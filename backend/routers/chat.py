"""Chat API endpoints for avatar conversations.

A conversation runs on one of two channels, fixed when it is opened:

- "voice": a simulated phone call (ElevenLabs STT + OpenAI + Cartesia TTS,
  see routers/voice.py). These endpoints only expose its transcript.
- "text": a written chat with the same avatar, driven from here. Only the
  LLM is involved: no speech to text, no text to speech.

Both start the same way, with the operator writing/speaking first.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import (
    CONVERSATION_MODE_TEXT,
    Avatar,
    User,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
)
from auth_dependency import get_current_user
from routers.avatars import _visible_avatars
from conversation_titles import next_conversation_title
from openai_service import evaluate_conversation, generate_avatar_reply
from persona_prompt import CHANNEL_TEXT, CHANNEL_VOICE
from schemas import (
    ChatMessageExchange,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatConversationResponse,
    ChatConversationSummary,
    ConversationEvaluationResponse,
    ConversationRenameRequest,
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


def _conversation_summary(db: Session, conv: ChatConversation) -> ChatConversationSummary:
    """Build the list entry for a conversation: counter plus last message preview."""
    msg_count = (
        db.query(func.count(ChatMessage.id))
        .filter(ChatMessage.conversation_id == conv.id)
        .scalar()
    )
    last_msg = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conv.id)
        .order_by(ChatMessage.created_at.desc())
        .first()
    )
    preview = None
    if last_msg:
        preview = last_msg.content[:100] + ("..." if len(last_msg.content) > 100 else "")

    return ChatConversationSummary(
        id=conv.id,
        avatar_id=conv.avatar_id,
        title=conv.title,
        mode=conv.mode,
        ended_at=conv.ended_at,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=msg_count or 0,
        last_message_preview=preview,
    )


@router.get("/avatar/{avatar_id}/conversations", response_model=list[ChatConversationSummary])
def list_conversations(
    avatar_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all conversations for a given avatar belonging to the current user."""
    # Verify the avatar exists and is visible to this user
    avatar = (
        _visible_avatars(db.query(Avatar), current_user)
        .filter(Avatar.id == avatar_id)
        .first()
    )
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

    return [_conversation_summary(db, conv) for conv in conversations]


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
        title=conversation.title,
        mode=conversation.mode,
        ended_at=conversation.ended_at,
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


@router.patch("/conversation/{conversation_id}", response_model=ChatConversationSummary)
def rename_conversation(
    conversation_id: UUID,
    payload: ConversationRenameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rename one of the current user's conversations.

    The title is mandatory, so a blank one is rejected upstream by the
    schema. Every user can rename their own conversations: no admin role
    required.
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

    # Renaming is not activity: updated_at orders the sidebar and dates each
    # call, so it is written explicitly with its current value — otherwise the
    # column's onupdate would bump it and move the conversation to the top.
    db.query(ChatConversation).filter(ChatConversation.id == conversation.id).update(
        {
            ChatConversation.title: payload.title,
            ChatConversation.updated_at: conversation.updated_at,
        },
        synchronize_session=False,
    )
    db.commit()
    db.refresh(conversation)

    return _conversation_summary(db, conversation)


@router.post("/message", response_model=ChatMessageExchange)
async def send_chat_message(
    payload: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send one operator message in a text chat and return the avatar's reply.

    Without a conversation_id a new text conversation is opened, so the
    operator writes first just as they speak first on a call. The LLM runs
    before anything is persisted: a failed generation leaves no half
    exchange in the transcript and the operator can simply send again.
    """
    avatar = (
        _visible_avatars(db.query(Avatar), current_user)
        .filter(Avatar.id == payload.avatar_id)
        .first()
    )
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar non trovato.")

    conversation = None
    history: list[dict] = []
    if payload.conversation_id:
        conversation = (
            db.query(ChatConversation)
            .filter(
                ChatConversation.id == payload.conversation_id,
                ChatConversation.avatar_id == payload.avatar_id,
                ChatConversation.user_id == current_user.id,
            )
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversazione non trovata.")
        # The channel is fixed at creation: a call transcript is not a chat
        # the operator can keep writing into.
        if conversation.mode != CONVERSATION_MODE_TEXT:
            raise HTTPException(
                status_code=409,
                detail="Questa conversazione è una chiamata: non può proseguire in chat.",
            )
        # A closed chat is final, exactly like a hung-up call
        if conversation.ended_at is not None:
            raise HTTPException(
                status_code=409,
                detail="Questa conversazione è terminata: avviane una nuova per scrivere ancora all'avatar.",
            )
        prior_messages = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.created_at.asc())
            .all()
        )
        history = [{"role": m.role, "content": m.content} for m in prior_messages]

    history.append({"role": "user", "content": payload.content})

    try:
        reply = await generate_avatar_reply(history, avatar.profile)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    if conversation is None:
        conversation = ChatConversation(
            avatar_id=avatar.id,
            user_id=current_user.id,
            title=next_conversation_title(db, current_user.id, avatar.category),
            mode=CONVERSATION_MODE_TEXT,
        )
        db.add(conversation)
        db.flush()

    # Explicit timestamps: the two messages are written in the same commit
    # and the transcript is read back ordered by created_at, so the reply
    # must be strictly after the message it answers.
    now = datetime.now(timezone.utc)
    user_message = ChatMessage(
        conversation_id=conversation.id,
        role="user",
        content=payload.content,
        created_at=now,
    )
    assistant_message = ChatMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=reply,
        created_at=now + timedelta(milliseconds=1),
    )
    db.add_all([user_message, assistant_message])
    conversation.updated_at = now
    db.commit()
    db.refresh(user_message)
    db.refresh(assistant_message)
    db.refresh(conversation)

    return ChatMessageExchange(
        conversation_id=conversation.id,
        title=conversation.title,
        user_message=ChatMessageResponse.model_validate(user_message),
        assistant_message=ChatMessageResponse.model_validate(assistant_message),
    )


@router.post("/conversation/{conversation_id}/end", response_model=ChatConversationSummary)
def end_chat_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Close a text chat: the transcript becomes final, like hanging up a call.

    Calls are closed by the voice pipeline when the socket drops, so this
    endpoint only serves the text channel.
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
    if conversation.mode != CONVERSATION_MODE_TEXT:
        raise HTTPException(
            status_code=409,
            detail="Questa conversazione è una chiamata: si chiude riagganciando.",
        )

    # Idempotent: closing an already closed chat just returns it
    if conversation.ended_at is None:
        conversation.ended_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(conversation)

    return _conversation_summary(db, conversation)


@router.post(
    "/conversation/{conversation_id}/evaluate",
    response_model=ConversationEvaluationResponse,
)
async def create_conversation_evaluation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Judge the whole conversation with the AI trainer (OpenAI reasoning
    model, see openai_service.evaluate_conversation) and store the result.
    Re-running the judgement replaces the previous evaluation.
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
    # Same criteria either way: the channel only tells the trainer whether
    # it is reading a call or a chat.
    channel = CHANNEL_TEXT if conversation.mode == CONVERSATION_MODE_TEXT else CHANNEL_VOICE

    try:
        result = await evaluate_conversation(
            history, avatar.profile if avatar else {}, channel
        )
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
