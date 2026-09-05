"""I conti delle dashboard, fatti sulle righe già lette.

Sta fuori dal router che li mostra per la stessa ragione di
``training_progress``: sono regole di lettura e non risposte HTTP, e da qui
si leggono per intero senza attraversare rotte, permessi e audit. Chi legge
le righe è ``report_rows``, chi le espone è ``routers/dashboards``, e in
mezzo c'è questo: funzioni che prendono quello che è già in memoria e
restituiscono gli oggetti della risposta.

Tre aggregazioni, tre domande:

- **i percorsi**: quante assegnazioni sono chiuse, in quanti giorni, e su
  quale tappa si ferma il gruppo. Il progresso di ognuna arriva già fatto da
  ``training_progress``, che resta l'unico posto dove si decide se una tappa
  è superata;
- **i contenuti**: quanto è difficile un avatar e quanto lo è un test, cioè
  le stesse prove guardate dal lato di chi le ha scritte invece che dal lato
  di chi le ha svolte;
- **le domande di un test**: quante volte una domanda è stata data giusta.
  Una domanda che sbagliano tutti è scritta male, e in una media di dieci
  domande non si vede.

Niente qui tocca il database e niente qui è salvato: sono numeri che si
rifanno a ogni lettura, come tutto il resto dell'applicazione.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from models import TrainingPathAssignment
from schemas import (
    ASSIGNMENT_STATUS_ACTIVE,
    ASSIGNMENT_STATUS_COMPLETED,
    ASSIGNMENT_STATUS_COMPLETED_LATE,
    ASSIGNMENT_STATUS_OVERDUE,
    AvatarStats,
    ContentDashboard,
    EvaluationReportRow,
    PathDeadline,
    PathsDashboard,
    PathStats,
    PathStepStats,
    SimulationItemStats,
    SimulationReportRow,
    SimulationStats,
)
from training_progress import PathProgress, Proof, ProofKey, progress_of, step_kind

# La riga sotto cui una prova non è andata bene. Sei decimi è la sufficienza
# in ognuna delle due prove (vedi ``simulation_scoring.PASS_POINTS``), e qui
# serve a distinguere un avatar difficile da uno poco frequentato: la media
# da sola non dice quante volte è finita male.
PASS_SCORE = 6.0

# Quante scadenze la dashboard dei percorsi si porta dietro. Sono l'unica sua
# parte che si legge riga per riga, e chi la guarda cerca le prossime: oltre
# questa misura non è più un elenco da leggere, è una tabella da filtrare, e
# per quella c'è la gestione percorsi.
DEADLINE_CAP = 50

# I due stati che dicono "chiusa", qui e in training_progress
_DONE = (ASSIGNMENT_STATUS_COMPLETED, ASSIGNMENT_STATUS_COMPLETED_LATE)


def _rate(part: int, whole: int) -> float:
    """La percentuale, arrotondata al decimo. Zero su un insieme vuoto."""
    return round(part / whole * 100, 1) if whole else 0.0


def _avg(values: list[float]) -> float | None:
    """La media, o None se non c'è niente da mediare.

    None e non zero: zero è un voto, e su una tappa che non ha ancora
    sbloccato nessuno si leggerebbe come "sono andati malissimo".
    """
    return round(sum(values) / len(values), 2) if values else None


@dataclass
class _StepAcc:
    """I numeri di una tappa mentre si scorrono gli assegnatari."""

    reached: int = 0
    passed: int = 0
    late: int = 0
    overdue: int = 0
    attempts: list[float] = field(default_factory=list)
    best_scores: list[float] = field(default_factory=list)


@dataclass
class _PathAcc:
    """I numeri di un percorso mentre si scorrono gli assegnatari."""

    title: str
    organization_name: str | None
    assignments: int = 0
    active: int = 0
    completed: int = 0
    completed_late: int = 0
    overdue: int = 0
    days: list[float] = field(default_factory=list)
    steps: dict[int, _StepAcc] = field(default_factory=dict)
    # Le tappe come sono scritte adesso, per numerarle e nominarle: le
    # assegnazioni dello stesso percorso condividono le stesse tappe, quindi
    # basta prenderle da una
    step_labels: dict[int, tuple[str, str, float]] = field(default_factory=dict)


def _days_to_complete(assignment: TrainingPathAssignment, progress: PathProgress) -> float | None:
    """Da quando il percorso è stato affidato all'ultima tappa superata.

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


def _deadline_of(assignment: TrainingPathAssignment, progress: PathProgress) -> PathDeadline | None:
    """La tappa con una data su cui questa persona è ferma adesso, se c'è.

    È la tappa aperta, cioè quella di cui è il turno: le successive hanno
    date che valgono ma su cui non si può ancora fare niente, e le precedenti
    sono chiuse. Un percorso finito non ne ha nessuna.
    """
    index = progress.current_index
    if index is None:
        return None
    step = assignment.path.steps[index]
    if step.due_at is None:
        return None
    step_progress = progress.steps[index]
    user = assignment.user
    return PathDeadline(
        assignment_id=assignment.id,
        path_id=assignment.path_id,
        path_title=assignment.path.title,
        user_id=user.id,
        user_name=f"{user.nome} {user.cognome}".strip() or user.email,
        user_email=user.email,
        step_position=index + 1,
        step_label=_step_label(step),
        due_at=step.due_at,
        status=step_progress.status,
    )


def _step_label(step) -> str:
    """Come si chiama una tappa: il suo avatar o il suo test.

    Il bersaglio è uno dei due e mai tutti e due (lo impone un vincolo sulla
    tabella), quindi qui non c'è un caso in cui manchino entrambi.
    """
    if step.avatar_id is not None:
        return step.avatar.name if step.avatar else "Avatar rimosso"
    return step.simulation.title if step.simulation else "Test rimosso"


def paths_dashboard(
    assignments: list[TrainingPathAssignment],
    by_key: dict[ProofKey, list[Proof]],
) -> PathsDashboard:
    """L'avanzamento di tutti i percorsi affidati, percorso per percorso.

    Il progresso di ogni assegnazione lo dà ``training_progress``, che resta
    l'unico posto in cui si decide se una tappa è superata: qui si contano
    soltanto gli esiti che ne escono. Una tappa si conta su chi l'ha
    sbloccata e non su tutti gli assegnatari, perché l'ultima tappa di un
    percorso lungo la raggiungono in pochi e misurarla su tutti direbbe che
    non funziona quando invece nessuno ci è ancora arrivato.
    """
    paths: dict[UUID, _PathAcc] = {}
    deadlines: list[PathDeadline] = []
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
        path = assignment.path
        people.add(assignment.user_id)
        totals[progress.status] = totals.get(progress.status, 0) + 1

        acc = paths.setdefault(
            path.id,
            _PathAcc(
                title=path.title,
                organization_name=assignment.user.organization_name,
            ),
        )
        acc.assignments += 1
        if progress.status == ASSIGNMENT_STATUS_ACTIVE:
            acc.active += 1
        elif progress.status == ASSIGNMENT_STATUS_COMPLETED:
            acc.completed += 1
        elif progress.status == ASSIGNMENT_STATUS_COMPLETED_LATE:
            acc.completed_late += 1
        elif progress.status == ASSIGNMENT_STATUS_OVERDUE:
            acc.overdue += 1

        days = _days_to_complete(assignment, progress)
        if days is not None:
            acc.days.append(days)
            all_days.append(days)

        for position, (step, step_progress) in enumerate(
            zip(path.steps, progress.steps, strict=True), start=1
        ):
            acc.step_labels.setdefault(
                position, (_step_label(step), step_kind(step), step.target_score)
            )
            step_acc = acc.steps.setdefault(position, _StepAcc())
            if step_progress.unlocked_at is not None:
                step_acc.reached += 1
                step_acc.attempts.append(step_progress.attempts)
                if step_progress.best_score is not None:
                    step_acc.best_scores.append(step_progress.best_score)
            if step_progress.status in _DONE:
                step_acc.passed += 1
                if step_progress.status == ASSIGNMENT_STATUS_COMPLETED_LATE:
                    step_acc.late += 1
            elif step_progress.status == ASSIGNMENT_STATUS_OVERDUE:
                step_acc.overdue += 1

        deadline = _deadline_of(assignment, progress)
        if deadline is not None:
            deadlines.append(deadline)

    # Le scadenze si leggono dalla più vicina, scadute comprese: quelle sono
    # le più vicine di tutte, e sono anche le uniche su cui si può ancora
    # fare qualcosa.
    deadlines.sort(key=lambda d: d.due_at)

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
        paths=[_path_stats(path_id, acc) for path_id, acc in paths.items()],
        deadlines=deadlines[:DEADLINE_CAP],
    )


def _path_stats(path_id: UUID, acc: _PathAcc) -> PathStats:
    """Un percorso, dai numeri raccolti sui suoi assegnatari."""
    return PathStats(
        path_id=path_id,
        title=acc.title,
        organization_name=acc.organization_name,
        assignments=acc.assignments,
        active=acc.active,
        completed=acc.completed,
        completed_late=acc.completed_late,
        overdue=acc.overdue,
        completion_rate=_rate(acc.completed + acc.completed_late, acc.assignments),
        avg_days_to_complete=_avg(acc.days),
        steps=[
            PathStepStats(
                position=position,
                label=acc.step_labels[position][0],
                kind=acc.step_labels[position][1],
                target_score=acc.step_labels[position][2],
                reached=step.reached,
                passed=step.passed,
                late=step.late,
                overdue=step.overdue,
                avg_attempts=_avg(step.attempts),
                avg_best_score=_avg(step.best_scores),
            )
            for position, step in sorted(acc.steps.items())
        ],
    )


@dataclass
class _AvatarAcc:
    """I numeri di un avatar mentre si scorrono le valutazioni."""

    name: str
    scores: list[float] = field(default_factory=list)
    people: set[UUID] = field(default_factory=set)
    below_pass: int = 0
    criteria: dict[str, list[float]] = field(default_factory=lambda: defaultdict(list))
    last_at: datetime | None = None


@dataclass
class _SimulationAcc:
    """I numeri di un test mentre si scorrono i tentativi."""

    title: str
    kind: str
    source: str
    scores: list[float] = field(default_factory=list)
    people: set[UUID] = field(default_factory=set)
    correct: int = 0
    asked: int = 0
    below_pass: int = 0
    last_at: datetime | None = None


def content_dashboard(
    evaluations: list[EvaluationReportRow],
    criteria_labels: dict[str, str],
    simulations: list[SimulationReportRow],
    truncated: bool = False,
) -> ContentDashboard:
    """Le stesse prove della dashboard dei punteggi, girate sul contenuto.

    Là le righe si raggruppano per persona e la domanda è chi è messo bene;
    qui si raggruppano per avatar e per test, e la domanda è cosa è tarato
    male. Sono lo stesso insieme di righe letto due volte perché sono due
    domande, non due schermate della stessa.

    Le due metà escono ordinate dalla media più bassa: la prima riga è quella
    su cui si va peggio, che è quella che si sta cercando.
    """
    avatars: dict[UUID, _AvatarAcc] = {}
    for row in evaluations:
        acc = avatars.setdefault(row.avatar_id, _AvatarAcc(name=row.avatar_name))
        acc.scores.append(row.overall_score)
        acc.people.add(row.user_id)
        if row.overall_score < PASS_SCORE:
            acc.below_pass += 1
        for key, score in row.criteria.items():
            acc.criteria[key].append(score)
        if acc.last_at is None or row.conversation_at > acc.last_at:
            acc.last_at = row.conversation_at

    tests: dict[UUID, _SimulationAcc] = {}
    for attempt in simulations:
        test = tests.setdefault(
            attempt.simulation_id,
            _SimulationAcc(
                title=attempt.simulation_title,
                kind=attempt.simulation_kind,
                source=attempt.simulation_source,
            ),
        )
        test.scores.append(attempt.score)
        test.people.add(attempt.user_id)
        test.correct += attempt.correct_count
        test.asked += attempt.question_count
        if attempt.score < PASS_SCORE:
            test.below_pass += 1
        if test.last_at is None or attempt.attempted_at > test.last_at:
            test.last_at = attempt.attempted_at

    return ContentDashboard(
        criteria_labels=criteria_labels,
        avatars=sorted(
            (_avatar_stats(avatar_id, acc) for avatar_id, acc in avatars.items()),
            key=lambda a: a.avg_score,
        ),
        simulations=sorted(
            (_simulation_stats(simulation_id, acc) for simulation_id, acc in tests.items()),
            key=lambda s: s.avg_score,
        ),
        truncated=truncated,
    )


def _avatar_stats(avatar_id: UUID, acc: _AvatarAcc) -> AvatarStats:
    """Un avatar, con il criterio su cui ci si inciampa di più.

    Il criterio più debole si cerca fra quelli che quell'avatar ha davvero
    prodotto: una valutazione vecchia poteva avere criteri diversi, e la
    media di una chiave presente su due conversazioni su cento non è la
    debolezza di nessuno. Resta la chiave con la media più bassa, che è
    quella su cui vale la pena riscrivere la scheda persona.
    """
    criteria = {key: round(sum(v) / len(v), 2) for key, v in acc.criteria.items() if v}
    weakest = min(criteria.items(), key=lambda item: item[1]) if criteria else None
    return AvatarStats(
        avatar_id=avatar_id,
        avatar_name=acc.name,
        conversations=len(acc.scores),
        people=len(acc.people),
        avg_score=round(sum(acc.scores) / len(acc.scores), 2),
        below_pass=acc.below_pass,
        weakest_criterion_key=weakest[0] if weakest else None,
        weakest_criterion_avg=weakest[1] if weakest else None,
        criteria=criteria,
        last_at=acc.last_at,
    )


def _simulation_stats(simulation_id: UUID, acc: _SimulationAcc) -> SimulationStats:
    """Un test, con la quota di risposte esatte accanto al voto medio.

    Le due cose non dicono lo stesso: il voto tiene conto anche del tempo
    impiegato (vedi ``simulation_scoring``), la quota di risposte esatte è
    quante ne sapevano. Un test con voti bassi e risposte quasi tutte esatte
    è un test cronometrato male, non un test difficile.
    """
    return SimulationStats(
        simulation_id=simulation_id,
        simulation_title=acc.title,
        simulation_kind=acc.kind,
        simulation_source=acc.source,
        attempts=len(acc.scores),
        people=len(acc.people),
        avg_score=round(sum(acc.scores) / len(acc.scores), 2),
        correct_rate=_rate(acc.correct, acc.asked),
        below_pass=acc.below_pass,
        last_at=acc.last_at,
    )


@dataclass
class _ItemAcc:
    """I numeri di una domanda mentre si scorrono i tentativi."""

    text: str
    positions: list[int] = field(default_factory=list)
    answers: int = 0
    correct: int = 0
    unanswered: int = 0
    seconds: list[float] = field(default_factory=list)


def _is_blank(answer: dict) -> bool:
    """Se questa domanda è rimasta in bianco.

    Ogni tipo di test scrive il non risposto a modo suo, perché a modo suo
    scrive anche la risposta: nessuna alternativa scelta, nessun testo,
    nessun ordine proposto, nessuna coppia. Le quattro forme si riconoscono
    dal campo che c'è, non da un tipo dichiarato: la fotografia di un
    tentativo è quella che era al momento della consegna, e un tipo aggiunto
    domani finirebbe qui senza che nessuno se ne ricordi.
    """
    if "selected_option" in answer:
        return answer.get("selected_option") is None
    if "answer_text" in answer:
        return not answer.get("answer_text")
    if "given_steps" in answer:
        return not answer.get("given_steps")
    if "given_pairs" in answer:
        return not answer.get("given_pairs")
    return False


def simulation_items(answer_sets: list[list[dict]]) -> list[SimulationItemStats]:
    """Le domande di un test, ognuna con quante volte è stata data giusta.

    Le domande si raggruppano per id e non per posizione: le domande di un
    test si estraggono da un serbatoio più grande e cambiano ordine da un
    tentativo all'altro, quindi "la terza" non è la stessa domanda per due
    persone. La posizione resta per ordinarle come le si è viste, in media.

    Il testo è quello dell'ultimo tentativo che l'ha portata: le domande si
    riscrivono, e la fotografia più recente è quella che chi guarda
    riconosce.
    """
    items: dict[str, _ItemAcc] = {}
    for answers in answer_sets:
        for answer in answers:
            question_id = str(answer.get("question_id") or "")
            if not question_id:
                continue
            acc = items.setdefault(question_id, _ItemAcc(text=str(answer.get("text") or "")))
            acc.text = str(answer.get("text") or acc.text)
            acc.positions.append(int(answer.get("position") or 0))
            acc.answers += 1
            if answer.get("is_correct"):
                acc.correct += 1
            if _is_blank(answer):
                acc.unanswered += 1
            elapsed = answer.get("elapsed_ms")
            if elapsed is not None:
                acc.seconds.append(float(elapsed) / 1000)

    return sorted(
        (
            SimulationItemStats(
                question_id=question_id,
                text=acc.text,
                answers=acc.answers,
                correct=acc.correct,
                unanswered=acc.unanswered,
                correct_rate=_rate(acc.correct, acc.answers),
                avg_seconds=_avg(acc.seconds),
            )
            for question_id, acc in items.items()
        ),
        key=lambda item: item.correct_rate,
    )
