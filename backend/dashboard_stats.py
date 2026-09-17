"""I conti delle dashboard, fatti sulle righe già lette.

Sta fuori dal router che li mostra per la stessa ragione di
``training_progress``: sono regole di lettura e non risposte HTTP, e da qui
si leggono per intero senza attraversare rotte, permessi e audit. Chi legge
le righe è ``report_rows``, chi le espone è ``routers/dashboards``, e in
mezzo c'è questo: funzioni che prendono quello che è già in memoria e
restituiscono gli oggetti della risposta.

Una aggregazione, una domanda: **i percorsi**, cioè quante assegnazioni
sono chiuse, in quanti giorni, e quante sono scadute. Il progresso di ognuna
arriva già fatto da ``training_progress``, che resta l'unico posto dove si
decide se una tappa è superata.

Niente qui tocca il database e niente qui è salvato: sono numeri che si
rifanno a ogni lettura, come tutto il resto dell'applicazione.
"""

from uuid import UUID

from models import TrainingPathAssignment
from schemas import (
    ASSIGNMENT_STATUS_ACTIVE,
    ASSIGNMENT_STATUS_COMPLETED,
    ASSIGNMENT_STATUS_COMPLETED_LATE,
    ASSIGNMENT_STATUS_OVERDUE,
    PathsDashboard,
)
from training_progress import PathProgress, Proof, ProofKey, progress_of

# I due stati che dicono "chiusa", qui e in training_progress
_DONE = (ASSIGNMENT_STATUS_COMPLETED, ASSIGNMENT_STATUS_COMPLETED_LATE)


def _rate(part: int, whole: int) -> float:
    """La percentuale, arrotondata al decimo. Zero su un insieme vuoto."""
    return round(part / whole * 100, 1) if whole else 0.0


def _avg(values: list[float]) -> float | None:
    """La media, o None se non c'è niente da mediare.

    None e non zero: zero giorni si leggerebbe come "chiusi all'istante",
    mentre finché nessuno ha chiuso un percorso non c'è niente da leggere.
    """
    return round(sum(values) / len(values), 2) if values else None


def _days_to_complete(assignment: TrainingPathAssignment, progress: PathProgress) -> float | None:
    """Da quando il percorso è stato assegnato all'ultima tappa superata.

    Solo sui percorsi chiusi: su uno ancora in corso il conto sarebbe
    "quanti giorni sono passati", che è un'altra cosa e la dice già lo stato.
    """
    if progress.status not in _DONE:
        return None
    achieved = [s.achieved_at for s in progress.steps if s.achieved_at is not None]
    if not achieved:
        return None
    started = assignment.created_at
    started = started if started.tzinfo is None else started.replace(tzinfo=None)
    return max((max(achieved) - started).total_seconds() / 86400, 0.0)


def paths_dashboard(
    assignments: list[TrainingPathAssignment],
    by_key: dict[ProofKey, list[Proof]],
) -> PathsDashboard:
    """I percorsi assegnati in quattro numeri: quanti, chiusi, in quanti
    giorni, scaduti.

    Il progresso di ogni assegnazione lo dà ``training_progress``, che resta
    l'unico posto in cui si decide se una tappa è superata: qui si contano
    soltanto gli esiti che ne escono. Il dettaglio persona per persona non
    sta qui ma nella gestione percorsi, che è dove poi si interviene.
    """
    people: set[UUID] = set()
    totals = {
        ASSIGNMENT_STATUS_ACTIVE: 0,
        ASSIGNMENT_STATUS_COMPLETED: 0,
        ASSIGNMENT_STATUS_COMPLETED_LATE: 0,
        ASSIGNMENT_STATUS_OVERDUE: 0,
    }
    all_days: list[float] = []

    for assignment in assignments:
        progress = progress_of(assignment, by_key)
        people.add(assignment.user_id)
        totals[progress.status] = totals.get(progress.status, 0) + 1

        days = _days_to_complete(assignment, progress)
        if days is not None:
            all_days.append(days)

    completed_total = totals[ASSIGNMENT_STATUS_COMPLETED] + totals[ASSIGNMENT_STATUS_COMPLETED_LATE]
    return PathsDashboard(
        assignments=len(assignments),
        people=len(people),
        active=totals[ASSIGNMENT_STATUS_ACTIVE],
        completed=totals[ASSIGNMENT_STATUS_COMPLETED],
        completed_late=totals[ASSIGNMENT_STATUS_COMPLETED_LATE],
        overdue=totals[ASSIGNMENT_STATUS_OVERDUE],
        completion_rate=_rate(completed_total, len(assignments)),
        avg_days_to_complete=_avg(all_days),
    )
