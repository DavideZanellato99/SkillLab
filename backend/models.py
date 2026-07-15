"""SQLAlchemy ORM models for the Avatar Selection app."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class Avatar(Base):
    """Represents an avatar that users can select."""

    __tablename__ = "avatars"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    image_url = Column(String(500), nullable=False)
    category = Column(String(50), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship to selections
    selections = relationship("UserSelection", back_populates="avatar")

    def __repr__(self):
        return f"<Avatar(id={self.id}, name='{self.name}', category='{self.category}')>"


class UserSelection(Base):
    """Records when a user selects an avatar."""

    __tablename__ = "user_selections"

    id = Column(Integer, primary_key=True, index=True)
    avatar_id = Column(Integer, ForeignKey("avatars.id"), nullable=False)
    selected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship to avatar
    avatar = relationship("Avatar", back_populates="selections")

    def __repr__(self):
        return f"<UserSelection(id={self.id}, avatar_id={self.avatar_id})>"
