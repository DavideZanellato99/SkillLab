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
    organization, a plain user never leaves it. Every avatar belongs to
    exactly one organization and is visible only within it.
    """

    __tablename__ = "organizations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(150), unique=True, nullable=False, index=True)
    # URL-safe identifier, unique across the platform
    slug = Column(String(80), unique=True, nullable=False, index=True)
    status = Column(String(20), nullable=False, default=ORG_STATUS_ACTIVE)
    # Why the tenant was suspended, in the admin's own words. Shown in the
    # admin table and to the locked-out users themselves, so they read the
    # actual reason instead of a generic wall. Cleared on reactivation: it
    # describes the current suspension, it is not a history (the audit
    # trail is).
    suspension_reason = Column(Text, nullable=True)
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
    # Last successful authentication, written only by the login endpoints.
    # NULL means the account has never been used: an invitation sent and
    # never accepted, which is a different problem from a dormant account
    # and is surfaced as such in the admin table. A token refresh
    # deliberately does NOT touch this — it would turn the column into
    # "last activity" and hide exactly what it exists to show.
    last_login_at = Column(DateTime, nullable=True)
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
    # Owning tenant: every avatar belongs to exactly one organization and is
    # visible only within it. Only the super admin creates avatars and assigns
    # the owning organization.
    organization_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False, index=True)
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
    # Deletion is logical: the row survives so that every conversation,
    # message and evaluation produced against this persona keeps its avatar,
    # and so that an old transcript can still be re-evaluated against the
    # sheet it was played on. An archived avatar leaves the students' gallery
    # and cannot start new training, but stays in the admin archive and in
    # the reports. NULL means active; the timestamp records when it was
    # archived. Nothing in the app hard-deletes an avatar except the deletion
    # of its owning organization, where the whole tenant goes away with it.
    deleted_at = Column(DateTime, nullable=True, index=True)

    # Relationship to selections
    organization = relationship("Organization", back_populates="avatars")
    selections = relationship("UserSelection", back_populates="avatar")
    conversations = relationship("ChatConversation", back_populates="avatar")

    @property
    def is_deleted(self) -> bool:
        """True once the avatar has been archived (logically deleted)."""
        return self.deleted_at is not None

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
    review = relationship(
        "ConversationReview",
        back_populates="conversation",
        uselist=False,
        cascade="all, delete-orphan",
    )
    annotations = relationship(
        "MessageAnnotation",
        back_populates="conversation",
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


class ConversationReview(Base):
    """The trainer's own verdict on a conversation, sitting above the AI's.

    One per conversation: a summary note in the trainer's own words and,
    when the machine got it wrong, a corrected score with the reason for the
    correction. This is what makes a grade defensible — a student who
    contests the AI gets a human answer, signed and dated, instead of a
    black box repeating itself.

    Once `override_score` is set it IS the grade: everything that consumes a
    score (the student's report, the progress of an assigned goal, the
    dashboard, the exports) reads it through ``reviews.final_score``, so a
    correction cannot mean one thing on screen and another in the report.

    The AI score the trainer was looking at is copied into
    `ai_score_at_review`, because the judgement can be re-run afterwards: a
    correction that reads "6.5 is too harsh here" says nothing next to a
    score that has since become an 8. Keeping the old number is what lets
    the views admit the review is stale instead of presenting it as current.

    The reviewer is stored twice, exactly like in the audit trail: the
    foreign key (nulled if the account is deleted) and a name snapshot taken
    at write time, so the student can still read who graded them.
    """

    __tablename__ = "conversation_reviews"

    conversation_id = Column(
        Uuid,
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    reviewer_id = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewer_name = Column(String(255), nullable=False, default="")
    # The trainer's overall comment. Nullable because a review is allowed to
    # be only a correction, just as it is allowed to be only a note.
    summary_note = Column(Text, nullable=True)
    # Corrected grade. NULL means the trainer let the AI's score stand, and
    # then the reason has nothing to justify: the API refuses one without
    # the other, in either direction.
    override_score = Column(Float, nullable=True)
    override_reason = Column(Text, nullable=True)
    # What the AI said when the review was written; NULL if the conversation
    # had not been judged yet (a trainer can grade one the AI never saw).
    ai_score_at_review = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    conversation = relationship("ChatConversation", back_populates="review")

    def __repr__(self):
        return (
            f"<ConversationReview(conversation_id={self.conversation_id}, "
            f"override_score={self.override_score})>"
        )


class MessageAnnotation(Base):
    """A trainer's note pinned to one of the operator's messages.

    The granular half of the feedback, where the review's summary note is
    the general one: "here you should have asked for the customer code"
    lands on the exact line it is about, which is how a debrief actually
    teaches something.

    Only on the operator's lines (enforced in routers/conversation_reviews):
    the student is graded on what they said, and even a mistake triggered by
    the avatar lives in the reply that mishandled it, never in the avatar's
    own generated words.

    At most one note per message (the unique constraint): a transcript
    covered in overlapping opinions from several trainers would be noise,
    not feedback, so a second trainer editing a message edits the note that
    is there and signs it with their own name.

    `conversation_id` is denormalized on purpose: every read wants "the
    notes of this conversation", and keeping it here answers that with one
    indexed lookup instead of a join through the messages table.
    """

    __tablename__ = "message_annotations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id = Column(
        Uuid,
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    message_id = Column(
        Uuid,
        ForeignKey("chat_messages.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    reviewer_id = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewer_name = Column(String(255), nullable=False, default="")
    note = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    conversation = relationship("ChatConversation", back_populates="annotations")

    def __repr__(self):
        return f"<MessageAnnotation(id={self.id}, message_id={self.message_id})>"


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


class TrainingAssignment(Base):
    """A training goal assigned to a user: reach target_score with one
    avatar, optionally within a deadline.

    Completion is never stored: it is derived at read time from the
    evaluations of the conversations the user opened AFTER the assignment
    was created (see routers/training.py), so re-judging or deleting a
    conversation can never leave a stale completion flag behind. The DB
    cascades take the assignment away with its user or its avatar.
    """

    __tablename__ = "training_assignments"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    avatar_id = Column(
        Uuid, ForeignKey("avatars.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Admin who handed out the goal (informational)
    assigned_by_id = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    target_score = Column(Float, nullable=False)
    due_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    user = relationship("User", foreign_keys=[user_id])
    avatar = relationship("Avatar")

    def __repr__(self):
        return (
            f"<TrainingAssignment(id={self.id}, user_id={self.user_id}, "
            f"avatar_id={self.avatar_id}, target_score={self.target_score})>"
        )


class NotificationRead(Base):
    """Marks one notification as already read by the user it was for.

    The notifications themselves are never stored. A goal assigned, a
    deadline coming up, a deadline gone by, a trainer publishing a review:
    they are all facts already in the database, and copying them into rows
    would create exactly the stale flags the rest of the app refuses to keep
    (see TrainingAssignment). Extend a deadline, or reach the target, and a
    stored "scaduto" would sit there contradicting the goal it describes.
    Derived at read time they simply stop being true, with nothing to clean
    up.

    What genuinely cannot be derived is whether the person has seen it, and
    that is all this table holds: one row per (user, notification key),
    where the key is the stable identity of the derived event, e.g.
    "assignment.overdue:{assignment_id}" (see ``notifications``).

    A key that stops being derivable leaves its row behind, harmlessly: it
    matches nothing, and it is the cheap price of not storing the events
    themselves.
    """

    __tablename__ = "notification_reads"

    user_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    key = Column(String(160), primary_key=True)
    read_at = Column(DateTime, default=lambda: datetime.now(UTC))

    def __repr__(self):
        return f"<NotificationRead(user_id={self.user_id}, key='{self.key}')>"


class AuditLog(Base):
    """One action performed by a user, whatever their role.

    The registry of who did what: every request that CHANGES something is
    written here by the audit middleware (see ``audit``), plus the
    authentication events, which have no authenticated user to hang off.
    Read-only GETs are deliberately absent — they would bury the real
    actions under navigation noise.

    Visible to the super admin only, and to no one else: an organization
    admin does not read the log of its own tenant either. Nothing deletes
    a row except the retention purge at startup, so the trail cannot be
    tidied up after the fact by whoever it incriminates.

    The actor is stored twice on purpose: the foreign keys (nulled when the
    user or the organization is deleted) and a text snapshot of email, role
    and organization name taken at write time, which keeps the row readable
    for ever.
    """

    __tablename__ = "audit_logs"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_email = Column(String(255), nullable=False, default="")
    user_role = Column(String(50), nullable=False, default="")
    organization_id = Column(
        Uuid, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    organization_name = Column(String(150), nullable=True)
    # Stable identifier of the action ("user.create", "auth.login"...): the
    # Italian label shown in the UI is derived from it at read time, so
    # rewording a label never rewrites history (see audit.ACTION_LABELS).
    action = Column(String(80), nullable=False, index=True)
    resource_type = Column(String(50), nullable=True)
    resource_id = Column(String(64), nullable=True)
    method = Column(String(10), nullable=False)
    path = Column(String(300), nullable=False)
    status_code = Column(Integer, nullable=False)
    client_ip = Column(String(64), nullable=False, default="")
    user_agent = Column(String(400), nullable=False, default="")
    # Whitelisted extras only (target email, avatar name...): never the raw
    # request body — passwords, tokens and conversation content stay out.
    details = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC), index=True)

    def __repr__(self):
        return (
            f"<AuditLog(id={self.id}, action='{self.action}', "
            f"user_email='{self.user_email}', created_at={self.created_at})>"
        )


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
