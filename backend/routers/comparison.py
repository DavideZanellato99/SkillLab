"""Comparing one person's attempts at a scenario.

A student sees their own attempts and nobody else's. An admin picks someone
from their own scope and reads that person's, one person at a time: there
is deliberately no way to put two different people side by side, because
this screen exists to answer "sono migliorato?" and a ranking between
students is a different question with different consequences in a
classroom.

The tenant boundary is the usual one (resolve_admin_scope), so an
organization admin only ever opens its own students.

Scores come from ``reviews.final_score``: a corrected attempt is compared at
the grade it was actually given, or the comparison would contradict the
report card the student is holding.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import reviews
from auth_dependency import get_current_user, resolve_admin_scope
from database import get_db
from models import (
    ROLE_SUPER_ADMIN,
    Avatar,
    ChatConversation,
    ConversationEvaluation,
    ConversationReview,
    Role,
    SimulationAttempt,
    TechnicalSimulation,
    User,
)
from schemas import (
    AttemptResponse,
    ComparableUserResponse,
    EvaluationCriterionScore,
    SimulationAnswerOutcome,
    SimulationComparisonAttempt,
)

router = APIRouter(prefix="/api/comparison", tags=["comparison"])


def _is_admin(user: User) -> bool:
    from models import ROLE_ORGANIZATION_ADMIN

    return user.ruolo in (ROLE_SUPER_ADMIN, ROLE_ORGANIZATION_ADMIN)


def _subject_or_404(db: Session, current_user: User, user_id: UUID | None) -> User:
    """Whose attempts are being read, refusing anything out of reach.

    A plain user is pinned to themselves: passing somebody else's id is
    ignored rather than refused, because the answer they are entitled to is
    the same either way and a 403 would confirm that the id exists.
    """
    if not _is_admin(current_user):
        return current_user
    if user_id is None or user_id == current_user.id:
        return current_user

    scope_org_id = resolve_admin_scope(current_user)
    query = db.query(User).filter(User.id == user_id)
    if scope_org_id is not None:
        query = query.filter(User.organization_id == scope_org_id)
    subject = query.first()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utente non trovato.")
    return subject


@router.get("/users", response_model=list[ComparableUserResponse])
def comparable_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The people whose attempts the caller may open, with how many each has.

    Empty for a student: they have themselves and no picker to fill. The
    count is computed here so the list can leave out whoever has nothing
    to compare yet, and it counts both proofs: the picker sits above both
    tabs, so somebody who has only ever taken written tests has to be in it.
    """
    if not _is_admin(current_user):
        return []

    scope_org_id = resolve_admin_scope(current_user)

    def _people_with(joined_query):
        """The same person query, hung off whatever proof is being counted.

        Colonne esplicite e non l'entità User: `role` e `organization` sono
        lazy="joined", quindi selezionare l'entità porterebbe nella query le
        loro colonne, che una GROUP BY su users.id non copre.
        """
        query = joined_query.join(Role, Role.id == User.role_id).filter(
            Role.name != ROLE_SUPER_ADMIN
        )
        if scope_org_id is not None:
            query = query.filter(User.organization_id == scope_org_id)
        return query.group_by(User.id).all()

    evaluated = _people_with(
        db.query(
            User.id,
            User.nome,
            User.cognome,
            User.email,
            func.count(ConversationEvaluation.id),
        )
        .join(ChatConversation, ChatConversation.user_id == User.id)
        .join(
            ConversationEvaluation,
            ConversationEvaluation.conversation_id == ChatConversation.id,
        )
    )
    tested = _people_with(
        db.query(
            User.id,
            User.nome,
            User.cognome,
            User.email,
            func.count(SimulationAttempt.id),
        ).join(SimulationAttempt, SimulationAttempt.user_id == User.id)
    )

    people: dict[UUID, ComparableUserResponse] = {}
    for user_id, nome, cognome, email, count in [*evaluated, *tested]:
        person = people.get(user_id)
        if person is None:
            people[user_id] = ComparableUserResponse(
                id=user_id, nome=nome, cognome=cognome, email=email, attempts=count
            )
        else:
            person.attempts += count

    return sorted(people.values(), key=lambda p: (p.cognome.lower(), p.nome.lower()))


@router.get("/attempts", response_model=list[AttemptResponse])
def list_attempts(
    user_id: UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One person's evaluated conversations, oldest first.

    Oldest first because that is the order progress is read in: the picker
    puts the earliest attempt on the left and the latest on the right, which
    is the comparison people actually want to see.
    """
    subject = _subject_or_404(db, current_user, user_id)

    rows = (
        db.query(ChatConversation, ConversationEvaluation, Avatar.name, ConversationReview)
        .join(
            ConversationEvaluation,
            ConversationEvaluation.conversation_id == ChatConversation.id,
        )
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
        .outerjoin(
            ConversationReview,
            ConversationReview.conversation_id == ChatConversation.id,
        )
        .filter(ChatConversation.user_id == subject.id)
        .order_by(ChatConversation.created_at.asc())
        .all()
    )

    return [
        AttemptResponse(
            conversation_id=conversation.id,
            title=conversation.title,
            mode=conversation.mode,
            avatar_id=conversation.avatar_id,
            avatar_name=avatar_name,
            conversation_at=conversation.created_at,
            evaluated_at=evaluation.updated_at,
            ai_score=evaluation.overall_score,
            final_score=reviews.final_score(evaluation.overall_score, review),
            has_override=review is not None and review.override_score is not None,
            summary=str((evaluation.result or {}).get("summary", "")),
            reviewer_name=review.reviewer_name if review else None,
            review_note=review.summary_note if review else None,
            review_reason=review.override_reason if review else None,
            criteria=[
                EvaluationCriterionScore(
                    key=str(c.get("key", "")),
                    label=str(c.get("label", "")),
                    score=float(c.get("score", 0) or 0),
                )
                for c in ((evaluation.result or {}).get("criteria") or [])
            ],
        )
        for conversation, evaluation, avatar_name, review in rows
    ]


@router.get("/simulation-attempts", response_model=list[SimulationComparisonAttempt])
def list_simulation_attempts(
    user_id: UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One person's delivered technical tests, oldest first.

    Same rules and same order as /attempts: the picker puts the earliest on
    the left and the latest on the right, which is how progress reads.

    The answers ride along instead of waiting for a second call on the two
    that get picked: they are the only thing that makes two attempts at the
    SAME test comparable question by question, which is the whole point of
    retaking one.
    """
    subject = _subject_or_404(db, current_user, user_id)

    rows = (
        db.query(SimulationAttempt, TechnicalSimulation.title, TechnicalSimulation.kind)
        .join(TechnicalSimulation, TechnicalSimulation.id == SimulationAttempt.simulation_id)
        .filter(SimulationAttempt.user_id == subject.id)
        .order_by(SimulationAttempt.created_at.asc())
        .all()
    )

    return [
        SimulationComparisonAttempt(
            attempt_id=attempt.id,
            simulation_id=attempt.simulation_id,
            simulation_title=title,
            simulation_kind=kind,
            attempted_at=attempt.created_at,
            correct_count=attempt.correct_count,
            question_count=attempt.question_count,
            score=attempt.score,
            # La fotografia scritta alla consegna, non le domande di adesso:
            # un tentativo resta leggibile anche se il test è stato riscritto.
            answers=[
                SimulationAnswerOutcome(
                    question_id=answer["question_id"],
                    position=answer["position"],
                    text=answer["text"],
                    is_correct=answer["is_correct"],
                    # Assenti su un test a risposta aperta, dove non c'è
                    # niente da scegliere: il confronto si regge su
                    # is_correct, che i due tipi hanno entrambi
                    selected_option=answer.get("selected_option"),
                    correct_option=answer.get("correct_option"),
                )
                for answer in (attempt.answers or [])
            ],
        )
        for attempt, title, kind in rows
    ]
