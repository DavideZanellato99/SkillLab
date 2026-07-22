"""Session binding: access tokens tied to the client that minted them.

At login (and at every refresh) the backend records in public.token_session
the context the token was minted for: (jti, user_id, client_ip,
user_agent, expires_at). A row is also written for the token's origin_jti
— the session anchor, shared by every access token of the same refresh
token — which is what the refresh endpoint validates.

On every authenticated request, after signature and denylist checks, the
caller's IP + User-Agent are compared with the row of the token's jti.
A mismatch (or a token with no binding at all) means the cookie left the
owner's browser: the jti AND the whole session (origin_jti) are pushed
into the denylist and the request gets 401. Intentionally the legitimate
owner is kicked out too — better one extra login than a hijacked session.

Trust note: client_ip honours the first hop of X-Forwarded-For. Behind a
reverse proxy make sure it overwrites any client-supplied value, or the
IP half of the binding can be spoofed (the User-Agent half still holds).

Datetimes are naive UTC, consistent with token_denylist.
"""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from models import TokenSession
from token_denylist import revoke_jtis

_UA_MAX_LEN = 400

# Mirror the Cognito token validities (see routers/auth.py cookie ages):
# the jti row dies with the access token, the origin anchor must span the
# whole refresh-token lifetime.
_ACCESS_LIFETIME_SECONDS = 60 * 60
_SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60


def client_ip(request: Request) -> str:
    """First hop of X-Forwarded-For behind a trusted reverse proxy;
    direct connections fall back to the socket peer address."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _user_agent(request: Request) -> str:
    return (request.headers.get("user-agent") or "")[:_UA_MAX_LEN]


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _jti_expiry(claims: dict, now: datetime) -> datetime:
    exp = claims.get("exp")
    if exp:
        return datetime.fromtimestamp(exp, tz=UTC).replace(tzinfo=None)
    return now + timedelta(seconds=_ACCESS_LIFETIME_SECONDS)


def revocation_entries(claims: dict) -> list[tuple[str, datetime]]:
    """Denylist entries that kill this token and its whole session."""
    now = _utcnow()
    entries: list[tuple[str, datetime]] = []
    jti = claims.get("jti")
    if jti:
        entries.append((jti, _jti_expiry(claims, now)))
    origin_jti = claims.get("origin_jti")
    if origin_jti:
        # Sibling access tokens can outlive this one by at most one
        # access-token validity window
        entries.append((origin_jti, now + timedelta(seconds=_ACCESS_LIFETIME_SECONDS)))
    return entries


def bind_access_token(db: Session, claims: dict, request: Request, user_id=None) -> None:
    """
    Record the caller's context for a freshly minted access token: one row
    for its jti and (first mint only) one for the origin_jti anchor.
    Expired rows are purged while we're here. No-op for tokens without a
    jti (the local mock admin).
    """
    jti = claims.get("jti")
    if not jti:
        return

    now = _utcnow()
    db.query(TokenSession).filter(TokenSession.expires_at < now).delete(synchronize_session=False)

    ip = client_ip(request)
    ua = _user_agent(request)
    entries = [(jti, _jti_expiry(claims, now))]
    origin_jti = claims.get("origin_jti")
    if origin_jti:
        entries.append((origin_jti, now + timedelta(seconds=_SESSION_LIFETIME_SECONDS)))

    for key, expires_at in entries:
        # The origin anchor already exists on refresh: keep the context
        # recorded at login, it is the ground truth of the session
        if db.get(TokenSession, key) is None:
            db.add(
                TokenSession(
                    jti=key,
                    user_id=user_id,
                    client_ip=ip,
                    user_agent=ua,
                    expires_at=expires_at,
                )
            )
    db.commit()


def session_anchor_matches(db: Session, claims: dict, request: Request) -> bool:
    """
    True when the caller's context matches the session anchor (origin_jti)
    recorded at login. Used by the refresh endpoint: a stolen refresh
    token replayed from another device/browser must not mint new tokens.
    """
    origin_jti = claims.get("origin_jti")
    if not origin_jti:
        return False
    row = db.get(TokenSession, origin_jti)
    return (
        row is not None
        and row.client_ip == client_ip(request)
        and row.user_agent == _user_agent(request)
    )


def access_binding_matches(db: Session, claims: dict, request: Request) -> bool:
    """
    True when the caller's context matches the binding recorded for this
    access token's jti. Tokens without a jti (the local mock admin) match
    trivially; a jti with no binding row does NOT match.
    """
    jti = claims.get("jti")
    if not jti:
        return True
    row = db.get(TokenSession, jti)
    return (
        row is not None
        and row.client_ip == client_ip(request)
        and row.user_agent == _user_agent(request)
    )


def enforce_session_binding(db: Session, claims: dict, request: Request) -> None:
    """
    Reject (401) an access token used from a context different from the
    one it was minted for — or never bound at all. On violation the token
    and its whole session are denylisted first, so the cookie dies for
    everyone, legitimate owner included.
    """
    if access_binding_matches(db, claims, request):
        return

    revoke_jtis(db, revocation_entries(claims))
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sessione non valida. Effettua nuovamente il login.",
        headers={"WWW-Authenticate": "Bearer"},
    )
