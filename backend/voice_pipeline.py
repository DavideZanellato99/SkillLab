"""Realtime voice pipeline: ElevenLabs STT → OpenAI LLM → ElevenLabs TTS.

One instance per call. The browser streams mic audio (PCM16 @ 16 kHz,
binary frames) over our WebSocket; we proxy it to ElevenLabs Scribe v2
Realtime, whose VAD commits the end of each user turn. Each committed
transcript triggers an LLM stream (voice model) whose tokens are piped
word-by-word into an ElevenLabs TTS context; the resulting PCM16 @ 24 kHz
audio chunks are forwarded to the browser as binary frames.

Browser-bound JSON events:
  ready, user_partial, user_final, assistant_delta, assistant_end,
  speaking_start, speaking_end, interrupt, error
Browser-sent JSON events:
  start (ring finished; the avatar — the caller — waits in silence for
  the operator to answer and speak first), end (hang up)

Half-duplex: the operator never talks over the avatar. The browser
gates the mic (sends silence) from the committed transcript until the
avatar's audio has finished playing, and partial transcripts never
interrupt a turn. Only a committed transcript arriving while a turn is
in flight cancels it — the VAD split one operator sentence into two
commits, so the turn restarts with the fuller history.
"""

import asyncio
import base64
import contextlib
import json
import logging
import os
import time
import uuid
from datetime import UTC, datetime
from uuid import UUID

import websockets
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState
from websockets.exceptions import InvalidStatus

import tls_setup  # noqa: F401  (TLS via OS store: must precede the websockets import)
from database import SessionLocal
from elevenlabs_service import STT_SAMPLE_RATE, log_stt_concurrency, stt_headers, stt_ws_url
from elevenlabs_tts_service import (
    ELEVENLABS_DEFAULT_VOICE_ID,
    resolve_voice_id,
    tts_chunk_message,
    tts_close_message,
    tts_headers,
    tts_keepalive_message,
    tts_ws_url,
)
from models import ChatConversation, ChatMessage
from openai_service import prewarm_roleplay, stream_avatar_response
from turn_metrics import (
    MARK_BROWSER_FIRST_AUDIO,
    MARK_LLM_FIRST_TOKEN,
    MARK_LLM_REQUEST,
    MARK_TTS_FIRST_AUDIO,
    MARK_TTS_FIRST_SEND,
    STT_DEBUG_ENABLED,
    CallMetrics,
    TurnTimer,
)
from voice_sessions import VoiceSession

logger = logging.getLogger(__name__)

_LLM_FALLBACK_LINE = "Mi dispiace, ho avuto un problema tecnico. Puoi ripetere?"

# Grace window (ms) after a committed transcript before the assistant turn
# fires. ElevenLabs force-commits long utterances mid-sentence regardless of
# the VAD silence threshold, splitting one spoken turn across several commits.
# A commit that does not end a sentence is held this long so a continuation
# can arrive and be merged, instead of answering half a sentence and then
# restarting. Commits that end a sentence fire immediately, so ordinary turns
# pay nothing. 0 disables the aggregation (fire every commit at once).
VOICE_SETTLE_MS = int(os.getenv("VOICE_SETTLE_MS", "700"))


def _looks_complete(text: str) -> bool:
    """True when the transcript ends like a finished sentence, so the turn can
    fire without waiting for a continuation. A mid-utterance forced commit
    lands on a word or comma instead and is held for the grace window."""
    return text.rstrip().endswith((".", "!", "?", "…"))


# Italian words that legitimately end in a consonant: articles, prepositions,
# conjunctions and the handful of adverbs. The list is closed on purpose. Every
# other consonant-final fragment in Italian is a word cut in half, which is
# what _join_transcript uses to tell "…bloccar" + "li" from "…per" + "assicurarci".
_TRONCHE = frozenset(
    {
        "il", "un", "del", "dal", "nel", "sul", "col", "al", "qual", "tal", "quel", "bel",
        "non", "in", "con", "ben", "gran", "per", "pur", "ad", "ed", "od", "or", "ancor",
    }
)  # fmt: skip

_VOCALI = "aeiouàèéìòóù"


def _join_transcript(previous: str, addition: str) -> str:
    """Glue two commits of the same spoken turn back together.

    ElevenLabs force-commits a long utterance the moment it hits its own
    limit, and that limit does not respect word boundaries: "provvediamo a
    bloccar" + "li, ne riceverà nuovi". Joining those with a space hands the
    model a word that does not exist, so the seam is closed instead whenever
    the break looks like it fell inside a word.

    The test is morphological and deliberately conservative: a full Italian
    word ends in a vowel or is one of the few tronche, so a lowercase
    consonant-final fragment outside that list is taken as a cut. Capitalised
    fragments are left alone, which keeps surnames and loanwords ("Rodriguez",
    "Carabinieri") from being welded to whatever follows.
    """
    if not previous:
        return addition
    if not addition:
        return previous
    tail = previous[-1]
    head = addition[0]
    if tail.isalpha() and head.isalpha() and head.islower():
        last_word = previous.rsplit(" ", 1)[-1]
        if last_word.islower() and tail.lower() not in _VOCALI and last_word not in _TRONCHE:
            return previous + addition
    return f"{previous} {addition}"


# PCM16 mono: two bytes per sample. Turns bytes forwarded into seconds of
# audio, which is what makes the upload comparable to the wall clock.
_AUDIO_BYTES_PER_SEC = STT_SAMPLE_RATE * 2

# How often the audio upload reports itself while the diagnostics are on.
_AUDIO_REPORT_SECS = 5.0

# Ogni quanto si tiene viva la socket della sintesi. Sta molto sotto il tetto
# di inattività che si chiede a ElevenLabs (vedi elevenlabs_tts_service)
# perché il margine serve: su questa socket, fra un turno e l'altro, non passa
# niente per tutto il tempo in cui parla l'operatore, e a cadere sarebbe a
# metà conversazione.
_TTS_KEEPALIVE_SECS = 15.0


async def _open_tts(stack: contextlib.AsyncExitStack, voice_id: str):
    """Open the TTS socket, falling back to the default voice if need be.

    La voce sta nell'indirizzo della connessione, non nei messaggi: un id che
    l'account non conosce non rovina un turno, rifiuta l'handshake e la
    chiamata non parte affatto. Gli avatar possono portare id di un fornitore
    precedente o di una voce cancellata, e un avatar che parla con la voce
    sbagliata è molto meglio di un avatar che non parla: si sente al primo
    ascolto, si corregge dal pannello, e intanto l'esercitazione si fa.

    Il secondo tentativo è gratis: cade dentro lo squillo, che è tempo morto.
    """
    try:
        return await stack.enter_async_context(
            websockets.connect(
                tts_ws_url(voice_id),
                additional_headers=tts_headers(),
                max_size=16 * 1024 * 1024,
            )
        )
    except InvalidStatus as e:
        status = e.response.status_code
        # Solo i rifiuti, e solo se c'è davvero un'altra voce da provare: un
        # 5xx o una rete che non risponde non li risolve una voce diversa, e
        # ritentare nasconderebbe il guasto vero.
        ripiego = ELEVENLABS_DEFAULT_VOICE_ID
        if not 400 <= status < 500 or not ripiego or voice_id == ripiego:
            raise
        logger.warning(
            "Voce '%s' rifiutata da ElevenLabs (HTTP %d): la chiamata prosegue con la "
            "voce predefinita. Riassegna la voce a questo avatar dal pannello.",
            voice_id,
            status,
        )
        return await stack.enter_async_context(
            websockets.connect(
                tts_ws_url(ripiego),
                additional_headers=tts_headers(),
                max_size=16 * 1024 * 1024,
            )
        )


# STT error types that make the whole call unusable
_FATAL_STT_ERRORS = {
    "auth_error",
    "quota_exceeded",
    "unaccepted_terms",
    "resource_exhausted",
    "session_time_limit_exceeded",
}


def _persist_message(conversation_id: str, role: str, content: str) -> None:
    """Blocking DB write, always called via asyncio.to_thread."""
    db = SessionLocal()
    try:
        db.add(
            ChatMessage(
                conversation_id=UUID(conversation_id),
                role=role,
                content=content,
            )
        )
        conversation = (
            db.query(ChatConversation).filter(ChatConversation.id == UUID(conversation_id)).first()
        )
        if conversation:
            conversation.updated_at = datetime.now(UTC)
        db.commit()
    except Exception:
        logger.exception("Persistenza messaggio vocale fallita")
    finally:
        db.close()


def _mark_conversation_ended(conversation_id: str) -> None:
    """Close the conversation for good. Blocking, called via asyncio.to_thread.

    Once the call hangs up the transcript is final: no later session can
    reopen it (see routers/voice.start_voice_session).
    """
    db = SessionLocal()
    try:
        conversation = (
            db.query(ChatConversation).filter(ChatConversation.id == UUID(conversation_id)).first()
        )
        if conversation and conversation.ended_at is None:
            conversation.ended_at = datetime.now(UTC)
            db.commit()
    except Exception:
        logger.exception("Chiusura conversazione fallita")
    finally:
        db.close()


class VoicePipeline:
    def __init__(self, browser: WebSocket, session: VoiceSession):
        self.browser = browser
        self.session = session
        self.voice_id = resolve_voice_id(session.voice_id)
        # Live history: prior turns + everything said during this call
        self.history: list[dict] = list(session.prior_history)
        self.stt = None
        self.tts = None
        self._send_lock = asyncio.Lock()
        self._turn_task: asyncio.Task | None = None
        # Keeps fire-and-forget persist tasks referenced until they finish:
        # the event loop only holds weak refs, so an unreferenced task can be
        # garbage-collected mid-flight and the DB write silently lost.
        self._bg_tasks: set[asyncio.Task] = set()
        # TTS context currently allowed to reach the browser; audio from any
        # other context (cancelled turn) is dropped.
        self._active_context: str | None = None
        # Un contesto che non dice mai niente, aperto per tutta la chiamata:
        # è l'appiglio dei keep alive, che vanno indirizzati a un contesto e
        # fra un turno e l'altro non ce n'è nessuno aperto.
        self._keepalive_context = uuid.uuid4().hex
        self._speaking = False
        # Text generated so far by the in-flight turn: lets a barge-in
        # deliver the truncated assistant bubble to the browser.
        self._turn_text = ""
        # Latency instrumentation. _last_partial_at approximates when the
        # operator stopped talking, so the wait the VAD adds before it
        # commits the turn can be told apart from the pipeline's own cost.
        self._metrics = CallMetrics()
        self._turn_timer: TurnTimer | None = None
        self._last_partial_at: float | None = None
        # ElevenLabs keeps re-emitting the same partial while the operator is
        # already silent, so the text goes with the timestamp: a partial that
        # repeats the previous one is not fresh speech, and letting it move
        # _last_partial_at would shrink every measured silence to the gap
        # between two keepalives (200ms against a 1.5s VAD threshold).
        self._last_partial_text = ""
        # Audio upload tracking. Transcripts can arrive in a burst that covers
        # half a minute of speech at once, and from the STT events alone there
        # is no telling whether the backlog piled up on our side or on
        # ElevenLabs'. These say how much audio actually left, and when.
        self._audio_bytes = 0
        # Il primo frame fa da zero a tutti e due: finché non è arrivato non
        # c'è una chiamata da confrontare con l'orologio.
        self._audio_first_at: float | None = None
        self._audio_reported_at = 0.0
        self._audio_slowest_send = 0.0
        # Commit aggregation: ElevenLabs may split one spoken turn into several
        # commits, so a non-final commit is buffered here and the turn only
        # fires once the grace window (VOICE_SETTLE_MS) passes without a
        # continuation. _pending_timer anchors the turn's latency to the first
        # commit of the group, so commit->audio includes the grace wait.
        self._pending_text = ""
        self._pending_timer: TurnTimer | None = None
        self._settle_task: asyncio.Task | None = None
        # Turns are numbered rather than tagged at random: the first one of
        # a call behaves differently from the rest (cold connection, cold
        # prompt cache) and the logs have to make that visible.
        self._turn_count = 0

    # ── Outbound helpers (single lock: JSON and audio frames must not interleave) ──

    async def _send_json(self, payload: dict) -> None:
        if self.browser.client_state != WebSocketState.CONNECTED:
            return
        async with self._send_lock:
            await self.browser.send_text(json.dumps(payload, ensure_ascii=False))

    async def _send_audio(self, data: bytes) -> None:
        if self.browser.client_state != WebSocketState.CONNECTED:
            return
        async with self._send_lock:
            await self.browser.send_bytes(data)

    def _persist(self, role: str, content: str) -> None:
        """Fire-and-forget DB write: never blocks the audio hot path."""
        task = asyncio.create_task(
            asyncio.to_thread(_persist_message, self.session.conversation_id, role, content)
        )
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)

    # ── Main loop ─────────────────────────────────────

    async def run(self) -> None:
        # Conferma che i parametri della VAD partano davvero nell'URL, cioè
        # che il valore messo nel .env sia quello con cui la STT sta girando.
        if STT_DEBUG_ENABLED:
            logger.info("[STT-URL] %s", stt_ws_url())
        try:
            async with contextlib.AsyncExitStack() as stack:
                stt = await stack.enter_async_context(
                    websockets.connect(
                        stt_ws_url(),
                        additional_headers=stt_headers(),
                        max_size=16 * 1024 * 1024,
                    )
                )
                tts = await _open_tts(stack, self.voice_id)
                self.stt = stt
                self.tts = tts
                log_stt_concurrency(stt)
                # Il contesto dei keep alive nasce qui, non al primo turno:
                # la socket va tenuta viva già durante lo squillo, che da solo
                # può durare più del tetto di inattività.
                await tts.send(tts_chunk_message(self._keepalive_context, " "))
                await self._send_json({"type": "ready"})

                # The ring is dead time for the operator, so spend it on the
                # handshake and the persona prefill the first turn would
                # otherwise pay for. Deliberately kept out of the task list
                # below: that one ends the call as soon as any member
                # finishes, and this is meant to finish early.
                prewarm = asyncio.create_task(
                    prewarm_roleplay(self.session.avatar_profile), name="prewarm"
                )

                tasks = [
                    asyncio.create_task(self._browser_loop(), name="browser"),
                    asyncio.create_task(self._stt_loop(), name="stt"),
                    asyncio.create_task(self._tts_loop(), name="tts"),
                    asyncio.create_task(self._keepalive_loop(), name="keepalive"),
                ]
                try:
                    done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    # Surface unexpected crashes of whichever loop ended first
                    for t in done:
                        exc = t.exception()
                        if exc and not isinstance(exc, (WebSocketDisconnect,)):
                            raise exc
                finally:
                    prewarm.cancel()
                    for t in tasks:
                        t.cancel()
                    await asyncio.gather(prewarm, *tasks, return_exceptions=True)
        except RuntimeError as e:
            await self._send_json({"type": "error", "message": str(e)})
        except Exception:
            logger.exception("Pipeline vocale interrotta")
            await self._send_json(
                {"type": "error", "message": "La chiamata si è interrotta per un errore tecnico."}
            )
        finally:
            # Drop any commit still waiting out its grace window, so it can't
            # fire a turn onto a socket that is being torn down.
            if self._settle_task and not self._settle_task.done():
                self._settle_task.cancel()
            await self._cancel_turn(notify=False)
            # After the cancel, so a turn still in flight on hang-up is
            # counted before the medians are computed.
            self._metrics.report()
            # Awaited, not fire-and-forget like _persist, so the write is
            # never left pending when the handler returns. It is still no
            # synchronisation point: on a hang-up the browser closed this
            # socket, so it knows the call is over before this runs and
            # tracks the closure on its side.
            await asyncio.to_thread(_mark_conversation_ended, self.session.conversation_id)

    # ── Browser → STT ─────────────────────────────────

    async def _browser_loop(self) -> None:
        while True:
            message = await self.browser.receive()
            if message["type"] == "websocket.disconnect":
                return
            data = message.get("bytes")
            if data:
                started = time.perf_counter()
                await self.stt.send(
                    json.dumps(
                        {
                            "message_type": "input_audio_chunk",
                            "audio_base_64": base64.b64encode(data).decode("ascii"),
                        }
                    )
                )
                if STT_DEBUG_ENABLED:
                    self._track_audio_send(len(data), started)
                continue
            text = message.get("text")
            if not text:
                continue
            try:
                event = json.loads(text)
            except json.JSONDecodeError:
                continue
            # "start" (ring finished) needs no server action: the avatar
            # is the caller and waits for the operator to speak first.
            if event.get("type") == "end":
                return

    def _track_audio_send(self, nbytes: int, started: float) -> None:
        """Riassume ogni tanto com'è andato l'invio dell'audio alla STT.

        Serve a dare un nome al colpevole quando le trascrizioni arrivano in
        blocco: se i secondi di audio spediti stanno al passo con l'orologio,
        il microfono e questo processo hanno fatto la loro parte e l'arretrato
        è di ElevenLabs. Se restano indietro, il ritardo è nostro e la send
        più lenta dice di quanto. Acceso solo con la diagnostica.
        """
        now = time.perf_counter()
        self._audio_slowest_send = max(self._audio_slowest_send, (now - started) * 1000)
        self._audio_bytes += nbytes
        if self._audio_first_at is None:
            self._audio_first_at = started
            self._audio_reported_at = started
            return
        if now - self._audio_reported_at < _AUDIO_REPORT_SECS:
            return
        self._audio_reported_at = now
        inviato = self._audio_bytes / _AUDIO_BYTES_PER_SEC
        trascorso = now - self._audio_first_at
        logger.info(
            "[STT-INVIO] audio inviato %.1fs su %.1fs di chiamata | "
            "indietro di %.0fms | send più lenta %.0fms",
            inviato,
            trascorso,
            (trascorso - inviato) * 1000,
            self._audio_slowest_send,
        )
        # Azzerata a ogni riga: il massimo dall'inizio della chiamata resta
        # quello di un singolo intoppo e non direbbe più niente sull'adesso.
        self._audio_slowest_send = 0.0

    # ── STT → turn management ─────────────────────────

    async def _stt_loop(self) -> None:
        async for raw in self.stt:
            event = json.loads(raw)
            message_type = event.get("message_type", "")

            # Il tracciato grezzo della STT: ogni evento con il tempo passato
            # dal parziale precedente e la coda del testo, che è come si vede
            # se un commit arriva mentre l'operatore sta ancora parlando.
            # Spento di default perché stampa quello che le persone dicono,
            # vedi STT_DEBUG_ENABLED in turn_metrics.
            if STT_DEBUG_ENABLED:
                _now = time.perf_counter()
                _gap = (
                    f"{(_now - self._last_partial_at) * 1000:.0f}ms"
                    if self._last_partial_at is not None
                    else "n/d"
                )
                _txt = (event.get("text") or "").strip()
                logger.info(
                    '[STT-RAW] %s | dal_last_partial=%s | len=%s | "%s"',
                    message_type,
                    _gap,
                    len(_txt),
                    _txt[-60:],
                )

            if message_type == "partial_transcript":
                text = (event.get("text") or "").strip()
                if not text:
                    continue
                # Last sign of *new* speech before the silence the VAD is
                # timing: an unchanged partial means the operator has already
                # stopped and the silence is running.
                if text != self._last_partial_text:
                    self._last_partial_text = text
                    self._last_partial_at = time.perf_counter()
                # More speech after a held commit means the turn is not over:
                # push the grace window back until the operator actually stops.
                if self._pending_timer is not None:
                    self._schedule_settle()
                    await self._send_json(
                        {"type": "user_partial", "text": _join_transcript(self._pending_text, text)}
                    )
                else:
                    await self._send_json({"type": "user_partial", "text": text})

            elif message_type in (
                "committed_transcript",
                "committed_transcript_with_timestamps",
            ):
                text = (event.get("text") or "").strip()
                if not text:
                    continue
                # A commit while a real turn is already streaming is a
                # barge-in/correction: drop that turn before taking the new
                # speech. Aggregated (held) commits never have a turn in flight
                # here, since those fire only after the grace window closes.
                if self._turn_task and not self._turn_task.done():
                    await self._cancel_turn(notify=True)
                # Anchor the timer on the first commit of a group so its
                # commit->audio spans the whole wait, grace window included.
                # Every later commit is handed to hold(): the group's cost
                # stays visible while the wait the operator actually sat
                # through is timed from the commit that really ended the turn.
                vad_ms = (
                    (time.perf_counter() - self._last_partial_at) * 1000
                    if self._last_partial_at is not None
                    else None
                )
                if self._pending_timer is None:
                    self._turn_count += 1
                    self._pending_timer = TurnTimer(turn_id=f"#{self._turn_count}", vad_ms=vad_ms)
                else:
                    self._pending_timer.hold(vad_ms)
                self._last_partial_at = None
                self._last_partial_text = ""
                self._pending_text = _join_transcript(self._pending_text, text)
                # Provisional bubble: the words so far, not yet the final turn
                await self._send_json({"type": "user_partial", "text": self._pending_text})
                # A commit that ends a sentence is the operator done; one that
                # ends mid-word/clause is ElevenLabs splitting a long turn, so
                # wait for the continuation instead of answering half of it.
                if VOICE_SETTLE_MS <= 0 or _looks_complete(text):
                    await self._fire_pending()
                else:
                    self._schedule_settle()

            elif "error" in message_type or message_type in _FATAL_STT_ERRORS:
                detail = event.get("error") or message_type
                logger.error("ElevenLabs STT: %s: %s", message_type, detail)
                if message_type in _FATAL_STT_ERRORS:
                    await self._send_json(
                        {
                            "type": "error",
                            "message": f"Riconoscimento vocale non disponibile ({message_type}).",
                        }
                    )
                    return

    # ── TTS → browser ─────────────────────────────────

    async def _keepalive_loop(self) -> None:
        """Tiene su la socket della sintesi mentre parla l'operatore.

        Non è una cautela di troppo: ElevenLabs chiude la connessione dopo un
        tetto di inattività, e su questa socket non passa niente per tutto il
        tempo in cui l'avatar sta zitto. Senza, a cadere sarebbero proprio le
        chiamate in cui l'operatore si dilunga, cioè quelle che vanno bene.
        """
        while True:
            await asyncio.sleep(_TTS_KEEPALIVE_SECS)
            await self.tts.send(tts_keepalive_message(self._keepalive_context))

    async def _tts_loop(self) -> None:
        async for raw in self.tts:
            event = json.loads(raw)

            # Gli errori si guardano prima del filtro sul contesto: possono
            # arrivare senza, e scartarli insieme all'audio vecchio vorrebbe
            # dire non accorgersi mai che la sintesi ha smesso di rispondere.
            if event.get("error"):
                logger.error("ElevenLabs TTS: %s", event.get("message") or event.get("error"))
                context_id = event.get("contextId")
                if self._active_context and context_id in (None, self._active_context):
                    self._metrics.close_tts_slot(self._active_context, interrotto=True)
                    self._speaking = False
                    self._active_context = None
                    await self._send_json({"type": "speaking_end"})
                continue

            context_id = event.get("contextId")
            if context_id != self._active_context:
                # Audio di un turno già annullato, o il contesto dei keep
                # alive che non ha niente da dire: in nessuno dei due casi
                # deve arrivare al browser.
                continue

            audio = base64.b64decode(event.get("audio") or "")
            if audio:
                # Only this turn's own timer: audio tagged with another
                # context belongs to a turn that was already cancelled.
                timer = self._turn_timer
                if timer is not None and timer.context_id == context_id:
                    timer.mark(MARK_TTS_FIRST_AUDIO)
                else:
                    timer = None
                if not self._speaking:
                    self._speaking = True
                    await self._send_json({"type": "speaking_start"})
                await self._send_audio(audio)
                if timer is not None:
                    # The wait the operator perceives ends here. Logging
                    # it drops the timer too, so a barge-in later in the
                    # same turn won't book it as cancelled.
                    timer.mark(MARK_BROWSER_FIRST_AUDIO)
                    self._metrics.record(timer)
                    self._turn_timer = None

            if event.get("isFinal"):
                self._metrics.close_tts_slot(context_id)
                self._speaking = False
                self._active_context = None
                await self._send_json({"type": "speaking_end"})

    # ── Assistant turns ───────────────────────────────

    def _schedule_settle(self) -> None:
        """(Re)start the grace-window countdown for the buffered commit."""
        if self._settle_task and not self._settle_task.done():
            self._settle_task.cancel()
        self._settle_task = asyncio.create_task(self._settle_then_fire())

    async def _settle_then_fire(self) -> None:
        """Fire the buffered turn once the grace window passes untouched."""
        try:
            await asyncio.sleep(VOICE_SETTLE_MS / 1000)
        except asyncio.CancelledError:
            return
        # Detach first so _fire_pending never cancels this very task
        if self._settle_task is asyncio.current_task():
            self._settle_task = None
        await self._fire_pending()

    async def _fire_pending(self) -> None:
        """Deliver the buffered turn and start the assistant reply."""
        if self._settle_task and not self._settle_task.done():
            self._settle_task.cancel()
        self._settle_task = None
        text = self._pending_text
        timer = self._pending_timer
        self._pending_text = ""
        self._pending_timer = None
        if not text or timer is None:
            return
        # A late continuation after the window closed can find a turn already
        # streaming: cancel it so the fuller turn replaces it (barge-in).
        await self._cancel_turn(notify=True)
        await self._send_json({"type": "user_final", "text": text})
        self.history.append({"role": "user", "content": text})
        self._persist("user", text)
        self._turn_timer = timer
        self._start_turn()

    def _start_turn(self) -> None:
        self._turn_task = asyncio.create_task(self._run_turn())

    async def _cancel_turn(self, notify: bool) -> None:
        """Stop the in-flight turn (restart on a late commit, or hang-up)."""
        interrupted = False
        task_cancelled = False
        if self._turn_task and not self._turn_task.done():
            self._turn_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._turn_task
            interrupted = True
            task_cancelled = True
        if self._active_context:
            with contextlib.suppress(Exception):
                await self.tts.send(tts_close_message(self._active_context))
            self._metrics.close_tts_slot(self._active_context, interrotto=True)
            self._active_context = None
            interrupted = True
        if interrupted:
            self._speaking = False
            if notify:
                # Deliver the truncated turn as a bubble before the flush
                if task_cancelled and self._turn_text:
                    await self._send_json({"type": "assistant_end", "text": self._turn_text})
                await self._send_json({"type": "interrupt"})
        self._turn_text = ""
        # A timer still set here belongs to a turn that died before its
        # first audio ever left (the TTS loop clears the ones that made it),
        # so it is logged as cancelled and counted apart in the summary.
        if self._turn_timer is not None:
            self._metrics.record(self._turn_timer)
            self._turn_timer = None

    async def _speak(self, context_id: str, text: str) -> None:
        if self._turn_timer is not None:
            self._turn_timer.mark(MARK_TTS_FIRST_SEND)
            self._turn_timer.count_tts_send()
        # Da qui il contesto occupa uno slot di concorrenza del piano, e lo
        # tiene finché la sintesi non chiude con "isFinal".
        self._metrics.open_tts_slot(context_id)
        await self.tts.send(tts_chunk_message(context_id, text))

    async def _run_turn(self) -> None:
        """Stream one assistant turn: LLM tokens → browser text + TTS audio."""
        context_id = uuid.uuid4().hex
        self._active_context = context_id
        timer = self._turn_timer
        if timer is not None:
            timer.context_id = context_id
        full_text = ""
        self._turn_text = ""
        try:
            word_buffer = ""
            try:
                if timer is not None:
                    timer.mark(MARK_LLM_REQUEST)
                async for delta in stream_avatar_response(
                    messages_history=self.history,
                    avatar_profile=self.session.avatar_profile,
                ):
                    if timer is not None:
                        timer.mark(MARK_LLM_FIRST_TOKEN)
                    full_text += delta
                    self._turn_text = full_text
                    await self._send_json({"type": "assistant_delta", "text": delta})
                    # Feed the TTS on word boundaries so it never has to
                    # guess the pronunciation of a half-token
                    word_buffer += delta
                    cut = max(word_buffer.rfind(" "), word_buffer.rfind("\n"))
                    if cut > 0:
                        await self._speak(context_id, word_buffer[: cut + 1])
                        word_buffer = word_buffer[cut + 1 :]
            except RuntimeError as e:
                # La causa vera l'ha già scritta openai_service con il suo
                # stacktrace: qui interessa che questo turno ha risposto con
                # la battuta di ripiego invece che con l'avatar.
                logger.error("LLM voce: %s", e)
                if not full_text:
                    full_text = _LLM_FALLBACK_LINE
                    self._turn_text = full_text
                    await self._send_json({"type": "assistant_delta", "text": _LLM_FALLBACK_LINE})
                    word_buffer = _LLM_FALLBACK_LINE + " "
            if word_buffer.strip():
                await self._speak(context_id, word_buffer)

            # Chiudere il contesto manda in sintesi quel che è rimasto in
            # cassa: è anche il flush, non serve chiederlo a parte.
            await self.tts.send(tts_close_message(context_id))

            if full_text:
                self.history.append({"role": "assistant", "content": full_text})
                self._persist("assistant", full_text)
            self._turn_text = ""
            await self._send_json({"type": "assistant_end", "text": full_text})
        except asyncio.CancelledError:
            # Barge-in: keep what was actually generated in the history so
            # the LLM knows what the operator heard (even if truncated)
            if full_text:
                self.history.append({"role": "assistant", "content": full_text})
                self._persist("assistant", full_text)
            raise
