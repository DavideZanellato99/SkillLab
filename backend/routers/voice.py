"""Voice conversation API endpoints (ElevenLabs STT + OpenAI + ElevenLabs TTS).

Flow:
1. The client calls POST /api/voice/session (authenticated) and receives
   an unguessable session_id bound to user+avatar+conversation. The call
   simulates the avatar phoning the bank's toll-free number: the operator
   (the user) answers and speaks first, then the avatar states its problem.
2. The browser opens WS /api/voice/ws?session_id=... and streams the
   microphone as binary PCM16 @ 16 kHz frames.
3. VoicePipeline orchestrates the call: ElevenLabs Scribe v2 Realtime
   transcribes and commits turns (VAD), OpenAI (voice model) streams the
   roleplay reply, ElevenLabs Flash streams back PCM16 @ 24 kHz audio that
   the browser plays as it arrives.
"""

import asyncio
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket
from sqlalchemy.orm import Session

import origins
import voice_capacity
from auth_dependency import get_current_user
from conversation_titles import next_conversation_title
from database import get_db
from elevenlabs_service import ELEVENLABS_API_KEY
from models import (
    CONVERSATION_MODE_VOICE,
    ROLE_ORGANIZATION_ADMIN,
    ROLE_SUPER_ADMIN,
    Avatar,
    ChatConversation,
    ChatMessage,
    ConversationRecording,
    User,
)
from routers.avatars import _visible_avatars, ensure_trainable
from schemas import VoiceRecordingInfo, VoiceSessionRequest, VoiceSessionResponse
from voice_pipeline import VoicePipeline
from voice_sessions import close_voice_session, create_voice_session, load_voice_session

router = APIRouter(prefix="/api/voice", tags=["voice"])

logger = logging.getLogger(__name__)

# Opus voice runs about 2 MB per 10 minutes, so this is a very long call.
# It guards against a client posting something absurd, it is not a real cap.
MAX_RECORDING_BYTES = 50 * 1024 * 1024

# Containers MediaRecorder produces, matched on the part before ";codecs=":
# webm/opus on Chrome and Firefox, mp4/aac on Safari.
_ALLOWED_RECORDING_TYPES = {"audio/webm", "audio/ogg", "audio/mp4"}

# Il nome del sottoprotocollo con cui il client apre il socket vocale. Ne
# manda due, questo e l'id di sessione, e il server sceglie questo nella
# risposta: l'id viaggia nell'header dell'handshake e non nell'indirizzo.
VOICE_WS_PROTOCOL = "skilllab-voice"


@router.post("/session", response_model=VoiceSessionResponse)
def start_voice_session(
    request: VoiceSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start a voice session: returns the session id for the voice WebSocket."""
    # Il dettaglio tecnico resta nei log: chi legge il messaggio si sta
    # esercitando, e i nomi delle variabili d'ambiente non gli servono a
    # nulla se non a capire che la piattaforma è configurata male.
    if not ELEVENLABS_API_KEY:
        logger.error("Sessione vocale rifiutata: ELEVENLABS_API_KEY mancante")
        raise HTTPException(
            status_code=503,
            detail="Il servizio vocale non è al momento disponibile. Utilizza la modalità chat oppure contatta l'amministratore.",
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
                detail="Questa conversazione è terminata: avviane una nuova per proseguire al telefono con l'avatar.",
            )
    else:
        # Only a brand new call is blocked on an archived avatar: a call
        # already open when it was archived is allowed to be finished.
        ensure_trainable(avatar)
        conversation = ChatConversation(
            avatar_id=request.avatar_id,
            user_id=current_user.id,
            title=next_conversation_title(db, current_user.id, avatar.category_name),
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
        db,
        user_id=current_user.id,
        avatar_id=avatar.id,
        conversation_id=conversation.id,
        avatar_profile=avatar.profile,
        prior_history=prior_history,
        voice_id=avatar.voice_id,
    )

    return VoiceSessionResponse(
        session_id=session_id,
        conversation_id=conversation.id,
    )


def _readable_conversation(conversation_id: UUID, user: User, db: Session) -> ChatConversation:
    """Fetch a conversation the user is allowed to listen back to.

    The owner always is; the super admin is too; an organization_admin only
    for conversations held by a user of its own organization — never across
    tenants. A conversation the caller may not see is reported as missing
    rather than forbidden, so the endpoint never confirms that someone
    else's conversation exists.
    """
    conversation = db.query(ChatConversation).filter(ChatConversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversazione non trovata.")

    if conversation.user_id == user.id or user.ruolo == ROLE_SUPER_ADMIN:
        return conversation

    if user.ruolo == ROLE_ORGANIZATION_ADMIN:
        owner = db.query(User).filter(User.id == conversation.user_id).first()
        if owner and owner.organization_id == user.organization_id:
            return conversation

    raise HTTPException(status_code=404, detail="Conversazione non trovata.")


async def _read_capped(request: Request) -> bytes:
    """Il corpo della richiesta, e non un byte oltre il tetto.

    ``request.body()`` legge fino alla fine prima di restituire qualcosa,
    quindi il controllo sulla lunghezza arrivava sempre a buoi scappati: il
    Content-Length si può dichiarare sbagliato, e con
    ``Transfer-Encoding: chunked`` non c'è affatto, quindi bastava un client
    che continua a scrivere per far crescere quel buffer in memoria finché
    il processo non cade. Qui si legge a pezzi e si smette al primo pezzo
    che manda oltre il tetto, che è la differenza fra rifiutare una
    registrazione troppo grande e riceverla comunque per poi dirlo.
    """
    pezzi: list[bytes] = []
    totale = 0
    async for pezzo in request.stream():
        totale += len(pezzo)
        if totale > MAX_RECORDING_BYTES:
            raise HTTPException(status_code=413, detail="Registrazione troppo grande.")
        pezzi.append(pezzo)
    return b"".join(pezzi)


def _owned_conversation_or_404(db: Session, conversation_id: UUID, user_id: UUID) -> None:
    """La conversazione esiste ed è di chi sta caricando, o è come se non ci fosse.

    Lettura bloccante, chiamata da un thread (vedi ``upload_recording``).
    """
    owned = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == user_id,
        )
        .first()
    )
    if not owned:
        raise HTTPException(status_code=404, detail="Conversazione non trovata.")


def _store_recording(
    db: Session,
    conversation_id: UUID,
    container: str,
    duration_ms: int | None,
    audio: bytes,
) -> VoiceRecordingInfo:
    """Scrive la registrazione, sostituendo quella che c'era.

    Scrittura bloccante, chiamata da un thread (vedi ``upload_recording``).
    La risposta si costruisce qui dentro e non fuori: dopo il commit gli
    attributi della riga sono scaduti, e leggerli di là vorrebbe dire una
    SELECT fatta dall'event loop, cioè esattamente ciò che questa funzione
    esiste per evitare.
    """
    recording = (
        db.query(ConversationRecording)
        .filter(ConversationRecording.conversation_id == conversation_id)
        .first()
    )
    if recording is None:
        recording = ConversationRecording(conversation_id=conversation_id)
        db.add(recording)
    # Il container validato, non l'intestazione che ha mandato il browser:
    # quella stringa torna indietro come Content-Type quando la
    # registrazione si riascolta, e quello che riparte da qui deve essere
    # una delle tre forme che sono state accettate, non i parametri che il
    # client ci aveva attaccato dietro.
    recording.mime_type = container
    recording.duration_ms = duration_ms
    recording.size_bytes = len(audio)
    recording.audio = audio
    db.commit()
    db.refresh(recording)

    return VoiceRecordingInfo.model_validate(recording)


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

    **Le due parti che toccano il database girano in un thread**, come già
    fa il socket qui sotto. Sono chiamate bloccanti, e questa non è una
    scrittura come le altre: l'audio di una chiamata sono decine di
    megabyte che partono verso Postgres in una INSERT sola, e per tutto quel
    tempo l'event loop di questa replica non fa girare nient'altro. Su
    quello stesso loop ci sono le telefonate in corso, che sono la cosa
    dell'applicazione a cui una pausa si sente di più: chi riaggancia
    metterebbe in pausa l'audio di chi sta ancora parlando.
    """
    await asyncio.to_thread(_owned_conversation_or_404, db, conversation_id, current_user.id)

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

    audio = await _read_capped(request)
    if not audio:
        raise HTTPException(status_code=400, detail="Registrazione vuota.")

    return await asyncio.to_thread(
        _store_recording, db, conversation_id, container, duration_ms, audio
    )


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


def _session_id_from(websocket: WebSocket) -> str | None:
    """L'id di sessione, letto dai sottoprotocolli dell'handshake.

    Il client ne offre due, il nome del protocollo e l'id. Sta lì e non
    nella query string perché un indirizzo finisce nel log degli accessi del
    proxy, e da lì in ogni posto dove quei log vengono raccolti: l'id è la
    sola credenziale che apre la chiamata, e una credenziale scritta in
    chiaro in un registro pensato per essere condiviso è una credenziale
    già mezza persa. Nell'handshake viaggia in un header, che nessuno logga.
    """
    protocols = websocket.scope.get("subprotocols") or []
    if len(protocols) == 2 and protocols[0] == VOICE_WS_PROTOCOL:
        return protocols[1].strip() or None
    return None


@router.websocket("/ws")
async def voice_websocket(websocket: WebSocket):
    """Realtime voice call socket; access gated by the unguessable session_id.

    The session is read from the database rather than from process memory,
    so the socket does not have to land on the same replica that issued the
    id. Both DB touches go through a thread: they are blocking calls, and
    this endpoint holds the event loop for the whole length of the call.
    """
    # Policy violation close code: no session id, one that is unknown or
    # expired, or an account that in the meantime was suspended. Same answer
    # for all of them, so a caller probing ids learns nothing from the
    # difference.
    # L'origine, prima di qualunque altra cosa. La same origin policy non
    # vale per i WebSocket: la pagina di un altro sito può aprirne uno verso
    # qui, e il browser glielo lascia fare. Oggi non basterebbe comunque,
    # perché la credenziale è l'id di sessione e non un cookie che il
    # browser attacca da solo, ma questa è la riga che regge il giorno in
    # cui quella scelta cambiasse.
    if not origins.is_allowed(websocket.headers.get("origin")):
        await websocket.close(code=4403)
        return

    session_id = _session_id_from(websocket)
    if not session_id:
        await websocket.close(code=4401)
        return
    session = await asyncio.to_thread(load_voice_session, session_id)
    if not session:
        await websocket.close(code=4401)
        return

    # Over the per-process ceiling the call is turned away instead of being
    # accepted and served badly along with all the others (see
    # voice_capacity). The session row is deliberately left alone: nothing
    # was consumed, so the same id still works on the next attempt.
    if not voice_capacity.take_slot():
        await websocket.accept(subprotocol=VOICE_WS_PROTOCOL)
        await websocket.send_text(
            json.dumps(
                {
                    "type": "error",
                    "message": "Tutte le linee sono occupate in questo momento. "
                    "Riprova fra qualche minuto.",
                }
            )
        )
        # 1013 Try Again Later: the condition is temporary and the client
        # is welcome back.
        await websocket.close(code=1013)
        return

    # Scegliere il sottoprotocollo nella risposta non è un dettaglio: se il
    # client ne offre e il server non ne conferma uno, il browser chiude
    # l'handshake da solo.
    await websocket.accept(subprotocol=VOICE_WS_PROTOCOL)
    try:
        try:
            pipeline = VoicePipeline(websocket, session)
        except RuntimeError as e:
            # Missing voice configuration (e.g. no ElevenLabs voice id)
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
            await websocket.close(code=1011)
            return

        await pipeline.run()
    finally:
        voice_capacity.release_slot()
        # The row holds a copy of the conversation history, so it goes as
        # soon as the call is over instead of waiting out its expiry. Also
        # in the failure paths: a session nobody can use is a session that
        # should not still be there.
        await asyncio.to_thread(close_voice_session, session_id)
