"""Voice conversation API endpoints (Hume EVI + Gemini CLM pipeline).

Flow:
1. The client calls POST /api/voice/session (authenticated) and receives a
   Hume access token, the EVI config id, the avatar's voice id and an
   unguessable custom_session_id bound to user+avatar+conversation.
2. The browser opens the EVI WebSocket directly with Hume and streams the
   microphone. Hume performs streaming STT and turn-taking.
3. For each user turn, Hume calls POST /api/voice/clm/chat/completions
   (public, reachable through a tunnel in dev) with the live transcript.
   We inject the avatar profile + persisted history and stream Gemini
   tokens back as OpenAI-compatible SSE chunks; EVI starts speaking on the
   first tokens (streaming TTS).
"""

import json
import time
import uuid as uuid_lib
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from models import Avatar, User, ChatConversation, ChatMessage
from auth_dependency import get_current_user
from schemas import VoiceSessionRequest, VoiceSessionResponse
from gemini_service import stream_avatar_response, GEMINI_MODEL
from hume_service import (
    HUME_EVI_CONFIG_ID,
    HUME_DEFAULT_VOICE_ID,
    fetch_access_token,
    create_voice_session,
    get_voice_session,
)

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/session", response_model=VoiceSessionResponse)
def start_voice_session(
    request: VoiceSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start a voice session: returns Hume credentials + session binding."""
    if not HUME_EVI_CONFIG_ID:
        raise HTTPException(
            status_code=503,
            detail="HUME_EVI_CONFIG_ID non configurato. Esegui setup_hume.py e aggiorna il .env.",
        )

    avatar = db.query(Avatar).filter(Avatar.id == request.avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")

    # Get or create the conversation (shared with the text chat)
    if request.conversation_id:
        conversation = (
            db.query(ChatConversation)
            .filter(
                ChatConversation.id == request.conversation_id,
                ChatConversation.avatar_id == request.avatar_id,
                ChatConversation.user_id == current_user.id,
            )
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        conversation = ChatConversation(avatar_id=request.avatar_id, user_id=current_user.id)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # Snapshot of the persisted history: during the voice session Hume sends
    # the live transcript, so the DB is not re-read at every turn.
    existing_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    prior_history = [{"role": m.role, "content": m.content} for m in existing_messages]

    try:
        access_token = fetch_access_token()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    custom_session_id = create_voice_session(
        user_id=str(current_user.id),
        avatar_id=str(avatar.id),
        conversation_id=str(conversation.id),
        prior_history=prior_history,
    )

    return VoiceSessionResponse(
        access_token=access_token,
        config_id=HUME_EVI_CONFIG_ID,
        custom_session_id=custom_session_id,
        conversation_id=conversation.id,
        voice_id=avatar.voice_id or HUME_DEFAULT_VOICE_ID or None,
    )


def _extract_clm_history(payload: dict) -> list[dict]:
    """Extract role/content messages from Hume's OpenAI-style CLM request."""
    history = []
    for msg in payload.get("messages", []):
        role = msg.get("role")
        content = msg.get("content")
        if role not in ("user", "assistant") or not isinstance(content, str):
            continue
        content = content.strip()
        if content:
            history.append({"role": role, "content": content})
    return history


def _sse_chunk(chunk_id: str, created: int, content: str | None, finish: str | None = None) -> str:
    """Format one OpenAI-compatible chat.completion.chunk SSE event."""
    delta = {"content": content} if content is not None else {}
    event = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": GEMINI_MODEL,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/clm/chat/completions")
async def clm_chat_completions(request: Request, custom_session_id: str | None = None):
    """
    OpenAI-compatible SSE endpoint called by Hume EVI (Custom Language Model).

    Public by design (Hume's cloud must reach it); access is gated by the
    unguessable custom_session_id issued by /api/voice/session.
    """
    session = get_voice_session(custom_session_id) if custom_session_id else None
    if not session:
        raise HTTPException(status_code=404, detail="Sessione vocale non valida o scaduta.")

    payload = await request.json()
    live_history = _extract_clm_history(payload)
    if not live_history or live_history[-1]["role"] != "user":
        raise HTTPException(status_code=400, detail="Nessun messaggio utente nella richiesta.")

    full_history = session.prior_history + live_history
    user_message = live_history[-1]["content"]

    def event_stream():
        chunk_id = f"chatcmpl-{uuid_lib.uuid4().hex[:24]}"
        created = int(time.time())

        # Own DB session: it must live for the whole duration of the stream
        db = SessionLocal()
        assistant_text = ""
        try:
            avatar = db.query(Avatar).filter(Avatar.id == UUID(session.avatar_id)).first()
            if not avatar:
                yield _sse_chunk(chunk_id, created, "Mi dispiace, si è verificato un errore.", "stop")
                yield "data: [DONE]\n\n"
                return

            # Persist the user's transcript right away
            db.add(
                ChatMessage(
                    conversation_id=UUID(session.conversation_id),
                    role="user",
                    content=user_message,
                )
            )
            db.commit()

            try:
                for text_chunk in stream_avatar_response(
                    avatar_name=avatar.name,
                    avatar_description=avatar.description or "",
                    avatar_category=avatar.category,
                    messages_history=full_history,
                ):
                    assistant_text += text_chunk
                    yield _sse_chunk(chunk_id, created, text_chunk)
            except RuntimeError as e:
                print(f"[ERROR] CLM Gemini failure: {e}")
                fallback = "Mi dispiace, ho avuto un problema tecnico. Puoi ripetere?"
                assistant_text = assistant_text or fallback
                yield _sse_chunk(chunk_id, created, fallback)

            yield _sse_chunk(chunk_id, created, None, "stop")
            yield "data: [DONE]\n\n"

            # Persist the assistant reply and touch the conversation
            if assistant_text:
                db.add(
                    ChatMessage(
                        conversation_id=UUID(session.conversation_id),
                        role="assistant",
                        content=assistant_text,
                    )
                )
                conversation = (
                    db.query(ChatConversation)
                    .filter(ChatConversation.id == UUID(session.conversation_id))
                    .first()
                )
                if conversation:
                    conversation.updated_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
