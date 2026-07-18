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
from models import Avatar, User, ChatConversation, ChatMessage, ConversationEvaluation
from auth_dependency import get_current_user
from gemini_service import evaluate_conversation
from schemas import (
    ChatMessageResponse,
    ChatConversationResponse,
    ChatConversationSummary,
    ConversationEvaluationResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _evaluation_response(evaluation: ConversationEvaluation) -> ConversationEvaluationResponse:
    data = evaluation.result or {}
    return ConversationEvaluationResponse(
        id=evaluation.id,
        conversation_id=evaluation.conversation_id,
        overall_score=evaluation.overall_score,
        summary=data.get("summary", ""),
        criteria=data.get("criteria", []),
        created_at=evaluation.created_at,
        updated_at=evaluation.updated_at,
    )


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
        raise HTTPException(status_code=404, detail="Avatar non trovato.")

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
        raise HTTPException(status_code=404, detail="Conversazione non trovata.")

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


@router.post(
    "/conversation/{conversation_id}/evaluate",
    response_model=ConversationEvaluationResponse,
)
def create_conversation_evaluation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Judge the whole conversation with the AI trainer (same Gemini model of
    the roleplay) and store the result. Re-evaluating a conversation (e.g.
    after resuming the call) replaces the previous evaluation.
    """
    conversation = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversazione non trovata.")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    if not any(m.role == "user" for m in messages):
        raise HTTPException(
            status_code=400,
            detail="La conversazione è troppo breve per essere valutata: l'operatore non ha ancora parlato.",
        )

    avatar = db.query(Avatar).filter(Avatar.id == conversation.avatar_id).first()
    history = [{"role": m.role, "content": m.content} for m in messages]

    try:
        result = evaluate_conversation(history, avatar.profile if avatar else {})
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    evaluation = (
        db.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation_id)
        .first()
    )
    if evaluation:
        evaluation.overall_score = result["overall_score"]
        evaluation.result = result
    else:
        evaluation = ConversationEvaluation(
            conversation_id=conversation.id,
            overall_score=result["overall_score"],
            result=result,
        )
        db.add(evaluation)
    db.commit()
    db.refresh(evaluation)

    return _evaluation_response(evaluation)


@router.get(
    "/conversation/{conversation_id}/evaluation",
    response_model=ConversationEvaluationResponse | None,
)
def get_conversation_evaluation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the stored evaluation for a conversation, or null if absent."""
    conversation = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversazione non trovata.")

    evaluation = (
        db.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation_id)
        .first()
    )
    return _evaluation_response(evaluation) if evaluation else None


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
        raise HTTPException(status_code=404, detail="Conversazione non trovata.")

    db.delete(conversation)
    db.commit()

    return MessageResponse(message="Conversazione eliminata con successo.", success=True)
