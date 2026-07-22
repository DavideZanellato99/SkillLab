"""Avatar API endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth_dependency import get_current_user
from database import get_db
from models import ROLE_SUPER_ADMIN, Avatar, User, UserSelection
from schemas import (
    AvatarResponse,
    MessageResponse,
    SelectionCreate,
    SelectionResponse,
)

router = APIRouter(prefix="/api/avatars", tags=["avatars"])


def _visible_avatars(query, user: User):
    """Restrict an avatar query to what `user` may see.

    A plain user or an organization_admin sees the global personas
    (organization_id NULL) plus the ones owned by their own organization.
    The super admin stands above tenants and sees every avatar.
    """
    if user.ruolo == ROLE_SUPER_ADMIN:
        return query
    return query.filter(
        (Avatar.organization_id.is_(None)) | (Avatar.organization_id == user.organization_id)
    )


@router.get("", response_model=list[AvatarResponse])
def get_avatars(
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all avatars, optionally filtered by category."""
    query = _visible_avatars(db.query(Avatar), current_user)

    if category:
        query = query.filter(Avatar.category == category)

    avatars = query.order_by(Avatar.id).all()

    # Compute selection counts
    result = []
    for avatar in avatars:
        count = (
            db.query(func.count(UserSelection.id))
            .filter(UserSelection.avatar_id == avatar.id)
            .scalar()
        )
        avatar_data = AvatarResponse(
            id=avatar.id,
            name=avatar.name,
            image_url=avatar.image_url,
            category=avatar.category,
            description=avatar.description,
            created_at=avatar.created_at,
            selection_count=count or 0,
            difficulty=avatar.difficulty,
        )
        result.append(avatar_data)

    return result


@router.get("/categories", response_model=list[str])
def get_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all distinct avatar categories."""
    query = _visible_avatars(db.query(Avatar.category), current_user)
    categories = query.distinct().order_by(Avatar.category).all()
    return [c[0] for c in categories]


@router.get("/{avatar_id}", response_model=AvatarResponse)
def get_avatar(
    avatar_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific avatar by ID."""
    avatar = _visible_avatars(db.query(Avatar), current_user).filter(Avatar.id == avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar non trovato.")

    count = (
        db.query(func.count(UserSelection.id)).filter(UserSelection.avatar_id == avatar.id).scalar()
    )

    return AvatarResponse(
        id=avatar.id,
        name=avatar.name,
        image_url=avatar.image_url,
        category=avatar.category,
        description=avatar.description,
        created_at=avatar.created_at,
        selection_count=count or 0,
        difficulty=avatar.difficulty,
    )


@router.post("/select", response_model=MessageResponse)
def select_avatar(
    selection: SelectionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a user's avatar selection."""
    # Check that the avatar exists and is visible to this user (a user must
    # not select a persona owned by another organization)
    avatar = (
        _visible_avatars(db.query(Avatar), current_user)
        .filter(Avatar.id == selection.avatar_id)
        .first()
    )
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar non trovato.")

    # Create selection record linked to the user
    db_selection = UserSelection(avatar_id=selection.avatar_id, user_id=current_user.id)
    db.add(db_selection)
    db.commit()

    return MessageResponse(
        message=f"Avatar '{avatar.name}' selezionato con successo!",
        success=True,
    )


@router.get("/selections/all", response_model=list[SelectionResponse])
def get_selections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all avatar selections."""
    selections = db.query(UserSelection).order_by(UserSelection.selected_at.desc()).limit(50).all()

    result = []
    for sel in selections:
        avatar = db.query(Avatar).filter(Avatar.id == sel.avatar_id).first()
        count = (
            db.query(func.count(UserSelection.id))
            .filter(UserSelection.avatar_id == avatar.id)
            .scalar()
        )
        result.append(
            SelectionResponse(
                id=sel.id,
                avatar_id=sel.avatar_id,
                selected_at=sel.selected_at,
                avatar=AvatarResponse(
                    id=avatar.id,
                    name=avatar.name,
                    image_url=avatar.image_url,
                    category=avatar.category,
                    description=avatar.description,
                    created_at=avatar.created_at,
                    selection_count=count or 0,
                    difficulty=avatar.difficulty,
                ),
            )
        )

    return result
