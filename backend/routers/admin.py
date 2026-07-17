"""Admin API endpoints for managing users (super admin only)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserSelection, ChatConversation, ChatMessage, ALL_ROLES, ROLE_SUPER_ADMIN
from auth_dependency import get_current_super_admin, get_role_by_name, MOCK_ADMIN_SUB
from cognito_service import admin_create_user, admin_delete_user
from schemas import (
    CreateUserRequest,
    UpdateUserRequest,
    UserResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _get_user_or_404(db: Session, user_id: UUID) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utente non trovato.")
    return user


def _resolve_role_or_400(db: Session, ruolo: str):
    if ruolo not in ALL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Il ruolo deve essere uno tra: {', '.join(ALL_ROLES)}.",
        )
    role = get_role_by_name(db, ruolo)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ruolo '{ruolo}' non presente nel database.",
        )
    return role


@router.get("/users", response_model=list[UserResponse])
def list_users(
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """List all registered users in the database (Super Admin only)."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [UserResponse.model_validate(u) for u in users]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    request: CreateUserRequest,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Create a new user both in AWS Cognito and in the local database (Super Admin only).
    Cognito sends a temporary password to the user's email.
    """
    # Check if email already exists locally
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utente con questa email è già registrato nel sistema locale.",
        )

    role = _resolve_role_or_400(db, request.ruolo)

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
        role_id=role.id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return UserResponse.model_validate(new_user)


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    request: UpdateUserRequest,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Update a user's profile fields and/or role (Super Admin only)."""
    user = _get_user_or_404(db, user_id)

    if request.nome is not None:
        user.nome = request.nome
    if request.cognome is not None:
        user.cognome = request.cognome

    if request.ruolo is not None and request.ruolo != user.ruolo:
        if user.id == current_admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Non puoi modificare il ruolo del tuo stesso account.",
            )
        if user.cognito_sub == MOCK_ADMIN_SUB and request.ruolo != ROLE_SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Non è possibile cambiare il ruolo dell'account di sistema.",
            )
        role = _resolve_role_or_400(db, request.ruolo)
        user.role_id = role.id

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: UUID,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Delete a user from Cognito and from the local database, together with
    their selections and conversations (Super Admin only).
    """
    user = _get_user_or_404(db, user_id)

    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non puoi eliminare il tuo stesso account.",
        )
    if user.cognito_sub == MOCK_ADMIN_SUB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non è possibile eliminare l'account di sistema.",
        )

    # Remove from Cognito first: if this fails the local data stays intact
    # and the operation can be retried (a user already missing on Cognito
    # is tolerated by admin_delete_user).
    try:
        admin_delete_user(user.email)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )

    # Local cleanup: selections, conversations (with messages), then the user
    conv_ids = [
        row[0]
        for row in db.query(ChatConversation.id).filter(ChatConversation.user_id == user.id).all()
    ]
    if conv_ids:
        db.query(ChatMessage).filter(ChatMessage.conversation_id.in_(conv_ids)).delete(
            synchronize_session=False
        )
        db.query(ChatConversation).filter(ChatConversation.id.in_(conv_ids)).delete(
            synchronize_session=False
        )
    db.query(UserSelection).filter(UserSelection.user_id == user.id).delete(
        synchronize_session=False
    )
    db.delete(user)
    db.commit()

    return MessageResponse(message=f"Utente {user.email} eliminato con successo.", success=True)
