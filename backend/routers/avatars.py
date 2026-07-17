"""Avatar API endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Avatar, User, UserSelection
from auth_dependency import get_current_user
from schemas import (
    AvatarResponse,
    SelectionCreate,
    SelectionResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/avatars", tags=["avatars"])


@router.get("", response_model=list[AvatarResponse])
def get_avatars(
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all avatars, optionally filtered by category."""
    query = db.query(Avatar)

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
    categories = db.query(Avatar.category).distinct().order_by(Avatar.category).all()
    return [c[0] for c in categories]


@router.get("/{avatar_id}", response_model=AvatarResponse)
def get_avatar(
    avatar_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific avatar by ID."""
    avatar = db.query(Avatar).filter(Avatar.id == avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")

    count = (
        db.query(func.count(UserSelection.id))
        .filter(UserSelection.avatar_id == avatar.id)
        .scalar()
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
    # Check that the avatar exists
    avatar = db.query(Avatar).filter(Avatar.id == selection.avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")

    # Create selection record linked to the user
    db_selection = UserSelection(avatar_id=selection.avatar_id, user_id=current_user.id)
    db.add(db_selection)
    db.commit()

    return MessageResponse(
        message=f"Avatar '{avatar.name}' selected successfully!",
        success=True,
    )


@router.get("/selections/all", response_model=list[SelectionResponse])
def get_selections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all avatar selections."""
    selections = (
        db.query(UserSelection)
        .order_by(UserSelection.selected_at.desc())
        .limit(50)
        .all()
    )

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
