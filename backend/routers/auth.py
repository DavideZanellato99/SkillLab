"""Authentication API endpoints.

Tokens are transported exclusively in HttpOnly + Secure + SameSite=Lax
cookies: JavaScript can never read them (XSS mitigation). The browser
attaches them automatically; the frontend only sees the user profile.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth_dependency import (
    get_current_user,
    get_or_create_mock_admin,
    ACCESS_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE,
)
from cognito_service import (
    authenticate,
    respond_to_new_password_challenge,
    refresh_tokens,
)
from rate_limit import SlidingWindowLimiter
from schemas import (
    LoginRequest,
    LoginResponse,
    NewPasswordRequiredResponse,
    NewPasswordRequest,
    MessageResponse,
    UserResponse,
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


def _client_ip(request: Request) -> str:
    # First hop of X-Forwarded-For when behind a trusted reverse proxy;
    # direct connections fall back to the socket peer address.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _retry_message(seconds: int) -> str:
    if seconds >= 60:
        minutes = (seconds + 59) // 60
        return f"Troppi tentativi di accesso. Riprova tra {minutes} minut{'o' if minutes == 1 else 'i'}."
    return f"Troppi tentativi di accesso. Riprova tra {seconds} secondi."


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
    ip_key = _client_ip(http_request)

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

    _set_access_cookie(response, result["access_token"])
    _set_refresh_cookie(response, result["refresh_token"])
    return LoginResponse(user=UserResponse.model_validate(user))


@router.post("/new-password")
def complete_new_password(
    request: NewPasswordRequest, response: Response, db: Session = Depends(get_db)
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

    _set_access_cookie(response, result["access_token"])
    _set_refresh_cookie(response, result["refresh_token"])
    return LoginResponse(user=UserResponse.model_validate(user))


@router.post("/refresh", response_model=MessageResponse)
def refresh_access_token(request: Request, response: Response):
    """Rotate the access token cookie using the refresh token cookie."""
    refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token mancante.",
        )

    try:
        result = refresh_tokens(refresh_token)
    except RuntimeError as e:
        # Generic message to the client (no Cognito internals); real cause
        # in the server log. Cookies must be cleared on the error response
        # itself: headers on the injected Response are dropped when an
        # HTTPException is raised
        print(f"[WARN] Refresh token non valido: {e}")
        error = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Sessione scaduta. Effettua nuovamente il login."},
        )
        _clear_auth_cookies(error)
        return error

    _set_access_cookie(response, result["access_token"])
    return MessageResponse(message="Token aggiornato.", success=True)


@router.post("/logout", response_model=MessageResponse)
def logout(response: Response):
    """Clear the auth cookies (HttpOnly cookies can't be removed by JS)."""
    _clear_auth_cookies(response)
    return MessageResponse(message="Logout effettuato.", success=True)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    return UserResponse.model_validate(current_user)
