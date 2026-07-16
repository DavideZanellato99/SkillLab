"""Admin API endpoints for managing users and system resources."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth_dependency import get_current_admin
from cognito_service import admin_create_user
from schemas import (
    CreateUserRequest,
    UserResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserResponse])
def list_users(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all registered users in the database (Admin only)."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [UserResponse.model_validate(u) for u in users]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    request: CreateUserRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Create a new user both in AWS Cognito and in the local database (Admin only).
    Cognito sends a temporary password to the user's email.
    """
    # Check if email already exists locally
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utente con questa email è già registrato nel sistema locale.",
        )

    # Validate role
    if request.ruolo not in ["admin", "utente"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Il ruolo deve essere 'admin' oppure 'utente'.",
        )

    # Create user in AWS Cognito
    try:
        cognito_sub = admin_create_user(request.email)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Create user in local database
    new_user = User(
        cognito_sub=cognito_sub,
        email=request.email,
        nome=request.nome,
        cognome=request.cognome,
        ruolo=request.ruolo,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return UserResponse.model_validate(new_user)
