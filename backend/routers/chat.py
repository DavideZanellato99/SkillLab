"""Chat API endpoints for avatar conversations."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Avatar, ChatConversation, ChatMessage
from schemas import (
    ChatSendRequest,
    ChatSendResponse,
    ChatMessageResponse,
    ChatConversationResponse,
    ChatConversationSummary,
    MessageResponse,
)
from gemini_service import get_avatar_response

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/avatar/{avatar_id}/conversations", response_model=list[ChatConversationSummary])
def list_conversations(avatar_id: int, db: Session = Depends(get_db)):
    """List all conversations for a given avatar."""
    # Verify avatar exists
    avatar = db.query(Avatar).filter(Avatar.id == avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")

    conversations = (
        db.query(ChatConversation)
        .filter(ChatConversation.avatar_id == avatar_id)
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
def get_conversation(conversation_id: int, db: Session = Depends(get_db)):
    """Get a conversation with all its messages."""
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id)
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


@router.post("/avatar/{avatar_id}/send", response_model=ChatSendResponse)
def send_message(avatar_id: int, request: ChatSendRequest, db: Session = Depends(get_db)):
    """Send a message and get an AI response in character."""
    # Verify avatar exists
    avatar = db.query(Avatar).filter(Avatar.id == avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")

    # Get or create conversation
    if request.conversation_id:
        conversation = (
            db.query(ChatConversation)
            .filter(
                ChatConversation.id == request.conversation_id,
                ChatConversation.avatar_id == avatar_id,
            )
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        conversation = ChatConversation(avatar_id=avatar_id)
        db.add(conversation)
        db.flush()  # Get the ID

    # Load existing messages for context
    existing_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    messages_history = [
        {"role": msg.role, "content": msg.content} for msg in existing_messages
    ]

    # Call Gemini
    try:
        ai_response = get_avatar_response(
            avatar_name=avatar.name,
            avatar_description=avatar.description or "",
            avatar_category=avatar.category,
            messages_history=messages_history,
            user_message=request.content,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Save user message
    user_msg = ChatMessage(
        conversation_id=conversation.id,
        role="user",
        content=request.content,
    )
    db.add(user_msg)

    # Save assistant message
    assistant_msg = ChatMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=ai_response,
    )
    db.add(assistant_msg)

    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)
    db.refresh(conversation)

    return ChatSendResponse(
        conversation_id=conversation.id,
        user_message=ChatMessageResponse(
            id=user_msg.id,
            role=user_msg.role,
            content=user_msg.content,
            created_at=user_msg.created_at,
        ),
        assistant_message=ChatMessageResponse(
            id=assistant_msg.id,
            role=assistant_msg.role,
            content=assistant_msg.content,
            created_at=assistant_msg.created_at,
        ),
    )


@router.delete("/conversation/{conversation_id}", response_model=MessageResponse)
def delete_conversation(conversation_id: int, db: Session = Depends(get_db)):
    """Delete a conversation and all its messages."""
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.delete(conversation)
    db.commit()

    return MessageResponse(message="Conversazione eliminata con successo.", success=True)
