"""In-memory registry of active voice sessions (provider-neutral).

A session is created by POST /api/voice/session (authenticated) and
consumed by the voice WebSocket endpoint, which is reachable only with
the unguessable session id issued here.
"""

import time
import secrets
import threading
from dataclasses import dataclass, field

# Voice sessions expire after this many seconds without being opened
_SESSION_TTL = 60 * 60  # 1 hour


@dataclass
class VoiceSession:
    """State for an active voice session, keyed by session_id."""

    user_id: str
    avatar_id: str
    conversation_id: str
    # Snapshot of the avatar's persona sheet taken when the session starts:
    # the pipeline reads it from here, keeping the per-turn hot path free
    # of avatar lookups.
    avatar_profile: dict = field(default_factory=dict)
    # Snapshot of the DB history taken when the session starts. During the
    # session the pipeline tracks turns in memory, so it never re-reads
    # the DB.
    prior_history: list[dict] = field(default_factory=list)
    # Cartesia voice id for this avatar (None -> default voice)
    voice_id: str | None = None
    created_at: float = field(default_factory=time.time)


_sessions: dict[str, VoiceSession] = {}
_sessions_lock = threading.Lock()


def create_voice_session(
    user_id: str,
    avatar_id: str,
    conversation_id: str,
    avatar_profile: dict,
    prior_history: list[dict],
    voice_id: str | None = None,
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
            voice_id=voice_id,
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
