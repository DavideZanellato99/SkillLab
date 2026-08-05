"""Admin CRUD endpoints for avatars / training personas (super admin only).

Every avatar IS a training persona: the payload always carries the full
persona sheet (profile) and the avatar name is derived from its
NOME + COGNOME. The profile is only ever exposed through these endpoints —
the student-facing API strips it.

Deletion here is logical (see Avatar.deleted_at): archiving an avatar takes
it out of the students' gallery but keeps every conversation, message and
evaluation ever produced against it, and stays reversible through
``restore``.
"""

import os
import uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import audit
from auth_dependency import get_current_super_admin
from database import get_db
from models import (
    Avatar,
    AvatarCategory,
    ChatConversation,
    Organization,
    User,
)
from persona_prompt import build_persona_prompt, clean_value
from schemas import (
    AdminAvatarPayload,
    AdminAvatarResponse,
    AvatarImageResponse,
    AvatarPromptPreviewRequest,
    AvatarPromptPreviewResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/admin/avatars", tags=["admin"])

_AVATARS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "avatars"
)

# Uploaded portraits are matched by their magic bytes, not by the name or the
# content-type the browser claims: the file ends up served from /static, so
# what must be excluded is anything a browser could execute (SVG carries
# script, HTML sniffs as a page). Only these three raster formats get in, and
# the extension we store is the one the signature proves, never the one the
# upload asked for.
_IMAGE_SIGNATURES: list[tuple[bytes, str]] = [
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpg"),
    (b"RIFF", "webp"),  # confirmed below: bytes 8..12 must read "WEBP"
]

_MAX_IMAGE_BYTES = 2 * 1024 * 1024

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


def _image_extension(data: bytes) -> str | None:
    """The extension proven by the file's own signature, or None if unknown."""
    for signature, extension in _IMAGE_SIGNATURES:
        if not data.startswith(signature):
            continue
        if extension == "webp" and data[8:12] != b"WEBP":
            continue
        return extension
    return None


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


def _resolve_category_or_400(db: Session, category_id, organization_id: UUID) -> UUID:
    """Validate the avatar's category: it must exist and belong to its tenant.

    The composite foreign key already makes the mismatch impossible in the
    database (see Avatar.__table_args__); this is here so the admin gets a
    sentence instead of an integrity error, and so the check reads where the
    decision is taken.
    """
    category = db.query(AvatarCategory).filter(AvatarCategory.id == category_id).first()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Categoria non trovata.",
        )
    if category.organization_id != organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La categoria appartiene a un'altra organizzazione.",
        )
    return category.id


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


def _conversation_count(db: Session, avatar_id: UUID) -> int:
    """How many conversations were held with this avatar, archived or not."""
    return (
        db.query(func.count(ChatConversation.id))
        .filter(ChatConversation.avatar_id == avatar_id)
        .scalar()
    ) or 0


def _get_avatar_or_404(db: Session, avatar_id: UUID) -> Avatar:
    avatar = db.query(Avatar).filter(Avatar.id == avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar non trovato.")
    return avatar


def _to_response(avatar: Avatar, conversation_count: int = 0) -> AdminAvatarResponse:
    return AdminAvatarResponse(
        id=avatar.id,
        name=avatar.name,
        image_url=avatar.image_url,
        category=avatar.category_name,
        category_id=avatar.category_id,
        category_color=avatar.category_color,
        description=avatar.description,
        voice_id=avatar.voice_id,
        difficulty=avatar.difficulty,
        organization_id=avatar.organization_id,
        organization_name=avatar.organization.name,
        profile=avatar.profile or {},
        created_at=avatar.created_at,
        created_by_email=avatar.created_by_email,
        updated_at=avatar.updated_at,
        updated_by_email=avatar.updated_by_email,
        deleted_at=avatar.deleted_at,
        conversation_count=conversation_count,
    )


@router.get("", response_model=list[AdminAvatarResponse])
def list_avatars_admin(
    include_deleted: bool = False,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """List all avatars with their full persona sheet (Super Admin only).

    Archived avatars are left out unless `include_deleted` is set: the admin
    page asks for them so it can offer the archive, everything else wants
    the catalogue as the students see it.
    """
    counts = dict(
        db.query(ChatConversation.avatar_id, func.count(ChatConversation.id))
        .group_by(ChatConversation.avatar_id)
        .all()
    )
    query = db.query(Avatar)
    if not include_deleted:
        query = query.filter(Avatar.deleted_at.is_(None))
    avatars = query.order_by(Avatar.created_at.asc()).all()
    return [_to_response(a, counts.get(a.id, 0)) for a in avatars]


@router.post("", response_model=AdminAvatarResponse, status_code=status.HTTP_201_CREATED)
def create_avatar(
    payload: AdminAvatarPayload,
    http_request: Request,
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
        category_id=_resolve_category_or_400(db, payload.category_id, organization_id),
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
    audit.describe(http_request, target_id=str(avatar.id), nome=avatar.name)
    return _to_response(avatar)


@router.put("/{avatar_id}", response_model=AdminAvatarResponse)
def update_avatar(
    avatar_id: UUID,
    payload: AdminAvatarPayload,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Update an avatar/persona (Super Admin only).

    An archived avatar is read-only: its sheet is the record of what the
    students were trained against, so it is restored first and edited after.
    """
    avatar = _get_avatar_or_404(db, avatar_id)
    if avatar.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="L'avatar è archiviato: ripristinalo prima di modificarlo.",
        )

    name = _validated_name_or_400(payload.profile)
    avatar.name = name
    avatar.description = payload.description
    avatar.voice_id = (payload.voice_id or "").strip() or None
    avatar.organization_id = _resolve_avatar_org_or_400(db, payload.organization_id)
    # Dopo l'organizzazione, e con quella nuova: cambiare tenant a un avatar
    # significa dargli una categoria di quel tenant, mai tenersi la vecchia.
    avatar.category_id = _resolve_category_or_400(db, payload.category_id, avatar.organization_id)
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
    audit.describe(http_request, nome=avatar.name)

    return _to_response(avatar, _conversation_count(db, avatar.id))


@router.delete("/{avatar_id}", response_model=MessageResponse)
def delete_avatar(
    avatar_id: UUID,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Archive an avatar/persona (Super Admin only).

    The deletion is logical and destroys nothing: the avatar leaves the
    students' gallery and no new session can start on it, while its
    conversations, messages and evaluations stay exactly where they are and
    keep feeding the reports. The persona sheet survives with it, so an old
    transcript can still be re-evaluated against the character it was played
    on, and `restore` puts the avatar back in the catalogue.

    The generated placeholder image is deliberately left on disk: the past
    conversations still show the avatar's face.
    """
    avatar = _get_avatar_or_404(db, avatar_id)
    audit.describe(http_request, nome=avatar.name)
    if avatar.is_deleted:
        return MessageResponse(
            message=f"Avatar '{avatar.name}' già archiviato.",
            success=True,
        )

    avatar.deleted_at = datetime.now(UTC)
    db.commit()

    return MessageResponse(
        message=f"Avatar '{avatar.name}' archiviato. Le conversazioni e le valutazioni "
        "già svolte restano disponibili nei report.",
        success=True,
    )


@router.post("/{avatar_id}/restore", response_model=AdminAvatarResponse)
def restore_avatar(
    avatar_id: UUID,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Put an archived avatar back into the catalogue (Super Admin only).

    Idempotent: restoring an active avatar simply returns it unchanged.
    """
    avatar = _get_avatar_or_404(db, avatar_id)
    audit.describe(http_request, nome=avatar.name)
    if avatar.is_deleted:
        avatar.deleted_at = None
        db.commit()
        db.refresh(avatar)

    return _to_response(avatar, _conversation_count(db, avatar.id))


# ── What the admin form needs while it is being filled in ─────────────
# Neither of these touches an avatar row: they serve the editor, which works
# on a sheet that may not exist in the database yet.


@router.post("/image", response_model=AvatarImageResponse)
async def upload_avatar_image(
    http_request: Request,
    file: UploadFile = File(...),
    current_admin: User = Depends(get_current_super_admin),
):
    """Store a portrait and return the URL to put in the avatar's image field.

    The upload happens while the form is open, so the file is named after a
    fresh uuid rather than after an avatar that may never be saved. An
    abandoned form therefore leaves an unreferenced file behind, which is the
    price of letting the admin see the portrait before committing to it.
    """
    data = await file.read(_MAX_IMAGE_BYTES + 1)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Il file caricato è vuoto."
        )
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"L'immagine non può superare {_MAX_IMAGE_BYTES // (1024 * 1024)} MB.",
        )

    extension = _image_extension(data)
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato non supportato: carica un'immagine PNG, JPEG o WebP.",
        )

    os.makedirs(_AVATARS_DIR, exist_ok=True)
    filename = f"upload_{uuid.uuid4()}.{extension}"
    with open(os.path.join(_AVATARS_DIR, filename), "wb") as f:
        f.write(data)

    audit.describe(http_request, file=filename, bytes=len(data))
    return AvatarImageResponse(image_url=f"/static/avatars/{filename}")


@router.post("/prompt-preview", response_model=AvatarPromptPreviewResponse)
def preview_persona_prompt(
    payload: AvatarPromptPreviewRequest,
    current_admin: User = Depends(get_current_super_admin),
):
    """Render the roleplay prompt a persona sheet produces, before saving it.

    This is the sheet as the avatar will actually receive it, which is not
    the same thing as the form: empty fields and "not applicable" markers
    drop out entirely, and the channel changes the framing. `ignored_fields`
    names the keys that were written but dropped, so a value the author
    thought they had given the character does not go unnoticed.
    """
    profile = payload.profile or {}
    ignored = [
        key
        for key, value in profile.items()
        if str(value or "").strip() and not clean_value(profile, key)
    ]
    return AvatarPromptPreviewResponse(
        prompt=build_persona_prompt(profile, payload.channel),
        channel=payload.channel,
        ignored_fields=sorted(ignored),
    )
