"""Dove è arrivato chi sta percorrendo un percorso, ricavato in lettura.

La regola di una tappa è la stessa di prima, applicata al momento in cui la
tappa si è aperta: una tappa è superata quando una prova svolta DOPO il suo
sblocco raggiunge il punteggio richiesto. La prova è una conversazione
valutata con l'avatar della tappa, oppure un test tecnico consegnato se la
tappa è una simulazione; in entrambi i casi il voto è in decimi, e sulle
conversazioni è quello finale, correzione del docente compresa.

Quello che le tappe aggiungono è la fila. La prima si sblocca quando il
percorso viene affidato, ognuna delle altre quando quella prima di lei è
stata superata, e da lì partono sia il conteggio delle prove sia la
scadenza. Quindi:

- **una tappa bloccata non si può portare avanti**: l'allenamento fatto
  mentre era chiusa non la supera, allo stesso modo in cui l'allenamento
  fatto prima dell'assegnazione non superava un obiettivo. L'avatar e il
  test restano liberi da galleria e pagina delle simulazioni, ma il
  percorso li conta solo dal suo turno;
- **la scadenza invece non aspetta lo sblocco**: è una data a calendario
  scritta sulla tappa quando si compone il percorso (vedi
  ``TrainingPathStep.due_at``), quindi vale anche su una tappa ancora
  chiusa. Una tappa bloccata la cui data è passata è scaduta, e lo è
  davvero: chi doveva arrivarci in tempo non ci è arrivato.

Niente di tutto questo è salvato, come per il resto dell'applicazione: una
tappa che risulta sbloccata perché il giudizio della precedente è stato poi
rifatto sarebbe una porta aperta da un fatto che non è più vero.

Sta fuori dal router che la mostra perché è una regola e non una risposta
HTTP: ``routers/training.py`` la chiama e basta, e leggendo qui si vede la
derivazione senza attraversare le rotte, i permessi e gli audit che le
stanno attorno.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.orm import Session

from models import (
    ChatConversation,
    ConversationEvaluation,
    ConversationReview,
    SimulationAttempt,
    TrainingPathAssignment,
    TrainingPathStep,
)
from schemas import (
    ASSIGNMENT_STATUS_ACTIVE,
    ASSIGNMENT_STATUS_COMPLETED,
    ASSIGNMENT_STATUS_COMPLETED_LATE,
    ASSIGNMENT_STATUS_LOCKED,
    ASSIGNMENT_STATUS_OVERDUE,
)
from simulation_scoring import attempt_score

# Le due forme di tappa, che sono anche le due prove che la superano
STEP_KIND_AVATAR = "avatar"
STEP_KIND_SIMULATION = "simulation"

# Come una prova si attacca alla tappa che la richiede: chi l'ha svolta, su
# quale delle due forme, e su quale avatar o simulazione. La forma sta nella
# chiave e non è ridondante: senza, due tabelle diverse finirebbero nello
# stesso spazio di id e a tenerle separate sarebbe solo la fiducia.
ProofKey = tuple[UUID, str, UUID]


def step_kind(step: TrainingPathStep) -> str:
    """Se la tappa si supera parlando con un avatar o consegnando un test."""
    return STEP_KIND_AVATAR if step.avatar_id is not None else STEP_KIND_SIMULATION


def step_target_id(step: TrainingPathStep) -> UUID:
    """L'avatar o la simulazione della tappa, quello dei due che c'è."""
    return step.avatar_id if step.avatar_id is not None else step.simulation_id


def _proof_key(user_id: UUID, step: TrainingPathStep) -> ProofKey:
    return (user_id, step_kind(step), step_target_id(step))


@dataclass(frozen=True)
class StepProgress:
    """Una tappa vista da chi la sta percorrendo, senza niente di salvato.

    La scadenza non è qui: è scritta sulla tappa e la si legge da lì, uguale
    per chiunque percorra quel percorso. Qui sta solo quello che cambia da
    una persona all'altra, cioè lo stato che dalla scadenza discende.
    """

    status: str
    # Quando la tappa si è aperta, cioè da quando le sue prove contano.
    # None finché la tappa precedente non è stata superata.
    unlocked_at: datetime | None
    # Prove svolte dopo lo sblocco
    attempts: int
    best_score: float | None
    achieved_at: datetime | None


@dataclass(frozen=True)
class PathProgress:
    """Il percorso intero e ognuna delle sue tappe, in ordine."""

    status: str
    steps: list[StepProgress]

    @property
    def completed_steps(self) -> int:
        return sum(
            1
            for s in self.steps
            if s.status in (ASSIGNMENT_STATUS_COMPLETED, ASSIGNMENT_STATUS_COMPLETED_LATE)
        )

    @property
    def current_index(self) -> int | None:
        """La posizione (da 0) della tappa da fare adesso, None se è finito.

        È la prima non ancora superata, che per costruzione è anche l'unica
        aperta: quelle dopo di lei sono tutte chiuse.
        """
        for index, step in enumerate(self.steps):
            if step.status in (ASSIGNMENT_STATUS_ACTIVE, ASSIGNMENT_STATUS_OVERDUE):
                return index
        return None


def _now() -> datetime:
    """Naive UTC, la convenzione di ogni colonna temporale dello schema."""
    return datetime.now(UTC).replace(tzinfo=None)


def _naive(value: datetime) -> datetime:
    """Porta un momento nella convenzione dello schema, UTC senza fuso.

    Una riga riletta dal database è già senza fuso, ma una ancora in sessione
    porta il default tz-aware della propria colonna Python, e i due non si
    possono confrontare: senza questo, un percorso appena assegnato
    solleverebbe al primo confronto con la data di una prova.
    """
    return value if value.tzinfo is None else value.astimezone(UTC).replace(tzinfo=None)


def proofs_by_key(
    db: Session, assignments: list[TrainingPathAssignment]
) -> dict[ProofKey, list[tuple[datetime, float]]]:
    """(utente, forma, bersaglio) -> [(prova svolta il, voto che conta)].

    Due query per tutta la pagina, una per forma di prova, invece di una per
    tappa: il taglio per tappa (solo le prove successive al suo sblocco)
    avviene in Python, perché lo sblocco dipende dalla tappa prima e due
    percorsi possono chiedere lo stesso avatar in posizioni diverse.

    Le due query restano separate anche qui, come ovunque nell'applicazione:
    un percorso di soli avatar non deve pagare la scansione dei tentativi di
    simulazione per scoprire che non ne ha.

    Sulle conversazioni il voto è quello finale, così un voto corretto dal
    docente è il voto contro cui la tappa si misura. Sui test è quello
    congelato sul tentativo, che nessuno corregge a mano (vedi
    ``SimulationAttempt``).
    """
    wanted: set[ProofKey] = {
        _proof_key(a.user_id, step) for a in assignments for step in a.path.steps
    }
    if not wanted:
        return {}

    by_key: dict[ProofKey, list[tuple[datetime, float]]] = defaultdict(list)
    user_ids = {user_id for user_id, _, _ in wanted}
    avatar_ids = {target for _, kind, target in wanted if kind == STEP_KIND_AVATAR}
    simulation_ids = {target for _, kind, target in wanted if kind == STEP_KIND_SIMULATION}

    if avatar_ids:
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
                ChatConversation.user_id.in_(user_ids),
                ChatConversation.avatar_id.in_(avatar_ids),
            )
            .all()
        )
        for user_id, avatar_id, opened_at, ai_score, override_score in rows:
            score = override_score if override_score is not None else ai_score
            by_key[(user_id, STEP_KIND_AVATAR, avatar_id)].append((_naive(opened_at), score))

    if simulation_ids:
        rows = (
            db.query(
                SimulationAttempt.user_id,
                SimulationAttempt.simulation_id,
                SimulationAttempt.created_at,
                SimulationAttempt.earned_points,
                SimulationAttempt.question_count,
            )
            .filter(
                SimulationAttempt.user_id.in_(user_ids),
                SimulationAttempt.simulation_id.in_(simulation_ids),
            )
            .all()
        )
        for user_id, simulation_id, submitted_at, points, questions in rows:
            score = attempt_score(points or 0.0, questions)
            by_key[(user_id, STEP_KIND_SIMULATION, simulation_id)].append(
                (_naive(submitted_at), score)
            )

    return by_key


def _step_progress(
    step: TrainingPathStep,
    unlocked_at: datetime | None,
    proofs: list[tuple[datetime, float]],
    now: datetime,
) -> StepProgress:
    """Una tappa, dato il momento in cui si è aperta e le prove di quel bersaglio."""
    due_at = _naive(step.due_at) if step.due_at is not None else None
    expired = due_at is not None and now > due_at

    if unlocked_at is None:
        # Chiusa: nessuna prova conta ancora, ma il calendario corre lo
        # stesso, quindi la sua data si legge e può già essere passata. Lo
        # sblocco resta a None, ed è da lì che si sa che non si può ancora
        # cominciare: lo stato dice se è in tempo, non se è aperta.
        return StepProgress(
            status=ASSIGNMENT_STATUS_OVERDUE if expired else ASSIGNMENT_STATUS_LOCKED,
            unlocked_at=None,
            attempts=0,
            best_score=None,
            achieved_at=None,
        )

    relevant = [(at, score) for at, score in proofs if at >= unlocked_at]
    best_score = max((score for _, score in relevant), default=None)
    # Primo momento in cui il bersaglio è stato raggiunto, per data della prova
    achieved_at = min(
        (at for at, score in relevant if score >= step.target_score),
        default=None,
    )

    if achieved_at is not None:
        late = due_at is not None and achieved_at > due_at
        status = ASSIGNMENT_STATUS_COMPLETED_LATE if late else ASSIGNMENT_STATUS_COMPLETED
    elif expired:
        status = ASSIGNMENT_STATUS_OVERDUE
    else:
        status = ASSIGNMENT_STATUS_ACTIVE

    return StepProgress(
        status=status,
        unlocked_at=unlocked_at,
        attempts=len(relevant),
        best_score=best_score,
        achieved_at=achieved_at,
    )


def progress_of(
    assignment: TrainingPathAssignment,
    by_key: dict[ProofKey, list[tuple[datetime, float]]],
) -> PathProgress:
    """Il percorso di una persona, tappa per tappa e nel suo insieme.

    Si scorre la fila una volta sola: ogni tappa si apre quando quella prima
    di lei è stata superata, e da lì contano le sue prove. Superata la prima
    non ancora chiusa, tutte quelle dopo restano bloccate, che è la fila
    stessa.
    """
    now = _now()
    unlocked_at: datetime | None = _naive(assignment.created_at)
    steps: list[StepProgress] = []

    for step in assignment.path.steps:
        progress = _step_progress(
            step, unlocked_at, by_key.get(_proof_key(assignment.user_id, step), []), now
        )
        steps.append(progress)
        # La prossima si apre nel momento in cui questa è stata superata, e
        # resta chiusa finché non lo è.
        unlocked_at = progress.achieved_at

    if not steps:
        # Un percorso senza tappe non è finito, è vuoto: da comporre.
        return PathProgress(status=ASSIGNMENT_STATUS_ACTIVE, steps=[])

    statuses = {s.status for s in steps}
    if statuses <= {ASSIGNMENT_STATUS_COMPLETED, ASSIGNMENT_STATUS_COMPLETED_LATE}:
        # Una sola tappa chiusa in ritardo basta a dirlo di tutto il
        # percorso: è finito, ma non nei tempi che gli erano stati dati.
        status = (
            ASSIGNMENT_STATUS_COMPLETED_LATE
            if ASSIGNMENT_STATUS_COMPLETED_LATE in statuses
            else ASSIGNMENT_STATUS_COMPLETED
        )
    elif ASSIGNMENT_STATUS_OVERDUE in statuses:
        status = ASSIGNMENT_STATUS_OVERDUE
    else:
        status = ASSIGNMENT_STATUS_ACTIVE

    return PathProgress(status=status, steps=steps)
