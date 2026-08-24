"""Organization (tenant) management endpoints — super admin only.

The super admin is the single actor that stands above every tenant: it
creates organizations, suspends or reactivates them, and can hard-delete
one together with all of its users (on Cognito too), their conversations
and its private avatars. Suspending an organization locks out all its
users at the next login and on their next request (see
account_status.access_denied_reason); deleting one is irreversible.
"""

import contextlib
import os
import re
import unicodedata
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

import audit
from auth_dependency import MOCK_ADMIN_SUB, get_current_super_admin
from cognito_service import admin_delete_user
from database import get_db
from erasure import erase_conversations, erase_users
from models import (
    ALL_ORG_STATUSES,
    DEFAULT_AVATAR_CATEGORY_NAME,
    ORG_STATUS_SUSPENDED,
    Avatar,
    AvatarCategory,
    ChatConversation,
    ConversationEvaluation,
    Organization,
    TechnicalSimulation,
    User,
)
from schemas import (
    CreateOrganizationRequest,
    MessageResponse,
    OrganizationDetailResponse,
    OrganizationResponse,
    UpdateOrganizationRequest,
    UpdateOrganizationStatusRequest,
)

router = APIRouter(prefix="/api/admin/organizations", tags=["admin"])

# Window the "is this tenant being used?" counter looks at. A lifetime
# total cannot answer that question: an organization that trained hard for
# a month and then stopped looks identical to one still working every day.
_ACTIVITY_WINDOW_DAYS = 30

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


def _name_taken(db: Session, name: str, exclude_id: UUID | None = None) -> bool:
    """True if another organization already carries this name.

    Case-insensitive on purpose: "Acme" and "acme" are the same tenant to
    everyone reading the admin tables, and only the slug would tell them
    apart (with a numeric suffix nobody asked for).
    """
    q = db.query(Organization.id).filter(func.lower(Organization.name) == name.lower())
    if exclude_id is not None:
        q = q.filter(Organization.id != exclude_id)
    return q.first() is not None


def _response(org: Organization, user_count: int, avatar_count: int) -> OrganizationResponse:
    return OrganizationResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        status=org.status,
        suspension_reason=org.suspension_reason,
        created_at=org.created_at,
        created_by_email=org.created_by_email,
        updated_at=org.updated_at,
        updated_by_email=org.updated_by_email,
        user_count=user_count,
        avatar_count=avatar_count,
    )


def _to_response(db: Session, org: Organization) -> OrganizationResponse:
    """One organization with its counters, for the endpoints that touch a
    single tenant. The list has its own path: see list_organizations."""
    user_count = db.query(func.count(User.id)).filter(User.organization_id == org.id).scalar()
    # Active avatars only, like the list endpoint: see list_organizations.
    avatar_count = (
        db.query(func.count(Avatar.id))
        .filter(Avatar.organization_id == org.id, Avatar.deleted_at.is_(None))
        .scalar()
    )
    return _response(org, user_count or 0, avatar_count or 0)


@router.get("", response_model=list[OrganizationResponse])
def list_organizations(
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """List every organization with its user and avatar counts (Super Admin).

    The two counters come from one aggregate each, not from a pair of
    counts per row: this endpoint also feeds the organization dropdown of
    every admin page, so a per-row count would turn each of those screens
    into 2N+1 round trips to the database for a list of names.
    """
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()
    users_by_org = dict(
        db.query(User.organization_id, func.count(User.id)).group_by(User.organization_id).all()
    )
    # Archived avatars are out of the catalogue, so they are out of the count
    # too: the figure answers "how many personas can this tenant train on".
    avatars_by_org = dict(
        db.query(Avatar.organization_id, func.count(Avatar.id))
        .filter(Avatar.deleted_at.is_(None))
        .group_by(Avatar.organization_id)
        .all()
    )
    return [_response(o, users_by_org.get(o.id, 0), avatars_by_org.get(o.id, 0)) for o in orgs]


@router.get("/{organization_id}", response_model=OrganizationDetailResponse)
def get_organization(
    organization_id: UUID,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """One organization with how much its users actually train (Super Admin).

    Read when the detail view opens: the figures below cost a scan of the
    tenant's conversations, which the list (and the dropdowns it feeds)
    has no use for.
    """
    org = _get_org_or_404(db, organization_id)
    base = _to_response(db, org)

    # Every counter is scoped to the tenant's members through this one
    # subquery, so no other organization's conversations can leak into the
    # figures.
    members = db.query(User.id).filter(User.organization_id == org.id).scalar_subquery()
    since = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=_ACTIVITY_WINDOW_DAYS)

    conversations_total, conversations_recent = (
        db.query(
            func.count(ChatConversation.id),
            func.count(case((ChatConversation.created_at >= since, 1))),
        )
        .filter(ChatConversation.user_id.in_(members))
        .one()
    )
    average_score, evaluated_count = (
        db.query(
            func.avg(ConversationEvaluation.overall_score),
            func.count(ConversationEvaluation.conversation_id),
        )
        .join(ChatConversation, ChatConversation.id == ConversationEvaluation.conversation_id)
        .filter(ChatConversation.user_id.in_(members))
        .one()
    )
    last_login_at = (
        db.query(func.max(User.last_login_at)).filter(User.organization_id == org.id).scalar()
    )

    return OrganizationDetailResponse(
        **base.model_dump(),
        conversations_total=conversations_total or 0,
        conversations_last_30_days=conversations_recent or 0,
        average_score=round(float(average_score), 1) if average_score is not None else None,
        evaluated_count=evaluated_count or 0,
        last_login_at=last_login_at,
    )


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    request: CreateOrganizationRequest,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Create a new organization (Super Admin only)."""
    name = request.name.strip()
    if _name_taken(db, name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esiste già un'organizzazione con questo nome.",
        )

    slug = _unique_slug(db, request.slug or name)
    org = Organization(name=name, slug=slug)
    db.add(org)
    db.flush()
    # Un'organizzazione nasce con una categoria di avatar, altrimenti il suo
    # primo avatar non si potrebbe creare: la categoria è obbligatoria e non
    # ce ne sarebbe nessuna da scegliere. Resta rinominabile come le altre.
    db.add(AvatarCategory(organization_id=org.id, name=DEFAULT_AVATAR_CATEGORY_NAME))
    db.commit()
    db.refresh(org)
    audit.describe(http_request, target_id=str(org.id), nome=org.name)
    return _to_response(db, org)


@router.put("/{organization_id}", response_model=OrganizationResponse)
def update_organization(
    organization_id: UUID,
    request: UpdateOrganizationRequest,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Rename an organization and/or change its slug (Super Admin only)."""
    org = _get_org_or_404(db, organization_id)

    # What the audit row carries beyond the current name. The path only
    # says WHICH organization was touched: without this the trail could not
    # tell what a tenant used to be called before the rename.
    changes: dict[str, str] = {}

    if request.name is not None:
        name = request.name.strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Il nome dell'organizzazione non può essere vuoto.",
            )
        if _name_taken(db, name, exclude_id=org.id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esiste già un'organizzazione con questo nome.",
            )
        if name != org.name:
            changes["nome_da"] = org.name
        org.name = name

    if request.slug is not None and request.slug.strip():
        new_slug = _unique_slug(db, request.slug, exclude_id=org.id)
        if new_slug != org.slug:
            changes["slug_da"] = org.slug
            changes["slug_a"] = new_slug
        org.slug = new_slug

    db.commit()
    db.refresh(org)
    audit.describe(http_request, nome=org.name, **changes)
    return _to_response(db, org)


@router.put("/{organization_id}/status", response_model=OrganizationResponse)
def set_organization_status(
    organization_id: UUID,
    request: UpdateOrganizationStatusRequest,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Suspend or reactivate an organization (Super Admin only). Suspending it
    blocks every one of its users on their next login and on their next
    request, killing the sessions already open; reactivating restores
    access.

    The optional `reason` is stored with the suspension and shown to the
    locked-out users themselves, so they read why instead of a generic
    wall. Reactivating clears it: it describes a suspension that is over.
    """
    org = _get_org_or_404(db, organization_id)
    if request.status not in ALL_ORG_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lo stato deve essere uno tra: {', '.join(ALL_ORG_STATUSES)}.",
        )
    reason = (request.reason or "").strip() or None
    # Cutting off a whole tenant is the kind of action the trail has to
    # name: "stato modificato" without the direction would be unreadable.
    audit.describe(http_request, nome=org.name, da=org.status, a=request.status)
    if request.status == ORG_STATUS_SUSPENDED and reason:
        audit.describe(http_request, motivo=reason)

    org.status = request.status
    org.suspension_reason = reason if request.status == ORG_STATUS_SUSPENDED else None
    db.commit()
    db.refresh(org)
    return _to_response(db, org)


@router.delete("/{organization_id}", response_model=MessageResponse)
def delete_organization(
    organization_id: UUID,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Hard-delete an organization with ALL of its data (Super Admin only):
    every user (removed from Cognito too), their conversations, messages,
    evaluations and recordings, plus the organization's avatars and the
    conversations held against them. Irreversible.
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

    # Deleting a tenant takes its users with it, so their own audit rows
    # lose the FK: the count keeps the scale of the operation on record.
    audit.describe(http_request, nome=org.name, utenti_eliminati=len(users))

    user_ids = [u.id for u in users]
    # Archived avatars go too: this is the one place where an avatar is
    # really removed from the database, and it is only because the tenant
    # that owned it, its users and their whole history are going with it.
    avatar_ids = [
        row[0] for row in db.query(Avatar.id).filter(Avatar.organization_id == org.id).all()
    ]

    # Remove the users from Cognito first: if any fails the local data is
    # still intact and the delete can be retried (a user already gone is
    # not an error for admin_delete_user, so the retry resumes cleanly).
    for already_removed, u in enumerate(users):
        try:
            admin_delete_user(u.email)
        except RuntimeError as e:
            # The tenant is now half removed on the identity provider and
            # whole in the database: those accounts can no longer log in
            # while their rows are still there. The trail has to say how
            # far the operation got, nothing else will remember.
            audit.describe(
                http_request,
                cognito_eliminati=already_removed,
                cognito_totali=len(users),
                cognito_errore_su=u.email,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    f"Eliminazione interrotta ({e}): {already_removed} utenti su "
                    f"{len(users)} sono già stati rimossi da Cognito e non possono "
                    "più accedere, mentre i dati locali sono intatti. Riprova per "
                    "completare l'operazione."
                ),
            )

    # Conversations held against the org's avatars by someone outside it
    # (defensive: an avatar is only visible in its own tenant). The users'
    # own conversations are not listed here, erase_users takes those.
    if avatar_ids:
        erase_conversations(
            db,
            [
                row[0]
                for row in db.query(ChatConversation.id)
                .filter(ChatConversation.avatar_id.in_(avatar_ids))
                .all()
            ],
        )

    # The users with everything about them: conversations, sessions and
    # goals (see `erasure`, shared with the single-account deletion so
    # neither path can forget a table).
    erase_users(db, user_ids)

    # Le simulazioni tecniche del tenant, con i passaggi del documento, le
    # domande e i tentativi che ne restassero: erase_users si è già portata
    # via quelli dei suoi utenti, questi sono le simulazioni stesse. Riga per
    # riga e non con una DELETE massiva, così le cascate dichiarate sulle
    # relazioni si applicano anche dove il database non le ha.
    for simulation in (
        db.query(TechnicalSimulation).filter(TechnicalSimulation.organization_id == org.id).all()
    ):
        db.delete(simulation)

    # Then the private avatars and the organization itself. The categories
    # go after the avatars that point at them, never before: they exist only
    # inside this tenant, so nothing outside it is left without a group.
    if avatar_ids:
        db.query(Avatar).filter(Avatar.id.in_(avatar_ids)).delete(synchronize_session=False)
    db.query(AvatarCategory).filter(AvatarCategory.organization_id == org.id).delete(
        synchronize_session=False
    )
    name = org.name
    db.delete(org)
    db.commit()

    # Best-effort cleanup of the private avatars' generated placeholder files
    for aid in avatar_ids:
        with contextlib.suppress(OSError):
            os.remove(os.path.join(_AVATARS_DIR, f"avatar_{aid}.svg"))

    return MessageResponse(
        message=f"Organizzazione '{name}' eliminata con tutti i suoi dati.",
        success=True,
    )
