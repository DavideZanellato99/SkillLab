"""FastAPI dependency for extracting and verifying the current authenticated user."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models import User
from cognito_service import verify_access_token

# Security scheme — extracts Bearer token from Authorization header
_bearer_scheme = HTTPBearer(auto_error=True)


def get_or_create_mock_admin(db: Session) -> User:
    """Ensure the mock admin user exists in the local database and return it."""
    user = db.query(User).filter(User.cognito_sub == "mock-admin-sub-0000-0000-0000").first()
    if not user:
        user = db.query(User).filter(User.email == "admin").first()
    if not user:
        user = User(
            cognito_sub="mock-admin-sub-0000-0000-0000",
            email="admin",
            nome="Admin",
            cognome="Mock",
            ruolo="admin",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency that:
    1. Extracts the Bearer token from the Authorization header
    2. Verifies the JWT with Cognito's JWKS
    3. Looks up the user in the DB by cognito_sub
    4. Returns the User object or raises 401
    """
    token = credentials.credentials

    # Verify the token with Cognito
    try:
        claims = verify_access_token(token)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    cognito_sub = claims.get("sub")
    if not cognito_sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token non contiene un identificativo utente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if cognito_sub == "mock-admin-sub-0000-0000-0000":
        return get_or_create_mock_admin(db)

    # Look up user in DB
    user = db.query(User).filter(User.cognito_sub == cognito_sub).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utente non trovato nel sistema.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    FastAPI dependency that ensures the current user has the 'admin' role.
    Returns the User object or raises 403 Forbidden.
    """
    if current_user.ruolo != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso riservato agli amministratori.",
        )
    return current_user

