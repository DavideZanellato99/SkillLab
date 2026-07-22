"""Organization (tenant) management endpoints — super admin only.

The super admin is the single actor that stands above every tenant: it
creates organizations, suspends or reactivates them, and can hard-delete
one together with all of its users (on Cognito too), their conversations
and its private avatars. Suspending an organization locks out all its
users on the next request (see auth_dependency); deleting one is
irreversible.
"""

import os
import re
import unicodedata
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth_dependency import MOCK_ADMIN_SUB, get_current_super_admin
from cognito_service import admin_delete_user
from database import get_db
from models import (
    ALL_ORG_STATUSES,
    Avatar,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    Organization,
    User,
    UserSelection,
)
from schemas import (
    CreateOrganizationRequest,
    MessageResponse,
    OrganizationResponse,
    UpdateOrganizationRequest,
    UpdateOrganizationStatusRequest,
)

router = APIRouter(prefix="/api/admin/organizations", tags=["admin"])

_AVATARS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "avatars"
)


def _slugify(value: str) -> str:
    """Turn a name into a url-safe slug (ascii, lowercase, dash-separated)."""
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "org"


def _unique_slug(db: Session, base: str, exclude_id: UUID | None = None) -> str:
    """Return `base`, or base-2, base-3... until it is free."""
    base = _slugify(base)
    candidate = base
    n = 1
    while True:
        q = db.query(Organization).filter(Organization.slug == candidate)
        if exclude_id is not None:
            q = q.filter(Organization.id != exclude_id)
        if not q.first():
            return candidate
        n += 1
        candidate = f"{base}-{n}"


def _get_org_or_404(db: Session, organization_id: UUID) -> Organization:
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organizzazione non trovata."
        )
    return org


def _to_response(db: Session, org: Organization) -> OrganizationResponse:
    user_count = (
        db.query(func.count(User.id)).filter(User.organization_id == org.id).scalar()
    )
    avatar_count = (
        db.query(func.count(Avatar.id)).filter(Avatar.organization_id == org.id).scalar()
    )
    return OrganizationResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        status=org.status,
        created_at=org.created_at,
        updated_at=org.updated_at,
        user_count=user_count or 0,
        avatar_count=avatar_count or 0,
    )


@router.get("", response_model=list[OrganizationResponse])
def list_organizations(
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """List every organization with its user and avatar counts (Super Admin)."""
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()
    return [_to_response(db, o) for o in orgs]


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    request: CreateOrganizationRequest,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Create a new organization (Super Admin only)."""
    name = request.name.strip()
    if db.query(Organization).filter(Organization.name == name).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esiste già un'organizzazione con questo nome.",
        )

    slug = _unique_slug(db, request.slug or name)
    org = Organization(name=name, slug=slug)
    db.add(org)
    db.commit()
    db.refresh(org)
    return _to_response(db, org)


@router.put("/{organization_id}", response_model=OrganizationResponse)
def update_organization(
    organization_id: UUID,
    request: UpdateOrganizationRequest,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Rename an organization and/or change its slug (Super Admin only)."""
    org = _get_org_or_404(db, organization_id)

    if request.name is not None:
        name = request.name.strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Il nome dell'organizzazione non può essere vuoto.",
            )
        clash = (
            db.query(Organization)
            .filter(Organization.name == name, Organization.id != org.id)
            .first()
        )
        if clash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esiste già un'organizzazione con questo nome.",
            )
        org.name = name

    if request.slug is not None and request.slug.strip():
        org.slug = _unique_slug(db, request.slug, exclude_id=org.id)

    db.commit()
    db.refresh(org)
    return _to_response(db, org)


@router.put("/{organization_id}/status", response_model=OrganizationResponse)
def set_organization_status(
    organization_id: UUID,
    request: UpdateOrganizationStatusRequest,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Suspend or reactivate an organization (Super Admin only). Suspending it
    blocks every one of its users on their next request and kills the
    sessions already open; reactivating restores access.
    """
    org = _get_org_or_404(db, organization_id)
    if request.status not in ALL_ORG_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lo stato deve essere uno tra: {', '.join(ALL_ORG_STATUSES)}.",
        )
    org.status = request.status
    db.commit()
    db.refresh(org)
    return _to_response(db, org)


@router.delete("/{organization_id}", response_model=MessageResponse)
def delete_organization(
    organization_id: UUID,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Hard-delete an organization with ALL of its data (Super Admin only):
    every user (removed from Cognito too), their conversations, messages,
    evaluations and recordings, plus the organization's private avatars and
    the conversations held against them. Global avatars (organization_id
    NULL) are shared and are never touched. Irreversible.
    """
    org = _get_org_or_404(db, organization_id)

    users = db.query(User).filter(User.organization_id == org.id).all()
    # Guard against wiping the platform owner by accident
    for u in users:
        if u.cognito_sub == MOCK_ADMIN_SUB:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="L'organizzazione contiene l'account di sistema e non può essere eliminata.",
            )

    user_ids = [u.id for u in users]
    avatar_ids = [
        row[0]
        for row in db.query(Avatar.id).filter(Avatar.organization_id == org.id).all()
    ]

    # Remove the users from Cognito first: if any fails the local data is
    # still intact and the delete can be retried.
    for u in users:
        try:
            admin_delete_user(u.email)
        except RuntimeError as e:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    # Conversations to purge: those held by the org's users AND those held
    # against the org's private avatars (in case an avatar was ever used by
    # a global user — defensive). Deleting the conversation rows cascades to
    # messages, evaluations and recordings at the DB level (ondelete=CASCADE).
    conv_filter = []
    if user_ids:
        conv_filter.append(ChatConversation.user_id.in_(user_ids))
    if avatar_ids:
        conv_filter.append(ChatConversation.avatar_id.in_(avatar_ids))
    if conv_filter:
        from sqlalchemy import or_

        conv_ids = [
            row[0]
            for row in db.query(ChatConversation.id).filter(or_(*conv_filter)).all()
        ]
        if conv_ids:
            db.query(ChatMessage).filter(
                ChatMessage.conversation_id.in_(conv_ids)
            ).delete(synchronize_session=False)
            db.query(ConversationEvaluation).filter(
                ConversationEvaluation.conversation_id.in_(conv_ids)
            ).delete(synchronize_session=False)
            db.query(ChatConversation).filter(
                ChatConversation.id.in_(conv_ids)
            ).delete(synchronize_session=False)

    # Selections referencing the org's users or private avatars
    sel_filter = []
    if user_ids:
        sel_filter.append(UserSelection.user_id.in_(user_ids))
    if avatar_ids:
        sel_filter.append(UserSelection.avatar_id.in_(avatar_ids))
    if sel_filter:
        from sqlalchemy import or_

        db.query(UserSelection).filter(or_(*sel_filter)).delete(
            synchronize_session=False
        )

    # Delete the users and the private avatars, then the organization itself
    if user_ids:
        db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
    if avatar_ids:
        db.query(Avatar).filter(Avatar.id.in_(avatar_ids)).delete(
            synchronize_session=False
        )
    name = org.name
    db.delete(org)
    db.commit()

    # Best-effort cleanup of the private avatars' generated placeholder files
    for aid in avatar_ids:
        try:
            os.remove(os.path.join(_AVATARS_DIR, f"avatar_{aid}.svg"))
        except OSError:
            pass

    return MessageResponse(
        message=f"Organizzazione '{name}' eliminata con tutti i suoi dati.",
        success=True,
    )
