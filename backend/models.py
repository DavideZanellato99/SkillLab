"""SQLAlchemy ORM models for the Avatar Selection app."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import deferred, relationship

from database import Base

# Canonical role names (rows of the `roles` table)
ROLE_SUPER_ADMIN = "super_admin"
ROLE_ORGANIZATION_ADMIN = "organization_admin"
ROLE_USER = "user"
ALL_ROLES = [ROLE_SUPER_ADMIN, ROLE_ORGANIZATION_ADMIN, ROLE_USER]

# Account states: suspended is reversible, disabled is final (the account
# can only be deleted). Any non-active state blocks login AND kills the
# sessions already open (checked on every authenticated request).
USER_STATUS_ACTIVE = "active"
USER_STATUS_SUSPENDED = "suspended"
USER_STATUS_DISABLED = "disabled"
ALL_USER_STATUSES = [USER_STATUS_ACTIVE, USER_STATUS_SUSPENDED, USER_STATUS_DISABLED]

# Organization states: suspending an organization blocks login for ALL its
# users and kills their open sessions (checked on every request, exactly
# like the per-user status). There is no "disabled": an organization is
# either active/suspended or hard-deleted with all its data.
ORG_STATUS_ACTIVE = "active"
ORG_STATUS_SUSPENDED = "suspended"
ALL_ORG_STATUSES = [ORG_STATUS_ACTIVE, ORG_STATUS_SUSPENDED]

# Channel a conversation runs on: a simulated phone call (STT + LLM + TTS)
# or a written chat with the same avatar (LLM only)
CONVERSATION_MODE_VOICE = "voice"
CONVERSATION_MODE_TEXT = "text"


class Organization(Base):
    """A tenant of the platform: an organization whose users, conversations
    and private avatars are isolated from every other organization.

    Only the super admin (who belongs to no organization, organization_id
    NULL) sees across tenants; an organization_admin is confined to its own
    organization, a plain user never leaves it. Avatars with a NULL
    organization_id are the shared global library, visible to everyone.
    """

    __tablename__ = "organizations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(150), unique=True, nullable=False, index=True)
    # URL-safe identifier, unique across the platform
    slug = Column(String(80), unique=True, nullable=False, index=True)
    status = Column(String(20), nullable=False, default=ORG_STATUS_ACTIVE)
    # Free-form per-tenant settings (branding, limits...): reserved for the
    # future, not read by any enforcement today.
    settings = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    users = relationship("User", back_populates="organization")
    avatars = relationship("Avatar", back_populates="organization")

    def __repr__(self):
        return f"<Organization(id={self.id}, name='{self.name}', status='{self.status}')>"


class Role(Base):
    """A system role assignable to users."""

    __tablename__ = "roles"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    users = relationship("User", back_populates="role")

    def __repr__(self):
        return f"<Role(id={self.id}, name='{self.name}')>"


class User(Base):
    """Represents an authenticated user linked to a Cognito identity."""

    __tablename__ = "users"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    cognito_sub = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    nome = Column(String(100), nullable=False, default="")
    cognome = Column(String(100), nullable=False, default="")
    role_id = Column(Uuid, ForeignKey("roles.id"), nullable=False, index=True)
    # The tenant this user belongs to. NULL only for the super admin (and
    # the mock admin), who stand above every organization. A plain user or
    # an organization_admin always has one.
    organization_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True, index=True)
    status = Column(String(20), nullable=False, default=USER_STATUS_ACTIVE)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationships
    role = relationship("Role", back_populates="users", lazy="joined")
    organization = relationship("Organization", back_populates="users", lazy="joined")
    selections = relationship("UserSelection", back_populates="user")
    conversations = relationship("ChatConversation", back_populates="user")

    @property
    def organization_name(self) -> str | None:
        """Organization name exposed to the API, None for the super admin."""
        return self.organization.name if self.organization else None

    @property
    def ruolo(self) -> str:
        """Role name exposed to the API (kept for backwards compatibility)."""
        return self.role.name if self.role else ""

    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}', ruolo='{self.ruolo}')>"


class Avatar(Base):
    """Represents an avatar that users can select."""

    __tablename__ = "avatars"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(100), nullable=False)
    image_url = Column(String(500), nullable=False)
    category = Column(String(50), nullable=False, index=True)
    description = Column(Text, nullable=True)
    # Owning tenant, or NULL for a global persona shared with every
    # organization. A plain user sees globals plus their own org's avatars;
    # only the super admin creates and assigns either kind.
    organization_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True, index=True)
    # Cartesia voice id used for the voice conversation mode (falls back
    # to CARTESIA_DEFAULT_VOICE_ID when null)
    voice_id = Column(String(100), nullable=True)
    # Training persona sheet (anagrafica, personalità, scenario, segreti...).
    # Required: every avatar IS a training persona — the sheet drives the
    # roleplay prompt. Server-side only: never expose it through the API —
    # students must not see hidden objectives, secrets or the real cause of
    # the problem.
    profile = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    # Relationship to selections
    organization = relationship("Organization", back_populates="avatars")
    selections = relationship("UserSelection", back_populates="avatar")
    conversations = relationship("ChatConversation", back_populates="avatar")

    @property
    def difficulty(self) -> str | None:
        """Safe-to-expose difficulty grade from the persona sheet (e.g. '8/10')."""
        if not self.profile:
            return None
        value = str(self.profile.get("GRADO_DIFFICOLTA", "") or "").strip()
        return value or None

    def __repr__(self):
        return f"<Avatar(id={self.id}, name='{self.name}', category='{self.category}')>"


class UserSelection(Base):
    """Records when a user selects an avatar."""

    __tablename__ = "user_selections"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
    avatar_id = Column(Uuid, ForeignKey("avatars.id"), nullable=False)
    selected_at = Column(DateTime, default=lambda: datetime.now(UTC))

    # Relationships
    user = relationship("User", back_populates="selections")
    avatar = relationship("Avatar", back_populates="selections")

    def __repr__(self):
        return f"<UserSelection(id={self.id}, user_id={self.user_id}, avatar_id={self.avatar_id})>"


class RevokedJti(Base):
    """Denylisted access-token identifier (server-side logout).

    Cognito's revoke_token only kills the refresh token: access tokens
    already issued stay valid until exp. At logout the access token's jti
    (and origin_jti) land here; get_current_user rejects them with 401.
    Rows are purged once expires_at passes (the JWT exp check takes over).
    """

    __tablename__ = "revoked_jti"

    jti = Column(String(64), primary_key=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    def __repr__(self):
        return f"<RevokedJti(jti='{self.jti}', expires_at={self.expires_at})>"


class TokenSession(Base):
    """Client context bound to an access token at mint time (session binding).

    One row per access-token jti (expires with the token) plus one row per
    origin_jti — the session anchor recorded at login and checked at
    refresh. Every authenticated request compares the caller's IP and
    User-Agent with the row of its jti: a mismatch means the cookie left
    the owner's browser, so the token is denylisted and rejected.
    """

    __tablename__ = "token_session"

    jti = Column(String(64), primary_key=True)
    # Informational (auditing): not used by the enforcement itself
    user_id = Column(Uuid, nullable=True, index=True)
    client_ip = Column(String(64), nullable=False)
    user_agent = Column(String(400), nullable=False, default="")
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    def __repr__(self):
        return f"<TokenSession(jti='{self.jti}', client_ip='{self.client_ip}')>"


class ChatConversation(Base):
    """Represents a chat conversation with an avatar."""

    __tablename__ = "chat_conversations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
    avatar_id = Column(Uuid, ForeignKey("avatars.id"), nullable=False, index=True)
    # Always set: a new conversation is born with a "<Category> <n>" default
    # (see conversation_titles) that the owner can rename, never blank
    title = Column(String(120), nullable=False)
    # Channel the conversation was opened on, fixed for its whole life: a
    # phone call (voice) or the written chat (text). The two are never
    # mixed — the persona prompt and the UI dock both follow this.
    mode = Column(String(10), nullable=False, default=CONVERSATION_MODE_VOICE)
    # Set when the call hangs up: a closed conversation is a read-only
    # transcript, it can no longer be resumed (only renamed)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationships
    user = relationship("User", back_populates="conversations")
    avatar = relationship("Avatar", back_populates="conversations")
    messages = relationship(
        "ChatMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )
    evaluation = relationship(
        "ConversationEvaluation",
        back_populates="conversation",
        uselist=False,
        cascade="all, delete-orphan",
    )
    recording = relationship(
        "ConversationRecording",
        back_populates="conversation",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return (
            f"<ChatConversation(id={self.id}, user_id={self.user_id}, avatar_id={self.avatar_id})>"
        )


class ConversationEvaluation(Base):
    """AI judgement of the operator's performance over a whole conversation.

    One evaluation per conversation: re-running the judgement replaces the
    previous result.
    """

    __tablename__ = "conversation_evaluations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4, index=True)
    conversation_id = Column(
        Uuid,
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    overall_score = Column(Float, nullable=False)
    # Structured result: {"summary": str, "criteria": [{key, label, weight,
    # score, comment, suggestions}]}, suggestions only where score < 8.
    # overall_score is the weighted average of the criteria (see
    # openai_service.EVALUATION_CRITERIA for keys and weights).
    result = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    conversation = relationship("ChatConversation", back_populates="evaluation")

    def __repr__(self):
        return f"<ConversationEvaluation(id={self.id}, conversation_id={self.conversation_id}, overall_score={self.overall_score})>"


class ConversationRecording(Base):
    """Mixed audio of a voice call: the operator and the avatar in one track.

    The browser records the call (mic + the avatar's playback, mixed by the
    Web Audio graph) and uploads it on hang-up, so the timeline is exactly
    what the operator heard, pauses included.

    Its own table, one row per conversation: the blob is heavy and must
    never be dragged in by an ordinary query on chat_conversations. The
    audio column is deferred for the same reason, so reading the metadata
    (has a recording? how long?) costs nothing.
    """

    __tablename__ = "conversation_recordings"

    conversation_id = Column(
        Uuid,
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # Whatever MediaRecorder actually produced: audio/webm;codecs=opus on
    # Chrome and Firefox, audio/mp4 on Safari. Stored so playback is served
    # back with the same type it was recorded in.
    mime_type = Column(String(64), nullable=False)
    duration_ms = Column(Integer, nullable=True)
    size_bytes = Column(Integer, nullable=False)
    audio = deferred(Column(LargeBinary, nullable=False))
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    conversation = relationship("ChatConversation", back_populates="recording")

    def __repr__(self):
        return f"<ConversationRecording(conversation_id={self.conversation_id}, size_bytes={self.size_bytes})>"


class ChatMessage(Base):
    """Stores a single message in a chat conversation."""

    __tablename__ = "chat_messages"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4, index=True)
    conversation_id = Column(
        Uuid, ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    # Relationships
    conversation = relationship("ChatConversation", back_populates="messages")

    def __repr__(self):
        return f"<ChatMessage(id={self.id}, role='{self.role}')>"
