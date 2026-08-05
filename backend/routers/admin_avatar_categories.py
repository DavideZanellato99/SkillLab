"""Anagrafica delle categorie di avatar (solo super admin).

Le categorie appartengono a un'organizzazione, come gli avatar che
raggruppano: due tenant possono averne una che si chiama allo stesso modo
senza che sia la stessa, e nessuno vede quelle di un altro.

Qui la cancellazione è vera, non logica come per gli avatar: una categoria
non è la traccia di niente, non porta con sé conversazioni né valutazioni.
Proprio per questo si può togliere solo quando non la usa nessuno, archiviati
compresi: un avatar senza categoria non può esistere, e sceglierne una al
posto dell'amministratore vorrebbe dire spostargli il gruppo di nascosto.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import audit
from auth_dependency import get_current_super_admin
from database import get_db
from models import Avatar, AvatarCategory, Organization, User
from schemas import (
    AdminAvatarCategoryPayload,
    AdminAvatarCategoryResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/admin/avatar-categories", tags=["admin"])


def _avatar_counts(db: Session) -> dict[UUID, int]:
    """Quanti avatar usano ciascuna categoria, archiviati compresi."""
    return dict(
        db.query(Avatar.category_id, func.count(Avatar.id)).group_by(Avatar.category_id).all()
    )


def _to_response(category: AvatarCategory, avatar_count: int = 0) -> AdminAvatarCategoryResponse:
    return AdminAvatarCategoryResponse(
        id=category.id,
        name=category.name,
        color=category.color,
        organization_id=category.organization_id,
        organization_name=category.organization.name,
        avatar_count=avatar_count,
        created_at=category.created_at,
        created_by_email=category.created_by_email,
        updated_at=category.updated_at,
        updated_by_email=category.updated_by_email,
    )


def _get_category_or_404(db: Session, category_id: UUID) -> AvatarCategory:
    category = db.query(AvatarCategory).filter(AvatarCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria non trovata.")
    return category


def _validated_name_or_400(db: Session, organization_id: UUID, name: str, exclude: UUID | None):
    """Il nome ripulito, se dentro l'organizzazione è ancora libero.

    Il controllo qui davanti esiste per dare un messaggio invece di un errore
    del database: a garantire l'unicità è comunque il vincolo sulla tabella.
    """
    clean = (name or "").strip()
    if not clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Il nome della categoria è obbligatorio.",
        )
    query = db.query(AvatarCategory).filter(
        AvatarCategory.organization_id == organization_id,
        func.lower(AvatarCategory.name) == clean.lower(),
    )
    if exclude:
        query = query.filter(AvatarCategory.id != exclude)
    if query.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"L'organizzazione ha già una categoria che si chiama '{clean}'.",
        )
    return clean


def _resolve_organization_or_400(db: Session, organization_id) -> UUID:
    if organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'organizzazione proprietaria è obbligatoria.",
        )
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organizzazione non trovata.",
        )
    return org.id


@router.get("", response_model=list[AdminAvatarCategoryResponse])
def list_categories(
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Le categorie di tutte le organizzazioni, o di una sola."""
    query = db.query(AvatarCategory)
    if organization_id:
        query = query.filter(AvatarCategory.organization_id == organization_id)
    categories = query.order_by(AvatarCategory.name.asc()).all()
    counts = _avatar_counts(db)
    return [_to_response(c, counts.get(c.id, 0)) for c in categories]


@router.post("", response_model=AdminAvatarCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: AdminAvatarCategoryPayload,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Aggiungere una categoria a un'organizzazione."""
    organization_id = _resolve_organization_or_400(db, payload.organization_id)
    name = _validated_name_or_400(db, organization_id, payload.name, exclude=None)

    category = AvatarCategory(
        organization_id=organization_id,
        name=name,
        color=payload.color,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    audit.describe(http_request, target_id=str(category.id), nome=category.name)
    return _to_response(category)


@router.put("/{category_id}", response_model=AdminAvatarCategoryResponse)
def update_category(
    category_id: UUID,
    payload: AdminAvatarCategoryPayload,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Rinominare o ricolorare una categoria.

    L'organizzazione non si tocca: spostare la categoria porterebbe con sé
    gli avatar che la usano, che è un trasloco fra tenant travestito da
    modifica anagrafica. Il campo nel payload viene ignorato di proposito.
    """
    category = _get_category_or_404(db, category_id)
    category.name = _validated_name_or_400(
        db, category.organization_id, payload.name, exclude=category.id
    )
    category.color = payload.color
    db.commit()
    db.refresh(category)
    audit.describe(http_request, nome=category.name)
    return _to_response(category, _avatar_counts(db).get(category.id, 0))


@router.delete("/{category_id}", response_model=MessageResponse)
def delete_category(
    category_id: UUID,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Eliminare una categoria che non usa nessuno.

    Se ci sono ancora avatar attaccati la richiesta viene rifiutata e non
    succede niente: prima si spostano loro, poi la categoria se ne va.
    """
    category = _get_category_or_404(db, category_id)
    audit.describe(http_request, nome=category.name)

    in_use = (
        db.query(func.count(Avatar.id)).filter(Avatar.category_id == category.id).scalar()
    ) or 0
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La categoria '{category.name}' è usata da {in_use} avatar: "
            "spostali in un'altra categoria prima di eliminarla.",
        )

    name = category.name
    db.delete(category)
    db.commit()
    return MessageResponse(message=f"Categoria '{name}' eliminata.", success=True)
