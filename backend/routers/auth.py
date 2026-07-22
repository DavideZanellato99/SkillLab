"""Authentication API endpoints.

Tokens are transported exclusively in HttpOnly + Secure + SameSite=Lax
cookies: JavaScript can never read them (XSS mitigation). The browser
attaches them automatically; the frontend only sees the user profile.
"""

import re
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from auth_dependency import (
    ACCESS_TOKEN_COOKIE,
    MOCK_ADMIN_SUB,
    REFRESH_TOKEN_COOKIE,
    get_current_user,
    get_or_create_mock_admin,
)
from cognito_service import (
    authenticate,
    change_own_password,
    refresh_tokens,
    respond_to_new_password_challenge,
    revoke_refresh_token,
    verify_access_token,
)
from database import get_db
from models import User
from rate_limit import SlidingWindowLimiter
from schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    NewPasswordRequest,
    NewPasswordRequiredResponse,
    UpdateProfileRequest,
    UserResponse,
)
from token_denylist import is_jti_revoked, revoke_jtis
from token_sessions import (
    access_binding_matches,
    bind_access_token,
    client_ip,
    revocation_entries,
    session_anchor_matches,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Cookie lifetimes: mirror the Cognito token validity (60 min access,
# 30 days refresh). The JWT expiry stays the real source of truth —
# the cookie max-age only controls browser retention.
_ACCESS_COOKIE_MAX_AGE = 60 * 60
_REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60

# The refresh token is only ever needed by /api/auth/* (refresh, logout):
# scoping its path shrinks the surface it travels on.
_REFRESH_COOKIE_PATH = "/api/auth"


def _set_access_cookie(response: Response, access_token: str) -> None:
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=access_token,
        max_age=_ACCESS_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        max_age=_REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path=_REFRESH_COOKIE_PATH,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    response.delete_cookie(REFRESH_TOKEN_COOKIE, path=_REFRESH_COOKIE_PATH)


# Password policy — must mirror the Cognito user pool policy (and the
# frontend checklist in Navbar.tsx). Cognito counts only these characters
# as symbols for the RequireSymbols rule.
PASSWORD_MIN_LENGTH = 12
_COGNITO_SYMBOLS = set("^$*.[]{}()?-\"!@#%&/\\,><':;|_~`+=")

# Brute-force protection on login: only FAILED attempts are counted.
# The email bucket shields a single account from password guessing (also
# distributed); the IP bucket caps one client probing many accounts.
# A successful login clears the email bucket only — clearing the IP one
# would let an attacker reset it by logging into an account they own.
_LOGIN_WINDOW_SECONDS = 15 * 60
_email_limiter = SlidingWindowLimiter(max_failures=5, window_seconds=_LOGIN_WINDOW_SECONDS)
_ip_limiter = SlidingWindowLimiter(max_failures=10, window_seconds=_LOGIN_WINDOW_SECONDS)

# Every login failure gets this same message, whatever the real cause
# (email inesistente, password sbagliata, account non confermato, utente
# assente dal DB...): a different message per case would let an attacker
# enumerate which emails exist. The real reason goes to the server log.
_GENERIC_LOGIN_ERROR = "Credenziali non valide."


def _retry_message(seconds: int) -> str:
    if seconds >= 60:
        minutes = (seconds + 59) // 60
        return f"Troppi tentativi di accesso. Riprova tra {minutes} minut{'o' if minutes == 1 else 'i'}."
    return f"Troppi tentativi di accesso. Riprova tra {seconds} secondi."


def _bind_fresh_token(db: Session, access_token: str, http_request: Request, user_id) -> None:
    """
    Record the session binding (jti ↔ IP + User-Agent) for a freshly
    minted access token. Best-effort: if the JWKS is unreachable the
    login/refresh still succeeds — the same outage would block every
    verified request anyway.
    """
    try:
        claims = verify_access_token(access_token)
        bind_access_token(db, claims, http_request, user_id)
    except RuntimeError as e:
        print(f"[ERROR] Session binding non registrato: {e}")


def validate_password_strength(password: str) -> list[str]:
    """Return the password policy requirements that `password` does not meet."""
    unmet: list[str] = []
    if len(password) < PASSWORD_MIN_LENGTH:
        unmet.append(f"almeno {PASSWORD_MIN_LENGTH} caratteri")
    if not re.search(r"[A-Z]", password):
        unmet.append("una lettera maiuscola")
    if not re.search(r"[a-z]", password):
        unmet.append("una lettera minuscola")
    if not re.search(r"[0-9]", password):
        unmet.append("un numero")
    if not any(c in _COGNITO_SYMBOLS for c in password):
        unmet.append("un simbolo (es. !@#$%)")
    return unmet


@router.post("/login")
def login(
    request: LoginRequest,
    http_request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Authenticate with email and password. Rate limited per account and
    per IP against credential brute-forcing (429 + Retry-After).

    On success the tokens are set as HttpOnly cookies and only the user
    profile is returned. May instead return NewPasswordRequiredResponse
    if Cognito requires a password change.
    """
    email_key = request.email.strip().lower()
    ip_key = client_ip(http_request)

    wait = max(_email_limiter.retry_after(email_key), _ip_limiter.retry_after(ip_key))
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_retry_message(wait),
            headers={"Retry-After": str(wait)},
        )

    try:
        result = authenticate(request.email, request.password)
    except RuntimeError as e:
        _email_limiter.record_failure(email_key)
        _ip_limiter.record_failure(ip_key)
        print(f"[WARN] Login fallito per '{email_key}': {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_GENERIC_LOGIN_ERROR,
        )

    # Correct credentials (full login or password challenge): clear the
    # account's failure bucket
    _email_limiter.reset(email_key)

    # If Cognito requires a new password
    if result.get("challenge") == "NEW_PASSWORD_REQUIRED":
        return NewPasswordRequiredResponse(session=result["session"])

    # Successful login — find or verify user in DB
    if result.get("access_token") == "mock-admin-access-token":
        user = get_or_create_mock_admin(db)
    else:
        user = db.query(User).filter(User.email == request.email).first()
    if not user:
        # Auth passed but the user has no DB row: same generic 401 — a
        # dedicated message would confirm the credentials were correct
        print(f"[WARN] Login: utente Cognito senza riga nel DB: '{email_key}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_GENERIC_LOGIN_ERROR,
        )

    _bind_fresh_token(db, result["access_token"], http_request, user.id)
    _set_access_cookie(response, result["access_token"])
    _set_refresh_cookie(response, result["refresh_token"])
    return LoginResponse(user=UserResponse.model_validate(user))


@router.post("/new-password")
def complete_new_password(
    request: NewPasswordRequest,
    http_request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Complete the NEW_PASSWORD_REQUIRED challenge.

    Called when the user logs in for the first time with a temporary password.
    """
    unmet = validate_password_strength(request.new_password)
    if unmet:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La password non soddisfa i requisiti: " + ", ".join(unmet) + ".",
        )

    try:
        result = respond_to_new_password_challenge(
            email=request.email,
            new_password=request.new_password,
            session=request.session,
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Find user in DB
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utente non trovato nel database. Contatta l'amministratore.",
        )

    _bind_fresh_token(db, result["access_token"], http_request, user.id)
    _set_access_cookie(response, result["access_token"])
    _set_refresh_cookie(response, result["refresh_token"])
    return LoginResponse(user=UserResponse.model_validate(user))


@router.post("/refresh", response_model=MessageResponse)
def refresh_access_token(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Rotate the access token cookie using the refresh token cookie.

    Session binding: the new access token is only issued if the caller's
    IP + User-Agent match the session anchor (origin_jti) recorded at
    login. A stolen refresh token replayed from another browser/device
    kills the whole session instead of minting fresh tokens.
    """
    refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token mancante.",
        )

    def _rejected(log_message: str) -> JSONResponse:
        # Generic message to the client (no internals); real cause in the
        # server log. Cookies must be cleared on the error response
        # itself: headers on the injected Response are dropped when an
        # HTTPException is raised
        print(log_message)
        error = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Sessione scaduta. Effettua nuovamente il login."},
        )
        _clear_auth_cookies(error)
        return error

    # ── Binding pre-check on the OLD access token ─────
    # The refresh is a rotation point: without this check a thief holding
    # both cookies could mint a fresh access token bound to HIS context.
    # The old jti identifies the session even if the token is expired
    # (signature still verified; exp ignored). Runs BEFORE the Cognito
    # call: on mismatch no token is ever minted.
    old_access = request.cookies.get(ACCESS_TOKEN_COOKIE)
    if old_access:
        try:
            old_claims = verify_access_token(old_access, verify_exp=False)
        except RuntimeError:
            # Unreadable/garbage cookie: can't identify the old token —
            # the post-mint anchor check below still guards the rotation
            old_claims = None

        if old_claims and old_claims.get("jti"):
            if is_jti_revoked(db, old_claims.get("jti"), old_claims.get("origin_jti")):
                try:
                    revoke_refresh_token(refresh_token)
                except RuntimeError as e:
                    print(f"[ERROR] Refresh: revoca del refresh token fallita: {e}")
                return _rejected("[WARN] Refresh rifiutato: sessione già revocata (pre-check).")

            if not access_binding_matches(db, old_claims, request):
                revoke_jtis(db, revocation_entries(old_claims))
                try:
                    revoke_refresh_token(refresh_token)
                except RuntimeError as e:
                    print(f"[ERROR] Refresh: revoca del refresh token fallita: {e}")
                return _rejected(
                    "[WARN] Refresh rifiutato: contesto diverso dal binding del vecchio "
                    f"access token (ip={client_ip(request)})"
                )

    try:
        result = refresh_tokens(refresh_token)
    except RuntimeError as e:
        return _rejected(f"[WARN] Refresh token non valido: {e}")

    access_token = result["access_token"]
    try:
        claims = verify_access_token(access_token)
    except RuntimeError as e:
        return _rejected(f"[WARN] Refresh: access token emesso non verificabile: {e}")

    if claims.get("jti"):
        # A denylisted session (logout or binding violation) must not mint
        # new tokens: reject and revoke the refresh token upstream too
        if is_jti_revoked(db, claims.get("jti"), claims.get("origin_jti")):
            try:
                revoke_refresh_token(refresh_token)
            except RuntimeError as e:
                print(f"[ERROR] Refresh: revoca del refresh token fallita: {e}")
            return _rejected("[WARN] Refresh rifiutato: sessione revocata.")

        if not session_anchor_matches(db, claims, request):
            # Context mismatch (or session never bound): kill everything —
            # denylist the fresh token + session anchor and revoke the
            # refresh token upstream on Cognito
            revoke_jtis(db, revocation_entries(claims))
            try:
                revoke_refresh_token(refresh_token)
            except RuntimeError as e:
                print(f"[ERROR] Refresh: revoca del refresh token fallita: {e}")
            return _rejected(
                "[WARN] Refresh rifiutato: contesto client diverso da quello della sessione "
                f"(ip={client_ip(request)})"
            )

        user = db.query(User).filter(User.cognito_sub == claims.get("sub")).first()
        bind_access_token(db, claims, request, user.id if user else None)

    _set_access_cookie(response, access_token)
    return MessageResponse(message="Token aggiornato.", success=True)


def _denylist_access_token(db: Session, access_token: str) -> None:
    """
    Push the access token's jti and origin_jti into the server-side
    denylist. origin_jti is shared by every access token minted from the
    same refresh token, so the whole session dies, not just this token.
    """
    claims = verify_access_token(access_token)
    now = datetime.now(UTC).replace(tzinfo=None)

    entries: list[tuple[str, datetime]] = []
    jti = claims.get("jti")
    exp = claims.get("exp")
    if jti:
        expires_at = (
            datetime.fromtimestamp(exp, tz=UTC).replace(tzinfo=None)
            if exp
            else now + timedelta(seconds=_ACCESS_COOKIE_MAX_AGE)
        )
        entries.append((jti, expires_at))

    origin_jti = claims.get("origin_jti")
    if origin_jti:
        # Sibling tokens of the session can outlive this one by at most a
        # full access-token validity window
        entries.append((origin_jti, now + timedelta(seconds=_ACCESS_COOKIE_MAX_AGE)))

    revoke_jtis(db, entries)


@router.post("/logout", response_model=MessageResponse)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Log out: revoke the refresh token on Cognito, denylist the access
    token's jti server-side, then clear the auth cookies (HttpOnly
    cookies can't be removed by JS).

    Together the two revocations kill the whole session: a stolen refresh
    token can't mint new access tokens, and the stolen access token stops
    working immediately instead of living out its remaining 60 minutes.
    Both steps are best-effort — the logout always clears the cookies, or
    an outage would keep the user trapped in the session.
    """
    refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if refresh_token:
        try:
            revoke_refresh_token(refresh_token)
        except RuntimeError as e:
            print(f"[ERROR] Logout: revoca del refresh token fallita: {e}")

    access_token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    if access_token:
        try:
            _denylist_access_token(db, access_token)
        except RuntimeError:
            # Invalid/expired access token: already unusable, nothing to deny
            pass
        except Exception as e:
            print(f"[ERROR] Logout: denylist del jti fallita: {e}")

    _clear_auth_cookies(response)
    return MessageResponse(message="Logout effettuato.", success=True)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
def update_my_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the authenticated user's own first/last name (self-service,
    every role). Email and role are read-only here — only a Super Admin can
    change those, via /api/admin/users/{id}.
    """
    if request.nome is not None:
        nome = request.nome.strip()
        if not nome:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Il nome non può essere vuoto.",
            )
        current_user.nome = nome

    if request.cognome is not None:
        cognome = request.cognome.strip()
        if not cognome:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Il cognome non può essere vuoto.",
            )
        current_user.cognome = cognome

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.post("/change-password", response_model=MessageResponse)
def change_my_password(
    request: ChangePasswordRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
):
    """
    Change the authenticated user's own password (self-service, every
    role). Cognito verifies request.current_password server-side before
    accepting the new one — a stolen session cookie alone isn't enough to
    take over the account.
    """
    if current_user.cognito_sub == MOCK_ADMIN_SUB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non è possibile cambiare la password dell'account di sistema.",
        )

    unmet = validate_password_strength(request.new_password)
    if unmet:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nuova password non soddisfa i requisiti: " + ", ".join(unmet) + ".",
        )

    access_token = http_request.cookies.get(ACCESS_TOKEN_COOKIE)
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessione non valida. Effettua nuovamente il login.",
        )

    try:
        change_own_password(access_token, request.current_password, request.new_password)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return MessageResponse(message="Password aggiornata con successo.", success=True)
