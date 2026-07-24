"""Assigned training paths.

The super admin hands a user a goal on one avatar ("reach 7 with Mario
Rossi", optionally by a deadline); the operator sees their goals on the
home page and the admins follow the completion state from the Percorsi
page. An organization admin reads only its own organization, exactly like
the other report endpoints.

Progress is derived here at read time and never stored: an assignment is
completed when an evaluated conversation of that user with that avatar,
OPENED AFTER the assignment was created, reaches the target score. Only
those conversations count, so practice from before the goal existed does
not complete it, and deleting or re-judging a conversation can never
leave a stale flag behind.
"""

from collections import defaultdict
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth_dependency import (
    get_current_admin,
    get_current_super_admin,
    get_current_user,
    resolve_admin_scope,
)
from database import get_db
from models import (
    Avatar,
    ChatConversation,
    ConversationEvaluation,
    TrainingAssignment,
    User,
)
from schemas import (
    ASSIGNMENT_STATUS_ACTIVE,
    ASSIGNMENT_STATUS_COMPLETED,
    ASSIGNMENT_STATUS_COMPLETED_LATE,
    ASSIGNMENT_STATUS_OVERDUE,
    MessageResponse,
    TrainingAssignmentCreate,
    TrainingAssignmentResponse,
)

router = APIRouter(prefix="/api/training", tags=["training"])


def _naive_utc(value: datetime | None) -> datetime | None:
    """Strip the timezone after converting to UTC.

    The DB columns are naive UTC (like everywhere else in the app), so a
    deadline posted with an offset must land in the same convention or
    every comparison against it would raise.
    """
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _evaluated_by_pair(
    db: Session, assignments: list[TrainingAssignment]
) -> dict[tuple, list[tuple[datetime, float]]]:
    """(user_id, avatar_id) -> [(conversation opened at, overall score)].

    One query for the whole page instead of one per assignment; the
    per-assignment cut (only conversations after its creation) happens in
    Python since two assignments may share the same pair.
    """
    if not assignments:
        return {}
    rows = (
        db.query(
            ChatConversation.user_id,
            ChatConversation.avatar_id,
            ChatConversation.created_at,
            ConversationEvaluation.overall_score,
        )
        .join(
            ConversationEvaluation,
            ConversationEvaluation.conversation_id == ChatConversation.id,
        )
        .filter(
            ChatConversation.user_id.in_({a.user_id for a in assignments}),
            ChatConversation.avatar_id.in_({a.avatar_id for a in assignments}),
        )
        .all()
    )
    by_pair: dict[tuple, list[tuple[datetime, float]]] = defaultdict(list)
    for user_id, avatar_id, opened_at, score in rows:
        by_pair[(user_id, avatar_id)].append((opened_at, score))
    return by_pair


def _assignment_response(
    assignment: TrainingAssignment,
    evaluated: list[tuple[datetime, float]],
) -> TrainingAssignmentResponse:
    """Assemble one assignment with its derived progress."""
    relevant = [(at, score) for at, score in evaluated if at >= assignment.created_at]
    best_score = max((score for _, score in relevant), default=None)
    # First moment the target was met, by when the conversation was opened
    achieved_at = min(
        (at for at, score in relevant if score >= assignment.target_score),
        default=None,
    )

    if achieved_at is not None:
        late = assignment.due_at is not None and achieved_at > assignment.due_at
        derived = ASSIGNMENT_STATUS_COMPLETED_LATE if late else ASSIGNMENT_STATUS_COMPLETED
    elif (
        assignment.due_at is not None and datetime.now(UTC).replace(tzinfo=None) > assignment.due_at
    ):
        derived = ASSIGNMENT_STATUS_OVERDUE
    else:
        derived = ASSIGNMENT_STATUS_ACTIVE

    user = assignment.user
    avatar = assignment.avatar
    return TrainingAssignmentResponse(
        id=assignment.id,
        user_id=assignment.user_id,
        user_name=f"{user.nome} {user.cognome}".strip() or user.email,
        user_email=user.email,
        organization_id=user.organization_id,
        organization_name=user.organization_name,
        avatar_id=assignment.avatar_id,
        avatar_name=avatar.name,
        avatar_category=avatar.category,
        target_score=assignment.target_score,
        due_at=assignment.due_at,
        created_at=assignment.created_at,
        status=derived,
        attempts=len(relevant),
        best_score=best_score,
        achieved_at=achieved_at,
    )


def _responses(
    db: Session, assignments: list[TrainingAssignment]
) -> list[TrainingAssignmentResponse]:
    by_pair = _evaluated_by_pair(db, assignments)
    return [_assignment_response(a, by_pair.get((a.user_id, a.avatar_id), [])) for a in assignments]


@router.get("/assignments/me", response_model=list[TrainingAssignmentResponse])
def my_assignments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The current user's goals with their progress, newest first."""
    assignments = (
        db.query(TrainingAssignment)
        .filter(TrainingAssignment.user_id == current_user.id)
        .order_by(TrainingAssignment.created_at.desc())
        .all()
    )
    return _responses(db, assignments)


@router.get("/assignments", response_model=list[TrainingAssignmentResponse])
def list_assignments(
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Every assignment in scope with its progress (admin, read-only)."""
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    query = db.query(TrainingAssignment).join(User, User.id == TrainingAssignment.user_id)
    if scope_org_id is not None:
        query = query.filter(User.organization_id == scope_org_id)
    assignments = query.order_by(TrainingAssignment.created_at.desc()).all()
    return _responses(db, assignments)


@router.post(
    "/assignments",
    response_model=list[TrainingAssignmentResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_assignments(
    payload: TrainingAssignmentCreate,
    current_super_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Assign one avatar as a goal to one or more users (super admin only).

    One row per user. Every user must belong to the avatar's organization:
    an avatar is private to its tenant, a goal on an avatar the user cannot
    even see would be impossible by construction.
    """
    avatar = db.query(Avatar).filter(Avatar.id == payload.avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar non trovato.")

    unique_ids = set(payload.user_ids)
    users = db.query(User).filter(User.id.in_(unique_ids)).all()
    if len(users) != len(unique_ids):
        raise HTTPException(status_code=404, detail="Uno o più utenti non trovati.")
    for user in users:
        if user.organization_id != avatar.organization_id:
            raise HTTPException(
                status_code=400,
                detail=f"{user.email} non appartiene all'organizzazione dell'avatar.",
            )

    assignments = [
        TrainingAssignment(
            user_id=user.id,
            avatar_id=avatar.id,
            assigned_by_id=current_super_admin.id,
            target_score=round(payload.target_score, 1),
            due_at=_naive_utc(payload.due_at),
        )
        for user in users
    ]
    db.add_all(assignments)
    db.commit()
    for assignment in assignments:
        db.refresh(assignment)
    return _responses(db, assignments)


@router.delete("/assignments/{assignment_id}", response_model=MessageResponse)
def delete_assignment(
    assignment_id: UUID,
    current_super_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Remove an assigned goal (super admin only). The conversations and
    evaluations it counted stay untouched: only the goal goes away."""
    assignment = db.query(TrainingAssignment).filter(TrainingAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Percorso non trovato.")
    db.delete(assignment)
    db.commit()
    return MessageResponse(message="Percorso eliminato.", success=True)
