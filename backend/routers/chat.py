"""Chat history API endpoints for avatar conversations.

The conversations are voice-only (Hume EVI + Gemini, see routers/voice.py):
these endpoints only expose the persisted transcripts — there is no
endpoint to send text messages.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Avatar, User, ChatConversation, ChatMessage
from auth_dependency import get_current_user
from schemas import (
    ChatMessageResponse,
    ChatConversationResponse,
    ChatConversationSummary,
    MessageResponse,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/avatar/{avatar_id}/conversations", response_model=list[ChatConversationSummary])
def list_conversations(
    avatar_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all conversations for a given avatar belonging to the current user."""
    # Verify avatar exists
    avatar = db.query(Avatar).filter(Avatar.id == avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")

    conversations = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.avatar_id == avatar_id,
            ChatConversation.user_id == current_user.id,
        )
        .order_by(ChatConversation.updated_at.desc())
        .all()
    )

    result = []
    for conv in conversations:
        msg_count = (
            db.query(func.count(ChatMessage.id))
            .filter(ChatMessage.conversation_id == conv.id)
            .scalar()
        )
        # Get the last message for preview
        last_msg = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conv.id)
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        preview = None
        if last_msg:
            preview = last_msg.content[:100] + ("..." if len(last_msg.content) > 100 else "")

        result.append(
            ChatConversationSummary(
                id=conv.id,
                avatar_id=conv.avatar_id,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                message_count=msg_count or 0,
                last_message_preview=preview,
            )
        )

    return result


@router.get("/conversation/{conversation_id}", response_model=ChatConversationResponse)
def get_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a conversation with all its messages (only if it belongs to the current user)."""
    conversation = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )

    return ChatConversationResponse(
        id=conversation.id,
        avatar_id=conversation.avatar_id,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[
            ChatMessageResponse(
                id=msg.id,
                role=msg.role,
                content=msg.content,
                created_at=msg.created_at,
            )
            for msg in messages
        ],
    )


@router.delete("/conversation/{conversation_id}", response_model=MessageResponse)
def delete_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a conversation and all its messages (only if it belongs to the current user)."""
    conversation = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.delete(conversation)
    db.commit()

    return MessageResponse(message="Conversazione eliminata con successo.", success=True)
