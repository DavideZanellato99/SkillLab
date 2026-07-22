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
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CONVERSATION_MODE_VOICE,
    ROLE_ORGANIZATION_ADMIN,
    ROLE_SUPER_ADMIN,
    Avatar,
    User,
    ChatConversation,
    ChatMessage,
    ConversationRecording,
)
from auth_dependency import get_current_user
from routers.avatars import _visible_avatars
from conversation_titles import next_conversation_title
from schemas import VoiceRecordingInfo, VoiceSessionRequest, VoiceSessionResponse
from voice_sessions import create_voice_session, get_voice_session
from voice_pipeline import VoicePipeline
from elevenlabs_service import ELEVENLABS_API_KEY
from cartesia_service import CARTESIA_API_KEY

router = APIRouter(prefix="/api/voice", tags=["voice"])

# Opus voice runs about 2 MB per 10 minutes, so this is a very long call.
# It guards against a client posting something absurd, it is not a real cap.
MAX_RECORDING_BYTES = 50 * 1024 * 1024

# Containers MediaRecorder produces, matched on the part before ";codecs=":
# webm/opus on Chrome and Firefox, mp4/aac on Safari.
_ALLOWED_RECORDING_TYPES = {"audio/webm", "audio/ogg", "audio/mp4"}


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

    avatar = (
        _visible_avatars(db.query(Avatar), current_user)
        .filter(Avatar.id == request.avatar_id)
        .first()
    )
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


def _readable_conversation(
    conversation_id: UUID, user: User, db: Session
) -> ChatConversation:
    """Fetch a conversation the user is allowed to listen back to.

    The owner always is; the super admin is too; an organization_admin only
    for conversations held by a user of its own organization — never across
    tenants. A conversation the caller may not see is reported as missing
    rather than forbidden, so the endpoint never confirms that someone
    else's conversation exists.
    """
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversazione non trovata.")

    if conversation.user_id == user.id or user.ruolo == ROLE_SUPER_ADMIN:
        return conversation

    if user.ruolo == ROLE_ORGANIZATION_ADMIN:
        owner = db.query(User).filter(User.id == conversation.user_id).first()
        if owner and owner.organization_id == user.organization_id:
            return conversation

    raise HTTPException(status_code=404, detail="Conversazione non trovata.")


@router.post("/recording/{conversation_id}", response_model=VoiceRecordingInfo)
async def upload_recording(
    conversation_id: UUID,
    request: Request,
    duration_ms: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Store the mixed audio of a call, posted by the browser on hang-up.

    The body is the raw recording and its Content-Type is whatever the
    browser's MediaRecorder settled on. Only the owner can upload, and a
    second upload for the same conversation replaces the first: a retry
    after a flaky POST must not leave two half recordings behind.
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

    content_type = (request.headers.get("content-type") or "").strip()
    container = content_type.split(";")[0].strip().lower()
    if container not in _ALLOWED_RECORDING_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Formato audio non supportato: {container or 'assente'}.",
        )

    # Reject on the declared length before buffering the body, then check
    # again on the real thing: Content-Length is a claim, not a guarantee.
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_RECORDING_BYTES:
        raise HTTPException(status_code=413, detail="Registrazione troppo grande.")

    audio = await request.body()
    if not audio:
        raise HTTPException(status_code=400, detail="Registrazione vuota.")
    if len(audio) > MAX_RECORDING_BYTES:
        raise HTTPException(status_code=413, detail="Registrazione troppo grande.")

    recording = (
        db.query(ConversationRecording)
        .filter(ConversationRecording.conversation_id == conversation_id)
        .first()
    )
    if recording is None:
        recording = ConversationRecording(conversation_id=conversation_id)
        db.add(recording)
    recording.mime_type = content_type[:64]
    recording.duration_ms = duration_ms
    recording.size_bytes = len(audio)
    recording.audio = audio
    db.commit()
    db.refresh(recording)

    return VoiceRecordingInfo.model_validate(recording)


@router.get("/recording/{conversation_id}/info", response_model=VoiceRecordingInfo | None)
def get_recording_info(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Metadata only, null when the call was never recorded.

    Lets the UI decide whether to render a player without pulling the audio
    it may never play: the blob column is deferred, so this touches none of it.
    """
    _readable_conversation(conversation_id, current_user, db)
    return (
        db.query(ConversationRecording)
        .filter(ConversationRecording.conversation_id == conversation_id)
        .first()
    )


@router.get("/recording/{conversation_id}")
def get_recording(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The audio itself, served back in the format it was recorded in."""
    _readable_conversation(conversation_id, current_user, db)
    recording = (
        db.query(ConversationRecording)
        .filter(ConversationRecording.conversation_id == conversation_id)
        .first()
    )
    if not recording:
        raise HTTPException(status_code=404, detail="Registrazione non trovata.")

    # Accessing .audio is what loads the deferred blob: one extra query,
    # only on the endpoint that actually needs the bytes.
    return Response(
        content=recording.audio,
        media_type=recording.mime_type,
        headers={"Cache-Control": "private, max-age=3600"},
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
