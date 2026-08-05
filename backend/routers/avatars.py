"""Avatar API endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from auth_dependency import get_current_user
from database import get_db
from models import ROLE_SUPER_ADMIN, Avatar, AvatarCategory, User, UserSelection
from schemas import (
    AvatarCategoryResponse,
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

    Tenant scoping only: archived avatars are still *visible* here on purpose,
    so a student keeps reaching the transcripts and evaluations of the
    training they already did. What archiving forbids is starting anything
    new, which is `active_avatars` / `ensure_trainable` below.
    """
    if user.ruolo == ROLE_SUPER_ADMIN:
        return query
    return query.filter(Avatar.organization_id == user.organization_id)


def active_avatars(query):
    """Restrict an avatar query to the ones that are not archived.

    Used wherever the catalogue is offered for training (the gallery, its
    category filter, the selection): an archived persona must not be
    proposed to anyone, in any tenant.
    """
    return query.filter(Avatar.deleted_at.is_(None))


def ensure_trainable(avatar: Avatar) -> None:
    """Refuse to open new training on an archived avatar.

    Conflict rather than not-found: the avatar exists and its history is
    still there to read, it just cannot be trained on any more.
    """
    if avatar.is_deleted:
        raise HTTPException(
            status_code=409,
            detail=(
                f"L'avatar '{avatar.name}' è archiviato: non è più possibile "
                "iniziare nuove sessioni con questo cliente."
            ),
        )


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
        category=avatar.category_name,
        category_id=avatar.category_id,
        category_color=avatar.category_color,
        description=avatar.description,
        created_at=avatar.created_at,
        selection_count=selection_count,
        difficulty=avatar.difficulty,
    )


@router.get("", response_model=list[AvatarResponse])
def get_avatars(
    category_id: UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all avatars, optionally filtered by category."""
    query = active_avatars(_visible_avatars(db.query(Avatar), current_user))

    if category_id:
        query = query.filter(Avatar.category_id == category_id)

    avatars = query.order_by(Avatar.id).all()

    counts = _selection_counts(db, [a.id for a in avatars])
    return [_avatar_response(a, counts.get(a.id, 0)) for a in avatars]


@router.get("/categories", response_model=list[AvatarCategoryResponse])
def get_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Le categorie dell'organizzazione di chi guarda, in ordine alfabetico.

    L'anagrafica intera e non solo le categorie che hanno un avatar: un
    gruppo appena creato e ancora vuoto deve comunque comparire nei filtri,
    altrimenti sembrerebbe non essere stato salvato. Il super admin, che non
    sta in nessun tenant, le vede tutte.
    """
    query = db.query(AvatarCategory)
    if current_user.ruolo != ROLE_SUPER_ADMIN:
        query = query.filter(AvatarCategory.organization_id == current_user.organization_id)
    return query.order_by(AvatarCategory.name.asc()).all()


@router.get("/{avatar_id}", response_model=AvatarResponse)
def get_avatar(
    avatar_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific avatar by ID.

    Archived avatars are served too: this is what the conversation screen
    reads to put a name and a face on a past session.
    """
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
    ensure_trainable(avatar)

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
