"""SQLAlchemy ORM models for the Avatar Selection app."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
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

# Come si risponde a un test: scegliendo fra alternative, scrivendo,
# rimettendo dei passi in ordine o accoppiando due colonne.
#
# Il tipo sta sulla simulazione e non sulla singola domanda, quindi un test è
# tutto dell'una forma o tutto dell'altra. Le forme si svolgono in modi troppo
# diversi per stare nella stessa pagina: le multiple hanno un cronometro e si
# correggono da sole, le altre no. Chi vuole verificare le stesse procedure
# in più modi carica due volte lo stesso documento, che costa una
# generazione e non un disegno.
#
# I due tipi aggiunti dopo verificano quello che una crocetta non raggiunge:
# l'ordinamento chiede la **sequenza** di una procedura, che è dove gli
# operatori sbagliano davvero (tutti sanno che il cliente va identificato,
# pochi sanno che va fatto prima di aprire la pratica), e l'abbinamento
# chiede le **corrispondenze**, cioè le tabelle dei documenti aziendali
# (casistica, importo, ufficio competente), che a crocette diventano quattro
# domande dove ne basterebbe una.
SIMULATION_KIND_MULTIPLE = "multiple"
SIMULATION_KIND_OPEN = "open"
SIMULATION_KIND_ORDERING = "ordering"
SIMULATION_KIND_MATCHING = "matching"
ALL_SIMULATION_KINDS = [
    SIMULATION_KIND_MULTIPLE,
    SIMULATION_KIND_OPEN,
    SIMULATION_KIND_ORDERING,
    SIMULATION_KIND_MATCHING,
]

# Chi scrive le domande: il modello a partire da un documento, oppure il
# docente, una per una.
#
# Sono due modi di preparare lo stesso test, e quello che cambia sta tutto
# prima della pubblicazione: chi svolge il test riceve dieci domande estratte
# a caso in entrambi i casi, e non ha modo di sapere da dove vengano.
#
# Si sceglie alla creazione e non si cambia. Una simulazione generata ha un
# documento indicizzato, e le sue domande citano i passaggi da cui nascono;
# una scritta a mano non ha documento affatto, perché il documento serviva al
# modello per scrivere e a chi sbaglia per rileggere la procedura, e su un
# test scritto a mano la spiegazione la fornisce il docente.
SIMULATION_SOURCE_AI = "ai"
SIMULATION_SOURCE_MANUAL = "manual"
ALL_SIMULATION_SOURCES = [SIMULATION_SOURCE_AI, SIMULATION_SOURCE_MANUAL]

# Quante domande il modello scrive per una simulazione, quante ne compongono
# un tentativo, e quante alternative ha una domanda.
#
# Le due cifre dicono cose diverse. Il serbatoio è tutto quello che si può
# chiedere su quel documento, scritto una volta e riletto una volta;
# il tentativo ne pesca dieci a caso quando qualcuno preme "inizia", quindi
# due prove dello stesso test non sono la stessa fila di domande e ritentare
# smette di essere un esercizio di memoria sull'ordine delle risposte.
SIMULATION_POOL_COUNT = 50
SIMULATION_QUESTION_COUNT = 10
SIMULATION_OPTION_COUNT = 4

# Quante alternative può avere una domanda scritta a mano. Il modello ne
# scrive sempre SIMULATION_OPTION_COUNT, che è il numero su cui sono tarate
# le sue regole; il docente decide domanda per domanda, perché una scelta fra
# due è una domanda diversa da una scelta fra sei e sono entrambe legittime.
# Sotto le due non c'è più niente da scegliere, sopra le sei la domanda non
# si legge più su un telefono.
SIMULATION_MIN_OPTIONS = 2
SIMULATION_MAX_OPTIONS = 6

# Quanti elementi ha una domanda di ordinamento o di abbinamento.
#
# Sono gli stessi due limiti delle alternative, per la stessa ragione: sotto
# i tre non c'è niente da riordinare (due passi si indovinano metà delle
# volte) e sopra i sei la domanda non si trascina più su un telefono. Il
# minimo è tre e non due perché qui non si sceglie, si dispone: con due
# elementi il caso vale mezzo punto.
SIMULATION_MIN_ITEMS = 3
SIMULATION_MAX_ITEMS = 6

# Quanti elementi scrive il modello quando genera una domanda di ordinamento
# o di abbinamento. Sta in mezzo all'intervallo consentito: cinque passi sono
# una procedura intera senza diventare un esercizio di memoria, e cinque
# coppie coprono una tabella senza costringere il modello a inventare la
# quinta riga.
SIMULATION_GENERATED_ITEMS = 5

# Le tinte fra cui si sceglie il colore di una categoria di avatar. Un elenco
# chiuso e non un colore libero: la pastiglia è disegnata da classi Tailwind
# scritte a mano nel frontend (categoryStyles), e una classe composta a
# runtime non finirebbe mai nel CSS compilato. Il nome della tinta è quindi
# una chiave condivisa fra le due sponde, non un valore CSS.
AVATAR_CATEGORY_COLORS = [
    "violet",
    "orange",
    "cyan",
    "emerald",
    "pink",
    "amber",
    "sky",
    "rose",
    "slate",
]
DEFAULT_AVATAR_CATEGORY_COLOR = "violet"

# La categoria che ogni organizzazione ha per partire: un avatar deve averne
# una, quindi una deve esistere prima del primo avatar.
DEFAULT_AVATAR_CATEGORY_NAME = "Clienti"


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


class AvatarCategory(Authored, Base):
    """Come un'organizzazione raggruppa i propri avatar.

    Anagrafica vera e non più una stringa scritta a mano sull'avatar: la
    categoria si crea, si rinomina, si colora e si ordina dalla pagina di
    amministrazione, e rinominarla la cambia ovunque invece di lasciare in
    giro i vecchi avatar con il vecchio nome.

    Appartiene a un'organizzazione sola, esattamente come gli avatar che
    raggruppa: due tenant possono avere una categoria che si chiama allo
    stesso modo senza che sia la stessa categoria.

    L'unico su `(id, organization_id)` non serve a impedire un duplicato che
    la chiave primaria già impedisce: esiste perché la chiave esterna che
    arriva dagli avatar è composta, e Postgres pretende un unico sulle due
    colonne a cui punta (vedi `Avatar`).
    """

    __tablename__ = "avatar_categories"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4, index=True)
    organization_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    # Il nome di una tinta di AVATAR_CATEGORY_COLORS, non un colore CSS.
    color = Column(String(20), nullable=False, default=DEFAULT_AVATAR_CATEGORY_COLOR)

    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_avatar_categories_org_name"),
        UniqueConstraint("id", "organization_id", name="uq_avatar_categories_id_org"),
    )

    organization = relationship("Organization", foreign_keys=[organization_id])

    def __repr__(self):
        return f"<AvatarCategory(id={self.id}, name='{self.name}')>"


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
    # La categoria di appartenenza, sempre una di quelle della stessa
    # organizzazione. La chiave esterna è composta e porta con sé
    # organization_id (vedi __table_args__): senza, cambiare categoria a un
    # avatar potrebbe spostarlo nel tenant di un'altra, che è una fuga di
    # dati travestita da modifica anagrafica.
    category_id = Column(Uuid, nullable=False, index=True)
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

    __table_args__ = (
        ForeignKeyConstraint(
            ["category_id", "organization_id"],
            ["avatar_categories.id", "avatar_categories.organization_id"],
            name="fk_avatars_category_org",
        ),
    )

    # Relationship to selections
    organization = relationship("Organization", back_populates="avatars")
    # Sola lettura e su category_id soltanto: la categoria si assegna
    # scrivendo l'id, e lasciare la relazione fuori dal flush evita che
    # SQLAlchemy si trovi due relazioni diverse a scrivere organization_id.
    # lazy="joined" perché il nome della categoria serve quasi ovunque serva
    # l'avatar, dalla galleria al titolo di una conversazione.
    category = relationship(
        "AvatarCategory",
        primaryjoin="Avatar.category_id == AvatarCategory.id",
        foreign_keys="Avatar.category_id",
        lazy="joined",
        viewonly=True,
    )
    selections = relationship("UserSelection", back_populates="avatar")
    conversations = relationship("ChatConversation", back_populates="avatar")

    @property
    def is_deleted(self) -> bool:
        """True once the avatar has been archived (logically deleted)."""
        return self.deleted_at is not None

    @property
    def category_name(self) -> str:
        """Il nome della categoria, per chi deve solo mostrarlo o scriverlo."""
        return self.category.name if self.category else ""

    @property
    def category_color(self) -> str:
        """La tinta della pastiglia della categoria (vedi AVATAR_CATEGORY_COLORS)."""
        return self.category.color if self.category else DEFAULT_AVATAR_CATEGORY_COLOR

    @property
    def difficulty(self) -> str | None:
        """Safe-to-expose difficulty grade from the persona sheet (e.g. '8/10')."""
        if not self.profile:
            return None
        value = str(self.profile.get("GRADO_DIFFICOLTA", "") or "").strip()
        return value or None

    def __repr__(self):
        return f"<Avatar(id={self.id}, name='{self.name}', category='{self.category_name}')>"


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


class TrainingPath(Authored, Base):
    """Un percorso di training: tappe numerate da superare in ordine.

    È un modello e non un'assegnazione: si compone una volta ("Onboarding
    vendite", tre tappe) e si affida a quanti utenti si vuole. Correggere
    l'obiettivo di una tappa vale per tutti quelli che il percorso ce
    l'hanno, che è il motivo per cui il percorso esiste come riga a sé
    invece di essere copiato addosso a ogni allievo.

    Il tenant è la regola di sempre: un percorso appartiene a una sola
    organizzazione, e le sue tappe possono puntare solo a roba di quella
    (lo impone ``routers/training``, che è anche l'unico posto da cui le
    tappe si scrivono).
    """

    __tablename__ = "training_paths"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)

    organization = relationship("Organization")
    # Le tappe si leggono sempre in ordine e non esistono senza il percorso:
    # ``delete-orphan`` è quello che permette di riscriverle tutte a ogni
    # modifica invece di inseguire quale è cambiata.
    steps = relationship(
        "TrainingPathStep",
        back_populates="path",
        cascade="all, delete-orphan",
        order_by="TrainingPathStep.position",
    )
    assignments = relationship(
        "TrainingPathAssignment",
        back_populates="path",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<TrainingPath(id={self.id}, title='{self.title}')>"


class TrainingPathStep(Base):
    """Una tappa di un percorso: un obiettivo su un avatar o su un test.

    Le due colonne del bersaglio sono alternative fra loro e il vincolo lo
    impone: una tappa è una conversazione con un avatar oppure un test
    tecnico da superare, mai le due cose insieme e mai nessuna delle due.
    È la stessa forma che hanno le chiavi di ``SimulationQuestion``, dove
    ogni tipo riempie la propria colonna e lascia stare le altre.

    ``due_days`` sono i giorni concessi **da quando la tappa si sblocca**, e
    non una data: su un modello riusabile una data assoluta sarebbe già
    scaduta al secondo utente a cui il percorso viene affidato, e la tappa
    numero tre non si può nemmeno datare, perché quando si sbloccherà
    dipende da quanto ci mette chi la sta percorrendo.
    """

    __tablename__ = "training_path_steps"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    path_id = Column(
        Uuid, ForeignKey("training_paths.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Il posto nella fila, da 1. Chi legge il percorso numera per posizione
    # nell'elenco ordinato e non per questo valore: un avatar cancellato si
    # porta via la sua tappa, e la fila si richiude senza buchi da spiegare.
    position = Column(Integer, nullable=False)
    avatar_id = Column(
        Uuid, ForeignKey("avatars.id", ondelete="CASCADE"), nullable=True, index=True
    )
    simulation_id = Column(
        Uuid,
        ForeignKey("technical_simulations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Il voto da raggiungere, da 1 a 10, sulla stessa scala nei due casi:
    # una valutazione e un test consegnato si leggono già in decimi.
    target_score = Column(Float, nullable=False)
    # Giorni dallo sblocco entro cui la tappa andrebbe chiusa, o NULL
    due_days = Column(Integer, nullable=True)

    path = relationship("TrainingPath", back_populates="steps")
    avatar = relationship("Avatar")
    simulation = relationship("TechnicalSimulation")

    __table_args__ = (
        UniqueConstraint("path_id", "position", name="uq_training_path_step_position"),
        CheckConstraint(
            "(avatar_id IS NULL) <> (simulation_id IS NULL)",
            name="ck_training_path_step_one_target",
        ),
    )

    def __repr__(self):
        return (
            f"<TrainingPathStep(path_id={self.path_id}, position={self.position}, "
            f"avatar_id={self.avatar_id}, simulation_id={self.simulation_id})>"
        )


class TrainingPathAssignment(Base):
    """Un percorso affidato a una persona.

    Non tiene nessuno stato: dove è arrivato chi lo sta percorrendo si
    ricava in lettura dalle prove che ha svolto (vedi
    ``training_progress``), per la stessa ragione di sempre. Una spunta
    salvata sopravviverebbe alla conversazione cancellata che l'aveva
    prodotta, e una tappa sbloccata resterebbe sbloccata dopo che il
    docente ha rifatto il giudizio che la chiudeva.

    La data di assegnazione non è informativa: è il momento da cui la prima
    tappa conta, quindi l'allenamento fatto prima non sblocca niente.

    Lo stesso percorso non si affida due volte alla stessa persona: sarebbe
    due volte la stessa fila di tappe, con due progressi identici da
    leggere.
    """

    __tablename__ = "training_path_assignments"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    path_id = Column(
        Uuid, ForeignKey("training_paths.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Chi l'ha affidato (informativo)
    assigned_by_id = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    path = relationship("TrainingPath", back_populates="assignments")
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("path_id", "user_id", name="uq_training_path_assignment_user"),
    )

    def __repr__(self):
        return f"<TrainingPathAssignment(path_id={self.path_id}, user_id={self.user_id})>"


class NotificationRead(Base):
    """Marks one notification as already read by the user it was for.

    The notifications themselves are never stored. A path assigned, a step
    unlocking, its deadline coming up or going by, a trainer publishing a
    review: they are all facts already in the database, and copying them
    into rows would create exactly the stale flags the rest of the app
    refuses to keep (see TrainingPathAssignment). Reach the target, and a
    stored "scaduto" would sit there contradicting the step it describes.
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
    """Un test tecnico a scelta multipla o aperto, generato o scritto a mano.

    È il gemello scritto del roleplay: là si valuta come l'operatore gestisce
    una persona, qui si verifica se conosce la procedura. Il super admin
    carica il documento (una procedura, un manuale, una circolare), l'LLM ne
    ricava le domande, e gli utenti dell'organizzazione a cui la simulazione
    appartiene la svolgono. Oppure il documento non c'è e le domande le
    scrive lui, il che è la stessa cosa vista da chi risponde.

    ``kind`` decide come si risponde, e si sceglie al caricamento del
    documento: cambiarlo dopo vorrebbe dire buttare le domande, perché
    un'alternativa e una risposta attesa non sono la stessa cosa scritta in
    due modi. Chi ha scelto il tipo sbagliato ricarica il documento in una
    simulazione nuova.

    ``source`` dice chi le ha scritte, e nemmeno lui si cambia: su una
    simulazione scritta a mano non c'è documento da cui generare, e su una
    generata le domande citano passaggi che a mano nessuno riscriverebbe.
    Quello che cambia è quante domande servono per pubblicare (vedi
    ``required_pool``) e quali bottoni compaiono nel pannello di revisione.

    Il tenant è la stessa regola di ovunque: ogni simulazione appartiene a
    una sola organizzazione e si vede solo dentro quella. Solo il super admin
    ne crea, e decide a chi appartengono.

    ``document_text`` è il documento come il modello lo ha letto, non il file
    originale: il file non viene conservato, perché quello che serve dopo il
    caricamento è il testo, sia per rigenerare le domande sia per motivare
    una risposta sbagliata. Il nome del file resta solo per far riconoscere
    a chi l'ha caricato quale documento sta guardando. Su una simulazione
    scritta a mano le due colonne restano vuote, ed è quello che vuol dire
    "senza documento": non un caricamento rimandato, ma un test che si regge
    sulle domande e basta.

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
    # Scelta multipla o risposta aperta, per tutte le domande del test
    kind = Column(String(20), nullable=False, default=SIMULATION_KIND_MULTIPLE)
    # Chi ha scritto le domande: il modello dal documento, o il docente
    source = Column(String(20), nullable=False, default=SIMULATION_SOURCE_AI)
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

    @property
    def is_open(self) -> bool:
        return self.kind == SIMULATION_KIND_OPEN

    @property
    def is_ordering(self) -> bool:
        return self.kind == SIMULATION_KIND_ORDERING

    @property
    def is_matching(self) -> bool:
        return self.kind == SIMULATION_KIND_MATCHING

    @property
    def is_timed(self) -> bool:
        """Se le domande di questo test hanno il cronometro.

        Solo la scelta multipla ce l'ha. Trenta secondi bastano a scegliere
        una lettera, non a scrivere una procedura né a trascinare sei passi
        nell'ordine giusto, e un tempo tarato male rende un tipo ingiocabile
        invece che difficile. Il posto che comanda resta ``question_points``,
        che i punti li assegna: questa proprietà serve a chi deve dire come
        si svolge il test prima che cominci.
        """
        return self.kind == SIMULATION_KIND_MULTIPLE

    @property
    def is_manual(self) -> bool:
        return self.source == SIMULATION_SOURCE_MANUAL

    @property
    def required_pool(self) -> int:
        """Quante domande servono per pubblicare questa simulazione.

        Il serbatoio pieno è quello che rende diverso un tentativo dal
        successivo, e alla generazione non costa niente: cinquanta domande
        sono la stessa attesa di dieci, quindi lì si pretendono tutte.

        A mano sono cinquanta domande scritte una per una, ed è il genere di
        richiesta che finisce con un test mai pubblicato. Il minimo è quanto
        serve a comporre un tentativo: con dieci domande tutti vedono le
        stesse dieci, e chi vuole che la seconda prova sia diversa ne scrive
        di più, fino allo stesso tetto di cinquanta.
        """
        return SIMULATION_QUESTION_COUNT if self.is_manual else SIMULATION_POOL_COUNT

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
    """Una domanda con la sua risposta esatta, da scegliere o da scrivere.

    Generata dall'LLM ma non intoccabile: il super admin la rilegge e la
    corregge prima di pubblicare, perché un test che vale come verifica non
    può contenere una domanda che nessun umano ha mai guardato.

    Le colonne della chiave sono quattro e se ne riempie una sola, a seconda
    del ``kind`` della simulazione a cui la domanda appartiene:

    - a scelta multipla, ``options`` è la lista delle alternative nell'ordine
      in cui si mostrano e ``correct_option`` l'indice di quella giusta. Le
      due stanno insieme sulla riga, quindi correggere il testo di
      un'opzione non può spostare la risposta esatta su un'altra;
    - a risposta aperta, ``expected_answer`` è quello che una risposta deve
      dire per essere considerata giusta. Non è una soluzione da confrontare
      parola per parola: è la traccia contro cui il modello giudica quello
      che l'utente ha scritto, ed è anche quello che gli si mostra nell'esito
      accanto alla propria risposta;
    - di ordinamento, ``ordered_steps`` sono i passi **nell'ordine giusto**,
      che è la chiave stessa: chi risponde li riceve mescolati e il confronto
      è fra due liste. Salvarli in ordine e mescolarli alla consegna delle
      domande è l'unico modo di non avere una seconda colonna che dice la
      stessa cosa in un altro modo;
    - di abbinamento, ``pairs`` sono le coppie giuste, ognuna un oggetto
      ``{"left": "", "right": ""}``. La colonna di sinistra si mostra
      nell'ordine in cui è scritta, quella di destra mescolata.

    Le due liste nuove sono JSON e non due tabelle: sono da tre a sei righe
    che si leggono, si scrivono e si buttano sempre insieme alla domanda, e
    nessuna query le cerca per conto loro. È la stessa ragione per cui
    ``options`` è JSON da sempre.

    Il tipo non sta qui perché non è una proprietà della domanda: sta sulla
    simulazione, che è quello che decide come si svolge il test.

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
    # Posto nel serbatoio, da 1 a SIMULATION_POOL_COUNT. Non è il numero che
    # chi svolge il test vede accanto alla domanda: quello dipende da dove
    # l'estrazione l'ha messa, e vive nella fotografia del tentativo.
    position = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    # Le due chiavi, alternative fra loro: piene quelle del tipo del test,
    # vuote le altre. Nullable per questo, non perché una domanda possa non
    # avere una risposta esatta.
    options = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)
    correct_option = Column(Integer, nullable=True)
    expected_answer = Column(Text, nullable=False, default="")
    # I passi nell'ordine giusto, che è la chiave di una domanda di
    # ordinamento: chi risponde li riceve mescolati
    ordered_steps = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)
    # Le coppie giuste di una domanda di abbinamento, come
    # [{"left": "", "right": ""}]
    pairs = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)
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

    Su un test a risposta aperta la fotografia conta ancora di più: lì la
    voce porta anche il giudizio del modello, che è stato dato una volta
    sola su quel testo. Rivalutare la stessa risposta domani darebbe un
    numero simile ma non lo stesso, e un voto che oscilla non è un voto.
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
    # Su un test a risposta aperta "esatta" vuol dire arrivata alla
    # sufficienza (vedi ``simulation_scoring.OPEN_PASS_QUALITY``): il
    # giudizio è una scala continua, questa colonna una conta.
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
