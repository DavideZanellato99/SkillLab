"""Server-side denylist for Cognito access tokens (by jti).

Cognito's revoke_token only invalidates the refresh token: access tokens
already issued keep working until their exp (up to 60 minutes). At logout
the backend pushes the access token's jti — and its origin_jti, shared by
every access token minted from the same refresh token — into this
denylist; get_current_user then rejects denylisted tokens with 401.

The Postgres table `revoked_jti` is the source of truth (survives
restarts, shared across workers). An in-memory snapshot refreshed every
_CACHE_TTL seconds keeps the per-request check free of extra queries:
revocations made by this process apply immediately, those made by other
workers propagate within _CACHE_TTL seconds.

Datetimes are handled as naive UTC throughout this module so comparisons
behave the same on TIMESTAMP columns regardless of session timezone.
"""

import threading
import time
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from models import RevokedJti

_CACHE_TTL = 60.0

_cache: set[str] = set()
_cache_loaded_at: float | None = None
_lock = threading.Lock()


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def revoke_jtis(db: Session, entries: list[tuple[str, datetime]]) -> None:
    """
    Persist (jti, expires_at naive-UTC) pairs in the denylist and make them
    effective immediately in this process. Expired rows are purged while
    we're here. Re-revoking an already denylisted jti is a no-op.
    """
    if not entries:
        return

    db.query(RevokedJti).filter(RevokedJti.expires_at < _utcnow()).delete(synchronize_session=False)
    existing = {
        row[0]
        for row in db.query(RevokedJti.jti)
        .filter(RevokedJti.jti.in_([jti for jti, _ in entries]))
        .all()
    }
    for jti, expires_at in entries:
        if jti not in existing:
            db.add(RevokedJti(jti=jti, expires_at=expires_at))
    db.commit()

    with _lock:
        _cache.update(jti for jti, _ in entries)


def is_jti_revoked(db: Session, *jtis: str | None) -> bool:
    """True if any of the given jti values is denylisted (None values skipped)."""
    values = [j for j in jtis if j]
    if not values:
        return False

    global _cache_loaded_at
    with _lock:
        stale = _cache_loaded_at is None or (time.monotonic() - _cache_loaded_at) > _CACHE_TTL

    if stale:
        rows = db.query(RevokedJti.jti).filter(RevokedJti.expires_at > _utcnow()).all()
        with _lock:
            _cache.clear()
            _cache.update(row[0] for row in rows)
            _cache_loaded_at = time.monotonic()

    with _lock:
        return any(v in _cache for v in values)
