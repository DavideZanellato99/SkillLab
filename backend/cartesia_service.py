"""Cartesia Sonic — streaming text-to-speech config and message builders.

The voice pipeline keeps a single TTS WebSocket per call and opens one
Cartesia *context* per assistant turn: LLM tokens are streamed in as
transcript chunks (continue=true) and raw PCM16 @ 24 kHz audio chunks
stream back, tagged with the context id so stale audio from an
interrupted turn can be dropped.
"""

import json
import os

import requests
from dotenv import load_dotenv

load_dotenv()

CARTESIA_API_KEY = os.getenv("CARTESIA_API_KEY", "")
CARTESIA_MODEL = os.getenv("CARTESIA_MODEL")
if not CARTESIA_MODEL:
    raise RuntimeError("CARTESIA_MODEL non configurato. Aggiungilo al file .env del backend.")
CARTESIA_VERSION = os.getenv("CARTESIA_VERSION")
if not CARTESIA_VERSION:
    raise RuntimeError("CARTESIA_VERSION non configurato. Aggiungilo al file .env del backend.")
CARTESIA_DEFAULT_VOICE_ID = os.getenv("CARTESIA_DEFAULT_VOICE_ID", "")
CARTESIA_LANGUAGE = os.getenv("CARTESIA_LANGUAGE")
if not CARTESIA_LANGUAGE:
    raise RuntimeError("CARTESIA_LANGUAGE non configurato. Aggiungilo al file .env del backend.")

_TTS_WS_BASE = os.getenv("CARTESIA_TTS_WS_URL")
if not _TTS_WS_BASE:
    raise RuntimeError("CARTESIA_TTS_WS_URL non configurato. Aggiungilo al file .env del backend.")

# REST base for the calls that are not the live pipeline (voice catalogue,
# one-shot preview). Optional, unlike the WebSocket URL above: those two are
# admin conveniences, not the product, so a missing value falls back to the
# public host rather than stopping the whole app from booting.
_API_BASE = (os.getenv("CARTESIA_API_BASE") or "https://api.cartesia.ai").rstrip("/")

# Raw PCM16 mono the browser plays back directly
TTS_SAMPLE_RATE = 24000

# One-shot preview: a WAV container so the <audio> element plays the reply
# as it comes, with no decoding on our side.
_PREVIEW_TIMEOUT_SECONDS = 20


def tts_ws_url() -> str:
    return f"{_TTS_WS_BASE}?cartesia_version={CARTESIA_VERSION}"


def tts_headers() -> dict:
    """Auth headers for the server-side TTS connection."""
    if not CARTESIA_API_KEY:
        raise RuntimeError("CARTESIA_API_KEY non configurata. Aggiungila al file .env del backend.")
    return {"X-API-Key": CARTESIA_API_KEY, "Cartesia-Version": CARTESIA_VERSION}


def resolve_voice_id(avatar_voice_id: str | None) -> str:
    voice_id = avatar_voice_id or CARTESIA_DEFAULT_VOICE_ID
    if not voice_id:
        raise RuntimeError(
            "Nessuna voce Cartesia configurata: assegna un voice_id all'avatar "
            "o imposta CARTESIA_DEFAULT_VOICE_ID nel .env."
        )
    return voice_id


def list_voices(limit: int = 100) -> list[dict]:
    """The Cartesia voice catalogue, as `{id, name, language, description}`.

    Read by the avatar admin form so a voice is picked from a list instead
    of pasting an opaque id. Raises RuntimeError when the key is missing,
    like the rest of this module.
    """
    response = requests.get(
        f"{_API_BASE}/voices",
        headers=tts_headers(),
        params={"limit": limit},
        timeout=_PREVIEW_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    voices = payload.get("data", payload if isinstance(payload, list) else [])
    return [
        {
            "id": v.get("id", ""),
            "name": v.get("name") or v.get("id", ""),
            "language": v.get("language") or "",
            "description": v.get("description") or None,
        }
        for v in voices
        if v.get("id")
    ]


def synthesize_preview(voice_id: str, transcript: str) -> bytes:
    """Speak one short line with a voice, as WAV bytes.

    A one-shot REST call, deliberately unrelated to the streaming pipeline:
    this is somebody in the admin page clicking "listen", not a call.
    """
    response = requests.post(
        f"{_API_BASE}/tts/bytes",
        headers={**tts_headers(), "Content-Type": "application/json"},
        json={
            "model_id": CARTESIA_MODEL,
            "transcript": transcript,
            "voice": {"mode": "id", "id": voice_id},
            "language": CARTESIA_LANGUAGE,
            "output_format": {
                "container": "wav",
                "encoding": "pcm_s16le",
                "sample_rate": TTS_SAMPLE_RATE,
            },
        },
        timeout=_PREVIEW_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.content


def tts_chunk_message(
    context_id: str,
    transcript: str,
    voice_id: str,
    more_coming: bool,
) -> str:
    """One streamed transcript chunk for a turn's TTS context."""
    return json.dumps(
        {
            "model_id": CARTESIA_MODEL,
            "context_id": context_id,
            "transcript": transcript,
            "continue": more_coming,
            "voice": {"mode": "id", "id": voice_id},
            "language": CARTESIA_LANGUAGE,
            "output_format": {
                "container": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": TTS_SAMPLE_RATE,
            },
        },
        ensure_ascii=False,
    )


def tts_cancel_message(context_id: str) -> str:
    """Cancel a context after a barge-in: stop generating its audio."""
    return json.dumps({"context_id": context_id, "cancel": True})
