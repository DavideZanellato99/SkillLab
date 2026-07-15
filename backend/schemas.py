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


# --- Generic Response ---

class MessageResponse(BaseModel):
    """Generic message response."""
    message: str
    success: bool = True
