"""Cartesia Sonic — streaming text-to-speech config and message builders.

The voice pipeline keeps a single TTS WebSocket per call and opens one
Cartesia *context* per assistant turn: LLM tokens are streamed in as
transcript chunks (continue=true) and raw PCM16 @ 24 kHz audio chunks
stream back, tagged with the context id so stale audio from an
interrupted turn can be dropped.
"""

import json
import os

from dotenv import load_dotenv

load_dotenv()

CARTESIA_API_KEY = os.getenv("CARTESIA_API_KEY", "")
CARTESIA_MODEL = os.getenv("CARTESIA_MODEL", "sonic-3.5")
CARTESIA_VERSION = os.getenv("CARTESIA_VERSION", "2026-03-01")
CARTESIA_DEFAULT_VOICE_ID = os.getenv("CARTESIA_DEFAULT_VOICE_ID", "")
CARTESIA_LANGUAGE = os.getenv("CARTESIA_LANGUAGE", "it")

_TTS_WS_BASE = os.getenv("CARTESIA_TTS_WS_URL", "wss://api.cartesia.ai/tts/websocket")

# Raw PCM16 mono the browser plays back directly
TTS_SAMPLE_RATE = 24000


def tts_ws_url() -> str:
    return f"{_TTS_WS_BASE}?cartesia_version={CARTESIA_VERSION}"


def tts_headers() -> dict:
    """Auth headers for the server-side TTS connection."""
    if not CARTESIA_API_KEY:
        raise RuntimeError(
            "CARTESIA_API_KEY non configurata. Aggiungila al file .env del backend."
        )
    return {"X-API-Key": CARTESIA_API_KEY, "Cartesia-Version": CARTESIA_VERSION}


def resolve_voice_id(avatar_voice_id: str | None) -> str:
    voice_id = avatar_voice_id or CARTESIA_DEFAULT_VOICE_ID
    if not voice_id:
        raise RuntimeError(
            "Nessuna voce Cartesia configurata: assegna un voice_id all'avatar "
            "o imposta CARTESIA_DEFAULT_VOICE_ID nel .env."
        )
    return voice_id


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
