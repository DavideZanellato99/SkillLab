"""Il simulatore tecnico visto da chi lo svolge.

Il gemello scritto del roleplay: là si misura come l'operatore gestisce una
persona, qui se conosce la procedura. Dieci domande a risposta multipla
ricavate da un documento aziendale (vedi ``simulation_questions``), la stessa
regola del tenant di tutto il resto, e nessun limite ai tentativi.

La correzione è deterministica e sta qui, non nel modello: la risposta esatta
è stata decisa quando la domanda è nata, riletta da un umano prima della
pubblicazione, e da quel momento lo stesso test consegnato due volte prende
lo stesso voto. Quello che l'LLM ha scritto e che arriva a chi ha sbagliato è
la spiegazione, insieme ai passaggi del documento da cui la domanda viene: è
lì che il test smette di essere un voto e diventa una lezione.

Il voto però non è più solo quante ne ha prese: una risposta corretta vale
meno se ci è voluto tempo (vedi ``simulation_scoring``), perché sapere una
procedura e ricordarsela subito non sono la stessa cosa. Il tempo lo misura
il browser e lo manda con la risposta; il server lo riporta dentro scala se
arriva storto, ma non ha modo di verificarlo, ed è una scelta: questo è un
test di formazione, non un esame sorvegliato.

Le domande viaggiano verso il browser senza la risposta esatta (vedi
``SimulationQuestionResponse``): la chiave resta sul server fino alla
consegna, altrimenti il test lo risolverebbe la scheda di rete.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, selectinload

import audit
from auth_dependency import get_current_admin, get_current_user, resolve_admin_scope
from database import get_db
from models import (
    ROLE_ORGANIZATION_ADMIN,
    ROLE_SUPER_ADMIN,
    SIMULATION_STATUS_PUBLISHED,
    SimulationAttempt,
    TechnicalSimulation,
    User,
)
from schemas import (
    SimulationAnswerResult,
    SimulationAttemptResponse,
    SimulationAttemptSummary,
    SimulationDetailResponse,
    SimulationQuestionResponse,
    SimulationResponse,
    SimulationSubmitRequest,
)
from simulation_scoring import attempt_points, attempt_score, question_points

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


def visible_query(db: Session, user: User, include_drafts: bool = False):
    """Le simulazioni che questo utente può vedere.

    Il punto unico da cui ogni lettura è filtrata, come ``resolve_admin_scope``
    per le pagine di amministrazione: il super admin sta sopra le
    organizzazioni e le vede tutte, chiunque altro vede quelle della propria e
    nient'altro. Le bozze restano fuori tranne dove si amministrano, perché
    una simulazione in bozza è una simulazione le cui domande nessuno ha
    ancora riletto.
    """
    query = db.query(TechnicalSimulation)
    if not include_drafts:
        query = query.filter(TechnicalSimulation.status == SIMULATION_STATUS_PUBLISHED)
    if user.ruolo != ROLE_SUPER_ADMIN:
        query = query.filter(TechnicalSimulation.organization_id == user.organization_id)
    return query


def get_visible_or_404(
    db: Session, user: User, simulation_id: UUID, include_drafts: bool = False
) -> TechnicalSimulation:
    simulation = (
        visible_query(db, user, include_drafts)
        .filter(TechnicalSimulation.id == simulation_id)
        .first()
    )
    if not simulation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Simulazione non trovata."
        )
    return simulation


def _user_name(user: User | None) -> str:
    if not user:
        return "utente eliminato"
    full = f"{user.nome} {user.cognome}".strip()
    return full or user.email


def attempt_stats(db: Session, user_id: UUID, simulation_ids: list[UUID]) -> dict:
    """Per ogni simulazione, quanti tentativi ha fatto questa persona e come
    è andato l'ultimo.

    Una query sola per tutto l'elenco, che legge le quattro colonne che
    servono e conta in Python: i tentativi di UNA persona sono decine, e
    farsi dare dal database l'ultimo di ogni gruppo costerebbe o una query
    per riga o una window function che non tutti i database hanno.
    """
    if not simulation_ids:
        return {}
    rows = (
        db.query(
            SimulationAttempt.simulation_id,
            SimulationAttempt.created_at,
            SimulationAttempt.earned_points,
            SimulationAttempt.question_count,
        )
        .filter(
            SimulationAttempt.user_id == user_id,
            SimulationAttempt.simulation_id.in_(simulation_ids),
        )
        .order_by(SimulationAttempt.created_at)
        .all()
    )
    stats: dict = {}
    for simulation_id, created_at, points, total in rows:
        entry = stats.setdefault(simulation_id, {"count": 0})
        entry["count"] += 1
        # Le righe arrivano dalla più vecchia, quindi l'ultima che passa di
        # qui è l'ultimo tentativo
        entry["last_at"] = created_at
        entry["last_score"] = attempt_score(points or 0.0, total)
    return stats


def to_response(
    simulation: TechnicalSimulation,
    question_count: int,
    stats: dict | None = None,
) -> dict:
    """I campi comuni a ogni forma in cui una simulazione viene servita."""
    stats = stats or {}
    return {
        "id": simulation.id,
        "organization_id": simulation.organization_id,
        "organization_name": simulation.organization.name if simulation.organization else "",
        "title": simulation.title,
        "description": simulation.description,
        "status": simulation.status,
        "document_name": simulation.document_name,
        "question_count": question_count,
        "created_at": simulation.created_at,
        "updated_at": simulation.updated_at,
        "last_attempt_at": stats.get("last_at"),
        "last_attempt_score": stats.get("last_score"),
        "attempt_count": stats.get("count", 0),
    }


@router.get("", response_model=list[SimulationResponse])
def list_simulations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Le simulazioni pubblicate che questo utente può svolgere."""
    simulations = (
        visible_query(db, current_user)
        .options(selectinload(TechnicalSimulation.questions))
        .order_by(TechnicalSimulation.created_at.desc())
        .all()
    )
    stats = attempt_stats(db, current_user.id, [s.id for s in simulations])
    return [to_response(s, len(s.questions), stats.get(s.id)) for s in simulations]


@router.get("/{simulation_id}", response_model=SimulationDetailResponse)
def get_simulation(
    simulation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Il test da svolgere: le domande senza le risposte esatte."""
    simulation = get_visible_or_404(db, current_user, simulation_id)
    stats = attempt_stats(db, current_user.id, [simulation.id])
    return {
        **to_response(simulation, len(simulation.questions), stats.get(simulation.id)),
        "questions": [
            SimulationQuestionResponse(id=q.id, position=q.position, text=q.text, options=q.options)
            for q in simulation.questions
        ],
    }


def _sources(simulation: TechnicalSimulation, ordinals: list[int] | None) -> list[str]:
    """Il testo dei passaggi citati da una domanda, nell'ordine del documento.

    Letti dai chunk e non congelati nel tentativo: sono il documento, che
    resta quello finché non lo si ricarica, e tenerne una copia per ogni
    tentativo di ogni utente moltiplicherebbe un manuale per il numero di chi
    lo studia. Se il documento viene ricaricato i passaggi cambiano, e va
    bene così: quello che deve restare fermo è il voto, non la citazione.
    """
    if not ordinals:
        return []
    wanted = set(ordinals)
    return [c.content for c in simulation.chunks if c.ordinal in wanted]


def _answer_results(
    simulation: TechnicalSimulation, answers: list[dict]
) -> list[SimulationAnswerResult]:
    """La correzione di un tentativo, come si legge nell'esito.

    Testo, alternative, risposta esatta, tempo e punti vengono dalla
    fotografia salvata nel tentativo, non dalle domande di oggi: una domanda
    corretta dopo la consegna non deve poter far apparire sbagliata una
    risposta che era giusta, e i punti dipendono da un tempo che è successo
    una volta sola. Spiegazione e passaggi invece si rileggono dalla domanda
    attuale, quando esiste ancora, perché lì una correzione è un
    miglioramento.

    I tentativi consegnati prima che il tempo contasse non hanno né l'uno né
    gli altri nella fotografia: lì il tempo resta vuoto e una risposta giusta
    vale il punto pieno che valeva allora.
    """
    questions = {q.id: q for q in simulation.questions}
    results = []
    for entry in answers:
        question_id = UUID(str(entry["question_id"]))
        question = questions.get(question_id)
        results.append(
            SimulationAnswerResult(
                question_id=question_id,
                position=entry["position"],
                text=entry["text"],
                options=entry["options"],
                selected_option=entry.get("selected_option"),
                correct_option=entry["correct_option"],
                is_correct=entry["is_correct"],
                elapsed_ms=entry.get("elapsed_ms"),
                points=entry.get("points", float(entry["is_correct"])),
                explanation=(question.explanation if question else entry.get("explanation", "")),
                sources=_sources(simulation, question.source_chunks if question else None),
            )
        )
    return results


def _attempt_response(attempt: SimulationAttempt) -> dict:
    return {
        "id": attempt.id,
        "simulation_id": attempt.simulation_id,
        "simulation_title": attempt.simulation.title,
        "user_id": attempt.user_id,
        "user_email": attempt.user.email if attempt.user else "",
        "user_name": _user_name(attempt.user),
        "correct_count": attempt.correct_count,
        "question_count": attempt.question_count,
        "earned_points": attempt.earned_points or 0.0,
        "score": attempt.score,
        "created_at": attempt.created_at,
    }


@router.post("/{simulation_id}/attempts", response_model=SimulationAttemptResponse)
def submit_attempt(
    simulation_id: UUID,
    payload: SimulationSubmitRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consegna il test e restituisce l'esito con le spiegazioni.

    Le domande non risposte valgono come sbagliate, ma restano distinguibili
    nell'esito: chi non sa e chi non ha fatto in tempo prendono lo stesso
    voto, e a chi rilegge il proprio tentativo la differenza serve.
    """
    simulation = get_visible_or_404(db, current_user, simulation_id)
    if not simulation.questions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Questa simulazione non ha ancora domande.",
        )

    given = {a.question_id: a for a in payload.answers}
    answers = []
    correct_count = 0
    points: list[float] = []
    for question in simulation.questions:
        answer = given.get(question.id)
        choice = answer.selected_option if answer else None
        if choice is not None and not 0 <= choice < len(question.options):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Risposta non valida per una delle domande.",
            )
        is_correct = choice == question.correct_option
        elapsed_ms = answer.elapsed_ms if answer else None
        earned = question_points(is_correct, elapsed_ms)
        if is_correct:
            correct_count += 1
        points.append(earned)
        answers.append(
            {
                "question_id": str(question.id),
                "position": question.position,
                "text": question.text,
                "options": question.options,
                "selected_option": choice,
                "correct_option": question.correct_option,
                "is_correct": is_correct,
                "elapsed_ms": elapsed_ms,
                "points": earned,
                "explanation": question.explanation,
            }
        )

    attempt = SimulationAttempt(
        simulation_id=simulation.id,
        user_id=current_user.id,
        correct_count=correct_count,
        question_count=len(simulation.questions),
        earned_points=attempt_points(points),
        answers=answers,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    audit.describe(
        http_request,
        simulazione=simulation.title,
        punteggio=attempt.score,
    )
    return {
        **_attempt_response(attempt),
        "answers": _answer_results(simulation, answers),
    }


@router.get("/{simulation_id}/attempts", response_model=list[SimulationAttemptSummary])
def list_my_attempts(
    simulation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """I propri tentativi su una simulazione, dal più recente."""
    simulation = get_visible_or_404(db, current_user, simulation_id)
    attempts = (
        db.query(SimulationAttempt)
        .filter(
            SimulationAttempt.simulation_id == simulation.id,
            SimulationAttempt.user_id == current_user.id,
        )
        .order_by(SimulationAttempt.created_at.desc())
        .all()
    )
    return [_attempt_response(a) for a in attempts]


@router.get("/attempts/{attempt_id}", response_model=SimulationAttemptResponse)
def get_attempt(
    attempt_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Un tentativo con la sua correzione.

    Lo legge chi lo ha svolto, e gli amministratori del tenant a cui la
    simulazione appartiene: è la stessa regola con cui un docente rilegge la
    conversazione di un suo studente.
    """
    attempt = db.query(SimulationAttempt).filter(SimulationAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tentativo non trovato.")
    simulation = attempt.simulation
    is_owner = attempt.user_id == current_user.id
    is_admin_of_tenant = False
    if current_user.ruolo in (ROLE_SUPER_ADMIN, ROLE_ORGANIZATION_ADMIN):
        scope = resolve_admin_scope(current_user)
        is_admin_of_tenant = scope is None or scope == simulation.organization_id
    if not is_owner and not is_admin_of_tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tentativo non trovato.")
    return {
        **_attempt_response(attempt),
        "answers": _answer_results(simulation, attempt.answers),
    }


@router.get("/{simulation_id}/results", response_model=list[SimulationAttemptSummary])
def list_simulation_results(
    simulation_id: UUID,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Tutti i tentativi su una simulazione, per gli amministratori.

    Un organization admin li vede solo per le simulazioni della propria
    organizzazione, che è la stessa cosa che dire "solo dei propri utenti":
    una simulazione appartiene a un tenant e i suoi tentativi anche.
    """
    simulation = get_visible_or_404(db, current_admin, simulation_id, include_drafts=True)
    scope = resolve_admin_scope(current_admin)
    if scope is not None and simulation.organization_id != scope:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Simulazione non trovata."
        )
    attempts = (
        db.query(SimulationAttempt)
        .filter(SimulationAttempt.simulation_id == simulation.id)
        .order_by(SimulationAttempt.created_at.desc())
        .all()
    )
    return [_attempt_response(a) for a in attempts]
