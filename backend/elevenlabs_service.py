"""ElevenLabs Scribe v2 Realtime — streaming speech-to-text config.

The voice pipeline opens a WebSocket to ElevenLabs and forwards the
operator's microphone audio (PCM16 @ 16 kHz). Turn-taking is delegated
to ElevenLabs' server-side VAD (commit_strategy=vad): a committed
transcript marks the end of the user's turn.
"""

import os
from urllib.parse import urlencode

from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_STT_MODEL = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2_realtime")
# ISO 639-1; the whole product is Italian-first
ELEVENLABS_STT_LANGUAGE = os.getenv("ELEVENLABS_STT_LANGUAGE", "it")
# Seconds of silence after speech before the turn is committed. Lower =
# snappier replies but more risk of cutting the operator off mid-sentence.
ELEVENLABS_VAD_SILENCE_SECS = float(os.getenv("ELEVENLABS_VAD_SILENCE_SECS", "0.8"))

_STT_WS_BASE = os.getenv(
    "ELEVENLABS_STT_WS_URL", "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
)

# Audio format the browser capture worklet produces
STT_SAMPLE_RATE = 16000


def stt_ws_url() -> str:
    """WebSocket URL for a realtime STT session (VAD-based turn commits)."""
    params = {
        "model_id": ELEVENLABS_STT_MODEL,
        "audio_format": f"pcm_{STT_SAMPLE_RATE}",
        "language_code": ELEVENLABS_STT_LANGUAGE,
        "commit_strategy": "vad",
        "vad_silence_threshold_secs": ELEVENLABS_VAD_SILENCE_SECS,
    }
    return f"{_STT_WS_BASE}?{urlencode(params)}"


def stt_headers() -> dict:
    """Auth headers for the server-side STT connection."""
    if not ELEVENLABS_API_KEY:
        raise RuntimeError(
            "ELEVENLABS_API_KEY non configurata. Aggiungila al file .env del backend."
        )
    return {"xi-api-key": ELEVENLABS_API_KEY}
