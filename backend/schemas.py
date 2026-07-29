"""Pydantic schemas for request/response validation."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from models import CONVERSATION_MODE_VOICE
from persona_prompt import CHANNEL_TEXT, CHANNEL_VOICE

# --- Avatar Schemas ---


class AvatarBase(BaseModel):
    """Base schema for avatar data."""

    name: str
    image_url: str
    category: str
    description: str | None = None


class AvatarResponse(AvatarBase):
    """Schema for avatar API responses.

    Note: the persona sheet (Avatar.profile) is intentionally NOT exposed —
    students must not see secrets, hidden objectives or the real cause of
    the problem. Only the derived difficulty grade is safe to show.
    """

    id: UUID
    created_at: datetime
    selection_count: int = 0
    difficulty: str | None = None

    model_config = {"from_attributes": True}


# --- Selection Schemas ---


class SelectionCreate(BaseModel):
    """Schema for creating a new avatar selection."""

    avatar_id: UUID


class SelectionResponse(BaseModel):
    """Schema for selection API responses."""

    id: UUID
    avatar_id: UUID
    selected_at: datetime
    avatar: AvatarResponse

    model_config = {"from_attributes": True}


# --- Chat Schemas (voice conversation transcripts) ---


class ChatMessageResponse(BaseModel):
    """Schema for a single chat message in API responses."""

    id: UUID
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageAnnotationResponse(BaseModel):
    """A trainer's note pinned to one message of the transcript."""

    id: UUID
    message_id: UUID
    note: str
    # Who wrote it, as it read at write time (see MessageAnnotation)
    reviewer_name: str
    created_at: datetime
    updated_at: datetime


class ConversationReviewResponse(BaseModel):
    """The trainer's review of a conversation, AI evaluation aside.

    Read by the trainer who wrote it and by the student it is about: the
    whole point of a human correction is that the person graded can read it,
    so nothing here is admin-only.
    """

    conversation_id: UUID
    reviewer_name: str
    summary_note: str | None = None
    # Present together or not at all: a corrected grade always carries its
    # reason (see ConversationReviewRequest)
    override_score: float | None = None
    override_reason: str | None = None
    # What the AI said when the review was written, and whether it has
    # changed since: a re-run judgement can leave a correction talking about
    # a score that no longer exists, and the UI says so rather than passing
    # it off as current.
    ai_score_at_review: float | None = None
    is_stale: bool = False
    annotations: list[MessageAnnotationResponse] = []
    created_at: datetime
    updated_at: datetime


class ChatConversationResponse(BaseModel):
    """Schema for conversation API responses."""

    id: UUID
    avatar_id: UUID
    title: str
    # Channel the conversation runs on: "voice" (call) or "text" (chat)
    mode: str = CONVERSATION_MODE_VOICE
    # When set, the conversation is over: the transcript is read-only
    ended_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageResponse] = []
    # The trainer's review, so the student reads the notes pinned to their
    # own lines while re-reading the transcript, which is where a debrief
    # actually lands
    review: ConversationReviewResponse | None = None

    model_config = {"from_attributes": True}


class ConversationRenameRequest(BaseModel):
    """Schema for renaming a conversation.

    The title is mandatory: a blank one is rejected, so a conversation is
    never left without a name.
    """

    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Il titolo non può essere vuoto.")
        return v


class ChatMessageRequest(BaseModel):
    """Schema for one operator message sent to the avatar in text chat.

    Without a conversation_id a new text conversation is opened; the
    operator always writes first, exactly as they speak first on a call.
    """

    avatar_id: UUID
    conversation_id: UUID | None = None
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Il messaggio non può essere vuoto.")
        return v


class ChatMessageExchange(BaseModel):
    """One completed chat round trip: the operator's message and the reply."""

    conversation_id: UUID
    title: str
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse


class EvaluationCitation(BaseModel):
    """One transcript message cited by the AI judge as evidence for a criterion.

    `index` is the 1-based position in the evaluated transcript;
    `message_id` anchors it to the stored message when one exists (live
    voice bubbles cited before the DB sync may only have the index).
    """

    index: int
    message_id: UUID | None = None


class EvaluationCriterionResponse(BaseModel):
    """Score and feedback for a single evaluation criterion."""

    key: str
    label: str
    score: float
    comment: str
    # Improvement suggestions, present only when score < 8
    suggestions: str | None = None
    # Transcript messages the judgment rests on (empty for evaluations
    # stored before citations existed)
    citations: list[EvaluationCitation] = []


class PreviousAttempt(BaseModel):
    """The user's previous evaluated attempt at the same scenario.

    Same user, same avatar, closest earlier conversation that has an
    evaluation: the baseline the current one is compared against, so the
    operator sees progress per criterion instead of an isolated verdict.
    """

    conversation_id: UUID
    title: str
    mode: str
    conversation_at: datetime
    # The grade that counted for that attempt, trainer's correction included:
    # comparing today's corrected score against yesterday's raw AI one would
    # invent a progress (or a regression) nobody made.
    overall_score: float
    # Criterion key -> score of the previous attempt (the UI computes deltas)
    criteria_scores: dict[str, float]


class ConversationReviewRequest(BaseModel):
    """Trainer's request: write (or rewrite) the review of a conversation.

    A blank field means "not set": the note and the correction are
    independent, a review can be either or both, but not neither — an empty
    review is a delete, and deleting has its own endpoint.
    """

    summary_note: str | None = None
    override_score: float | None = Field(default=None, ge=1, le=10)
    override_reason: str | None = None

    @field_validator("summary_note", "override_reason")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None

    @model_validator(mode="after")
    def coherent(self) -> "ConversationReviewRequest":
        """A corrected grade needs its reason, and a reason needs a grade.

        Correcting the machine without saying why is exactly the black box
        this feature exists to open, so the pair is enforced here rather
        than left to the goodwill of whoever calls the API.
        """
        if self.override_score is not None and not self.override_reason:
            raise ValueError("Motiva la correzione del punteggio.")
        if self.override_reason and self.override_score is None:
            raise ValueError("Indica il punteggio corretto insieme alla motivazione.")
        if self.summary_note is None and self.override_score is None:
            raise ValueError("Scrivi una nota o correggi il punteggio.")
        return self


class MessageAnnotationRequest(BaseModel):
    """Trainer's request: pin a note to one message of the transcript.

    Re-annotating a message rewrites the note that is already there: there
    is at most one per message (see MessageAnnotation).
    """

    message_id: UUID
    note: str

    @field_validator("note")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("L'annotazione non può essere vuota.")
        return v


class ConversationEvaluationResponse(BaseModel):
    """AI evaluation of the operator's performance in a conversation."""

    id: UUID
    conversation_id: UUID
    # What the AI judged. `final_score` is what the grade actually IS: the
    # two differ exactly when a trainer corrected the machine, and both are
    # sent so the report can show the correction instead of hiding it.
    overall_score: float
    final_score: float
    summary: str
    criteria: list[EvaluationCriterionResponse]
    # None on the first evaluated attempt at this scenario
    previous: PreviousAttempt | None = None
    # The trainer's review, when one has been written
    review: ConversationReviewResponse | None = None
    created_at: datetime
    updated_at: datetime


# Derived state of a training assignment (see routers/training.py)
ASSIGNMENT_STATUS_ACTIVE = "active"
ASSIGNMENT_STATUS_OVERDUE = "overdue"
ASSIGNMENT_STATUS_COMPLETED = "completed"
ASSIGNMENT_STATUS_COMPLETED_LATE = "completed_late"


class TrainingAssignmentCreate(BaseModel):
    """Super admin request: assign one avatar as a goal to one or more users."""

    avatar_id: UUID
    user_ids: list[UUID] = Field(min_length=1)
    target_score: float = Field(ge=1, le=10)
    due_at: datetime | None = None


class TrainingAssignmentResponse(BaseModel):
    """One assigned goal with its progress, derived from the evaluations.

    status: "active" (still open), "overdue" (deadline passed without
    reaching the target), "completed", or "completed_late" (target reached
    after the deadline). Only conversations opened after the assignment
    count: attempts, best_score and achieved_at all follow that rule.
    """

    id: UUID
    user_id: UUID
    user_name: str
    user_email: str
    organization_id: UUID | None = None
    organization_name: str | None = None
    avatar_id: UUID
    avatar_name: str
    avatar_category: str
    target_score: float
    due_at: datetime | None = None
    created_at: datetime
    status: str
    attempts: int
    best_score: float | None = None
    achieved_at: datetime | None = None


class ChatConversationSummary(BaseModel):
    """Lightweight schema for listing conversations (without full messages)."""

    id: UUID
    avatar_id: UUID
    title: str
    # Channel the conversation runs on: "voice" (call) or "text" (chat)
    mode: str = CONVERSATION_MODE_VOICE
    # When set, the conversation is over: the transcript is read-only
    ended_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message_preview: str | None = None

    model_config = {"from_attributes": True}


# --- Voice Schemas ---


class VoiceSessionRequest(BaseModel):
    """Schema for starting a voice session with an avatar.

    The session simulates the avatar phoning the bank's toll-free number:
    the operator (the user) answers and speaks first, then the avatar
    states its problem.
    """

    avatar_id: UUID
    conversation_id: UUID | None = None


class VoiceSessionResponse(BaseModel):
    """Schema returned to the client to open the voice WebSocket."""

    session_id: str
    conversation_id: UUID


class VoiceRecordingInfo(BaseModel):
    """Metadata of a stored call recording, without the audio itself.

    Lets the UI decide whether to show a player without pulling megabytes
    of audio it may never play.
    """

    conversation_id: UUID
    mime_type: str
    duration_ms: int | None
    size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Auth Schemas ---


class LoginRequest(BaseModel):
    """Schema for login request."""

    email: str
    password: str


class LoginResponse(BaseModel):
    """Schema for successful login response.

    The tokens are NOT in the body: they travel only as HttpOnly cookies
    set by the auth endpoints (XSS mitigation).
    """

    user: "UserResponse"


class NewPasswordRequiredResponse(BaseModel):
    """Schema returned when Cognito requires a new password."""

    challenge: str = "NEW_PASSWORD_REQUIRED"
    session: str
    message: str = "È necessario impostare una nuova password."


class NewPasswordRequest(BaseModel):
    """Schema for completing the new password challenge."""

    email: str
    new_password: str
    session: str


class UserResponse(BaseModel):
    """Schema for user profile response."""

    id: UUID
    cognito_sub: str
    email: str
    nome: str
    cognome: str
    role_id: UUID
    ruolo: str  # role name, resolved from the roles table
    status: str  # "active" | "suspended" | "disabled"
    # Tenant the user belongs to; both null for the super admin
    organization_id: UUID | None = None
    organization_name: str | None = None
    # Last successful authentication; null means the account has never been
    # used (an invitation that was never accepted).
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UpdateProfileRequest(BaseModel):
    """Schema for the authenticated user updating their own profile
    (self-service). Email and role are not editable here."""

    nome: str | None = None
    cognome: str | None = None


class ChangePasswordRequest(BaseModel):
    """Schema for the authenticated user changing their own password
    (self-service): Cognito verifies current_password server-side."""

    current_password: str
    new_password: str


# --- Organization Schemas (super admin only) ---


class OrganizationResponse(BaseModel):
    """An organization/tenant with its aggregate counters."""

    id: UUID
    name: str
    slug: str
    status: str  # "active" | "suspended"
    # Only set while the organization is suspended: the admin's own wording
    # of why, shown in the admin table and to the locked-out users.
    suspension_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    user_count: int = 0
    avatar_count: int = 0

    model_config = {"from_attributes": True}


class OrganizationDetailResponse(OrganizationResponse):
    """One organization plus how much its users actually train.

    Read when the detail modal opens, not with the list: these figures cost
    a scan of the tenant's conversations and nobody needs them to pick a
    name out of a dropdown.
    """

    # Conversations opened by the tenant's users in the last 30 days: the
    # counter that says whether the platform is being used *now*, which the
    # lifetime total cannot.
    conversations_last_30_days: int = 0
    conversations_total: int = 0
    # Average of the evaluated conversations' overall scores, over the
    # tenant's whole history. None when nothing has been evaluated yet: a
    # zero would read as "they score terribly" instead of "no data".
    average_score: float | None = None
    evaluated_count: int = 0
    # Most recent successful login among the tenant's users. None means
    # nobody has ever signed in: invitations sent and never accepted.
    last_login_at: datetime | None = None


class CreateOrganizationRequest(BaseModel):
    """Schema for the super admin creating a new organization.

    The slug is optional: when omitted it is derived from the name.
    """

    name: str = Field(min_length=1, max_length=150)
    slug: str | None = Field(default=None, max_length=80)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Il nome dell'organizzazione non può essere vuoto.")
        return v


class UpdateOrganizationRequest(BaseModel):
    """Schema for renaming an organization; omitted fields stay unchanged."""

    name: str | None = Field(default=None, min_length=1, max_length=150)
    slug: str | None = Field(default=None, max_length=80)


class UpdateOrganizationStatusRequest(BaseModel):
    """Schema for suspending or reactivating an organization.

    `reason` is what the locked-out users will read, so it travels with the
    suspension itself rather than living only in the audit trail. Ignored
    when reactivating: the reason describes a suspension that is over.
    """

    status: str  # "active" | "suspended"
    reason: str | None = Field(default=None, max_length=500)


# --- Admin Schemas ---


class CreateUserRequest(BaseModel):
    """Schema for admin creating a new user."""

    email: str
    nome: str
    cognome: str
    ruolo: str = "user"  # "super_admin" | "organization_admin" | "user"
    # Required for organization_admin/user, must be null for super_admin
    # (validated server-side).
    organization_id: UUID | None = None


class UpdateUserRequest(BaseModel):
    """Schema for admin updating a user; omitted fields are left unchanged."""

    nome: str | None = None
    cognome: str | None = None
    ruolo: str | None = None
    organization_id: UUID | None = None


class UpdateUserStatusRequest(BaseModel):
    """Schema for admin changing an account's state."""

    status: str  # "active" | "suspended" | "disabled"


class UserPage(BaseModel):
    """A window over the users: the rows plus how many matched in all.

    `total` counts every user the filters select, not the ones in `items`:
    it is what tells the client how much is still behind the window.
    """

    total: int
    items: list[UserResponse]


class AdminAvatarPayload(BaseModel):
    """Schema for creating/updating an avatar (training persona) from the
    admin page. The avatar name is derived from profile NOME + COGNOME."""

    category: str = "Clienti"
    description: str | None = None
    # Empty → the backend generates an initials placeholder image
    image_url: str | None = None
    voice_id: str | None = None
    # Owning tenant: every avatar belongs to exactly one organization.
    # Required — only the super admin sets this.
    organization_id: UUID
    profile: dict


class AdminAvatarResponse(BaseModel):
    """Avatar including the full persona sheet — super admin only."""

    id: UUID
    name: str
    image_url: str
    category: str
    description: str | None = None
    voice_id: str | None = None
    difficulty: str | None = None
    organization_id: UUID
    organization_name: str
    profile: dict
    created_at: datetime
    # When the avatar was archived (logical deletion); None while active.
    deleted_at: datetime | None = None
    conversation_count: int = 0


class AvatarImageResponse(BaseModel):
    """Public URL of an image just uploaded for an avatar."""

    image_url: str


class AvatarPromptPreviewRequest(BaseModel):
    """Render the roleplay prompt of a sheet that may not be saved yet."""

    profile: dict
    # "voice" (call) or "text" (chat): the same persona, a different medium
    channel: str = CHANNEL_VOICE

    @field_validator("channel")
    @classmethod
    def _known_channel(cls, value: str) -> str:
        if value not in (CHANNEL_VOICE, CHANNEL_TEXT):
            raise ValueError(f"Canale non valido: usa '{CHANNEL_VOICE}' o '{CHANNEL_TEXT}'.")
        return value


class AvatarPromptPreviewResponse(BaseModel):
    """The system prompt a sheet produces, plus what it left out.

    `ignored_fields` are the sheet keys that carry a value the prompt builder
    drops (the "not applicable" markers), which is exactly what an author
    needs to see: a field they believe they filled in and the avatar will
    never know about.
    """

    prompt: str
    channel: str
    ignored_fields: list[str] = []


class VoiceOption(BaseModel):
    """One selectable Cartesia voice."""

    id: str
    name: str
    language: str = ""
    description: str | None = None


class VoicePreviewRequest(BaseModel):
    """Ask for one spoken line, to compare voices before saving."""

    voice_id: str = Field(min_length=1)
    text: str | None = None


class ConversationReport(BaseModel):
    """Read-only recap of a single conversation for the activity report."""

    id: UUID
    title: str
    # Channel it ran on: "voice" (call) or "text" (chat)
    mode: str = CONVERSATION_MODE_VOICE
    avatar_id: UUID
    avatar_name: str
    avatar_category: str
    created_at: datetime
    message_count: int
    # First-to-last message span; 0 when the conversation has < 2 messages
    duration_seconds: int


class UserActivityReport(BaseModel):
    """Read-only recap of a user with their conversations and durations."""

    id: UUID
    email: str
    nome: str
    cognome: str
    ruolo: str
    organization_id: UUID | None = None
    organization_name: str | None = None
    created_at: datetime
    conversation_count: int
    total_duration_seconds: int
    conversations: list[ConversationReport]


class EvaluationCriterionScore(BaseModel):
    """Score of a single criterion inside the evaluations report."""

    key: str
    label: str
    score: float


class EvaluationReportRow(BaseModel):
    """One evaluated conversation, flattened for the dashboard charts.

    `overall_score` is the grade that counts, so a conversation a trainer
    corrected is charted and exported at the corrected value: a report that
    kept plotting the machine's number would contradict what the student
    reads on their own page. `ai_overall_score` keeps the AI's own next to
    it, and the two differ exactly when `has_override` is true.
    """

    conversation_id: UUID
    conversation_title: str
    # Channel it ran on: "voice" (call) or "text" (chat)
    mode: str = CONVERSATION_MODE_VOICE
    user_id: UUID
    user_email: str
    user_nome: str
    user_cognome: str
    organization_id: UUID | None = None
    organization_name: str | None = None
    avatar_id: UUID
    avatar_name: str
    conversation_at: datetime
    evaluated_at: datetime
    overall_score: float
    ai_overall_score: float
    has_override: bool = False
    # A trainer has been through this conversation (note, correction or both)
    has_review: bool = False
    criteria: list[EvaluationCriterionScore]


class AdminConversationDetail(BaseModel):
    """Full transcript + stored evaluation of a conversation, for the admin dashboard."""

    conversation_id: UUID
    messages: list[ChatMessageResponse]
    evaluation: ConversationEvaluationResponse | None = None
    # Carried next to the evaluation rather than inside it: a trainer can
    # annotate a conversation the AI never judged, and that review still has
    # to reach the modal.
    review: ConversationReviewResponse | None = None


# --- Notifiche (derivate, mai memorizzate: vedi notifications.py) ---


class NotificationResponse(BaseModel):
    """One thing to tell the user, assembled at read time."""

    # Stable identity of the event: what a read mark refers to
    key: str
    # "assignment.assigned", "assignment.due_soon", "assignment.overdue",
    # "review.published" (see notifications.py)
    kind: str
    title: str
    body: str
    # When the event became true, which is the order of the list
    at: datetime
    read: bool
    # Where clicking it takes the user, None when there is nowhere to go
    link: str | None = None


class NotificationListResponse(BaseModel):
    """The user's notifications, newest first, with the unread counter.

    The counter is returned next to the items rather than left to the client
    to compute: the bell shows it before anything is opened, and two
    definitions of "unread" would eventually disagree.
    """

    items: list[NotificationResponse]
    unread: int


class NotificationReadRequest(BaseModel):
    """Mark notifications as read.

    An empty (or absent) list means "everything the user can currently see":
    it is the "segna tutte come lette" button, and it is resolved on the
    server because only the server knows what is derivable right now.
    """

    keys: list[str] | None = None


# --- Audit log (super admin only) ---


class AuditLogResponse(BaseModel):
    """One recorded action, as the super admin's registry shows it."""

    id: UUID
    created_at: datetime
    user_id: UUID | None = None
    user_email: str
    user_role: str
    organization_id: UUID | None = None
    organization_name: str | None = None
    action: str
    # Italian wording of `action`, resolved at read time from the catalogue
    action_label: str
    resource_type: str | None = None
    resource_id: str | None = None
    method: str
    path: str
    status_code: int
    client_ip: str
    user_agent: str
    details: dict | None = None


class AuditLogPage(BaseModel):
    """A window over the registry: the rows plus how many matched in all."""

    total: int
    items: list[AuditLogResponse]


class AuditActionOption(BaseModel):
    """An action the registry can contain, for the filter dropdown."""

    key: str
    label: str


# --- Generic Response ---


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str
    success: bool = True
