"""Service for communicating with Hume AI (EVI voice sessions)."""

import os
import time
import secrets
import threading
from dataclasses import dataclass, field

import requests as http_requests
from dotenv import load_dotenv

load_dotenv()

HUME_API_KEY = os.getenv("HUME_API_KEY", "")
HUME_SECRET_KEY = os.getenv("HUME_SECRET_KEY", "")
HUME_EVI_CONFIG_ID = os.getenv("HUME_EVI_CONFIG_ID", "")
HUME_DEFAULT_VOICE_ID = os.getenv("HUME_DEFAULT_VOICE_ID", "")

_TOKEN_URL = "https://api.hume.ai/oauth2-cc/token"

# Voice sessions expire after this many seconds without activity
_SESSION_TTL = 60 * 60  # 1 hour


def fetch_access_token() -> str:
    """
    Fetch a short-lived Hume access token via the client-credentials flow.

    The token is returned to the browser, which uses it to open the EVI
    WebSocket directly with Hume. Raises RuntimeError on failure.
    """
    if not HUME_API_KEY or not HUME_SECRET_KEY:
        raise RuntimeError(
            "HUME_API_KEY / HUME_SECRET_KEY non configurate. "
            "Aggiungile al file .env del backend."
        )

    try:
        response = http_requests.post(
            _TOKEN_URL,
            auth=(HUME_API_KEY, HUME_SECRET_KEY),
            data={"grant_type": "client_credentials"},
            timeout=10,
        )
        response.raise_for_status()
    except http_requests.RequestException as e:
        raise RuntimeError(f"Errore nella comunicazione con Hume AI: {str(e)}")

    token = response.json().get("access_token")
    if not token:
        raise RuntimeError("Hume AI non ha restituito un access token.")
    return token


@dataclass
class VoiceSession:
    """State for an active voice session, keyed by custom_session_id."""

    user_id: str
    avatar_id: str
    conversation_id: str
    # Snapshot of the avatar's persona sheet taken when the session starts:
    # the CLM endpoint reads it from here, keeping the per-turn hot path
    # free of avatar lookups.
    avatar_profile: dict = field(default_factory=dict)
    # Snapshot of the DB history taken when the session starts. During the
    # session Hume sends the live transcript, so we never re-read the DB.
    prior_history: list[dict] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)


# In-memory registry of active voice sessions. The CLM endpoint is public
# (Hume must reach it), so unknown/expired session ids are rejected there.
_sessions: dict[str, VoiceSession] = {}
_sessions_lock = threading.Lock()


def create_voice_session(
    user_id: str,
    avatar_id: str,
    conversation_id: str,
    avatar_profile: dict,
    prior_history: list[dict],
) -> str:
    """Register a new voice session and return its unguessable id."""
    session_id = secrets.token_urlsafe(24)
    with _sessions_lock:
        # Drop expired sessions while we're here
        now = time.time()
        expired = [sid for sid, s in _sessions.items() if now - s.created_at > _SESSION_TTL]
        for sid in expired:
            del _sessions[sid]

        _sessions[session_id] = VoiceSession(
            user_id=user_id,
            avatar_id=avatar_id,
            conversation_id=conversation_id,
            avatar_profile=avatar_profile,
            prior_history=prior_history,
        )
    return session_id


def get_voice_session(session_id: str) -> VoiceSession | None:
    """Look up an active voice session, or None if unknown/expired."""
    with _sessions_lock:
        session = _sessions.get(session_id)
        if session and (time.time() - session.created_at) > _SESSION_TTL:
            del _sessions[session_id]
            return None
        return session
