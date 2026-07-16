"""Authentication API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth_dependency import get_current_user, get_or_create_mock_admin
from cognito_service import (
    authenticate,
    respond_to_new_password_challenge,
    refresh_tokens,
)
from schemas import (
    LoginRequest,
    LoginResponse,
    NewPasswordRequiredResponse,
    NewPasswordRequest,
    RefreshTokenRequest,
    RefreshTokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate with email and password.

    Returns either:
    - LoginResponse with tokens + user info (if auth succeeds)
    - NewPasswordRequiredResponse (if Cognito requires password change)
    """
    try:
        result = authenticate(request.email, request.password)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )

    # If Cognito requires a new password
    if result.get("challenge") == "NEW_PASSWORD_REQUIRED":
        return NewPasswordRequiredResponse(session=result["session"])

    # Successful login — find or verify user in DB
    if result.get("access_token") == "mock-admin-access-token":
        user = get_or_create_mock_admin(db)
    else:
        user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utente non trovato nel database. Contatta l'amministratore.",
        )

    return LoginResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        user=UserResponse.model_validate(user),
    )


@router.post("/new-password")
def complete_new_password(request: NewPasswordRequest, db: Session = Depends(get_db)):
    """
    Complete the NEW_PASSWORD_REQUIRED challenge.

    Called when the user logs in for the first time with a temporary password.
    """
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

    return LoginResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        user=UserResponse.model_validate(user),
    )



@router.post("/refresh", response_model=RefreshTokenResponse)
def refresh_access_token(request: RefreshTokenRequest):
    """Refresh the access token using a valid refresh token."""
    try:
        result = refresh_tokens(request.refresh_token)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )

    return RefreshTokenResponse(access_token=result["access_token"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    return UserResponse.model_validate(current_user)
