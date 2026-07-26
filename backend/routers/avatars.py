"""Avatar API endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

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

    A plain user or an organization_admin sees only the avatars owned by their
    own organization. The super admin stands above tenants and sees every
    avatar.
    """
    if user.ruolo == ROLE_SUPER_ADMIN:
        return query
    return query.filter(Avatar.organization_id == user.organization_id)


def _selection_counts(db: Session, avatar_ids: list[UUID]) -> dict[UUID, int]:
    """How many times each avatar was selected, in one grouped query.

    Avatars never selected are simply absent from the map (callers default
    to 0), so no N+1 COUNT per avatar.
    """
    if not avatar_ids:
        return {}
    return dict(
        db.query(UserSelection.avatar_id, func.count(UserSelection.id))
        .filter(UserSelection.avatar_id.in_(avatar_ids))
        .group_by(UserSelection.avatar_id)
        .all()
    )


def _avatar_response(avatar: Avatar, selection_count: int) -> AvatarResponse:
    """Serialize one avatar with its (already computed) selection count."""
    return AvatarResponse(
        id=avatar.id,
        name=avatar.name,
        image_url=avatar.image_url,
        category=avatar.category,
        description=avatar.description,
        created_at=avatar.created_at,
        selection_count=selection_count,
        difficulty=avatar.difficulty,
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

    counts = _selection_counts(db, [a.id for a in avatars])
    return [_avatar_response(a, counts.get(a.id, 0)) for a in avatars]


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

    return _avatar_response(avatar, count or 0)


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
    # joinedload pulls each selection's avatar in the same query instead of
    # one lookup per row, and the counts come from a single grouped query.
    selections = (
        db.query(UserSelection)
        .options(joinedload(UserSelection.avatar))
        .order_by(UserSelection.selected_at.desc())
        .limit(50)
        .all()
    )

    counts = _selection_counts(db, [sel.avatar_id for sel in selections])
    return [
        SelectionResponse(
            id=sel.id,
            avatar_id=sel.avatar_id,
            selected_at=sel.selected_at,
            avatar=_avatar_response(sel.avatar, counts.get(sel.avatar_id, 0)),
        )
        for sel in selections
    ]
