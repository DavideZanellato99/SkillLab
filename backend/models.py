"""SQLAlchemy ORM models for the Avatar Selection app."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import deferred, relationship

from authorship import Authored
from database import Base
from simulation_scoring import attempt_score

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

# Stati di una simulazione tecnica. In bozza esiste solo per il super admin,
# che rilegge e corregge le domande generate; pubblicata entra nell'elenco
# della sua organizzazione. Si torna in bozza, ed è voluto: una domanda
# sbagliata si ritira invece di restare in giro mentre la si corregge.
SIMULATION_STATUS_DRAFT = "draft"
SIMULATION_STATUS_PUBLISHED = "published"
ALL_SIMULATION_STATUSES = [SIMULATION_STATUS_DRAFT, SIMULATION_STATUS_PUBLISHED]

# Quante domande ha un test, e quante alternative ha una domanda.
SIMULATION_QUESTION_COUNT = 10
SIMULATION_OPTION_COUNT = 4


class Organization(Authored, Base):
    """A tenant of the platform: an organization whose users, conversations
    and private avatars are isolated from every other organization.

    Only the super admin (who belongs to no organization, organization_id
    NULL) sees across tenants; an organization_admin is confined to its own
    organization, a plain user never leaves it. Every avatar belongs to
    exactly one organization and is visible only within it.

    Who created it and who last touched it comes from `Authored` (see
    `authorship`): the columns are filled at flush time, never by hand.
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

    # foreign_keys spelled out: now that the table carries created_by and
    # updated_by, two paths run between organizations and users (membership
    # and paternity), and SQLAlchemy cannot guess which one this follows.
    users = relationship("User", back_populates="organization", foreign_keys="User.organization_id")
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


class User(Authored, Base):
    """Represents an authenticated user linked to a Cognito identity.

    Who created the account and who last modified it comes from `Authored`
    (see `authorship`), self-referencing this same table: an account created
    by an admin carries that admin, one created by the system carries NULL
    and the "sistema" label.
    """

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
    # L'ultima volta che l'account è stato visto vivo: la scrive ogni
    # richiesta autenticata (vedi `activity`), non solo l'accesso. Le due
    # colonne rispondono a domande diverse e nessuna delle due sostituisce
    # l'altra: con una sessione che si rinnova da sola, l'ultimo accesso può
    # essere di settimane fa mentre la persona sta usando la piattaforma
    # adesso. NULL quando l'account non è mai stato usato, come la gemella.
    last_activity_at = Column(DateTime, nullable=True)

    # Relationships
    role = relationship("Role", back_populates="users", lazy="joined")
    organization = relationship(
        "Organization",
        back_populates="users",
        lazy="joined",
        foreign_keys=[organization_id],
    )
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


class Avatar(Authored, Base):
    """Represents an avatar that users can select.

    Who created the persona and who last edited its sheet comes from
    `Authored` (see `authorship`): editing the sheet of an avatar already
    used in training is not a small thing, and it has to leave a name and a
    date on the row itself, not only in the audit trail.
    """

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


class LoginAttempt(Base):
    """A failed sign-in, counted to slow down password guessing.

    Two buckets, told apart by ``scope``: one keyed by email (a single
    account under attack, even from many addresses) and one keyed by client
    IP (one client probing many accounts).

    In a table rather than in process memory because a limit that is not the
    same limit for everyone is not a limit: behind a load balancer, four
    replicas counting on their own hand an attacker four times the attempts,
    and not one of the four ever sees the attack whole.

    The rows carry a client IP, so they are personal data with a very short
    life: whatever falls outside the window is dropped as the failures are
    counted, and the sweep in ``housekeeping`` collects the leftovers on an
    install where nobody ever fails a login.
    """

    __tablename__ = "login_attempts"
    __table_args__ = (Index("ix_login_attempts_bucket", "scope", "key", "created_at"),)

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    scope = Column(String(10), nullable=False)
    key = Column(String(320), nullable=False)
    # Naive UTC, like every comparison this table is read with
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC).replace(tzinfo=None)
    )

    def __repr__(self):
        return f"<LoginAttempt(scope='{self.scope}')>"


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


class TechnicalSimulation(Authored, Base):
    """Un test tecnico a risposta multipla, ricavato da un documento.

    È il gemello scritto del roleplay: là si valuta come l'operatore gestisce
    una persona, qui si verifica se conosce la procedura. Il super admin
    carica il documento (una procedura, un manuale, una circolare), l'LLM ne
    ricava le domande, e gli utenti dell'organizzazione a cui la simulazione
    appartiene la svolgono.

    Il tenant è la stessa regola di ovunque: ogni simulazione appartiene a
    una sola organizzazione e si vede solo dentro quella. Solo il super admin
    ne crea, e decide a chi appartengono.

    ``document_text`` è il documento come il modello lo ha letto, non il file
    originale: il file non viene conservato, perché quello che serve dopo il
    caricamento è il testo, sia per rigenerare le domande sia per motivare
    una risposta sbagliata. Il nome del file resta solo per far riconoscere
    a chi l'ha caricato quale documento sta guardando.

    La pubblicazione è una porta sola: finché è in bozza la simulazione esiste
    per il solo super admin, che può rileggere e correggere le domande generate
    prima che qualcuno le veda. Una volta pubblicata entra nell'elenco della
    sua organizzazione.
    """

    __tablename__ = "technical_simulations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4, index=True)
    organization_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default=SIMULATION_STATUS_DRAFT, index=True)
    # Il documento su cui le domande si fondano, come testo estratto
    document_name = Column(String(255), nullable=False, default="")
    document_text = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    organization = relationship("Organization")
    chunks = relationship(
        "SimulationChunk",
        back_populates="simulation",
        cascade="all, delete-orphan",
        order_by="SimulationChunk.ordinal",
    )
    questions = relationship(
        "SimulationQuestion",
        back_populates="simulation",
        cascade="all, delete-orphan",
        order_by="SimulationQuestion.position",
    )
    attempts = relationship(
        "SimulationAttempt",
        back_populates="simulation",
        cascade="all, delete-orphan",
    )

    @property
    def is_published(self) -> bool:
        return self.status == SIMULATION_STATUS_PUBLISHED

    def __repr__(self):
        return f"<TechnicalSimulation(id={self.id}, title='{self.title}', status='{self.status}')>"


class SimulationChunk(Base):
    """Un pezzo del documento con il suo embedding: la memoria del RAG.

    Il documento viene spezzato in passaggi e ognuno porta il proprio vettore,
    così la generazione di una domanda parte dai passaggi che parlano davvero
    dell'argomento invece che dalle prime pagine del file. Gli stessi passaggi
    restano poi citati dalla domanda, ed è quello che permette di mostrare a
    chi sbaglia il punto esatto della procedura che avrebbe dovuto leggere.

    L'embedding è una lista di float in JSON e non un tipo vettoriale: la
    somiglianza si calcola in Python (vedi ``simulation_rag``) su qualche
    centinaio di passaggi, che è lavoro da millisecondi, e in cambio il
    database resta un Postgres qualunque senza estensioni da installare su
    una macchina che non si tocca più dopo il primo deploy.
    """

    __tablename__ = "simulation_chunks"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    simulation_id = Column(
        Uuid,
        ForeignKey("technical_simulations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Posizione nel documento, da 1: è il numero con cui le domande citano
    # il passaggio, quindi non cambia finché il documento non cambia
    ordinal = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)

    simulation = relationship("TechnicalSimulation", back_populates="chunks")

    def __repr__(self):
        return f"<SimulationChunk(simulation_id={self.simulation_id}, ordinal={self.ordinal})>"


class SimulationQuestion(Base):
    """Una domanda a risposta multipla con la sua risposta esatta.

    Generata dall'LLM ma non intoccabile: il super admin la rilegge e la
    corregge prima di pubblicare, perché un test che vale come verifica non
    può contenere una domanda che nessun umano ha mai guardato.

    ``options`` è la lista delle alternative nell'ordine in cui si mostrano,
    ``correct_option`` l'indice di quella giusta. Le due stanno insieme sulla
    riga, quindi correggere il testo di un'opzione non può spostare la
    risposta esatta su un'altra.

    ``source_chunks`` sono gli ordinali dei passaggi da cui la domanda nasce:
    la spiegazione mostrata a chi sbaglia si appoggia a quelli, così la
    correzione rimanda al documento invece di chiedere fiducia.
    """

    __tablename__ = "simulation_questions"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    simulation_id = Column(
        Uuid,
        ForeignKey("technical_simulations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Ordine di presentazione, da 1 a SIMULATION_QUESTION_COUNT
    position = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    options = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    correct_option = Column(Integer, nullable=False)
    explanation = Column(Text, nullable=False, default="")
    source_chunks = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)

    simulation = relationship("TechnicalSimulation", back_populates="questions")

    def __repr__(self):
        return f"<SimulationQuestion(simulation_id={self.simulation_id}, position={self.position})>"


class SimulationAttempt(Base):
    """Un test consegnato: le risposte date, quanto valevano e quando.

    Il punteggio è congelato qui e non ricalcolato a ogni lettura, al
    contrario dei percorsi di training: là lo stato dipende da valutazioni
    che possono essere rifatte, qui dipende da domande che il super admin può
    correggere dopo la consegna, e un voto che cambia da solo mesi dopo
    l'esame non è un voto. Ora c'è una ragione in più: i punti dipendono dal
    tempo di ogni risposta, e quel tempo è successo una volta sola.

    Per la stessa ragione ``answers`` è una fotografia e non dei puntatori:
    ogni voce porta domanda, opzioni, risposta data, risposta esatta, tempo
    impiegato e punti come erano al momento della consegna, quindi il
    tentativo resta leggibile per intero anche se la domanda viene poi
    riscritta o la simulazione rigenerata da capo.
    """

    __tablename__ = "simulation_attempts"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    simulation_id = Column(
        Uuid,
        ForeignKey("technical_simulations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Risposte esatte e domande totali: non fanno più il voto, ma restano la
    # risposta alla domanda "quante ne sapeva", che il voto da solo non dà
    # più. Leggibili anche se un giorno le domande non fossero più dieci.
    correct_count = Column(Integer, nullable=False)
    question_count = Column(Integer, nullable=False)
    # I punti raccolti, che è da dove il voto si ricava: una risposta giusta
    # ne vale da 1 a 0,1 a seconda di quanto in fretta è arrivata (vedi
    # ``simulation_scoring``), una sbagliata zero. Sui tentativi consegnati
    # prima che il tempo contasse vale quante ne erano giuste, che è la
    # verità di allora: lì una risposta esatta valeva un punto pieno.
    earned_points = Column(Float, nullable=False, default=0.0)
    answers = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC), index=True)

    simulation = relationship("TechnicalSimulation", back_populates="attempts")
    user = relationship("User")

    @property
    def score(self) -> float:
        """Il voto in decimi, per stare sulla stessa scala delle valutazioni."""
        return attempt_score(self.earned_points or 0.0, self.question_count)

    def __repr__(self):
        return (
            f"<SimulationAttempt(id={self.id}, user_id={self.user_id}, "
            f"corrette={self.correct_count}/{self.question_count}, "
            f"punti={self.earned_points})>"
        )


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


class VoiceSessionRecord(Base):
    """A call that has been authorised and is waiting for (or holding) its socket.

    It is created by ``POST /api/voice/session`` and consumed by the voice
    WebSocket, which are two separate HTTP requests: with more than one
    backend replica they almost never land on the same process, so this
    state cannot live in the memory of one of them. In a table, any replica
    can serve any call and no session affinity is needed in front.

    It carries the snapshot the pipeline reads once when the socket opens
    (the persona sheet and the history written so far), which is what keeps
    the per-turn hot path free of queries. That snapshot duplicates rows
    that already exist elsewhere, so the row is deliberately short-lived:
    it is deleted when the call hangs up, and the expiry is swept by
    ``housekeeping`` for the calls that are never opened at all.

    ``avatar_id`` carries no foreign key on purpose: it is a pointer for the
    duration of one call, not a historical fact worth blocking the deletion
    of an avatar over.
    """

    __tablename__ = "voice_sessions"

    # The unguessable token handed to the browser. It is the only credential
    # that opens the voice socket, so it is also the primary key.
    id = Column(String(64), primary_key=True)
    user_id = Column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
    avatar_id = Column(Uuid, nullable=False)
    conversation_id = Column(
        Uuid, ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    avatar_profile = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    prior_history = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    voice_id = Column(String(64), nullable=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    def __repr__(self):
        return f"<VoiceSessionRecord(conversation_id={self.conversation_id})>"


# Everything that hangs off a conversation, keyed by conversation_id. Held
# here, next to the tables themselves, because two different features have
# to delete a conversation completely — the retention sweep (``retention``)
# and the erasure of a user or a tenant (``erasure``) — and a child table
# added later must not be able to be forgotten by one of them.
#
# Declared in delete order: the annotations before the messages they are
# pinned to, everything before the conversation itself.
CONVERSATION_CHILDREN = (
    MessageAnnotation,
    ConversationReview,
    ConversationEvaluation,
    ConversationRecording,
    VoiceSessionRecord,
    ChatMessage,
)
