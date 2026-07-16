"""Pydantic schemas for request/response validation."""

from datetime import datetime
from pydantic import BaseModel


# --- Avatar Schemas ---

class AvatarBase(BaseModel):
    """Base schema for avatar data."""
    name: str
    image_url: str
    category: str
    description: str | None = None


class AvatarCreate(AvatarBase):
    """Schema for creating a new avatar."""
    pass


class AvatarResponse(AvatarBase):
    """Schema for avatar API responses."""
    id: int
    created_at: datetime
    selection_count: int = 0

    model_config = {"from_attributes": True}


# --- Selection Schemas ---

class SelectionCreate(BaseModel):
    """Schema for creating a new avatar selection."""
    avatar_id: int


class SelectionResponse(BaseModel):
    """Schema for selection API responses."""
    id: int
    avatar_id: int
    selected_at: datetime
    avatar: AvatarResponse

    model_config = {"from_attributes": True}


# --- Chat Schemas ---

class ChatMessageCreate(BaseModel):
    """Schema for sending a new chat message."""
    content: str


class ChatSendRequest(BaseModel):
    """Schema for the chat send endpoint."""
    content: str
    conversation_id: int | None = None


class ChatMessageResponse(BaseModel):
    """Schema for a single chat message in API responses."""
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatConversationResponse(BaseModel):
    """Schema for conversation API responses."""
    id: int
    avatar_id: int
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageResponse] = []

    model_config = {"from_attributes": True}


class ChatConversationSummary(BaseModel):
    """Lightweight schema for listing conversations (without full messages)."""
    id: int
    avatar_id: int
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message_preview: str | None = None

    model_config = {"from_attributes": True}


class ChatSendResponse(BaseModel):
    """Schema for the response after sending a chat message."""
    conversation_id: int
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse


# --- Auth Schemas ---

class LoginRequest(BaseModel):
    """Schema for login request."""
    email: str
    password: str


class LoginResponse(BaseModel):
    """Schema for successful login response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
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


class RefreshTokenRequest(BaseModel):
    """Schema for refreshing the access token."""
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    """Schema for refresh token response."""
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """Schema for user profile response."""
    id: str
    cognito_sub: str
    email: str
    nome: str
    cognome: str
    ruolo: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Admin Schemas ---

class CreateUserRequest(BaseModel):
    """Schema for admin creating a new user."""
    email: str
    nome: str
    cognome: str
    ruolo: str = "utente"  # "admin" | "utente"


# --- Generic Response ---

class MessageResponse(BaseModel):
    """Generic message response."""
    message: str
    success: bool = True
