"""Read-only API over the audit trail (super admin only).

Deliberately read-only: there is no endpoint that deletes or edits a row,
not even for the super admin. A registry its own subject can tidy up
proves nothing, so the only thing that removes rows is the retention purge
at startup (see audit.RETENTION_DAYS).

The whole router hangs off `get_current_super_admin`, so it is not scoped
with `resolve_admin_scope` like the rest of the admin API: an organization
admin gets a 403 here, including for the log of its own organization.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

import audit
from auth_dependency import get_current_super_admin
from database import get_db
from models import AuditLog, User
from schemas import AuditActionOption, AuditLogPage, AuditLogResponse

router = APIRouter(prefix="/api/admin/audit-logs", tags=["admin"])


@router.get("/actions", response_model=list[AuditActionOption])
def list_actions(current_admin: User = Depends(get_current_super_admin)):
    """The catalogue of recordable actions, alphabetical by label.

    Static: it comes from the code, not from the rows, so the filter offers
    every action even when nobody has performed it yet.
    """
    options = [
        AuditActionOption(key=key, label=label) for key, label in audit.ACTION_LABELS.items()
    ]
    return sorted(options, key=lambda o: o.label)


@router.get("", response_model=AuditLogPage)
def list_audit_logs(
    user_id: UUID | None = None,
    organization_id: UUID | None = None,
    action: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    q: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Recorded actions, most recent first, with every filter optional.

    `total` counts the rows matching the filters, not the ones returned:
    the table grows without bound, so the client always reads a window of
    it (`limit`/`offset`) and uses the count to know what is left.
    """
    query = db.query(AuditLog)

    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if organization_id is not None:
        query = query.filter(AuditLog.organization_id == organization_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if date_from is not None:
        query = query.filter(AuditLog.created_at >= _naive(date_from))
    if date_to is not None:
        query = query.filter(AuditLog.created_at <= _naive(date_to))
    if q:
        pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                AuditLog.user_email.ilike(pattern),
                AuditLog.organization_name.ilike(pattern),
                AuditLog.path.ilike(pattern),
                AuditLog.resource_id.ilike(pattern),
            )
        )

    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    return AuditLogPage(total=total, items=[_response(row) for row in rows])


def _naive(value: datetime) -> datetime:
    """Drop the offset of an ISO datetime: the column is naive UTC."""
    return value.replace(tzinfo=None) if value.tzinfo else value


def _response(row: AuditLog) -> AuditLogResponse:
    return AuditLogResponse(
        id=row.id,
        created_at=row.created_at,
        user_id=row.user_id,
        user_email=row.user_email,
        user_role=row.user_role,
        organization_id=row.organization_id,
        organization_name=row.organization_name,
        action=row.action,
        action_label=audit.action_label(row.action),
        resource_type=row.resource_type,
        resource_id=row.resource_id,
        method=row.method,
        path=row.path,
        status_code=row.status_code,
        client_ip=row.client_ip,
        user_agent=row.user_agent,
        details=row.details,
    )
