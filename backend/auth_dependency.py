"""FastAPI dependency for extracting and verifying the current authenticated user."""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from cognito_service import verify_access_token
from database import get_db
from models import (
    ALL_ROLES,
    ORG_STATUS_ACTIVE,
    ROLE_ORGANIZATION_ADMIN,
    ROLE_SUPER_ADMIN,
    USER_STATUS_ACTIVE,
    Role,
    User,
)
from token_denylist import is_jti_revoked
from token_sessions import enforce_session_binding

# Tokens travel in HttpOnly cookies (XSS mitigation: JS can never read them).
# The Authorization header is kept as a fallback for API tools/tests.
ACCESS_TOKEN_COOKIE = "skilllab_access_token"
REFRESH_TOKEN_COOKIE = "skilllab_refresh_token"

_bearer_scheme = HTTPBearer(auto_error=False)

# Cognito sub of the local mock super admin (dev account, not on Cognito)
MOCK_ADMIN_SUB = "mock-admin-sub-0000-0000-0000"


def ensure_roles(db: Session) -> dict[str, Role]:
    """Ensure all system roles exist; returns them keyed by name."""
    roles = {r.name: r for r in db.query(Role).filter(Role.name.in_(ALL_ROLES)).all()}
    missing = [name for name in ALL_ROLES if name not in roles]
    for name in missing:
        role = Role(name=name)
        db.add(role)
        roles[name] = role
    if missing:
        db.commit()
    return roles


def get_role_by_name(db: Session, name: str) -> Role | None:
    """Look up a role by its canonical name."""
    return db.query(Role).filter(Role.name == name).first()



def get_or_create_mock_admin(db: Session) -> User:
    """Ensure the mock super admin user exists in the local database and return it."""
    user = db.query(User).filter(User.cognito_sub == MOCK_ADMIN_SUB).first()
    if not user:
        user = db.query(User).filter(User.email == "admin").first()
    if not user:
        roles = ensure_roles(db)
        user = User(
            cognito_sub=MOCK_ADMIN_SUB,
            email="admin",
            nome="Admin",
            cognome="Mock",
            role_id=roles[ROLE_SUPER_ADMIN].id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency that:
    1. Extracts the access token from the HttpOnly cookie (or, as a
       fallback, from the Authorization Bearer header)
    2. Verifies the JWT with Cognito's JWKS
    3. Looks up the user in the DB by cognito_sub
    4. Returns the User object or raises 401
    """
    token = request.cookies.get(ACCESS_TOKEN_COOKIE) or (
        credentials.credentials if credentials else None
    )
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Non autenticato.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify the token with Cognito
    try:
        claims = verify_access_token(token)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Server-side logout: a signature-valid token whose jti (or origin_jti,
    # shared by the whole session) was denylisted at logout is rejected —
    # a stolen access token dies with the logout instead of living out its
    # remaining 60 minutes.
    if is_jti_revoked(db, claims.get("jti"), claims.get("origin_jti")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessione terminata. Effettua nuovamente il login.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Session binding: the token must be spent from the same IP +
    # User-Agent it was minted for. A mismatch denylists the whole
    # session and rejects the request (raises 401).
    enforce_session_binding(db, claims, request)

    cognito_sub = claims.get("sub")
    if not cognito_sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token non contiene un identificativo utente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if cognito_sub == MOCK_ADMIN_SUB:
        return get_or_create_mock_admin(db)

    # Look up user in DB
    user = db.query(User).filter(User.cognito_sub == cognito_sub).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utente non trovato nel sistema.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Suspended/disabled accounts die immediately: the check runs on every
    # request, so tokens already issued stop working the moment the admin
    # flips the status (Cognito alone would let them live until exp).
    if user.status != USER_STATUS_ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="L'account è stato sospeso o disabilitato. Contatta l'amministratore.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Suspending the whole organization locks out every one of its users the
    # same way, on every request. The super admin has no organization, so it
    # is never caught by this.
    if user.organization is not None and user.organization.status != ORG_STATUS_ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="L'organizzazione è stata sospesa. Contatta l'amministratore.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_current_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    FastAPI dependency that ensures the current user is a super_admin.
    User management endpoints are restricted to this role only.
    """
    if current_user.ruolo != ROLE_SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso riservato al Super Admin.",
        )
    return current_user


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    FastAPI dependency that ensures the current user is a super_admin or an
    organization_admin. Used for read-only admin views (activity reports).
    """
    if current_user.ruolo not in (ROLE_SUPER_ADMIN, ROLE_ORGANIZATION_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso riservato agli amministratori.",
        )
    return current_user


def resolve_admin_scope(admin: User, organization_id=None):
    """Organization an admin endpoint must be confined to, or None for "all".

    - super_admin: free to see across tenants. Returns the optional
      `organization_id` query filter as-is (None means every organization).
    - organization_admin: always locked to its own organization; any
      `organization_id` the caller tried to pass is ignored.

    Row filters throughout the admin API are derived from this single point,
    so an org admin can never read another tenant's data.
    """
    if admin.ruolo == ROLE_SUPER_ADMIN:
        return organization_id
    return admin.organization_id
