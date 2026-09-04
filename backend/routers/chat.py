"""Chat API endpoints for avatar conversations.

A conversation runs on one of two channels, fixed when it is opened:

- "voice": a simulated phone call (ElevenLabs STT + OpenAI + ElevenLabs TTS,
  see routers/voice.py). These endpoints only expose its transcript.
- "text": a written chat with the same avatar, driven from here. Only the
  LLM is involved: no speech to text, no text to speech.

Both start the same way, with the operator writing/speaking first.
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

import llm_limits
import reviews
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
    ConversationReview,
    User,
)
from openai_service import evaluate_conversation, stream_avatar_response
from persona_prompt import CHANNEL_TEXT, CHANNEL_VOICE
from routers.avatars import _visible_avatars, ensure_trainable
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

logger = logging.getLogger(__name__)


def _owned_conversation_or_404(db: Session, conversation_id: UUID, user: User) -> ChatConversation:
    """Fetch a conversation owned by `user`, or raise 404.

    Every read/write of a conversation goes through here: a conversation that
    belongs to another user is indistinguishable from one that doesn't exist.
    """
    conversation = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversazione non trovata.")
    return conversation


def _previous_attempt(db: Session, conversation: ChatConversation) -> PreviousAttempt | None:
    """The user's closest earlier evaluated conversation with the same avatar.

    Attempts are ordered by when the conversation was opened, not by when
    it was judged: evaluating an old transcript later must not make it the
    "previous attempt" of everything in between.

    The baseline carries the score that counted for that attempt, trainer's
    correction included (outer join, most attempts have no review): comparing
    a corrected score against the raw AI number of the attempt before would
    show a progress that never happened.
    """
    row = (
        db.query(ChatConversation, ConversationEvaluation, ConversationReview)
        .join(
            ConversationEvaluation,
            ConversationEvaluation.conversation_id == ChatConversation.id,
        )
        .outerjoin(
            ConversationReview,
            ConversationReview.conversation_id == ChatConversation.id,
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
    prev_conv, prev_eval, prev_review = row
    return PreviousAttempt(
        conversation_id=prev_conv.id,
        title=prev_conv.title,
        mode=prev_conv.mode,
        conversation_at=prev_conv.created_at,
        overall_score=reviews.final_score(prev_eval.overall_score, prev_review),
        # Per criterion the AI's own scores stand: a trainer corrects the
        # verdict as a whole, never the six numbers behind it.
        criteria_scores={
            str(c["key"]): float(c.get("score", 0) or 0)
            for c in ((prev_eval.result or {}).get("criteria") or [])
            if c.get("key")
        },
    )


def _review_of(db: Session, conversation_id: UUID) -> ConversationReview | None:
    return (
        db.query(ConversationReview)
        .filter(ConversationReview.conversation_id == conversation_id)
        .first()
    )


def _ai_score_of(db: Session, conversation_id: UUID) -> float | None:
    """The AI's own score, None when the conversation was never judged."""
    return (
        db.query(ConversationEvaluation.overall_score)
        .filter(ConversationEvaluation.conversation_id == conversation_id)
        .scalar()
    )


def _annotations_for_pdf(db: Session, annotations: list) -> list[dict]:
    """Trainer's notes with the line each was pinned to, for the PDF.

    On screen a note lives next to its message; on paper there is no
    transcript to sit next to, so the message travels with it (trimmed to
    the same length as the conversation-list preview) or the note would
    point at nothing.
    """
    if not annotations:
        return []
    contents = dict(
        db.query(ChatMessage.id, ChatMessage.content)
        .filter(ChatMessage.id.in_([a.message_id for a in annotations]))
        .all()
    )
    return [
        {
            "note": a.note,
            "reviewer_name": a.reviewer_name,
            "message_preview": _preview(contents.get(a.message_id)) or "",
        }
        for a in annotations
    ]


def _evaluation_response(
    db: Session, conversation: ChatConversation, evaluation: ConversationEvaluation
) -> ConversationEvaluationResponse:
    """The evaluation as every reader sees it, trainer's review included.

    Student and admin get exactly the same object: a correction the student
    could not read would protect nobody.
    """
    data = evaluation.result or {}
    review = _review_of(db, conversation.id)
    return ConversationEvaluationResponse(
        id=evaluation.id,
        conversation_id=evaluation.conversation_id,
        overall_score=evaluation.overall_score,
        final_score=reviews.final_score(evaluation.overall_score, review),
        summary=data.get("summary", ""),
        criteria=data.get("criteria", []),
        previous=_previous_attempt(db, conversation),
        review=reviews.review_response(
            review,
            reviews.annotations_of(db, conversation.id),
            evaluation.overall_score,
        ),
        created_at=evaluation.created_at,
        updated_at=evaluation.updated_at,
    )


def _preview(content: str | None) -> str | None:
    """Trim a message to the fixed-length list preview (None when empty)."""
    if not content:
        return None
    return content[:100] + ("..." if len(content) > 100 else "")


def _build_summary(
    conv: ChatConversation, message_count: int, last_content: str | None
) -> ChatConversationSummary:
    """Assemble a summary from a conversation and its already-computed stats."""
    return ChatConversationSummary(
        id=conv.id,
        avatar_id=conv.avatar_id,
        title=conv.title,
        mode=conv.mode,
        ended_at=conv.ended_at,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=message_count,
        last_message_preview=_preview(last_content),
    )


def _conversation_summary(db: Session, conv: ChatConversation) -> ChatConversationSummary:
    """Build the list entry for a single conversation (counter + last preview)."""
    msg_count = (
        db.query(func.count(ChatMessage.id)).filter(ChatMessage.conversation_id == conv.id).scalar()
    )
    last_msg = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conv.id)
        .order_by(ChatMessage.created_at.desc())
        .first()
    )
    return _build_summary(conv, msg_count or 0, last_msg.content if last_msg else None)


def _conversation_summaries(
    db: Session, conversations: list[ChatConversation]
) -> list[ChatConversationSummary]:
    """Summaries for a list of conversations in two queries total, not 2 per row.

    One grouped COUNT for the message counters, one DISTINCT ON for the last
    message of each conversation; both keyed by conversation id.
    """
    if not conversations:
        return []
    conv_ids = [conv.id for conv in conversations]

    counts = dict(
        db.query(ChatMessage.conversation_id, func.count(ChatMessage.id))
        .filter(ChatMessage.conversation_id.in_(conv_ids))
        .group_by(ChatMessage.conversation_id)
        .all()
    )
    last_contents = dict(
        db.query(ChatMessage.conversation_id, ChatMessage.content)
        .filter(ChatMessage.conversation_id.in_(conv_ids))
        .order_by(ChatMessage.conversation_id, ChatMessage.created_at.desc())
        .distinct(ChatMessage.conversation_id)
        .all()
    )
    return [
        _build_summary(conv, counts.get(conv.id, 0), last_contents.get(conv.id))
        for conv in conversations
    ]


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

    return _conversation_summaries(db, conversations)


@router.get("/conversation/{conversation_id}", response_model=ChatConversationResponse)
def get_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a conversation with all its messages (only if it belongs to the current user)."""
    conversation = _owned_conversation_or_404(db, conversation_id, current_user)

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
        # The trainer's notes travel with the transcript: they are pinned to
        # single lines, and re-reading the call is where they teach something.
        review=reviews.review_response(
            _review_of(db, conversation.id),
            reviews.annotations_of(db, conversation.id),
            _ai_score_of(db, conversation.id),
        ),
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
    conversation = _owned_conversation_or_404(db, conversation_id, current_user)

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

    La sessione della richiesta è ancora viva qui (FastAPI smonta le
    dipendenze solo dopo che la risposta è uscita tutta), ma la sua
    connessione è stata restituita al pool prima dello streaming: la prima
    query qui sotto ne prende una nuova. Per questo la funzione riceve id e
    non oggetti, e ricarica quello che le serve.
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


@dataclass(frozen=True)
class _TurnContext:
    """Il punto di partenza di una battuta, in soli valori.

    Niente oggetti della sessione: il generatore che li usa gira dopo che
    l'handler è finito e dopo che la connessione è tornata al pool, dove una
    riga a cui si chiedesse un campo tornerebbe a interrogare il database.
    """

    avatar_id: UUID
    avatar_category: str
    avatar_profile: dict
    conversation_id: UUID | None
    history: list[dict]


def _turn_context(db: Session, payload: ChatMessageRequest, user: User) -> _TurnContext:
    """Blocking read of one turn's starting point (run via asyncio.to_thread).

    Sono tre letture (l'avatar, la conversazione, la trascrizione fin qui) e
    i controlli che decidono se questa battuta si può scrivere. Finisce con
    il commit che restituisce la connessione, perché da lì in avanti questa
    richiesta aspetta solo il modello.
    """
    avatar = _visible_avatars(db.query(Avatar), user).filter(Avatar.id == payload.avatar_id).first()
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
                ChatConversation.user_id == user.id,
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
                detail="Questa conversazione è terminata: avviane una nuova per proseguire in chat con l'avatar.",
            )
        prior_messages = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.created_at.asc())
            .all()
        )
        history = [{"role": m.role, "content": m.content} for m in prior_messages]
    else:
        # Only a brand new chat is blocked on an archived avatar: a chat
        # already open when it was archived is allowed to be finished.
        ensure_trainable(avatar)

    history.append({"role": "user", "content": payload.content})

    context = _TurnContext(
        avatar_id=avatar.id,
        avatar_category=avatar.category_name,
        avatar_profile=avatar.profile,
        conversation_id=conversation.id if conversation else None,
        history=history,
    )

    # La connessione torna al pool prima dell'attesa lunga. Il generatore
    # gira dopo che questo handler è finito e dura quanto la risposta del
    # modello, e fino a lì la sessione terrebbe ferma una connessione senza
    # usarla. _persist_exchange lavora solo con id e rifà le sue query,
    # quindi alla fine dello stream la sessione ne riprende una e scrive.
    #
    # `commit` e non `close`: chiude la transazione senza annullarla, che è
    # quello che serve quando la sessione non è solo nostra (vedi il commento
    # esteso nella valutazione, più sotto).
    db.commit()

    return context


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

    Le due parti che toccano il database, la lettura di qui e la scrittura
    di fine stream, girano tutte e due in un thread: sono chiamate
    bloccanti, e su questo event loop ci sono le telefonate in corso, che si
    fermerebbero per il tempo di ogni interrogazione fatta da qui.
    """
    # Prima di ogni altra cosa, perché è l'unico controllo che parla del
    # costo della richiesta e non di cosa contiene.
    await llm_limits.consume(llm_limits.CHAT, current_user.id)

    # Letto prima, non dopo: la lettura qui sotto si chiude con un commit, e
    # da lì in poi chiedere un campo a `current_user` sarebbe una query fatta
    # dall'event loop, cioè la cosa che tutto questo giro serve a evitare.
    user_id = current_user.id
    turn = await asyncio.to_thread(_turn_context, db, payload, current_user)

    async def event_stream():
        parts: list[str] = []
        try:
            async for delta in stream_avatar_response(
                turn.history, turn.avatar_profile, CHANNEL_TEXT
            ):
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
                turn.avatar_id,
                turn.avatar_category,
                turn.conversation_id,
                payload.content,
                reply,
            )
            yield _sse_event("done", exchange.model_dump_json())
        except Exception as e:
            logger.exception("Streaming chat fallito")
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
    conversation = _owned_conversation_or_404(db, conversation_id, current_user)
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


@dataclass(frozen=True)
class _EvaluationInput:
    """Quello che il giudice legge, staccato dalla sessione."""

    history: list[dict]
    avatar_profile: dict
    channel: str


def _evaluation_input(db: Session, conversation_id: UUID, user: User) -> _EvaluationInput:
    """Blocking read of the material to judge (run via asyncio.to_thread).

    Finisce con il commit che restituisce la connessione: da lì in avanti
    questa richiesta aspetta un modello di ragionamento, e sono decine di
    secondi in cui il database non serve.
    """
    conversation = _owned_conversation_or_404(db, conversation_id, user)

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
    material = _EvaluationInput(
        # The ids anchor the judge's citations back to the stored messages
        history=[{"id": str(m.id), "role": m.role, "content": m.content} for m in messages],
        avatar_profile=avatar.profile if avatar else {},
        # Same criteria either way: the channel only tells the trainer whether
        # it is reading a call or a chat.
        channel=CHANNEL_TEXT if conversation.mode == CONVERSATION_MODE_TEXT else CHANNEL_VOICE,
    )

    # Tutto quello che serve al giudizio è già in memoria, quindi la
    # connessione al database torna al pool prima dell'attesa.
    #
    # Senza questa riga resterebbe occupata per tutta la durata della
    # valutazione, che con un modello di ragionamento sono decine di secondi
    # e non i millisecondi di una richiesta normale. Il caso che conta è
    # l'aula: quaranta persone che chiudono la chiamata insieme chiedono la
    # valutazione nello stesso minuto, e ogni replica di connessioni ne ha
    # DB_POOL_SIZE + DB_MAX_OVERFLOW in tutto, condivise con i login e con
    # tutto il resto. Chi non ne trova una aspetta il pool_timeout e poi si
    # prende un errore, per colpa di richieste che nel frattempo non stanno
    # usando il database, stanno solo aspettando OpenAI.
    #
    # `commit` e non `close`, per quanto qui non ci sia niente da salvare:
    # tutti e due restituiscono la connessione, ma close *annulla* la
    # transazione in corso, e questa sessione non sempre è solo nostra. Nei
    # test è quella della fixture, e dentro la sua transazione ci sono i dati
    # che il test ha appena creato: annullarla li porta via, e la scrittura
    # di dopo fallisce per una chiave esterna che punta a un utente sparito.
    #
    # La sessione resta valida: alla prima query dopo l'attesa ne prende una
    # nuova. Gli oggetti già caricati però scadono, ed è il motivo per cui
    # la conversazione viene ricaricata invece di riusare quella di prima.
    db.commit()

    return material


def _store_evaluation(
    db: Session, conversation_id: UUID, user: User, result: dict
) -> ConversationEvaluationResponse:
    """Blocking write of a fresh judgement (run via asyncio.to_thread).

    Rigiudicare sostituisce, non aggiunge: di una conversazione vale il
    giudizio di adesso, e lo storico dei ripensamenti del modello non lo
    legge nessuno.
    """
    # Ricaricata, non riusata: l'oggetto di prima è staccato dalla sessione.
    # Il controllo di proprietà si rifà da sé, il che non guasta.
    conversation = _owned_conversation_or_404(db, conversation_id, user)

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

    Le due parti che toccano il database girano in un thread, come nella
    chat qui sopra: sono chiamate bloccanti, e l'event loop di questa
    replica lo condividono le telefonate in corso.
    """
    # La chiamata più cara dell'applicazione, e l'unica che si può rifare
    # sulla stessa conversazione quante volte si vuole.
    await llm_limits.consume(llm_limits.VALUTAZIONE, current_user.id)

    material = await asyncio.to_thread(_evaluation_input, db, conversation_id, current_user)

    try:
        result = await evaluate_conversation(
            material.history, material.avatar_profile, material.channel
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return await asyncio.to_thread(_store_evaluation, db, conversation_id, current_user, result)


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
    conversation = _owned_conversation_or_404(db, conversation_id, current_user)

    evaluation = (
        db.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation_id)
        .first()
    )
    return _evaluation_response(db, conversation, evaluation) if evaluation else None


def evaluation_pdf_response(
    db: Session,
    conversation: ChatConversation,
    evaluation: ConversationEvaluation,
    operator: User,
) -> Response:
    """The stored evaluation as a PDF download.

    Shared by the two ways of asking for it: the student downloading their
    own report and an admin downloading it from the conversation detail.
    Who may ask changes, the document does not. `operator` is always the
    person who held the conversation, not whoever clicked: it is their name
    that goes on the sheet handed to the trainer.
    """
    avatar = db.query(Avatar).filter(Avatar.id == conversation.avatar_id).first()
    data = evaluation.result or {}
    review = _review_of(db, conversation.id)
    annotations = reviews.annotations_of(db, conversation.id)
    # La trascrizione chiude il documento: il giudizio si legge accanto a
    # quello che giudica, o resta un numero da prendere per buono.
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    pdf = evaluation_pdf(
        operator_name=f"{operator.nome} {operator.cognome}".strip() or operator.email,
        avatar_name=avatar.name if avatar else "",
        conversation_title=conversation.title,
        mode=conversation.mode,
        conversation_at=conversation.created_at,
        evaluated_at=evaluation.updated_at,
        overall_score=evaluation.overall_score,
        summary=data.get("summary", ""),
        criteria=data.get("criteria") or [],
        previous=_previous_attempt(db, conversation),
        review=reviews.review_response(review, annotations, evaluation.overall_score),
        annotations=_annotations_for_pdf(db, annotations),
        messages=[
            {"role": m.role, "content": m.content, "created_at": m.created_at} for m in messages
        ],
    )

    # ASCII-only filename derived from the conversation title
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", conversation.title).strip("-").lower() or "conversazione"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="valutazione-{slug}.pdf"'},
    )


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
    conversation = _owned_conversation_or_404(db, conversation_id, current_user)

    evaluation = (
        db.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation_id)
        .first()
    )
    if not evaluation:
        raise HTTPException(
            status_code=404, detail="Questa conversazione non ha ancora una valutazione."
        )

    return evaluation_pdf_response(db, conversation, evaluation, current_user)
