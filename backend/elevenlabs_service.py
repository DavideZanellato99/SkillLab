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
ELEVENLABS_STT_MODEL = os.getenv("ELEVENLABS_STT_MODEL")
if not ELEVENLABS_STT_MODEL:
    raise RuntimeError("ELEVENLABS_STT_MODEL non configurato. Aggiungilo al file .env del backend.")
# ISO 639-1; the whole product is Italian-first
ELEVENLABS_STT_LANGUAGE = os.getenv("ELEVENLABS_STT_LANGUAGE")
if not ELEVENLABS_STT_LANGUAGE:
    raise RuntimeError(
        "ELEVENLABS_STT_LANGUAGE non configurato. Aggiungilo al file .env del backend."
    )
# Seconds of silence after speech before the turn is committed. Lower =
# snappier replies but more risk of cutting the operator off mid-sentence.
_vad_silence_secs = os.getenv("ELEVENLABS_VAD_SILENCE_SECS")
if not _vad_silence_secs:
    raise RuntimeError(
        "ELEVENLABS_VAD_SILENCE_SECS non configurato. Aggiungilo al file .env del backend."
    )
ELEVENLABS_VAD_SILENCE_SECS = float(_vad_silence_secs)

# Speech-probability threshold (0.1–0.9): how loud a frame must be to count
# as speech rather than silence. Lower = softer speech still counts, so the
# VAD is less likely to read a quiet stretch mid-sentence as a pause and
# commit early. Left unset it falls back to ElevenLabs' own default, which
# we do not control; setting it explicitly is what keeps long sentences from
# being cut where the voice trails off.
_vad_threshold = os.getenv("ELEVENLABS_VAD_THRESHOLD")
if not _vad_threshold:
    raise RuntimeError(
        "ELEVENLABS_VAD_THRESHOLD non configurato. Aggiungilo al file .env del backend."
    )
ELEVENLABS_VAD_THRESHOLD = float(_vad_threshold)
if not 0.1 <= ELEVENLABS_VAD_THRESHOLD <= 0.9:
    raise RuntimeError("ELEVENLABS_VAD_THRESHOLD deve essere tra 0.1 e 0.9.")

_STT_WS_BASE = os.getenv("ELEVENLABS_STT_WS_URL")
if not _STT_WS_BASE:
    raise RuntimeError(
        "ELEVENLABS_STT_WS_URL non configurato. Aggiungilo al file .env del backend."
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
        "vad_threshold": ELEVENLABS_VAD_THRESHOLD,
    }
    return f"{_STT_WS_BASE}?{urlencode(params)}"


def stt_headers() -> dict:
    """Auth headers for the server-side STT connection."""
    if not ELEVENLABS_API_KEY:
        raise RuntimeError(
            "ELEVENLABS_API_KEY non configurata. Aggiungila al file .env del backend."
        )
    return {"xi-api-key": ELEVENLABS_API_KEY}
