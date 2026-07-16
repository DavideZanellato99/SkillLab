"""SQLAlchemy ORM models for the Avatar Selection app."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Uuid
from sqlalchemy.orm import relationship
from database import Base

# Canonical role names (rows of the `roles` table)
ROLE_SUPER_ADMIN = "super_admin"
ROLE_ORGANIZATION_ADMIN = "organization_admin"
ROLE_USER = "user"
ALL_ROLES = [ROLE_SUPER_ADMIN, ROLE_ORGANIZATION_ADMIN, ROLE_USER]

# Roles allowed to access the admin endpoints
ADMIN_ROLES = [ROLE_SUPER_ADMIN, ROLE_ORGANIZATION_ADMIN]


class Role(Base):
    """A system role assignable to users."""

    __tablename__ = "roles"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

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
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    role = relationship("Role", back_populates="users", lazy="joined")
    selections = relationship("UserSelection", back_populates="user")
    conversations = relationship("ChatConversation", back_populates="user")

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
    # Hume voice id used for the voice conversation mode (falls back to
    # HUME_DEFAULT_VOICE_ID when null)
    voice_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship to selections
    selections = relationship("UserSelection", back_populates="avatar")
    conversations = relationship("ChatConversation", back_populates="avatar")

    def __repr__(self):
        return f"<Avatar(id={self.id}, name='{self.name}', category='{self.category}')>"


class UserSelection(Base):
    """Records when a user selects an avatar."""

    __tablename__ = "user_selections"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
    avatar_id = Column(Uuid, ForeignKey("avatars.id"), nullable=False)
    selected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="selections")
    avatar = relationship("Avatar", back_populates="selections")

    def __repr__(self):
        return f"<UserSelection(id={self.id}, user_id={self.user_id}, avatar_id={self.avatar_id})>"


class ChatConversation(Base):
    """Represents a chat conversation with an avatar."""

    __tablename__ = "chat_conversations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
    avatar_id = Column(Uuid, ForeignKey("avatars.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
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

    def __repr__(self):
        return f"<ChatConversation(id={self.id}, user_id={self.user_id}, avatar_id={self.avatar_id})>"


class ChatMessage(Base):
    """Stores a single message in a chat conversation."""

    __tablename__ = "chat_messages"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4, index=True)
    conversation_id = Column(
        Uuid, ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    conversation = relationship("ChatConversation", back_populates="messages")

    def __repr__(self):
        return f"<ChatMessage(id={self.id}, role='{self.role}')>"
