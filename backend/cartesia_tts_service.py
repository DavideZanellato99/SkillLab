"""Cartesia Sonic — streaming text-to-speech config and message builders.

L'altro adattatore della sintesi, nella forma descritta da
[tts_protocol](tts_protocol.py); chi lo sceglie è `TTS_PROVIDER`.

The voice pipeline keeps a single TTS WebSocket per call and opens one
Cartesia *context* per assistant turn: LLM tokens are streamed in as
transcript chunks (continue=true) and raw PCM16 @ 24 kHz audio chunks
stream back, tagged with the context id so stale audio from an
interrupted turn can be dropped.

Tre differenze con ElevenLabs, e sono quelle che il protocollo unico deve
coprire:

- **La voce sta in ogni messaggio**, non nell'indirizzo. Una connessione può
  quindi cambiare voce a metà, cosa che a una telefonata non serve, ma vuol
  dire anche che un id sbagliato non lo si scopre nell'handshake: passa la
  connessione e a rompersi è il turno. Vedi ``VOICE_IN_URL``.
- **Chiudere e annullare sono due cose diverse.** Un contesto chiuso manda in
  sintesi quel che è rimasto in cassa, uno annullato lo butta via, ed è
  esattamente la differenza fra la fine di una battuta e un'interruzione.
- **La socket non si chiude da sola** per inattività, quindi il giro dei keep
  alive resta spento. Vedi ``KEEPALIVE_SECS``.
"""

import base64
import json
import os

import requests
from dotenv import load_dotenv

from tts_protocol import TtsEvent

load_dotenv()

PROVIDER_LABEL = "Cartesia"

API_KEY = os.getenv("CARTESIA_API_KEY", "")
CARTESIA_MODEL = os.getenv("CARTESIA_MODEL")
if not CARTESIA_MODEL:
    raise RuntimeError("CARTESIA_MODEL non configurato. Aggiungilo al file .env del backend.")
# La versione dell'API che si pretende di parlare. Cartesia la vuole in ogni
# richiesta, nell'indirizzo del socket e nelle intestazioni REST.
CARTESIA_VERSION = os.getenv("CARTESIA_VERSION")
if not CARTESIA_VERSION:
    raise RuntimeError("CARTESIA_VERSION non configurato. Aggiungilo al file .env del backend.")
DEFAULT_VOICE_ID = os.getenv("CARTESIA_DEFAULT_VOICE_ID", "")
TTS_LANGUAGE = os.getenv("CARTESIA_LANGUAGE")
if not TTS_LANGUAGE:
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

# La voce viaggia nei messaggi, quindi l'handshake non la vede e non può
# rifiutarla: chi apre il socket non ha nessun ripiego da tentare.
VOICE_IN_URL = False

# Niente keep alive: questa socket non ha un tetto di inattività da riarmare,
# e resta su per tutta la chiamata anche mentre l'avatar sta zitto.
KEEPALIVE_SECS = None

# One-shot preview: a WAV container so the <audio> element plays the reply
# as it comes, with no decoding on our side.
_PREVIEW_TIMEOUT_SECONDS = 20

# Il formato dell'audio dal vivo: grezzo, senza contenitore, perché il
# browser lo suona così com'è.
_STREAM_OUTPUT_FORMAT = {
    "container": "raw",
    "encoding": "pcm_s16le",
    "sample_rate": TTS_SAMPLE_RATE,
}


def ws_url(voice_id: str) -> str:
    """WebSocket URL della sessione di sintesi.

    La voce non compare: qui una connessione le parla tutte, e quale sia lo
    dice ogni messaggio.
    """
    return f"{_TTS_WS_BASE}?cartesia_version={CARTESIA_VERSION}"


def ws_headers() -> dict:
    """Auth headers for the server-side TTS connection."""
    if not API_KEY:
        raise RuntimeError("CARTESIA_API_KEY non configurata. Aggiungila al file .env del backend.")
    return {"X-API-Key": API_KEY, "Cartesia-Version": CARTESIA_VERSION}


def resolve_voice_id(avatar_voice_id: str | None) -> str:
    voice_id = avatar_voice_id or DEFAULT_VOICE_ID
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
        headers=ws_headers(),
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
        headers={**ws_headers(), "Content-Type": "application/json"},
        json={
            "model_id": CARTESIA_MODEL,
            "transcript": transcript,
            "voice": {"mode": "id", "id": voice_id},
            "language": TTS_LANGUAGE,
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


def _synthesis_message(context_id: str, transcript: str, voice_id: str, more_coming: bool) -> str:
    """Un messaggio di sintesi, che sia un pezzo di battuta o la sua fine.

    `continue` è tutta la differenza: finché è vero il contesto resta
    aperto e aspetta il pezzo dopo, quando è falso Cartesia sintetizza
    quello che ha in cassa e chiude.
    """
    return json.dumps(
        {
            "model_id": CARTESIA_MODEL,
            "context_id": context_id,
            "transcript": transcript,
            "continue": more_coming,
            "voice": {"mode": "id", "id": voice_id},
            "language": TTS_LANGUAGE,
            "output_format": _STREAM_OUTPUT_FORMAT,
        },
        ensure_ascii=False,
    )


def chunk_message(context_id: str, text: str, voice_id: str) -> str:
    """One streamed transcript chunk for a turn's TTS context."""
    return _synthesis_message(context_id, text, voice_id, more_coming=True)


def end_message(context_id: str, voice_id: str) -> str:
    """Fine del turno: un pezzo vuoto che non continua svuota la cassa."""
    return _synthesis_message(context_id, "", voice_id, more_coming=False)


def cancel_message(context_id: str) -> str:
    """Interruzione: smetti di generare l'audio di questo contesto."""
    return json.dumps({"context_id": context_id, "cancel": True})


def keepalive_message(context_id: str, voice_id: str) -> str:
    """Un pezzo vuoto che non chiude niente.

    Non lo usa nessuno finché ``KEEPALIVE_SECS`` resta a ``None``, ma il
    protocollo lo prevede e tenerlo qui costa meno che spiegare altrove
    perché manchi.
    """
    return _synthesis_message(context_id, "", voice_id, more_coming=True)


def parse_event(raw: str | bytes) -> TtsEvent:
    """Un messaggio della sintesi nella forma che la pipeline conosce.

    I tipi che non riguardano l'audio (i tempi delle parole, la conferma di
    un flush) tornano come eventi vuoti, che chi legge lascia cadere.
    """
    event = json.loads(raw)
    kind = event.get("type")
    context_id = event.get("context_id")
    if kind == "error":
        return TtsEvent(
            context_id=context_id,
            audio=b"",
            final=False,
            error=str(event.get("message") or event.get("error") or "errore senza messaggio"),
        )
    return TtsEvent(
        context_id=context_id,
        audio=base64.b64decode(event.get("data") or "") if kind == "chunk" else b"",
        final=kind == "done",
        error=None,
    )
