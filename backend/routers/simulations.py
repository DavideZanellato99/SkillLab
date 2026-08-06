"""Il simulatore tecnico visto da chi lo svolge.

Il gemello scritto del roleplay: là si misura come l'operatore gestisce una
persona, qui se conosce la procedura. Dieci domande estratte a caso dal
serbatoio ricavato da un documento aziendale (vedi ``simulation_questions``),
la stessa regola del tenant di tutto il resto, e nessun limite ai tentativi.

**L'estrazione avviene quando il test comincia**, non quando la pagina si
apre: è il senso di ``start_attempt``, che è l'unica lettura di questa
applicazione a rispondere due cose diverse alla stessa domanda. Le dieci
domande vivono da lì in poi nel browser di chi risponde, e tornano indietro
con la consegna: il server non tiene da nessuna parte quali aveva dato, e
corregge quelle che gli vengono riconsegnate dopo aver controllato che siano
davvero sue e che siano il numero giusto. Una riga in più per ogni test
iniziato e mai finito sarebbe una tabella di sessioni da far scadere, per un
test di formazione dove un tentativo esiste solo quando viene consegnato.

**Due modi di rispondere, e due correzioni diverse.** Un test a scelta
multipla si corregge qui e non nel modello: la risposta esatta è stata decisa
quando la domanda è nata, riletta da un umano prima della pubblicazione, e da
quel momento lo stesso test consegnato due volte prende lo stesso voto. Un
test a risposta aperta non può funzionare così, perché quello che l'utente ha
scritto qualcuno lo deve leggere: alla consegna parte una chiamata sola che
giudica tutte le risposte insieme (vedi ``simulation_open_answers``), e il
giudizio viene congelato nel tentativo perché è stato dato una volta sola.

Quello che l'LLM ha scritto e che arriva a chi ha sbagliato è la spiegazione,
insieme ai passaggi del documento da cui la domanda viene: è lì che il test
smette di essere un voto e diventa una lezione.

Il voto di un test a scelta multipla non è solo quante ne ha prese: una
risposta corretta vale meno se ci è voluto tempo (vedi
``simulation_scoring``), perché sapere una procedura e ricordarsela subito
non sono la stessa cosa. Il tempo lo misura il browser e lo manda con la
risposta; il server lo riporta dentro scala se arriva storto, ma non ha modo
di verificarlo, ed è una scelta: questo è un test di formazione, non un esame
sorvegliato. Sulle risposte aperte il cronometro non c'è, e i punti sono
quanto la risposta è completa: trenta secondi bastano a scegliere una
lettera, non a scrivere una procedura.

Le domande viaggiano verso il browser senza la risposta esatta (vedi
``SimulationQuestionResponse``): la chiave resta sul server fino alla
consegna, altrimenti il test lo risolverebbe la scheda di rete.
"""

import random
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, selectinload

import audit
from auth_dependency import get_current_admin, get_current_user, resolve_admin_scope
from database import get_db
from models import (
    ROLE_ORGANIZATION_ADMIN,
    ROLE_SUPER_ADMIN,
    SIMULATION_QUESTION_COUNT,
    SIMULATION_STATUS_PUBLISHED,
    SimulationAttempt,
    SimulationQuestion,
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
from simulation_open_answers import judge_open_answers
from simulation_scoring import (
    attempt_points,
    attempt_score,
    is_open_answer_correct,
    open_answer_points,
    question_points,
)

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


def drawn_count(simulation: TechnicalSimulation) -> int:
    """Quante domande ha un tentativo di questa simulazione.

    Dieci, cioè quante ne promette la pagina, tranne che su una simulazione
    con un serbatoio più piccolo: le pubblicate ce l'hanno pieno, ma una
    bozza che il super admin sta ancora scrivendo può averne meno, e un test
    di sei domande su sei è preferibile a un errore.

    È anche il numero che gli utenti leggono nell'elenco e nelle regole: a
    chi svolge il test interessa quante domande deve rispondere, non quante
    ne sono state scritte in tutto. Il serbatoio è una cosa di chi il test
    lo prepara, e si legge dalle pagine di amministrazione.
    """
    return min(SIMULATION_QUESTION_COUNT, len(simulation.questions))


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
        "kind": simulation.kind,
        "source": simulation.source,
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
    return [to_response(s, drawn_count(s), stats.get(s.id)) for s in simulations]


@router.get("/{simulation_id}", response_model=SimulationDetailResponse)
def get_simulation(
    simulation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Il test prima di cominciarlo: il titolo, il tipo, quante domande sono.

    Le domande non ci sono, ed è la differenza con quando ce n'erano dieci
    fisse: qui non si sa ancora quali saranno, perché si estraggono quando il
    test comincia. La pagina che si apre mostra le regole e i tentativi
    passati, e per quello basta questo.
    """
    simulation = get_visible_or_404(db, current_user, simulation_id)
    stats = attempt_stats(db, current_user.id, [simulation.id])
    return to_response(simulation, drawn_count(simulation), stats.get(simulation.id))


@router.post("/{simulation_id}/start", response_model=list[SimulationQuestionResponse])
def start_attempt(
    simulation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Le dieci domande di questo tentativo, estratte adesso e a caso.

    Un'estrazione completamente casuale, senza memoria di quelle di prima:
    chi ritenta può ritrovare una domanda che aveva già visto, ed è giusto
    così, perché una procedura che si sbaglia due volte va chiesta due
    volte. Evitarlo vorrebbe dire tenere il conto di cosa ognuno ha già
    visto, cioè una tabella che cresce con i tentativi per risolvere un
    problema che il caso risolve da solo su un serbatoio da cinquanta.

    L'ordine è quello dell'estrazione e non quello del serbatoio: le
    posizioni con cui le domande sono state scritte non dicono niente a chi
    risponde, e mostrarle in fila darebbe l'ordine del documento a chi fa il
    test due volte.

    È un POST e non un GET perché la stessa richiesta risponde due cose
    diverse: qui si comincia un test, non si legge una pagina, e una GET del
    genere sarebbe la prima cosa che una cache metterebbe da parte.

    Le chiavi restano dov'erano: la risposta esatta, la traccia attesa, la
    spiegazione e i passaggi non escono da qui. È lo stesso schema di prima
    (``SimulationQuestionResponse``) e la ragione è la stessa: se la chiave
    viaggia con la domanda, il test lo risolve la scheda di rete.
    """
    simulation = get_visible_or_404(db, current_user, simulation_id)
    if not simulation.questions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Questa simulazione non ha ancora domande.",
        )
    drawn = random.sample(simulation.questions, drawn_count(simulation))
    return [
        SimulationQuestionResponse(
            id=q.id,
            # La posizione dentro il test appena estratto, non quella nel
            # serbatoio: è il numero che si legge accanto alla domanda
            position=position,
            text=q.text,
            # Vuote su un test a risposta aperta, dove la domanda non ha
            # alternative: è il tipo del test a dire come si risponde
            options=q.options or [],
        )
        for position, q in enumerate(drawn, start=1)
    ]


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
                options=entry.get("options") or [],
                selected_option=entry.get("selected_option"),
                correct_option=entry.get("correct_option"),
                # Risposta scritta, traccia e giudizio vengono dalla
                # fotografia come tutto il resto: la traccia di oggi potrebbe
                # essere stata riscritta, e mostrarla accanto a un voto dato
                # su quella di ieri farebbe leggere una correzione sbagliata.
                answer_text=entry.get("answer_text"),
                expected_answer=entry.get("expected_answer", ""),
                feedback=entry.get("feedback", ""),
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
        "simulation_kind": attempt.simulation.kind,
        "simulation_source": attempt.simulation.source,
        "user_id": attempt.user_id,
        "user_email": attempt.user.email if attempt.user else "",
        "user_name": _user_name(attempt.user),
        "correct_count": attempt.correct_count,
        "question_count": attempt.question_count,
        "earned_points": attempt.earned_points or 0.0,
        "score": attempt.score,
        "created_at": attempt.created_at,
    }


def _submitted_questions(
    simulation: TechnicalSimulation, payload: SimulationSubmitRequest
) -> list[SimulationQuestion]:
    """Le domande che questo tentativo ha ricevuto, nell'ordine in cui sono
    state consegnate.

    Quali fossero lo dice il payload, perché il server non se l'è segnato da
    nessuna parte, e per questo tre cose vanno controllate qui: che ogni
    domanda sia di questa simulazione, che nessuna arrivi due volte, e che
    siano tante quante un tentativo ne ha. Senza l'ultimo controllo bastava
    consegnare una sola risposta giusta per prendere dieci, ed è l'unico
    modo che questo disegno lascerebbe aperto: il tempo si può dichiarare
    (vedi ``simulation_scoring``), ma il numero delle domande no.

    Il fatto che una risposta manchi resta possibile e vale sbagliata: si
    manda la voce con la risposta in bianco, che è quello che il browser fa
    per le domande saltate.
    """
    by_id = {q.id: q for q in simulation.questions}
    questions: list[SimulationQuestion] = []
    seen: set[UUID] = set()
    for answer in payload.answers:
        question = by_id.get(answer.question_id)
        if question is None or answer.question_id in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le risposte consegnate non corrispondono alle domande del test.",
            )
        seen.add(answer.question_id)
        questions.append(question)

    expected = drawn_count(simulation)
    if len(questions) != expected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Il test ha {expected} domande e ne sono arrivate {len(questions)}: "
                "ricomincia il test."
            ),
        )
    return questions


def _multiple_choice_answers(questions: list[SimulationQuestion], given: dict) -> list[dict]:
    """La correzione di un test a scelta multipla: due numeri e un tempo.

    Deterministica e senza modelli di mezzo. Un indice fuori dall'intervallo
    delle alternative è 400 e non una risposta sbagliata: significa che il
    client ha mandato qualcosa di incoerente con la domanda che aveva.

    La posizione che finisce nella fotografia è quella dentro il tentativo e
    non quella nel serbatoio: chi rilegge il proprio esito deve trovare la
    terza domanda al terzo posto, non al trentanovesimo.
    """
    answers = []
    for position, question in enumerate(questions, start=1):
        answer = given.get(question.id)
        choice = answer.selected_option if answer else None
        options = question.options or []
        if choice is not None and not 0 <= choice < len(options):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Risposta non valida per una delle domande.",
            )
        is_correct = choice == question.correct_option
        elapsed_ms = answer.elapsed_ms if answer else None
        answers.append(
            {
                "question_id": str(question.id),
                "position": position,
                "text": question.text,
                "options": options,
                "selected_option": choice,
                "correct_option": question.correct_option,
                "is_correct": is_correct,
                "elapsed_ms": elapsed_ms,
                "points": question_points(is_correct, elapsed_ms),
                "explanation": question.explanation,
            }
        )
    return answers


async def _open_answers(questions: list[SimulationQuestion], given: dict) -> list[dict]:
    """La correzione di un test a risposta aperta: una chiamata, poi i punti.

    Le risposte in bianco non arrivano al modello. Valgono zero comunque, e
    non chiederlo è più veloce, costa meno ed è l'unico modo di essere certi
    che chi non scrive niente non prenda niente.

    **Se anche un solo giudizio manca, la consegna fallisce.** Un tentativo
    scritto con una domanda non valutata sarebbe un voto più basso del
    dovuto, per un motivo che chi lo riceve non può né vedere né contestare;
    ritentare invece costa una rotella in più, e le risposte sono ancora nel
    browser di chi le ha appena scritte. Il modello a cui chiedere è già più
    di uno (vedi ``eval_json_completion``), quindi arrivare qui vuol dire
    che hanno fallito tutti.
    """
    to_judge = [
        {
            "position": position,
            "text": question.text,
            "expected_answer": question.expected_answer,
            "answer_text": (given[question.id].answer_text or "").strip(),
        }
        for position, question in enumerate(questions, start=1)
        if question.id in given and (given[question.id].answer_text or "").strip()
    ]

    try:
        judgements = await judge_open_answers(to_judge)
    except RuntimeError:
        # Il motivo è già nei log di eval_json_completion, con il modello
        # che ha fallito: qui serve solo dire a chi ha consegnato che può
        # riprovare senza aver perso quello che ha scritto.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="La correzione non è riuscita. Le tue risposte non sono perse: riprova.",
        )
    if len(judgements) < len(to_judge):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="La correzione è arrivata incompleta. Le tue risposte non sono perse: riprova.",
        )

    answers = []
    for position, question in enumerate(questions, start=1):
        answer = given.get(question.id)
        written = (answer.answer_text or "").strip() if answer else ""
        judgement = judgements.get(position) if written else None
        # I punti sono il giudizio, non una sua conseguenza: c'è un numero
        # solo, e il campo che lo tiene è quello che tutti i test usano
        earned = open_answer_points(judgement["quality"] if judgement else None)
        answers.append(
            {
                "question_id": str(question.id),
                "position": position,
                "text": question.text,
                # In bianco resta None e non stringa vuota: è la stessa
                # distinzione fra chi non ha risposto e chi ha risposto male
                # che sulle multiple fa selected_option
                "answer_text": written or None,
                "expected_answer": question.expected_answer,
                "feedback": judgement["feedback"] if judgement else "",
                "is_correct": is_open_answer_correct(earned),
                "points": earned,
                "explanation": question.explanation,
            }
        )
    return answers


@router.post("/{simulation_id}/attempts", response_model=SimulationAttemptResponse)
async def submit_attempt(
    simulation_id: UUID,
    payload: SimulationSubmitRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consegna il test e restituisce l'esito con le spiegazioni.

    Si corregge quello che è stato consegnato, non tutto il serbatoio: quali
    fossero le domande di questo tentativo lo dice il payload, dopo i
    controlli di ``_submitted_questions``.

    Le domande non risposte valgono come sbagliate, ma restano distinguibili
    nell'esito: chi non sa e chi non ha fatto in tempo prendono lo stesso
    voto, e a chi rilegge il proprio tentativo la differenza serve.

    La consegna di un test a risposta aperta è l'unica di tutta
    l'applicazione che aspetta un modello prima di rispondere. Il tentativo
    nasce già corretto e già votato, invece di nascere "in valutazione" e
    riempirsi dopo: uno stato in più significherebbe tentativi rimasti
    appesi da riprendere, e un voto che compare mezz'ora dopo non lo legge
    più nessuno.
    """
    simulation = get_visible_or_404(db, current_user, simulation_id)
    if not simulation.questions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Questa simulazione non ha ancora domande.",
        )

    questions = _submitted_questions(simulation, payload)
    given = {a.question_id: a for a in payload.answers}
    if simulation.is_open:
        answers = await _open_answers(questions, given)
    else:
        answers = _multiple_choice_answers(questions, given)

    correct_count = sum(1 for a in answers if a["is_correct"])
    points = [a["points"] for a in answers]

    attempt = SimulationAttempt(
        simulation_id=simulation.id,
        user_id=current_user.id,
        correct_count=correct_count,
        question_count=len(questions),
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
