"""Chat API endpoints for avatar conversations.

A conversation runs on one of two channels, fixed when it is opened:

- "voice": a simulated phone call (ElevenLabs STT + OpenAI + Cartesia TTS,
  see routers/voice.py). These endpoints only expose its transcript.
- "text": a written chat with the same avatar, driven from here. Only the
  LLM is involved: no speech to text, no text to speech.

Both start the same way, with the operator writing/speaking first.
"""

import asyncio
import json
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth_dependency import get_current_user
from conversation_titles import next_conversation_title
from database import get_db
from exports import evaluation_pdf
from models import (
    CONVERSATION_MODE_TEXT,
    Avatar,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    User,
)
from openai_service import evaluate_conversation, stream_avatar_response
from persona_prompt import CHANNEL_TEXT, CHANNEL_VOICE
from routers.avatars import _visible_avatars
from schemas import (
    ChatConversationResponse,
    ChatConversationSummary,
    ChatMessageExchange,
    ChatMessageRequest,
    ChatMessageResponse,
    ConversationEvaluationResponse,
    ConversationRenameRequest,
    PreviousAttempt,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _previous_attempt(db: Session, conversation: ChatConversation) -> PreviousAttempt | None:
    """The user's closest earlier evaluated conversation with the same avatar.

    Attempts are ordered by when the conversation was opened, not by when
    it was judged: evaluating an old transcript later must not make it the
    "previous attempt" of everything in between.
    """
    row = (
        db.query(ChatConversation, ConversationEvaluation)
        .join(
            ConversationEvaluation,
            ConversationEvaluation.conversation_id == ChatConversation.id,
        )
        .filter(
            ChatConversation.user_id == conversation.user_id,
            ChatConversation.avatar_id == conversation.avatar_id,
            ChatConversation.created_at < conversation.created_at,
        )
        .order_by(ChatConversation.created_at.desc())
        .first()
    )
    if not row:
        return None
    prev_conv, prev_eval = row
    return PreviousAttempt(
        conversation_id=prev_conv.id,
        title=prev_conv.title,
        mode=prev_conv.mode,
        conversation_at=prev_conv.created_at,
        overall_score=prev_eval.overall_score,
        criteria_scores={
            str(c["key"]): float(c.get("score", 0) or 0)
            for c in ((prev_eval.result or {}).get("criteria") or [])
            if c.get("key")
        },
    )


def _evaluation_response(
    db: Session, conversation: ChatConversation, evaluation: ConversationEvaluation
) -> ConversationEvaluationResponse:
    data = evaluation.result or {}
    return ConversationEvaluationResponse(
        id=evaluation.id,
        conversation_id=evaluation.conversation_id,
        overall_score=evaluation.overall_score,
        summary=data.get("summary", ""),
        criteria=data.get("criteria", []),
        previous=_previous_attempt(db, conversation),
        created_at=evaluation.created_at,
        updated_at=evaluation.updated_at,
    )


def _conversation_summary(db: Session, conv: ChatConversation) -> ChatConversationSummary:
    """Build the list entry for a conversation: counter plus last message preview."""
    msg_count = (
        db.query(func.count(ChatMessage.id)).filter(ChatMessage.conversation_id == conv.id).scalar()
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
    avatar = _visible_avatars(db.query(Avatar), current_user).filter(Avatar.id == avatar_id).first()
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


def _sse_event(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


def _persist_exchange(
    db: Session,
    user_id: UUID,
    avatar_id: UUID,
    avatar_category: str,
    conversation_id: UUID | None,
    content: str,
    reply: str,
) -> ChatMessageExchange:
    """Blocking write of one completed exchange (run via asyncio.to_thread).

    The request-scoped session is still open here: FastAPI tears yielded
    dependencies down only after the response has fully streamed out.
    Explicit timestamps: the two messages land in the same commit and the
    transcript is read back ordered by created_at, so the reply must be
    strictly after the message it answers.
    """
    if conversation_id is None:
        conversation = ChatConversation(
            avatar_id=avatar_id,
            user_id=user_id,
            title=next_conversation_title(db, user_id, avatar_category),
            mode=CONVERSATION_MODE_TEXT,
        )
        db.add(conversation)
        db.flush()
    else:
        conversation = (
            db.query(ChatConversation).filter(ChatConversation.id == conversation_id).one()
        )

    now = datetime.now(UTC)
    user_message = ChatMessage(
        conversation_id=conversation.id,
        role="user",
        content=content,
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


@router.post("/message")
async def send_chat_message(
    payload: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send one operator message in a text chat and stream the avatar's reply.

    The response is Server-Sent Events, so the first words reach the
    operator at the model's first token instead of at the end:

    - "delta"  {"text": ...} — one fragment as OpenAI produces it
    - "done"   the persisted exchange (ChatMessageExchange), stream over
    - "error"  {"detail": ...} — nothing was persisted, simply resend

    Validation problems (unknown avatar, closed conversation...) are raised
    before the stream opens and still travel as ordinary HTTP errors.
    Without a conversation_id a new text conversation is opened, so the
    operator writes first just as they speak first on a call. Nothing is
    persisted until the reply has fully streamed: a failed generation
    leaves no half exchange in the transcript.
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

    # Captured as plain values: the generator runs after this handler
    # returns, when lazy loads on the ORM objects are no longer welcome.
    avatar_profile = avatar.profile
    avatar_id = avatar.id
    avatar_category = avatar.category
    conversation_id = conversation.id if conversation else None
    user_id = current_user.id

    async def event_stream():
        parts: list[str] = []
        try:
            async for delta in stream_avatar_response(history, avatar_profile, CHANNEL_TEXT):
                parts.append(delta)
                yield _sse_event("delta", json.dumps({"text": delta}))
            reply = "".join(parts).strip()
            # An empty reply leaves the operator with nothing to answer to
            if not reply:
                raise RuntimeError("L'avatar non ha prodotto nessuna risposta: riprova.")
            exchange = await asyncio.to_thread(
                _persist_exchange,
                db,
                user_id,
                avatar_id,
                avatar_category,
                conversation_id,
                payload.content,
                reply,
            )
            yield _sse_event("done", exchange.model_dump_json())
        except Exception as e:
            print(f"[ERROR] Streaming chat fallito: {e}")
            detail = str(e) if isinstance(e, RuntimeError) else "Errore nella risposta dell'avatar."
            yield _sse_event("error", json.dumps({"detail": detail}))

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # nginx buffers proxied responses by default, which would turn
            # the stream back into one final block
            "X-Accel-Buffering": "no",
        },
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
        conversation.ended_at = datetime.now(UTC)
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
    # The ids anchor the judge's citations back to the stored messages
    history = [{"id": str(m.id), "role": m.role, "content": m.content} for m in messages]
    # Same criteria either way: the channel only tells the trainer whether
    # it is reading a call or a chat.
    channel = CHANNEL_TEXT if conversation.mode == CONVERSATION_MODE_TEXT else CHANNEL_VOICE

    try:
        result = await evaluate_conversation(history, avatar.profile if avatar else {}, channel)
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

    return _evaluation_response(db, conversation, evaluation)


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
    return _evaluation_response(db, conversation, evaluation) if evaluation else None


@router.get("/conversation/{conversation_id}/evaluation/pdf")
def download_evaluation_pdf(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The stored evaluation as a PDF the operator can hand to the trainer.

    Owner only, like every other read of the conversation. The document
    carries the same content as the on-screen report: overall score and
    summary, per-criterion scores with comments and suggestions, and the
    comparison with the previous attempt when there is one.
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

    evaluation = (
        db.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation_id)
        .first()
    )
    if not evaluation:
        raise HTTPException(
            status_code=404, detail="Questa conversazione non ha ancora una valutazione."
        )

    avatar = db.query(Avatar).filter(Avatar.id == conversation.avatar_id).first()
    data = evaluation.result or {}
    pdf = evaluation_pdf(
        operator_name=f"{current_user.nome} {current_user.cognome}".strip() or current_user.email,
        avatar_name=avatar.name if avatar else "",
        conversation_title=conversation.title,
        mode=conversation.mode,
        conversation_at=conversation.created_at,
        evaluated_at=evaluation.updated_at,
        overall_score=evaluation.overall_score,
        summary=data.get("summary", ""),
        criteria=data.get("criteria") or [],
        previous=_previous_attempt(db, conversation),
    )

    # ASCII-only filename derived from the conversation title
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", conversation.title).strip("-").lower() or "conversazione"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="valutazione-{slug}.pdf"'},
    )
