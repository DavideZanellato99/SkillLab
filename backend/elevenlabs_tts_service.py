"""ElevenLabs Flash — streaming text-to-speech config and message builders.

The voice pipeline keeps a single TTS WebSocket per call and opens one
ElevenLabs *context* per assistant turn: LLM tokens are streamed in as text
messages tagged with the context id, and raw PCM16 @ 24 kHz audio comes back
tagged the same way, so stale audio from an interrupted turn can be dropped.

Three traits of this protocol shape the code around it:

- **The voice lives in the URL**, not in every message. One connection speaks
  with one voice, which suits a call (one avatar, one voice), but means a
  voice id the account does not know fails the *handshake* instead of a
  single turn. Chi apre la connessione deve quindi avere una voce di
  ripiego pronta, vedi ``ELEVENLABS_DEFAULT_VOICE_ID``.
- **The connection closes itself after silence.** Una chiamata è per lo più
  l'operatore che parla, quindi fra un turno e l'altro non passa niente su
  questa socket: senza qualcuno che la tenga viva cadrebbe da sola a metà
  conversazione. Vedi ``INACTIVITY_TIMEOUT_SECS``.
- **``auto_mode`` decides the latency.** Spento, il modello aspetta di avere
  in cassa 120 caratteri prima di sintetizzare, e il primo audio di ogni
  turno arriverebbe con l'avatar che ha già finito di pensare. Acceso,
  genera appena il testo glielo consente.
"""

import json
import os
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv

from elevenlabs_service import api_headers

load_dotenv()

ELEVENLABS_TTS_MODEL = os.getenv("ELEVENLABS_TTS_MODEL")
if not ELEVENLABS_TTS_MODEL:
    raise RuntimeError("ELEVENLABS_TTS_MODEL non configurato. Aggiungilo al file .env del backend.")
# ISO 639-1: la lingua la impone la connessione, non la voce. I modelli sono
# multilingue, quindi qualunque voce del catalogo parla questa lingua.
ELEVENLABS_TTS_LANGUAGE = os.getenv("ELEVENLABS_TTS_LANGUAGE")
if not ELEVENLABS_TTS_LANGUAGE:
    raise RuntimeError(
        "ELEVENLABS_TTS_LANGUAGE non configurato. Aggiungilo al file .env del backend."
    )
ELEVENLABS_DEFAULT_VOICE_ID = os.getenv("ELEVENLABS_DEFAULT_VOICE_ID", "")

_TTS_WS_BASE = os.getenv("ELEVENLABS_TTS_WS_URL")
if not _TTS_WS_BASE:
    raise RuntimeError(
        "ELEVENLABS_TTS_WS_URL non configurato. Aggiungilo al file .env del backend."
    )
_TTS_WS_BASE = _TTS_WS_BASE.rstrip("/")

# REST base for the calls that are not the live pipeline (voice catalogue,
# one-shot preview). Optional, unlike the WebSocket URL above: those two are
# admin conveniences, not the product, so a missing value falls back to the
# public host rather than stopping the whole app from booting.
_API_BASE = (os.getenv("ELEVENLABS_API_BASE") or "https://api.elevenlabs.io").rstrip("/")

# Raw PCM16 mono the browser plays back directly
TTS_SAMPLE_RATE = 24000

# Quanto la socket sopravvive senza ricevere niente. ElevenLabs la chiude a 20
# secondi se non si dice altro, e 180 è il massimo che accetta: si chiede il
# massimo perché il pipeline la tiene comunque viva da solo, e questo margine
# è quello che copre un event loop occupato che manda il keep alive in ritardo.
INACTIVITY_TIMEOUT_SECS = 180

# One-shot preview: a WAV container so the <audio> element plays the reply
# as it comes, with no decoding on our side.
_PREVIEW_TIMEOUT_SECONDS = 20


def tts_ws_url(voice_id: str) -> str:
    """WebSocket URL for a multi-context TTS session with one given voice."""
    params = {
        "model_id": ELEVENLABS_TTS_MODEL,
        "output_format": f"pcm_{TTS_SAMPLE_RATE}",
        "language_code": ELEVENLABS_TTS_LANGUAGE,
        "auto_mode": "true",
        "inactivity_timeout": INACTIVITY_TIMEOUT_SECS,
    }
    return f"{_TTS_WS_BASE}/{voice_id}/multi-stream-input?{urlencode(params)}"


def tts_headers() -> dict:
    """Auth headers for the server-side TTS connection."""
    return api_headers()


def resolve_voice_id(avatar_voice_id: str | None) -> str:
    voice_id = avatar_voice_id or ELEVENLABS_DEFAULT_VOICE_ID
    if not voice_id:
        raise RuntimeError(
            "Nessuna voce ElevenLabs configurata: assegna un voice_id all'avatar "
            "o imposta ELEVENLABS_DEFAULT_VOICE_ID nel .env."
        )
    return voice_id


def _voice_language(voice: dict) -> str:
    """La lingua dichiarata da una voce, per quel che serve a distinguerla.

    Non è un vincolo: il modello è multilingue e legge l'italiano con
    qualunque voce. Serve solo a chi sceglie dal pannello, perché un
    catalogo di nomi propri senza altro non si naviga.
    """
    verified = voice.get("verified_languages") or []
    if verified and isinstance(verified[0], dict):
        language = verified[0].get("language")
        if language:
            return language
    labels = voice.get("labels") or {}
    return labels.get("language") or labels.get("accent") or ""


def list_voices(limit: int = 100) -> list[dict]:
    """The ElevenLabs voice catalogue, as `{id, name, language, description}`.

    Read by the avatar admin form so a voice is picked from a list instead
    of pasting an opaque id. Raises RuntimeError when the key is missing,
    like the rest of this module.
    """
    response = requests.get(
        f"{_API_BASE}/v2/voices",
        headers=tts_headers(),
        params={"page_size": limit},
        timeout=_PREVIEW_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    voices = payload.get("voices", payload if isinstance(payload, list) else [])
    return [
        {
            "id": v.get("voice_id", ""),
            "name": v.get("name") or v.get("voice_id", ""),
            "language": _voice_language(v),
            "description": v.get("description") or None,
        }
        for v in voices
        if v.get("voice_id")
    ]


def synthesize_preview(voice_id: str, transcript: str) -> bytes:
    """Speak one short line with a voice, as WAV bytes.

    A one-shot REST call, deliberately unrelated to the streaming pipeline:
    this is somebody in the admin page clicking "listen", not a call.
    """
    response = requests.post(
        f"{_API_BASE}/v1/text-to-speech/{voice_id}",
        headers={**tts_headers(), "Content-Type": "application/json"},
        params={"output_format": f"wav_{TTS_SAMPLE_RATE}"},
        json={
            "text": transcript,
            "model_id": ELEVENLABS_TTS_MODEL,
            "language_code": ELEVENLABS_TTS_LANGUAGE,
        },
        timeout=_PREVIEW_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.content


def tts_chunk_message(context_id: str, text: str) -> str:
    """One streamed text chunk for a turn's TTS context."""
    return json.dumps({"text": text, "context_id": context_id}, ensure_ascii=False)


def tts_close_message(context_id: str) -> str:
    """Close a context, both at the end of a turn and on a barge-in.

    ElevenLabs non distingue i due casi: chiudere svuota il buffer e manda
    in sintesi quel che resta, e non c'è modo di dirgli di buttarlo via. La
    differenza la fa il pipeline, che l'audio di un contesto non più attivo
    lo scarta appena arriva.
    """
    return json.dumps({"context_id": context_id, "close_context": True})


def tts_keepalive_message(context_id: str) -> str:
    """Reset the inactivity timer without generating anything.

    Il testo vuoto il server lo ignora: conta solo che sia arrivato
    qualcosa, ed è quello che tiene su la socket fra un turno e l'altro.
    """
    return json.dumps({"text": "", "context_id": context_id})
