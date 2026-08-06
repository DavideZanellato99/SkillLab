"""Lo stato di un obiettivo assegnato, ricavato in lettura e mai salvato.

La regola: un obiettivo è completato quando una conversazione valutata di
quell'utente con quell'avatar, APERTA DOPO l'assegnazione, raggiunge il
punteggio richiesto. Il punteggio usato è quello finale, correzione del
docente compresa.

Sta fuori dal router che la mostra perché è una regola e non una risposta
HTTP: ``routers/training.py`` la chiama e basta, e leggendo qui si vede la
derivazione senza attraversare le rotte, i permessi e gli audit che le
stanno attorno.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from models import (
    ChatConversation,
    ConversationEvaluation,
    ConversationReview,
    TrainingAssignment,
)
from schemas import (
    ASSIGNMENT_STATUS_ACTIVE,
    ASSIGNMENT_STATUS_COMPLETED,
    ASSIGNMENT_STATUS_COMPLETED_LATE,
    ASSIGNMENT_STATUS_OVERDUE,
)


@dataclass(frozen=True)
class AssignmentProgress:
    """Quello che si sa di un obiettivo senza averlo scritto da nessuna parte."""

    status: str
    # Conversazioni valutate con quell'avatar aperte dopo l'assegnazione
    attempts: int
    best_score: float | None
    achieved_at: datetime | None


def evaluated_by_pair(
    db: Session, assignments: list[TrainingAssignment]
) -> dict[tuple, list[tuple[datetime, float]]]:
    """(user_id, avatar_id) -> [(conversazione aperta il, voto che conta)].

    Una query sola per tutta la pagina invece di una per obiettivo; il taglio
    per obiettivo (solo le conversazioni successive alla sua creazione)
    avviene in Python, perché due obiettivi possono condividere la stessa
    coppia utente e avatar.

    Il voto è quello finale, così un voto corretto dal docente è il voto
    contro cui l'obiettivo si misura: uno studente a cui è stato detto 7.5
    non deve trovarsi l'obiettivo ancora aperto perché la macchina aveva
    detto 6.
    """
    if not assignments:
        return {}
    rows = (
        db.query(
            ChatConversation.user_id,
            ChatConversation.avatar_id,
            ChatConversation.created_at,
            ConversationEvaluation.overall_score,
            ConversationReview.override_score,
        )
        .join(
            ConversationEvaluation,
            ConversationEvaluation.conversation_id == ChatConversation.id,
        )
        .outerjoin(
            ConversationReview,
            ConversationReview.conversation_id == ChatConversation.id,
        )
        .filter(
            ChatConversation.user_id.in_({a.user_id for a in assignments}),
            ChatConversation.avatar_id.in_({a.avatar_id for a in assignments}),
        )
        .all()
    )
    by_pair: dict[tuple, list[tuple[datetime, float]]] = defaultdict(list)
    for user_id, avatar_id, opened_at, ai_score, override_score in rows:
        by_pair[(user_id, avatar_id)].append(
            (opened_at, override_score if override_score is not None else ai_score)
        )
    return by_pair


def progress_of(
    assignment: TrainingAssignment,
    evaluated: list[tuple[datetime, float]],
) -> AssignmentProgress:
    """Lo stato di un obiettivo date le conversazioni valutate della sua coppia."""
    relevant = [(at, score) for at, score in evaluated if at >= assignment.created_at]
    best_score = max((score for _, score in relevant), default=None)
    # Primo momento in cui il bersaglio è stato raggiunto, per data di apertura
    achieved_at = min(
        (at for at, score in relevant if score >= assignment.target_score),
        default=None,
    )

    if achieved_at is not None:
        late = assignment.due_at is not None and achieved_at > assignment.due_at
        status = ASSIGNMENT_STATUS_COMPLETED_LATE if late else ASSIGNMENT_STATUS_COMPLETED
    elif (
        assignment.due_at is not None and datetime.now(UTC).replace(tzinfo=None) > assignment.due_at
    ):
        status = ASSIGNMENT_STATUS_OVERDUE
    else:
        status = ASSIGNMENT_STATUS_ACTIVE

    return AssignmentProgress(
        status=status,
        attempts=len(relevant),
        best_score=best_score,
        achieved_at=achieved_at,
    )
