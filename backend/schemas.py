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


# --- Generic Response ---

class MessageResponse(BaseModel):
    """Generic message response."""
    message: str
    success: bool = True
