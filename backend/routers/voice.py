"""Voice conversation API endpoints (ElevenLabs STT + OpenAI + Cartesia TTS).

Flow:
1. The client calls POST /api/voice/session (authenticated) and receives
   an unguessable session_id bound to user+avatar+conversation. The call
   simulates the avatar phoning the bank's toll-free number: the operator
   (the user) answers and speaks first, then the avatar states its problem.
2. The browser opens WS /api/voice/ws?session_id=... and streams the
   microphone as binary PCM16 @ 16 kHz frames.
3. VoicePipeline orchestrates the call: ElevenLabs Scribe v2 Realtime
   transcribes and commits turns (VAD), OpenAI (voice model) streams the
   roleplay reply, Cartesia Sonic streams back PCM16 @ 24 kHz audio that
   the browser plays as it arrives.
"""

import json

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CONVERSATION_MODE_VOICE,
    Avatar,
    User,
    ChatConversation,
    ChatMessage,
)
from auth_dependency import get_current_user
from conversation_titles import next_conversation_title
from schemas import VoiceSessionRequest, VoiceSessionResponse
from voice_sessions import create_voice_session, get_voice_session
from voice_pipeline import VoicePipeline
from elevenlabs_service import ELEVENLABS_API_KEY
from cartesia_service import CARTESIA_API_KEY

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/session", response_model=VoiceSessionResponse)
def start_voice_session(
    request: VoiceSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start a voice session: returns the session id for the voice WebSocket."""
    if not ELEVENLABS_API_KEY or not CARTESIA_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ELEVENLABS_API_KEY / CARTESIA_API_KEY non configurate nel .env del backend.",
        )

    avatar = db.query(Avatar).filter(Avatar.id == request.avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar non trovato.")

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
            raise HTTPException(status_code=404, detail="Conversazione non trovata.")
        # The channel is fixed at creation: a written chat is not something
        # the operator can pick up the phone and continue.
        if conversation.mode != CONVERSATION_MODE_VOICE:
            raise HTTPException(
                status_code=409,
                detail="Questa conversazione è una chat: non può proseguire al telefono.",
            )
        # A hung-up call is final: the transcript can no longer be extended
        if conversation.ended_at is not None:
            raise HTTPException(
                status_code=409,
                detail="Questa conversazione è terminata: avviane una nuova per parlare ancora con l'avatar.",
            )
    else:
        conversation = ChatConversation(
            avatar_id=request.avatar_id,
            user_id=current_user.id,
            title=next_conversation_title(db, current_user.id, avatar.category),
            mode=CONVERSATION_MODE_VOICE,
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # Snapshot of the persisted history: during the voice session the
    # pipeline tracks turns in memory, so the DB is not re-read per turn.
    existing_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    prior_history = [{"role": m.role, "content": m.content} for m in existing_messages]

    # The avatar is always the caller dialing the bank's toll-free number:
    # after the ring it waits in silence for the operator (the user) to
    # answer and introduce themselves, then it states why it is calling.
    session_id = create_voice_session(
        user_id=str(current_user.id),
        avatar_id=str(avatar.id),
        conversation_id=str(conversation.id),
        avatar_profile=avatar.profile,
        prior_history=prior_history,
        voice_id=avatar.voice_id,
    )

    return VoiceSessionResponse(
        session_id=session_id,
        conversation_id=conversation.id,
    )


@router.websocket("/ws")
async def voice_websocket(websocket: WebSocket, session_id: str | None = None):
    """Realtime voice call socket; access gated by the unguessable session_id."""
    session = get_voice_session(session_id) if session_id else None
    if not session:
        # Policy violation close code: invalid or expired session
        await websocket.close(code=4401)
        return

    await websocket.accept()
    try:
        pipeline = VoicePipeline(websocket, session)
    except RuntimeError as e:
        # Missing voice configuration (e.g. no Cartesia voice id)
        await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
        await websocket.close(code=1011)
        return

    await pipeline.run()
