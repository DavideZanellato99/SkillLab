"""Realtime voice pipeline: ElevenLabs STT → OpenAI LLM → Cartesia TTS.

One instance per call. The browser streams mic audio (PCM16 @ 16 kHz,
binary frames) over our WebSocket; we proxy it to ElevenLabs Scribe v2
Realtime, whose VAD commits the end of each user turn. Each committed
transcript triggers an LLM stream (voice model) whose tokens are piped
word-by-word into a Cartesia context; the resulting PCM16 @ 24 kHz audio
chunks are forwarded to the browser as binary frames.

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
import json
import uuid
from datetime import datetime, timezone
from uuid import UUID

import websockets
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState

from database import SessionLocal
from models import ChatConversation, ChatMessage
from voice_sessions import VoiceSession
from openai_service import stream_avatar_response
from elevenlabs_service import stt_ws_url, stt_headers
from cartesia_service import (
    tts_ws_url,
    tts_headers,
    tts_chunk_message,
    tts_cancel_message,
    resolve_voice_id,
)

_LLM_FALLBACK_LINE = "Mi dispiace, ho avuto un problema tecnico. Puoi ripetere?"

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
            db.query(ChatConversation)
            .filter(ChatConversation.id == UUID(conversation_id))
            .first()
        )
        if conversation:
            conversation.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        print(f"[ERROR] Persistenza messaggio vocale fallita: {e}")
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
            db.query(ChatConversation)
            .filter(ChatConversation.id == UUID(conversation_id))
            .first()
        )
        if conversation and conversation.ended_at is None:
            conversation.ended_at = datetime.now(timezone.utc)
            db.commit()
    except Exception as e:
        print(f"[ERROR] Chiusura conversazione fallita: {e}")
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
        # Cartesia context currently allowed to reach the browser; audio
        # from any other context (cancelled turn) is dropped.
        self._active_context: str | None = None
        self._speaking = False
        # Text generated so far by the in-flight turn: lets a barge-in
        # deliver the truncated assistant bubble to the browser.
        self._turn_text = ""

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
        asyncio.create_task(
            asyncio.to_thread(_persist_message, self.session.conversation_id, role, content)
        )

    # ── Main loop ─────────────────────────────────────

    async def run(self) -> None:
        try:
            async with websockets.connect(
                stt_ws_url(),
                additional_headers=stt_headers(),
                max_size=16 * 1024 * 1024,
            ) as stt, websockets.connect(
                tts_ws_url(),
                additional_headers=tts_headers(),
                max_size=16 * 1024 * 1024,
            ) as tts:
                self.stt = stt
                self.tts = tts
                await self._send_json({"type": "ready"})

                tasks = [
                    asyncio.create_task(self._browser_loop(), name="browser"),
                    asyncio.create_task(self._stt_loop(), name="stt"),
                    asyncio.create_task(self._tts_loop(), name="tts"),
                ]
                try:
                    done, pending = await asyncio.wait(
                        tasks, return_when=asyncio.FIRST_COMPLETED
                    )
                    # Surface unexpected crashes of whichever loop ended first
                    for t in done:
                        exc = t.exception()
                        if exc and not isinstance(exc, (WebSocketDisconnect,)):
                            raise exc
                finally:
                    for t in tasks:
                        t.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
        except RuntimeError as e:
            await self._send_json({"type": "error", "message": str(e)})
        except Exception as e:
            print(f"[ERROR] Pipeline vocale interrotta: {e}")
            await self._send_json(
                {"type": "error", "message": "La chiamata si è interrotta per un errore tecnico."}
            )
        finally:
            await self._cancel_turn(notify=False)
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
                await self.stt.send(
                    json.dumps(
                        {
                            "message_type": "input_audio_chunk",
                            "audio_base_64": base64.b64encode(data).decode("ascii"),
                        }
                    )
                )
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

    # ── STT → turn management ─────────────────────────

    async def _stt_loop(self) -> None:
        async for raw in self.stt:
            event = json.loads(raw)
            message_type = event.get("message_type", "")

            if message_type == "partial_transcript":
                text = (event.get("text") or "").strip()
                if not text:
                    continue
                await self._send_json({"type": "user_partial", "text": text})

            elif message_type in (
                "committed_transcript",
                "committed_transcript_with_timestamps",
            ):
                text = (event.get("text") or "").strip()
                if not text:
                    continue
                # A commit while a turn is in flight means the VAD split the
                # operator's sentence: restart with the fuller history. The
                # cancel goes first so the browser's mic gate (armed by
                # user_final) stays closed through the regeneration.
                await self._cancel_turn(notify=True)
                await self._send_json({"type": "user_final", "text": text})
                self.history.append({"role": "user", "content": text})
                self._persist("user", text)
                self._start_turn()

            elif "error" in message_type or message_type in _FATAL_STT_ERRORS:
                detail = event.get("error") or message_type
                print(f"[ERROR] ElevenLabs STT: {message_type}: {detail}")
                if message_type in _FATAL_STT_ERRORS:
                    await self._send_json(
                        {"type": "error", "message": f"Riconoscimento vocale non disponibile ({message_type})."}
                    )
                    return

    # ── TTS → browser ─────────────────────────────────

    async def _tts_loop(self) -> None:
        async for raw in self.tts:
            event = json.loads(raw)
            event_type = event.get("type")
            context_id = event.get("context_id")
            if context_id != self._active_context:
                continue  # stale audio from a cancelled turn

            if event_type == "chunk":
                audio = base64.b64decode(event.get("data") or "")
                if audio:
                    if not self._speaking:
                        self._speaking = True
                        await self._send_json({"type": "speaking_start"})
                    await self._send_audio(audio)
            elif event_type == "done":
                self._speaking = False
                self._active_context = None
                await self._send_json({"type": "speaking_end"})
            elif event_type == "error":
                print(f"[ERROR] Cartesia TTS: {event.get('message')}")
                self._speaking = False
                self._active_context = None
                await self._send_json({"type": "speaking_end"})

    # ── Assistant turns ───────────────────────────────

    def _start_turn(self) -> None:
        self._turn_task = asyncio.create_task(self._run_turn())

    async def _cancel_turn(self, notify: bool) -> None:
        """Stop the in-flight turn (restart on a late commit, or hang-up)."""
        interrupted = False
        task_cancelled = False
        if self._turn_task and not self._turn_task.done():
            self._turn_task.cancel()
            try:
                await self._turn_task
            except (asyncio.CancelledError, Exception):
                pass
            interrupted = True
            task_cancelled = True
        if self._active_context:
            try:
                await self.tts.send(tts_cancel_message(self._active_context))
            except Exception:
                pass
            self._active_context = None
            interrupted = True
        if interrupted:
            self._speaking = False
            if notify:
                # Deliver the truncated turn as a bubble before the flush
                if task_cancelled and self._turn_text:
                    await self._send_json(
                        {"type": "assistant_end", "text": self._turn_text}
                    )
                await self._send_json({"type": "interrupt"})
        self._turn_text = ""

    async def _speak(self, context_id: str, text: str, more_coming: bool) -> None:
        await self.tts.send(
            tts_chunk_message(context_id, text, self.voice_id, more_coming)
        )

    async def _run_turn(self) -> None:
        """Stream one assistant turn: LLM tokens → browser text + TTS audio."""
        context_id = uuid.uuid4().hex
        self._active_context = context_id
        full_text = ""
        self._turn_text = ""
        try:
            word_buffer = ""
            try:
                async for delta in stream_avatar_response(
                    messages_history=self.history,
                    avatar_profile=self.session.avatar_profile,
                ):
                    full_text += delta
                    self._turn_text = full_text
                    await self._send_json({"type": "assistant_delta", "text": delta})
                    # Feed the TTS on word boundaries so it never has to
                    # guess the pronunciation of a half-token
                    word_buffer += delta
                    cut = max(word_buffer.rfind(" "), word_buffer.rfind("\n"))
                    if cut > 0:
                        await self._speak(context_id, word_buffer[: cut + 1], more_coming=True)
                        word_buffer = word_buffer[cut + 1 :]
            except RuntimeError as e:
                print(f"[ERROR] LLM voce: {e}")
                if not full_text:
                    full_text = _LLM_FALLBACK_LINE
                    self._turn_text = full_text
                    await self._send_json(
                        {"type": "assistant_delta", "text": _LLM_FALLBACK_LINE}
                    )
                    word_buffer = _LLM_FALLBACK_LINE + " "
            if word_buffer.strip():
                await self._speak(context_id, word_buffer, more_coming=True)

            # Close the context: empty final chunk flushes remaining audio
            await self._speak(context_id, "", more_coming=False)

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
