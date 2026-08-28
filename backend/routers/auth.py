"""Authentication API endpoints.

Tokens are transported exclusively in HttpOnly + Secure + SameSite=Lax
cookies: JavaScript can never read them (XSS mitigation). The browser
attaches them automatically; the frontend only sees the user profile.
"""

import logging
import re
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import audit
import personal_data
from auth_dependency import (
    ACCESS_TOKEN_COOKIE,
    MOCK_ADMIN_SUB,
    REFRESH_TOKEN_COOKIE,
    access_denied_reason,
    get_current_super_admin,
    get_current_user,
    get_or_create_mock_admin,
)
from cognito_service import (
    authenticate,
    change_own_password,
    global_sign_out,
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
    revoke_user_sessions,
    session_anchor_matches,
)
from user_fields import clean_name_or_400, find_user_by_email

logger = logging.getLogger(__name__)

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
    """Il cookie che vale trenta giorni, e che viaggia il meno possibile.

    ``strict`` e non ``lax`` come l'altro, ed è l'unico dei due che se lo può
    permettere: la differenza fra i due sta in cosa succede quando si arriva
    qui da un link scritto altrove (una mail, un messaggio), perché con
    ``strict`` quella prima navigazione parte senza cookie. Per l'access
    token conta: si arriverebbe alla pagina da sconosciuti e si finirebbe al
    login pur avendo una sessione valida. Per questo no, perché nessuna
    navigazione lo usa: lo spende solo il rinnovo, che parte dalla pagina
    già aperta ed è una chiamata alla propria stessa origine.
    """
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        max_age=_REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="strict",
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
_email_limiter = SlidingWindowLimiter(
    scope="email", max_events=5, window_seconds=_LOGIN_WINDOW_SECONDS
)
_ip_limiter = SlidingWindowLimiter(scope="ip", max_events=10, window_seconds=_LOGIN_WINDOW_SECONDS)

# Le altre porte dello stesso corridoio. Il login non è l'unico endpoint che
# si può bussare a ripetizione, ed erano rimaste senza limite tre cose che
# vale la pena contare, ognuna per una ragione sua:
#
# - il rinnovo del token e la prima password si contano solo quando
#   FALLISCONO, come il login: un rinnovo riuscito è la cosa più normale che
#   un browser faccia, uno fallito a ripetizione è qualcuno che sta provando
#   cookie che non sono suoi;
# - il cambio password si conta sull'utente e non sull'indirizzo, perché lì
#   quello che si prova a indovinare è la password attuale di quell'account;
# - l'export dei dati personali si conta invece **riuscito**, come le
#   chiamate al modello: nessuno lo sta indovinando, costa (uno ZIP con
#   dentro l'audio delle proprie chiamate) e il modo di abusarne è chiederlo
#   in continuazione.
_refresh_limiter = SlidingWindowLimiter(
    scope="refresh-ip", max_events=20, window_seconds=_LOGIN_WINDOW_SECONDS
)
_new_password_limiter = SlidingWindowLimiter(
    scope="new-password-ip", max_events=10, window_seconds=_LOGIN_WINDOW_SECONDS
)
_change_password_limiter = SlidingWindowLimiter(
    scope="change-password", max_events=5, window_seconds=_LOGIN_WINDOW_SECONDS
)
_export_limiter = SlidingWindowLimiter(scope="export", max_events=5, window_seconds=60 * 60)

# Every login failure gets this same message, whatever the real cause
# (email inesistente, password sbagliata, account non confermato, utente
# assente dal DB...): a different message per case would let an attacker
# enumerate which emails exist. The real reason goes to the server log.
_GENERIC_LOGIN_ERROR = "Credenziali non valide"


def _too_many(limiter: SlidingWindowLimiter, key: str, message: str) -> None:
    """429 con Retry-After se la chiave ha esaurito il suo secchiello.

    Il messaggio lo passa chi chiama perché il tempo di attesa è la sola
    parte comune: "troppi tentativi di accesso" e "hai già scaricato i tuoi
    dati poco fa" descrivono due situazioni diverse a due persone diverse.
    """
    wait = limiter.retry_after(key)
    if not wait:
        return
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"{message} {_attesa(wait)}",
        headers={"Retry-After": str(wait)},
    )


def _attesa(seconds: int) -> str:
    if seconds >= 60:
        minutes = (seconds + 59) // 60
        return f"Riprova tra {minutes} minut{'o' if minutes == 1 else 'i'}"
    return f"Riprova tra {seconds} secondi"


def _retry_message(seconds: int) -> str:
    return f"Troppi tentativi di accesso. {_attesa(seconds)}"


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
        logger.error("Session binding non registrato: %s", e)


def _revoke_refresh_upstream(refresh_token: str, where: str) -> None:
    """Kill the refresh token on Cognito, without letting the failure surface.

    Called from the two places that end a session for good, the logout and
    every rejected refresh, and best-effort in both: the caller has already
    decided that this session is over and is clearing the cookies for it, so
    a Cognito outage must not turn that into an error the browser sees. What
    it costs is a refresh token that stays valid upstream until it expires,
    which is why the failure is worth a line of its own in the log.

    `where` says which of the two callers it was, so the line reads the same
    way the code does.
    """
    try:
        revoke_refresh_token(refresh_token)
    except RuntimeError as e:
        logger.error("%s: revoca del refresh token fallita: %s", where, e)


def _refuse_locked_out(user: User, http_request: Request) -> None:
    """Stop a valid authentication that the platform still refuses.

    Cognito has just checked the credentials, but a suspended account (or
    one inside a suspended organization) must not get a session: without
    this the login would set the cookies, stamp last_login_at and record an
    "Accesso effettuato" for someone every following request rejects with a
    401 nobody can read. 403 rather than 401: the credentials were right,
    it is the account that is closed — and the message says which of the
    two it is, since whoever got this far already knows the password.
    """
    denied = access_denied_reason(user)
    if not denied:
        return
    audit.log_action(
        audit.LOGIN_FAILED,
        http_request,
        user=user,
        status_code=status.HTTP_403_FORBIDDEN,
        motivo=denied,
    )
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=denied)


def _record_login(db: Session, user: User, http_request: Request) -> None:
    """Stamp the account's last successful authentication.

    Called from the two endpoints that actually hand out a fresh session,
    the login and the first-login password challenge. /refresh is left out
    on purpose: rotating a token is not an access, and counting it would
    keep an abandoned browser tab looking like an active user for as long
    as its refresh token lives.

    Publishing the actor before the commit is what keeps the row honest: a
    login writes on the user's own row, and without this the paternity
    columns would credit "sistema" for it (see `authorship`). The audit
    middleware ignores these routes, so no duplicate log row comes of it.
    """
    http_request.state.audit_user = user
    user.last_login_at = datetime.now(UTC)
    db.commit()


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
        _email_limiter.record(email_key)
        _ip_limiter.record(ip_key)
        logger.warning("Login fallito per '%s': %s", email_key, e)
        # Only the attempted email is recorded, never why it failed: the
        # reason is what would let the registry enumerate valid accounts.
        audit.log_action(
            audit.LOGIN_FAILED,
            http_request,
            user_email=email_key,
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
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
        # Case-insensitive on purpose: Cognito has just authenticated the
        # address however the user spelled it, so an exact match here would
        # reject a valid login with a generic 401 nobody can diagnose.
        user = find_user_by_email(db, request.email)
    if not user:
        # Auth passed but the user has no DB row: same generic 401 — a
        # dedicated message would confirm the credentials were correct
        logger.warning("Login: utente Cognito senza riga nel DB: '%s'", email_key)
        audit.log_action(
            audit.LOGIN_FAILED,
            http_request,
            user_email=email_key,
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_GENERIC_LOGIN_ERROR,
        )

    _refuse_locked_out(user, http_request)

    _bind_fresh_token(db, result["access_token"], http_request, user.id)
    _record_login(db, user, http_request)
    _set_access_cookie(response, result["access_token"])
    _set_refresh_cookie(response, result["refresh_token"])
    audit.log_action(audit.LOGIN, http_request, user=user)
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
    ip_key = client_ip(http_request)
    _too_many(_new_password_limiter, ip_key, "Troppi tentativi.")

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
        _new_password_limiter.record(ip_key)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Find user in DB (same case-insensitive match as the login)
    user = find_user_by_email(db, request.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utente non trovato nel database. Contatta l'amministratore.",
        )

    # The challenge hands out a session exactly like the login, so it is
    # held by the same rule: the password was just set, but a locked-out
    # account still gets no cookies.
    _refuse_locked_out(user, http_request)

    _bind_fresh_token(db, result["access_token"], http_request, user.id)
    _record_login(db, user, http_request)
    _set_access_cookie(response, result["access_token"])
    _set_refresh_cookie(response, result["refresh_token"])
    audit.log_action(audit.PASSWORD_SET, http_request, user=user)
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
    ip_key = client_ip(request)
    _too_many(_refresh_limiter, ip_key, "Troppi tentativi di rinnovo.")

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
        logger.warning(log_message)
        # Un rinnovo rifiutato entra nel conteggio: uno riuscito no, perché
        # è quello che ogni browser fa da solo una volta all'ora.
        _refresh_limiter.record(ip_key)
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
                _revoke_refresh_upstream(refresh_token, "Refresh")
                return _rejected("Refresh rifiutato: sessione già revocata (pre-check).")

            if not access_binding_matches(db, old_claims, request):
                revoke_jtis(db, revocation_entries(old_claims))
                _revoke_refresh_upstream(refresh_token, "Refresh")
                return _rejected(
                    "Refresh rifiutato: contesto diverso dal binding del vecchio "
                    f"access token (ip={client_ip(request)})"
                )

    try:
        result = refresh_tokens(refresh_token)
    except RuntimeError as e:
        return _rejected(f"Refresh token non valido: {e}")

    access_token = result["access_token"]
    try:
        claims = verify_access_token(access_token)
    except RuntimeError as e:
        return _rejected(f"Refresh: access token emesso non verificabile: {e}")

    if claims.get("jti"):
        # A denylisted session (logout or binding violation) must not mint
        # new tokens: reject and revoke the refresh token upstream too
        if is_jti_revoked(db, claims.get("jti"), claims.get("origin_jti")):
            _revoke_refresh_upstream(refresh_token, "Refresh")
            return _rejected("Refresh rifiutato: sessione revocata.")

        if not session_anchor_matches(db, claims, request):
            # Context mismatch (or session never bound): kill everything —
            # denylist the fresh token + session anchor and revoke the
            # refresh token upstream on Cognito
            revoke_jtis(db, revocation_entries(claims))
            _revoke_refresh_upstream(refresh_token, "Refresh")
            return _rejected(
                "Refresh rifiutato: contesto client diverso da quello della sessione "
                f"(ip={client_ip(request)})"
            )

        user = db.query(User).filter(User.cognito_sub == claims.get("sub")).first()
        bind_access_token(db, claims, request, user.id if user else None)

    _set_access_cookie(response, access_token)
    return MessageResponse(message="Token aggiornato.", success=True)


def _denylist_access_token(db: Session, access_token: str) -> dict:
    """
    Push the access token's jti and origin_jti into the server-side
    denylist. origin_jti is shared by every access token minted from the
    same refresh token, so the whole session dies, not just this token.

    Returns the verified claims, which is how the logout identifies who is
    leaving (there is no get_current_user on that endpoint).
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
    return claims


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
        _revoke_refresh_upstream(refresh_token, "Logout")

    access_token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    claims: dict | None = None
    if access_token:
        try:
            claims = _denylist_access_token(db, access_token)
        except RuntimeError:
            # Invalid/expired access token: already unusable, nothing to deny
            pass
        except Exception:
            logger.exception("Logout: denylist del jti fallita")

    # Only a logout with a still-readable token names its author. With an
    # expired one nobody can be identified, and a row with no actor would
    # say nothing: the session was already dead anyway.
    if claims and claims.get("sub"):
        user = db.query(User).filter(User.cognito_sub == claims["sub"]).first()
        if user:
            audit.log_action(audit.LOGOUT, request, user=user)

    _clear_auth_cookies(response)
    return MessageResponse(message="Logout effettuato.", success=True)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    return UserResponse.model_validate(current_user)


@router.get("/me/export")
def export_my_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A copy of everything the platform holds about the caller (art. 15/20).

    A ZIP with the structured data, the audio of their own calls and a
    README that explains the archive. Self-service and about the caller
    only: there is no path here for reading anybody else's copy, the user
    is taken from the session and never from a parameter.

    Recorded in the audit trail (the one read-only GET that is), because
    an access request is exactly the kind of thing you want to be able to
    prove you answered.
    """
    _too_many(
        _export_limiter,
        str(current_user.id),
        "Hai già richiesto una copia dei tuoi dati poco fa.",
    )
    archive = personal_data.export_zip(db, current_user)
    _export_limiter.record(str(current_user.id))
    day = datetime.now(UTC).strftime("%Y-%m-%d")
    return Response(
        content=archive,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="dati-personali-{day}.zip"'},
    )


@router.put("/me", response_model=UserResponse)
def update_my_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Update the authenticated user's own first/last name.

    Riservato al Super Admin: l'anagrafica di chi si allena e di chi
    amministra un'organizzazione la tiene l'amministrazione, non
    l'interessato, così il nome che compare nei report e nelle revisioni
    resta quello che l'organizzazione ha registrato. Gli altri ruoli
    vedono i campi in sola lettura e passano da /api/admin/users/{id},
    come già succede per l'email e per il ruolo.
    """
    if request.nome is not None:
        current_user.nome = clean_name_or_400(request.nome, "nome")
    if request.cognome is not None:
        current_user.cognome = clean_name_or_400(request.cognome, "cognome")

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.post("/change-password", response_model=MessageResponse)
def change_my_password(
    request: ChangePasswordRequest,
    http_request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change the authenticated user's own password (self-service, every
    role). Cognito verifies request.current_password server-side before
    accepting the new one — a stolen session cookie alone isn't enough to
    take over the account.

    E con la password vecchia cade tutto quello che quella password aveva
    aperto. Chi cambia la password quasi sempre lo fa perché teme che
    qualcun altro la conoscesse, e una password nuova che lasciava in piedi
    le sessioni già aperte non rispondeva a quel timore: il cookie rubato
    restava buono per un'altra ora, e il refresh token per un altro mese.
    Ora ne cadono due metà insieme, quella su Cognito (``global_sign_out``,
    che smette di rinnovare) e quella locale (la denylist, che ferma subito
    gli access token già emessi).

    Cadono **tutte**, questa compresa: Cognito non sa revocare "tutte tranne
    una". Chi ha appena dimostrato di conoscere entrambe le password però
    non deve rifare il login per questo, quindi la sessione da cui arriva la
    richiesta viene riaperta qui, con la password nuova, e al browser
    arrivano cookie nuovi al posto di quelli appena invalidati.
    """
    if current_user.cognito_sub == MOCK_ADMIN_SUB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non è possibile cambiare la password dell'account di sistema.",
        )

    utente = str(current_user.id)
    _too_many(_change_password_limiter, utente, "Troppi tentativi di cambio password.")

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
        # La password attuale sbagliata si conta: chi ha in mano un cookie
        # rubato e non la password la proverebbe da qui.
        _change_password_limiter.record(utente)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    _change_password_limiter.reset(utente)

    chiuse = revoke_user_sessions(db, current_user.id)
    try:
        global_sign_out(access_token)
    except RuntimeError as e:
        # Best effort come le altre revoche su Cognito: la denylist locale
        # ha già fermato gli access token, quello che resta in piedi è la
        # possibilità di rinnovare, e vale una riga nel log.
        logger.error("Cambio password: chiusura delle sessioni su Cognito fallita: %s", e)
    audit.describe(http_request, sessioni_chiuse=chiuse)

    try:
        rientro = authenticate(current_user.email, request.new_password)
        nuovo_access = rientro["access_token"]
    except (RuntimeError, KeyError) as e:
        logger.error("Cambio password: rientro automatico non riuscito: %s", e)
        _clear_auth_cookies(response)
        return MessageResponse(
            message="Password aggiornata. Effettua nuovamente l'accesso.", success=True
        )

    _bind_fresh_token(db, nuovo_access, http_request, current_user.id)
    _set_access_cookie(response, nuovo_access)
    _set_refresh_cookie(response, rientro["refresh_token"])
    return MessageResponse(message="Password aggiornata con successo.", success=True)
