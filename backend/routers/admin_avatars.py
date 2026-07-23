"""Admin CRUD endpoints for avatars / training personas (super admin only).

Every avatar IS a training persona: the payload always carries the full
persona sheet (profile) and the avatar name is derived from its
NOME + COGNOME. The profile is only ever exposed through these endpoints —
the student-facing API strips it.
"""

import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth_dependency import get_current_super_admin
from database import get_db
from models import (
    Avatar,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    Organization,
    User,
    UserSelection,
)
from schemas import AdminAvatarPayload, AdminAvatarResponse, MessageResponse

router = APIRouter(prefix="/api/admin/avatars", tags=["admin"])

_AVATARS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "avatars"
)

_PLACEHOLDER_PALETTES = [
    ("#7c3aed", "#06b6d4"),
    ("#dc2626", "#f97316"),
    ("#059669", "#34d399"),
    ("#0284c7", "#22d3ee"),
    ("#be185d", "#f472b6"),
    ("#b45309", "#fbbf24"),
]


def _persona_name(profile: dict) -> str:
    """Avatar display name derived from the persona sheet."""
    nome = str(profile.get("NOME", "") or "").strip()
    cognome = str(profile.get("COGNOME", "") or "").strip()
    return f"{nome} {cognome}".strip()


def _generated_image_url(avatar_id: UUID) -> str:
    return f"/static/avatars/avatar_{avatar_id}.svg"


def _generate_avatar_image(name: str, avatar_id: UUID) -> str:
    """Write an initials-on-gradient SVG placeholder; returns its public URL."""
    parts = [p for p in name.split() if p]
    initials = "".join(p[0] for p in parts[:2]).upper() or "?"
    c1, c2 = _PLACEHOLDER_PALETTES[avatar_id.int % len(_PLACEHOLDER_PALETTES)]
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">'
        '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'
        f'<stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/>'
        "</linearGradient></defs>"
        '<rect width="400" height="400" fill="url(#g)"/>'
        '<text x="200" y="210" font-family="Arial, sans-serif" font-size="140" font-weight="bold" '
        f'fill="white" fill-opacity="0.92" text-anchor="middle" dominant-baseline="middle">{initials}</text>'
        "</svg>"
    )
    os.makedirs(_AVATARS_DIR, exist_ok=True)
    filename = f"avatar_{avatar_id}.svg"
    with open(os.path.join(_AVATARS_DIR, filename), "w", encoding="utf-8") as f:
        f.write(svg)
    return _generated_image_url(avatar_id)


def _resolve_avatar_org_or_400(db: Session, organization_id) -> UUID:
    """Validate the avatar's owning tenant: it is required and the
    organization must exist."""
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


def _validated_name_or_400(profile: dict) -> str:
    if not isinstance(profile, dict) or not profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La scheda persona (profile) è obbligatoria.",
        )
    name = _persona_name(profile)
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La scheda persona deve contenere almeno NOME o COGNOME.",
        )
    return name


def _to_response(avatar: Avatar, conversation_count: int = 0) -> AdminAvatarResponse:
    return AdminAvatarResponse(
        id=avatar.id,
        name=avatar.name,
        image_url=avatar.image_url,
        category=avatar.category,
        description=avatar.description,
        voice_id=avatar.voice_id,
        difficulty=avatar.difficulty,
        organization_id=avatar.organization_id,
        organization_name=avatar.organization.name,
        profile=avatar.profile or {},
        created_at=avatar.created_at,
        conversation_count=conversation_count,
    )


@router.get("", response_model=list[AdminAvatarResponse])
def list_avatars_admin(
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """List all avatars with their full persona sheet (Super Admin only)."""
    counts = dict(
        db.query(ChatConversation.avatar_id, func.count(ChatConversation.id))
        .group_by(ChatConversation.avatar_id)
        .all()
    )
    avatars = db.query(Avatar).order_by(Avatar.created_at.asc()).all()
    return [_to_response(a, counts.get(a.id, 0)) for a in avatars]


@router.post("", response_model=AdminAvatarResponse, status_code=status.HTTP_201_CREATED)
def create_avatar(
    payload: AdminAvatarPayload,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Create a new avatar/persona (Super Admin only).

    organization_id is required: the avatar is private to that organization.
    """
    name = _validated_name_or_400(payload.profile)
    organization_id = _resolve_avatar_org_or_400(db, payload.organization_id)

    avatar = Avatar(
        name=name,
        category=(payload.category or "Clienti").strip() or "Clienti",
        description=payload.description,
        voice_id=(payload.voice_id or "").strip() or None,
        image_url=(payload.image_url or "").strip(),
        organization_id=organization_id,
        profile=payload.profile,
    )
    db.add(avatar)
    db.flush()  # assigns the id needed for the placeholder filename
    if not avatar.image_url:
        avatar.image_url = _generate_avatar_image(name, avatar.id)
    db.commit()
    db.refresh(avatar)
    return _to_response(avatar)


@router.put("/{avatar_id}", response_model=AdminAvatarResponse)
def update_avatar(
    avatar_id: UUID,
    payload: AdminAvatarPayload,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Update an avatar/persona (Super Admin only)."""
    avatar = db.query(Avatar).filter(Avatar.id == avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar non trovato.")

    name = _validated_name_or_400(payload.profile)
    avatar.name = name
    avatar.category = (payload.category or "Clienti").strip() or "Clienti"
    avatar.description = payload.description
    avatar.voice_id = (payload.voice_id or "").strip() or None
    avatar.organization_id = _resolve_avatar_org_or_400(db, payload.organization_id)
    avatar.profile = payload.profile

    # Explicit URL wins; an emptied field keeps the current image, unless
    # the avatar never had one (then a placeholder is generated).
    new_url = (payload.image_url or "").strip()
    if new_url:
        avatar.image_url = new_url
    elif not avatar.image_url:
        avatar.image_url = _generate_avatar_image(name, avatar.id)

    db.commit()
    db.refresh(avatar)

    count = (
        db.query(func.count(ChatConversation.id))
        .filter(ChatConversation.avatar_id == avatar.id)
        .scalar()
    )
    return _to_response(avatar, count or 0)


@router.delete("/{avatar_id}", response_model=MessageResponse)
def delete_avatar(
    avatar_id: UUID,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Delete an avatar/persona together with its conversations (and messages)
    and selections (Super Admin only).
    """
    avatar = db.query(Avatar).filter(Avatar.id == avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar non trovato.")

    name = avatar.name
    had_generated_image = avatar.image_url == _generated_image_url(avatar.id)

    conv_ids = [
        row[0]
        for row in db.query(ChatConversation.id)
        .filter(ChatConversation.avatar_id == avatar.id)
        .all()
    ]
    if conv_ids:
        db.query(ChatMessage).filter(ChatMessage.conversation_id.in_(conv_ids)).delete(
            synchronize_session=False
        )
        db.query(ConversationEvaluation).filter(
            ConversationEvaluation.conversation_id.in_(conv_ids)
        ).delete(synchronize_session=False)
        db.query(ChatConversation).filter(ChatConversation.id.in_(conv_ids)).delete(
            synchronize_session=False
        )
    db.query(UserSelection).filter(UserSelection.avatar_id == avatar.id).delete(
        synchronize_session=False
    )
    db.delete(avatar)
    db.commit()

    if had_generated_image:
        try:
            os.remove(os.path.join(_AVATARS_DIR, f"avatar_{avatar_id}.svg"))
        except OSError:
            pass

    return MessageResponse(message=f"Avatar '{name}' eliminato con successo.", success=True)
