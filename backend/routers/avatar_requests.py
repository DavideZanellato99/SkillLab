"""Le richieste di avatar: un organization admin chiede, il super admin evade.

Gli avatar li crea solo il super admin, ma è l'organizzazione a sapere di
quale cliente ha bisogno per allenare i suoi. Qui passa quella domanda: chi
amministra un tenant manda i pochi campi da cui una scheda nasce, il super
admin la trova in attesa e la chiude in uno dei due modi, compilando la
scheda intera (che è ``POST /api/admin/avatars`` con `request_id`, vedi
``routers/admin_avatars``) oppure rifiutandola con un motivo.

Le due metà leggono lo stesso elenco con lo stesso filtro di sempre
(``resolve_admin_scope``): l'organization admin vede le richieste del suo
tenant, il super admin tutte. Non c'è un secondo posto in cui quella
decisione venga presa.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload

import audit
from auth_dependency import (
    get_current_admin,
    get_current_organization_admin,
    get_current_super_admin,
    resolve_admin_scope,
)
from database import get_db
from models import (
    ALL_AVATAR_REQUEST_STATUSES,
    AVATAR_REQUEST_PUBLISHED,
    AVATAR_REQUEST_REJECTED,
    AvatarRequest,
    User,
)
from schemas import (
    AvatarRequestPayload,
    AvatarRequestRejectPayload,
    AvatarRequestResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/avatar-requests", tags=["avatar-requests"])


def _now() -> datetime:
    """Naive UTC, la convenzione di ogni colonna datetime dello schema."""
    return datetime.now(UTC).replace(tzinfo=None)


def to_response(request: AvatarRequest) -> AvatarRequestResponse:
    return AvatarRequestResponse(
        id=request.id,
        organization_id=request.organization_id,
        organization_name=request.organization.name,
        category=request.category,
        first_name=request.first_name,
        last_name=request.last_name,
        scenario_type=request.scenario_type,
        problem=request.problem,
        status=request.status,
        avatar_id=request.avatar_id,
        rejection_reason=request.rejection_reason,
        resolved_at=request.resolved_at,
        created_at=request.created_at,
        created_by_email=request.created_by_email,
        updated_at=request.updated_at,
        updated_by_email=request.updated_by_email,
    )


def _get_request_or_404(db: Session, request_id: UUID, organization_id=None) -> AvatarRequest:
    """La richiesta, dentro il tenant di chi chiede.

    404 e non 403 quando sta in un altro tenant: chi non può leggerla non ha
    nemmeno diritto di sapere che esiste (vedi docs/organizzazioni-e-ruoli).
    """
    query = db.query(AvatarRequest).filter(AvatarRequest.id == request_id)
    if organization_id is not None:
        query = query.filter(AvatarRequest.organization_id == organization_id)
    request = query.first()
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Richiesta non trovata.")
    return request


def ensure_pending(request: AvatarRequest) -> None:
    """Una richiesta si chiude una volta sola.

    409 e non 400: la richiesta esiste ed è ben formata, è il suo stato a
    non ammettere più quella mossa.
    """
    if not request.is_pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La richiesta è già stata evasa.",
        )


@router.get("", response_model=list[AvatarRequestResponse])
def list_requests(
    # `status` nella query string; qui si chiama altrimenti perché `status`
    # è il modulo dei codici HTTP importato sopra.
    status_filter: str | None = Query(None, alias="status"),
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Le richieste che chi chiede può vedere, dalla più recente.

    Il super admin le vede tutte e può restringere per stato e per tenant;
    un organization admin vede quelle della propria organizzazione, e il
    parametro `organization_id` gli viene ignorato come in ogni altra rotta
    di amministrazione.
    """
    if status_filter is not None and status_filter not in ALL_AVATAR_REQUEST_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stato non valido. Valori ammessi: {', '.join(ALL_AVATAR_REQUEST_STATUSES)}.",
        )
    query = db.query(AvatarRequest).options(joinedload(AvatarRequest.organization))
    scope = resolve_admin_scope(current_admin, organization_id)
    if scope is not None:
        query = query.filter(AvatarRequest.organization_id == scope)
    if status_filter is not None:
        query = query.filter(AvatarRequest.status == status_filter)
    rows = query.order_by(AvatarRequest.created_at.desc(), AvatarRequest.id.desc()).all()
    return [to_response(r) for r in rows]


@router.post("", response_model=AvatarRequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: AvatarRequestPayload,
    http_request: Request,
    current_admin: User = Depends(get_current_organization_admin),
    db: Session = Depends(get_db),
):
    """Chiedere un avatar per la propria organizzazione.

    La categoria è un nome e basta, non viene cercata nell'anagrafica: chi
    chiede può volere un gruppo che la sua galleria non ha ancora, e a
    crearlo, o a riconoscerlo fra quelli che esistono, è il super admin
    quando compila la scheda.
    """
    request = AvatarRequest(
        organization_id=current_admin.organization_id,
        category=payload.category,
        first_name=payload.first_name,
        last_name=payload.last_name,
        scenario_type=payload.scenario_type,
        problem=payload.problem,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    audit.describe(http_request, target_id=str(request.id), nome=request.name)
    return to_response(request)


@router.post("/{request_id}/reject", response_model=AvatarRequestResponse)
def reject_request(
    request_id: UUID,
    payload: AvatarRequestRejectPayload,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Rifiutare una richiesta, con un motivo che chi l'ha mandata leggerà.

    La pubblicazione non passa di qui: è il salvataggio della scheda intera
    (``POST /api/admin/avatars`` con `request_id`), perché un avatar nasce
    solo da una scheda che qualcuno ha compilato, non da un bottone.
    """
    request = _get_request_or_404(db, request_id)
    ensure_pending(request)
    request.status = AVATAR_REQUEST_REJECTED
    request.rejection_reason = payload.reason
    request.resolved_at = _now()
    db.commit()
    db.refresh(request)
    audit.describe(http_request, nome=request.name)
    return to_response(request)


@router.delete("/{request_id}", response_model=MessageResponse)
def delete_request(
    request_id: UUID,
    http_request: Request,
    current_admin: User = Depends(get_current_organization_admin),
    db: Session = Depends(get_db),
):
    """Ritirare una richiesta in attesa, o togliere di mezzo una rifiutata.

    Una richiesta pubblicata non si cancella: l'avatar che ne è nato è in
    galleria e la riga è la traccia di come ci è arrivato.
    """
    request = _get_request_or_404(db, request_id, current_admin.organization_id)
    if request.status == AVATAR_REQUEST_PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La richiesta è stata pubblicata: l'avatar è già in galleria.",
        )
    audit.describe(http_request, nome=request.name, stato=request.status)
    name = request.name
    db.delete(request)
    db.commit()
    return MessageResponse(message=f"Richiesta per {name} rimossa.", success=True)
