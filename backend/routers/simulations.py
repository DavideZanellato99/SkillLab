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

**Quattro modi di rispondere, e una sola correzione che chiama un modello.**
Scelta multipla, ordinamento e abbinamento si correggono qui: le chiavi sono
state decise quando la domanda è nata, rilette da un umano prima della
pubblicazione, e da quel momento lo stesso test consegnato due volte prende
lo stesso voto. Un test a risposta aperta non può funzionare così, perché
quello che l'utente ha scritto qualcuno lo deve leggere: alla consegna parte
una chiamata sola che giudica tutte le risposte insieme (vedi
``simulation_open_answers``), e il giudizio viene congelato nel tentativo
perché è stato dato una volta sola.

Le tre correzioni deterministiche non danno però lo stesso genere di voto.
Sulla scelta multipla una risposta è giusta o sbagliata, e a fare la
differenza è il tempo; su ordinamento e abbinamento una risposta può essere
giusta **in parte**, e i punti sono la quota di elementi al posto giusto
(vedi ``matched_points``). È la ragione per cui quei due tipi non hanno il
cronometro: là il punto si guadagna a pezzi, e toglierne anche col tempo
vorrebbe dire due scale che si moltiplicano su una domanda dove nessuno
saprebbe più dire da dove viene il voto.

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
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, selectinload

import audit
import llm_limits
from auth_dependency import get_current_super_admin, get_current_user, resolve_admin_scope
from database import get_db
from exports import simulation_attempt_pdf
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
    is_partially_correct,
    matched_points,
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
            # Ogni tipo riempie la propria lista e lascia vuote le altre: è
            # il tipo del test a dire come si risponde, non la lunghezza di
            # queste liste
            options=q.options or [],
            **_shuffled_items(q),
        )
        for position, q in enumerate(drawn, start=1)
    ]


def _shuffled_items(question: SimulationQuestion) -> dict:
    """Gli elementi di una domanda di ordinamento o di abbinamento, mescolati.

    **La mescolata è la domanda.** I passi sono salvati nell'ordine giusto e
    le coppie già accoppiate, perché quella è la chiave: mandarli come sono
    scritti vorrebbe dire consegnare la risposta insieme alla domanda. Si
    mescola qui, nel momento in cui la domanda esce dal server, come le
    domande stesse si estraggono qui e non quando la pagina si apre.

    Sull'abbinamento si mescola **solo la colonna di destra**: la sinistra è
    l'elenco dei casi e il suo ordine non dice niente, mentre rimescolare
    tutte e due farebbe leggere la stessa domanda in due modi a due persone
    senza aggiungere niente.

    Il server non si segna quale mescolata ha spedito, e non gli serve: la
    consegna rimanda il testo degli elementi, non la loro posizione (vedi
    ``SimulationAnswerPayload``).
    """
    steps = [str(s) for s in (question.ordered_steps or [])]
    if steps:
        return {"steps": random.sample(steps, len(steps))}
    pairs = question.pairs or []
    if pairs:
        right = [str(p.get("right") or "") for p in pairs]
        return {
            "left": [str(p.get("left") or "") for p in pairs],
            "right": random.sample(right, len(right)),
        }
    return {}


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
                # Come aveva disposto i passi e come aveva accoppiato le due
                # colonne, con accanto la chiave: sono nella fotografia come
                # tutto il resto, quindi una domanda riscritta dopo non può
                # far apparire fuori posto un passo che era al suo posto
                given_steps=entry.get("given_steps") or [],
                correct_steps=entry.get("correct_steps") or [],
                given_pairs=entry.get("given_pairs") or [],
                correct_pairs=entry.get("correct_pairs") or [],
                matched_count=entry.get("matched_count", 0),
                item_count=entry.get("item_count", 0),
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


def _same_text(a: str, b: str) -> bool:
    """Se due elementi sono lo stesso, a meno di spazi e maiuscole.

    Il confronto è sul testo e non su un indice perché il server non si è
    segnato in che ordine aveva spedito gli elementi (vedi
    ``_shuffled_items``). Perdonare gli spazi doppi e le maiuscole è il
    minimo indispensabile: quello che torna indietro è il testo che il
    server stesso ha mandato, quindi un elemento che non combacia qui è un
    elemento che qualcuno ha riscritto, non uno che un browser ha storpiato.
    """
    return " ".join(a.split()).casefold() == " ".join(b.split()).casefold()


def _ordering_answers(questions: list[SimulationQuestion], given: dict) -> list[dict]:
    """La correzione di un test di ordinamento: quanti passi al posto giusto.

    Deterministica come la scelta multipla, e con una differenza sola: qui
    una risposta può essere giusta a metà, e i punti sono la quota di passi
    che stanno dove devono stare (vedi ``matched_points``). Una posizione
    vale l'altra, quindi il numero che finisce nell'esito è "quattro passi su
    sei", che è anche quello che serve sapere per rimediare.

    Un ordine che non contiene gli stessi passi mandati è 400 e non una
    risposta sbagliata: significa che il client ha riscritto la domanda,
    esattamente come un indice fuori intervallo sulla scelta multipla.
    """
    answers = []
    for position, question in enumerate(questions, start=1):
        answer = given.get(question.id)
        correct = [str(s) for s in (question.ordered_steps or [])]
        proposed = [str(s) for s in (answer.ordered_steps or [])] if answer else []
        if proposed and len(proposed) != len(correct):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Risposta non valida per una delle domande.",
            )
        # I passi al posto giusto, confrontando le due liste posizione per
        # posizione. Una risposta in bianco non ne ha nessuno.
        # `strict=False` di proposito: una risposta in bianco è più corta
        # della chiave, e lì la conta si ferma senza che sia un errore
        matched = sum(
            1 for mine, right in zip(proposed, correct, strict=False) if _same_text(mine, right)
        )
        points = matched_points(matched, len(correct))
        answers.append(
            {
                "question_id": str(question.id),
                "position": position,
                "text": question.text,
                # In bianco resta lista vuota e non l'ordine corretto: chi
                # non ha risposto e chi ha sbagliato tutto prendono gli stessi
                # zero punti, ma nell'esito si distinguono
                "given_steps": proposed,
                "correct_steps": correct,
                "matched_count": matched,
                "item_count": len(correct),
                "is_correct": is_partially_correct(points),
                "points": points,
                "explanation": question.explanation,
            }
        )
    return answers


def _matching_answers(questions: list[SimulationQuestion], given: dict) -> list[dict]:
    """La correzione di un test di abbinamento: quante coppie indovinate.

    La stessa scala dell'ordinamento, su un'altra chiave: si conta quante
    voci di sinistra hanno accanto l'abbinato giusto. Le voci che chi
    rispondeva ha lasciato scoperte semplicemente non arrivano, e valgono
    come sbagliate senza bisogno di dirlo.

    Non si controlla che gli abbinati proposti siano quelli mandati: chi ne
    scrive uno inventato ha già sbagliato quella coppia, e rifiutare la
    consegna intera per una riga storta butterebbe via un test che qualcuno
    ha appena svolto. È la differenza con l'ordinamento, dove una lista di
    lunghezza diversa non è una risposta sbagliata ma una domanda diversa.
    """
    answers = []
    for position, question in enumerate(questions, start=1):
        answer = given.get(question.id)
        correct = [
            {"left": str(p.get("left") or ""), "right": str(p.get("right") or "")}
            for p in (question.pairs or [])
        ]
        proposed = (
            [{"left": p.left, "right": p.right} for p in (answer.pairs or [])] if answer else []
        )
        by_left = {" ".join(p["left"].split()).casefold(): p["right"] for p in proposed}
        matched = sum(
            1
            for pair in correct
            if _same_text(by_left.get(" ".join(pair["left"].split()).casefold(), ""), pair["right"])
        )
        points = matched_points(matched, len(correct))
        answers.append(
            {
                "question_id": str(question.id),
                "position": position,
                "text": question.text,
                "given_pairs": proposed,
                "correct_pairs": correct,
                "matched_count": matched,
                "item_count": len(correct),
                "is_correct": is_partially_correct(points),
                "points": points,
                "explanation": question.explanation,
            }
        )
    return answers


async def _open_answers(
    questions: list[SimulationQuestion], given: dict, user_id: UUID
) -> list[dict]:
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
    # Solo se c'è davvero qualcosa da far correggere: un test consegnato in
    # bianco non chiama nessuno e non deve consumare niente.
    if to_judge:
        await llm_limits.consume(llm_limits.CORREZIONE, user_id)

    try:
        judgements = await judge_open_answers(to_judge)
    except RuntimeError:
        # Il motivo è già nei log di eval_json_completion, con il modello
        # che ha fallito: qui serve solo dire a chi ha consegnato che può
        # riprovare senza aver perso quello che ha scritto.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="La correzione non è riuscita. Le risposte non sono andate perse: ripeti la consegna.",
        )
    if len(judgements) < len(to_judge):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="La correzione è risultata incompleta. Le risposte non sono andate perse: ripeti la consegna.",
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
                "is_correct": is_partially_correct(earned),
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
        answers = await _open_answers(questions, given, current_user.id)
    elif simulation.is_ordering:
        answers = _ordering_answers(questions, given)
    elif simulation.is_matching:
        answers = _matching_answers(questions, given)
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


def _readable_attempt_or_404(db: Session, attempt_id: UUID, user: User) -> SimulationAttempt:
    """Un tentativo che `user` può leggere, o 404.

    Lo leggono chi lo ha svolto e gli amministratori del tenant a cui
    appartiene **chi lo ha svolto**: è la stessa regola con cui un docente
    rilegge la conversazione di un suo studente. Un tentativo che non si può
    leggere è indistinguibile da uno che non esiste.

    L'organizzazione che conta è quella della persona e non quella della
    simulazione, come nel report che elenca i tentativi e nella cancellazione
    che li toglie (vedi ``routers.admin``). Le due coincidono quasi sempre,
    perché un test si svolge solo dentro la propria organizzazione, ma non
    dopo che il super admin ha spostato qualcuno di tenant: lì il tentativo
    resta attaccato alla simulazione di prima, e prendere quella come
    riferimento significava far leggere nome ed email di una persona
    all'amministratore dell'organizzazione che ha appena lasciato, mentre a
    quello dell'organizzazione dove adesso sta il dettaglio rispondeva 404 di
    una riga che il suo report gli mostrava.
    """
    attempt = db.query(SimulationAttempt).filter(SimulationAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tentativo non trovato.")
    is_owner = attempt.user_id == user.id
    is_admin_of_tenant = False
    if user.ruolo in (ROLE_SUPER_ADMIN, ROLE_ORGANIZATION_ADMIN):
        scope = resolve_admin_scope(user)
        # `attempt.user` è None solo se la persona è stata cancellata, e allora
        # il tentativo non è di nessun tenant: resta al super admin.
        taker_org = attempt.user.organization_id if attempt.user else None
        is_admin_of_tenant = scope is None or scope == taker_org
    if not is_owner and not is_admin_of_tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tentativo non trovato.")
    return attempt


@router.get("/attempts/{attempt_id}", response_model=SimulationAttemptResponse)
def get_attempt(
    attempt_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Un tentativo con la sua correzione."""
    attempt = _readable_attempt_or_404(db, attempt_id, current_user)
    return {
        **_attempt_response(attempt),
        "answers": _answer_results(attempt.simulation, attempt.answers),
    }


@router.get("/attempts/{attempt_id}/pdf")
def download_attempt_pdf(
    attempt_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """L'esito di un test come PDF, da consegnare al formatore.

    Un endpoint solo per tutti e due i lettori, perché la lettura del
    tentativo è già una sola: la pagina che si scarica è quella che si sta
    guardando, e chi non può guardarla non può nemmeno stamparla.
    """
    attempt = _readable_attempt_or_404(db, attempt_id, current_user)
    simulation = attempt.simulation
    pdf = simulation_attempt_pdf(
        operator_name=_user_name(attempt.user),
        operator_email=attempt.user.email if attempt.user else "",
        simulation_title=simulation.title,
        kind=simulation.kind,
        submitted_at=attempt.created_at,
        correct_count=attempt.correct_count,
        question_count=attempt.question_count,
        earned_points=attempt.earned_points or 0.0,
        score=attempt.score,
        answers=_answer_results(simulation, attempt.answers),
    )

    # Nome del file in solo ASCII, ricavato dal titolo del test
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", simulation.title).strip("-").lower() or "test"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="test-{slug}.pdf"'},
    )


@router.get("/{simulation_id}/results", response_model=list[SimulationAttemptSummary])
def list_simulation_results(
    simulation_id: UUID,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin),
):
    """Tutti i tentativi su una simulazione, per il super admin.

    È l'unico punto che guarda una prova **dal lato del test** invece che dal
    lato della persona: la dashboard e il report rispondono a "come sta
    andando Mario", questo elenco risponde a "è venuto bene questo test?".
    Dodici dieci di fila dicono che le domande sono troppo facili, nessuna
    sufficienza dice che una è scritta male, ed è il riscontro che chiude il
    ciclo carica, genera, rileggi, pubblica. Per questo sta accanto alle
    domande, nella stessa modale: si legge il risultato e si corregge la
    domanda nella linguetta di fianco.

    **Solo il super admin**, che è l'unico a scrivere le simulazioni e
    l'unico ad avere la pagina da cui questo si apre. Il ruolo dichiarato
    qui e il ruolo che serve per arrivarci devono essere lo stesso: quando
    il primo è più largo del secondo, quello che conta è il primo, perché
    l'indirizzo si digita anche senza un pulsante che ci porti. Il giorno in
    cui un organization admin avrà una pagina dei propri test, questo
    tornerà a ``get_current_admin`` e i tentativi andranno filtrati per
    l'organizzazione di **chi li ha svolti** (come in
    ``_readable_attempt_or_404``): la simulazione non basta a dirlo, perché
    chi trasloca di tenant si porta dietro i propri tentativi.
    """
    simulation = get_visible_or_404(db, current_admin, simulation_id, include_drafts=True)
    attempts = (
        db.query(SimulationAttempt)
        .filter(SimulationAttempt.simulation_id == simulation.id)
        .order_by(SimulationAttempt.created_at.desc())
        .all()
    )
    return [_attempt_response(a) for a in attempts]
