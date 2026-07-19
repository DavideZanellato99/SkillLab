"""Pydantic schemas for request/response validation."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


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


class ChatConversationResponse(BaseModel):
    """Schema for conversation API responses."""
    id: UUID
    avatar_id: UUID
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageResponse] = []

    model_config = {"from_attributes": True}


class EvaluationCriterionResponse(BaseModel):
    """Score and feedback for a single evaluation criterion."""
    key: str
    label: str
    score: float
    comment: str
    # Improvement suggestions, present only when score < 7
    suggestions: str | None = None


class ConversationEvaluationResponse(BaseModel):
    """AI evaluation of the operator's performance in a conversation."""
    id: UUID
    conversation_id: UUID
    overall_score: float
    summary: str
    criteria: list[EvaluationCriterionResponse]
    created_at: datetime
    updated_at: datetime


class ChatConversationSummary(BaseModel):
    """Lightweight schema for listing conversations (without full messages)."""
    id: UUID
    avatar_id: UUID
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message_preview: str | None = None

    model_config = {"from_attributes": True}


# --- Voice Schemas ---

class VoiceSessionRequest(BaseModel):
    """Schema for starting a voice session with an avatar."""
    avatar_id: UUID
    conversation_id: UUID | None = None
    # Call mode: the session simulates a phone call. Whether the avatar
    # speaks first (brief self-introduction) or waits in silence for the
    # operator depends on its persona sheet (CHI_INIZIA_CONVERSAZIONE).
    call_mode: bool = False


class VoiceSessionResponse(BaseModel):
    """Schema returned to the client to open the EVI WebSocket."""
    access_token: str
    config_id: str
    custom_session_id: str
    conversation_id: UUID
    voice_id: str | None = None
    # Opening line the avatar speaks after the ring when its persona sheet
    # says it starts the conversation; None when it waits for the operator
    greeting: str | None = None


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Admin Schemas ---

class CreateUserRequest(BaseModel):
    """Schema for admin creating a new user."""
    email: str
    nome: str
    cognome: str
    ruolo: str = "user"  # "super_admin" | "organization_admin" | "user"


class UpdateUserRequest(BaseModel):
    """Schema for admin updating a user; omitted fields are left unchanged."""
    nome: str | None = None
    cognome: str | None = None
    ruolo: str | None = None


class UpdateUserStatusRequest(BaseModel):
    """Schema for admin changing an account's state."""
    status: str  # "active" | "suspended" | "disabled"


class AdminAvatarPayload(BaseModel):
    """Schema for creating/updating an avatar (training persona) from the
    admin page. The avatar name is derived from profile NOME + COGNOME."""
    category: str = "Clienti"
    description: str | None = None
    # Empty → the backend generates an initials placeholder image
    image_url: str | None = None
    voice_id: str | None = None
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
    profile: dict
    created_at: datetime
    conversation_count: int = 0


class ConversationReport(BaseModel):
    """Read-only recap of a single conversation for the activity report."""
    id: UUID
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
    """One evaluated conversation, flattened for the dashboard charts."""
    conversation_id: UUID
    user_id: UUID
    user_email: str
    user_nome: str
    user_cognome: str
    avatar_id: UUID
    avatar_name: str
    conversation_at: datetime
    evaluated_at: datetime
    overall_score: float
    criteria: list[EvaluationCriterionScore]


class AdminConversationDetail(BaseModel):
    """Full transcript + stored evaluation of a conversation, for the admin dashboard."""
    conversation_id: UUID
    messages: list[ChatMessageResponse]
    evaluation: ConversationEvaluationResponse | None = None


# --- Generic Response ---

class MessageResponse(BaseModel):
    """Generic message response."""
    message: str
    success: bool = True
