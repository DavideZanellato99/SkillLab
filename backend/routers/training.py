"""Assigned training paths.

An admin hands a user a goal on one avatar ("reach 7 with Mario Rossi",
optionally by a deadline); the operator sees their goals on the home page
and the admins follow the completion state from the Percorsi page.

Both admin roles assign: an organization admin is the one who actually
teaches its students, so waiting on the super admin to hand out every goal
would put a stranger to the course in the middle of it. What confines it is
the tenant, here as everywhere else: it only ever starts from an avatar of
its own organization, and since a goal always lands on users of the
avatar's organization, its trainees can only be its own. Every read is
scoped the same way (resolve_admin_scope), so an organization admin never
sees, assigns or deletes outside its own.

Progress is derived at read time and never stored: an assignment is
completed when an evaluated conversation of that user with that avatar,
OPENED AFTER the assignment was created, reaches the target score. Only
those conversations count, so practice from before the goal existed does
not complete it, and deleting or re-judging a conversation can never
leave a stale flag behind. That derivation lives in ``training_progress``,
since the activity report counts the very same goals.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

import audit
from auth_dependency import (
    get_current_admin,
    get_current_user,
    resolve_admin_scope,
)
from database import get_db
from models import (
    ROLE_SUPER_ADMIN,
    USER_STATUS_ACTIVE,
    Avatar,
    Role,
    TrainingAssignment,
    User,
)
from routers.avatars import ensure_trainable
from schemas import (
    MessageResponse,
    TrainingAssignmentCreate,
    TrainingAssignmentResponse,
    UserResponse,
)
from training_progress import evaluated_by_pair, progress_of

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


def _assignment_response(
    assignment: TrainingAssignment,
    evaluated: list[tuple[datetime, float]],
) -> TrainingAssignmentResponse:
    """Assemble one assignment with its derived progress."""
    progress = progress_of(assignment, evaluated)
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
        avatar_category=avatar.category_name,
        avatar_category_color=avatar.category_color,
        target_score=assignment.target_score,
        due_at=assignment.due_at,
        created_at=assignment.created_at,
        status=progress.status,
        attempts=progress.attempts,
        best_score=progress.best_score,
        achieved_at=progress.achieved_at,
    )


def _responses(
    db: Session, assignments: list[TrainingAssignment]
) -> list[TrainingAssignmentResponse]:
    by_pair = evaluated_by_pair(db, assignments)
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


@router.get("/assignable-users", response_model=list[UserResponse])
def assignable_users(
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """The users an avatar of `organization_id` can be handed to as a goal.

    It lives next to create_assignments so the picker and the check that
    rejects a bad request share one definition of who is assignable, rather
    than the frontend keeping a copy of the rule that can drift from it: an
    avatar is private to its tenant, so a goal on one the user cannot even
    see would be impossible, and a suspended account could never work on
    it. The super admin is left out because it belongs to no tenant.

    An organization admin does not name the tenant: resolve_admin_scope pins
    it to its own, so an `organization_id` pointing anywhere else is ignored
    rather than obeyed. The super admin has to pass one, since "every
    organization" is not an answer to this question.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    if scope_org_id is None:
        raise HTTPException(
            status_code=400,
            detail="Specificare l'organizzazione di cui elencare gli utenti.",
        )
    users = (
        db.query(User)
        .join(Role, Role.id == User.role_id)
        .filter(
            User.organization_id == scope_org_id,
            User.status == USER_STATUS_ACTIVE,
            Role.name != ROLE_SUPER_ADMIN,
        )
        .order_by(User.cognome.asc(), User.nome.asc())
        .all()
    )
    return [UserResponse.model_validate(u) for u in users]


@router.post(
    "/assignments",
    response_model=list[TrainingAssignmentResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_assignments(
    payload: TrainingAssignmentCreate,
    http_request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Assign one avatar as a goal to one or more users.

    One row per user. Every user must belong to the avatar's organization:
    an avatar is private to its tenant, a goal on an avatar the user cannot
    even see would be impossible by construction.

    That same rule is what confines an organization admin: the avatar it
    starts from has to be one of its own (an avatar of another tenant
    answers 404, it does not exist as far as this admin is concerned), and
    the trainees then have to belong to that organization, which is its own.
    """
    scope_org_id = resolve_admin_scope(current_admin, None)
    avatar_query = db.query(Avatar).filter(Avatar.id == payload.avatar_id)
    if scope_org_id is not None:
        avatar_query = avatar_query.filter(Avatar.organization_id == scope_org_id)
    avatar = avatar_query.first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar non trovato.")
    # An archived avatar has left the students' gallery: a goal on it would
    # be one nobody could ever start.
    ensure_trainable(avatar)

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
            assigned_by_id=current_admin.id,
            target_score=round(payload.target_score, 1),
            due_at=_naive_utc(payload.due_at),
        )
        for user in users
    ]
    db.add_all(assignments)
    db.commit()
    for assignment in assignments:
        db.refresh(assignment)
    # One call assigns the same goal to several users: the audit row names
    # them all rather than losing everything but the count.
    audit.describe(
        http_request,
        avatar=avatar.name,
        target=round(payload.target_score, 1),
        utenti=[u.email for u in users],
    )
    return _responses(db, assignments)


@router.delete("/assignments/{assignment_id}", response_model=MessageResponse)
def delete_assignment(
    assignment_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Remove an assigned goal. The conversations and evaluations it counted
    stay untouched: only the goal goes away.

    An organization admin reaches only the goals of its own users: one of
    another tenant answers 404, the same nothing the list shows it.
    """
    scope_org_id = resolve_admin_scope(current_admin, None)
    query = db.query(TrainingAssignment).filter(TrainingAssignment.id == assignment_id)
    if scope_org_id is not None:
        query = query.join(User, User.id == TrainingAssignment.user_id).filter(
            User.organization_id == scope_org_id
        )
    assignment = query.first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Percorso non trovato.")
    db.delete(assignment)
    db.commit()
    return MessageResponse(message="Percorso eliminato.", success=True)
