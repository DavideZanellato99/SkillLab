"""La creazione delle simulazioni tecniche, per chi amministra.

Entrambi i ruoli di amministrazione scrivono i test, come compongono i
percorsi (vedi ``routers.training``): un organization admin è chi
insegna davvero ai propri studenti, e far passare dal super admin ogni
procedura aziendale da trasformare in test metterebbe in mezzo un estraneo
al mestiere che si sta insegnando. A confinarlo è il tenant, qui come
altrove: legge, scrive e pubblica dentro la propria organizzazione e
nient'altro, e a dirlo è la stessa ``visible_query`` che serve chi i test
li svolge, chiesta con le bozze incluse.

Il ciclo di vita di una simulazione, in tre momenti distinti e in
quest'ordine, che è anche il motivo per cui sono tre chiamate e non una:

1. il caricamento del documento, che lo legge, lo spezza in passaggi e li
   indicizza (secondi);
2. la generazione delle domande, che è una lettura del documento più cinque
   scritture in parallelo su un modello di ragionamento, e può prendersi
   minuti;
3. la revisione umana e la pubblicazione.

Separarli non è pignoleria: se fossero un'unica richiesta, un modello lento
riporterebbe indietro un errore dopo tre minuti lasciando chi la sta
creando senza niente, documento compreso. Così un caricamento riuscito resta
riuscito, e una generazione che va storta si rilancia da sola.

Il passo 3 è la ragione per cui esiste lo stato di bozza. Le domande le
scrive una macchina che ha letto il documento, e quasi sempre le scrive bene:
"quasi sempre" è esattamente il motivo per cui nessuno le vede prima che un
umano le abbia rilette. Finché la simulazione è in bozza esiste solo qui.

Le domande però può scriverle anche il docente, una per una, ed è la seconda
strada che questo router serve (``source``, vedi ``TechnicalSimulation``). Là
i tre passi diventano uno solo: niente documento da caricare e niente
generazione da attendere, si scrivono le domande e si pubblica. Cambia quanto
basta a pubblicare, dieci domande invece di cinquanta, e cade tutto quello
che presuppone un documento: la generazione e la sua sostituzione rispondono
409 su una simulazione scritta a mano. Quello che non cambia è il resto:
stesso salvataggio in blocco, stessa bozza, stessa estrazione di dieci
domande a caso quando qualcuno comincia il test.
"""

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

import audit
import document_text
import llm_limits
import simulation_review
from auth_dependency import get_current_admin, resolve_admin_scope
from database import get_db
from models import (
    ALL_SIMULATION_KINDS,
    ALL_SIMULATION_SOURCES,
    SIMULATION_KIND_MATCHING,
    SIMULATION_KIND_MULTIPLE,
    SIMULATION_KIND_OPEN,
    SIMULATION_KIND_ORDERING,
    SIMULATION_SOURCE_AI,
    SIMULATION_SOURCE_MANUAL,
    SIMULATION_STATUS_DRAFT,
    Organization,
    SimulationAttempt,
    SimulationChunk,
    SimulationQuestion,
    TechnicalSimulation,
    User,
)
from openai_service import embed_texts
from routers.simulations import (
    attempt_stats,
    get_visible_or_404,
    question_counts,
    to_response,
    visible_query,
)
from schemas import (
    AdminSimulationResponse,
    MessageResponse,
    SimulationAdminDetailResponse,
    SimulationQuestionAdminResponse,
    SimulationQuestionPayload,
    SimulationQuestionsPayload,
    SimulationStatusRequest,
    SimulationUpdateRequest,
)
from simulation_grounding import grounding_findings, verifiable_count
from simulation_questions import generate_questions
from simulation_rag import split_into_chunks

router = APIRouter(prefix="/api/admin/simulations", tags=["admin-simulations"])


def _scoped_or_404(db: Session, admin: User, simulation_id: UUID) -> TechnicalSimulation:
    """La simulazione, se questo admin ha diritto di amministrarla.

    È la stessa ``visible_query`` di chi i test li svolge, chiesta con le
    bozze incluse: un test in bozza esiste solo qui, e chi lo amministra
    deve vederlo per pubblicarlo. Fuori dal proprio tenant una simulazione
    non esiste, quindi 404 e non 403: è lo stesso niente che l'elenco
    mostra.
    """
    return get_visible_or_404(db, admin, simulation_id, include_drafts=True)


def _target_organization(db: Session, admin: User, requested: UUID | None) -> Organization:
    """Il tenant a cui una simulazione appartiene, deciso dal server.

    L'organization admin non lo nomina: è il proprio, e quello che chiede
    viene ignorato invece che obbedito. Il super admin deve nominarlo,
    perché una simulazione di "tutte le organizzazioni" non esiste: la
    svolge la gente di un tenant solo, e i suoi tentativi sono loro.
    """
    scope_org_id = resolve_admin_scope(admin, requested)
    if scope_org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Specificare l'organizzazione a cui la simulazione appartiene.",
        )
    organization = db.query(Organization).filter(Organization.id == scope_org_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organizzazione non trovata."
        )
    return organization


def _admin_response(
    simulation: TechnicalSimulation, question_count: int, stats: dict | None = None
) -> dict:
    """La riga dell'elenco con la firma di chi l'ha scritta.

    Le quattro colonne di paternità le scrive il listener di ``authorship``
    su ogni scrittura, qui si leggono e basta: escono solo dalle risposte
    dell'amministrazione, come per utenti, organizzazioni e avatar.
    """
    return {
        **to_response(simulation, question_count, stats),
        "created_by_email": simulation.created_by_email,
        "updated_by_email": simulation.updated_by_email,
    }


def _admin_detail(db: Session, simulation: TechnicalSimulation, admin: User) -> dict:
    stats = attempt_stats(db, admin.id, [simulation.id])
    total_attempts = (
        db.query(SimulationAttempt).filter(SimulationAttempt.simulation_id == simulation.id).count()
    )
    return {
        **_admin_response(simulation, len(simulation.questions), stats.get(simulation.id)),
        "questions": [
            SimulationQuestionAdminResponse(
                id=q.id,
                position=q.position,
                text=q.text,
                options=q.options or [],
                correct_option=q.correct_option,
                expected_answer=q.expected_answer,
                # In ordine e non mescolati, al contrario di come li riceve
                # chi svolge il test: qui la chiave si rilegge, non si
                # indovina
                ordered_steps=q.ordered_steps,
                pairs=q.pairs,
                explanation=q.explanation,
                source_chunks=q.source_chunks,
            )
            for q in simulation.questions
        ],
        "chunk_count": len(simulation.chunks),
        "total_attempts": total_attempts,
        "review": _review_response(simulation),
    }


def _review_response(simulation: TechnicalSimulation) -> dict | None:
    """L'esito dell'ultimo controllo, con la sola cosa che si ricava in lettura.

    Viaggia dentro il dettaglio e non da una rotta sua: chi apre il pannello
    di revisione vuole le domande e l'esito insieme, e una seconda chiamata
    sarebbe un secondo momento in cui i due possono non corrispondere.

    None quando nessuno lo ha ancora chiesto, che è diverso da un controllo
    passato senza rilievi: quello è un esito con la lista vuota, ed è una
    notizia.
    """
    if simulation.review_report is None or simulation.review_at is None:
        return None
    report = simulation.review_report or {}
    return {
        "findings": report.get("findings") or [],
        "checked": report.get("checked") or 0,
        "reviewed_at": simulation.review_at,
        "is_stale": simulation_review.is_stale(simulation),
    }


async def _read_upload(file: UploadFile) -> bytes:
    """Il file caricato, se è di un formato leggibile e non è troppo grande.

    I tre controlli stanno insieme perché sono la stessa domanda posta a un
    upload: si legge? Il caricamento iniziale e la sostituzione del documento
    la pongono uguale, e una versione sola evita che il tetto cambiato in un
    posto resti vecchio nell'altro.
    """
    if not document_text.is_supported(file.filename or ""):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato non supportato: carica un file PDF, DOCX, TXT o Markdown.",
        )
    data = await file.read(document_text.MAX_DOCUMENT_BYTES + 1)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Il file caricato è vuoto."
        )
    if len(data) > document_text.MAX_DOCUMENT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=(
                "Il documento non può superare "
                f"{document_text.MAX_DOCUMENT_BYTES // (1024 * 1024)} MB."
            ),
        )
    return data


def _unfinished_question(simulation: TechnicalSimulation) -> str | None:
    """La prima domanda a metà, descritta, o None se sono tutte finite.

    Salvare una domanda incompleta si può, ed è quello che permette a chi ne
    sta scrivendo trenta di fermarsi alla decima. Pubblicarla no: una
    domanda senza la risposta corretta segnata arriverebbe a chi svolge il
    test come una domanda che nessuna scelta indovina.

    Il controllo è qui e non nello schema del payload perché cosa manchi
    dipende dal tipo del test, che il payload non porta con sé (vedi
    ``SimulationQuestionPayload``).
    """
    for question in simulation.questions:
        position = question.position
        if not question.text.strip():
            return f"La domanda {position} non ha il testo."
        if simulation.is_open:
            if not (question.expected_answer or "").strip():
                return f"La domanda {position} non ha la risposta attesa."
            continue
        if simulation.is_ordering:
            steps = question.ordered_steps or []
            if any(not str(s).strip() for s in steps):
                return f"La domanda {position} ha un passo vuoto."
            # Due passi uguali sono due risposte giuste, e chi risponde non
            # avrebbe modo di sapere quale delle due il test si aspetta
            if _duplicated([str(s) for s in steps]):
                return f"La domanda {position} ha due passi uguali."
            continue
        if simulation.is_matching:
            pairs = list(question.pairs or [])
            if any(not str(p.get("left") or "").strip() for p in pairs):
                return f"La domanda {position} ha una voce da abbinare vuota."
            if any(not str(p.get("right") or "").strip() for p in pairs):
                return f"La domanda {position} ha un abbinamento vuoto."
            # Come sopra, ma su una colonna sola: un elemento di destra che
            # vale per due voci di sinistra fa sbagliare chi sa la procedura
            if _duplicated([str(p.get("left")) for p in pairs]):
                return f"La domanda {position} ha due voci uguali da abbinare."
            if _duplicated([str(p.get("right")) for p in pairs]):
                return f"La domanda {position} ha due abbinamenti uguali."
            continue
        options = question.options or []
        if any(not str(o).strip() for o in options):
            return f"La domanda {position} ha un'alternativa vuota."
        if question.correct_option is None:
            return f"La domanda {position} non ha la risposta corretta segnata."
    return None


def _duplicated(values: list[str]) -> bool:
    """Se due elementi sono lo stesso testo, a meno di spazi e maiuscole."""
    keys = [" ".join(v.split()).casefold() for v in values]
    return len(set(keys)) != len(keys)


def _missing_key(
    simulation: TechnicalSimulation, question: SimulationQuestionPayload
) -> str | None:
    """Perché questa domanda non è del tipo del suo test, o None se lo è.

    È un controllo di forma e non di contenuto: si guarda che la chiave del
    tipo ci sia, non che sia scritta bene. Una domanda a scelta multipla
    senza alternative non è una domanda a metà, è una domanda di un altro
    test, e salvarla vorrebbe dire mandare a chi risponde qualcosa che
    nessuna risposta indovina.

    La frase torna senza soggetto perché il chiamante ci mette davanti il
    numero della domanda, che è la sola cosa che permette di trovarla in un
    elenco da cinquanta.
    """
    if simulation.is_open:
        return None
    if simulation.is_ordering:
        if question.ordered_steps is None:
            return "non ha i passi da rimettere in ordine."
        return None
    if simulation.is_matching:
        if question.pairs is None:
            return "non ha le coppie da abbinare."
        return None
    if question.options is None:
        return "non ha le alternative fra cui scegliere."
    return None


def _key_columns(kind: str, question: SimulationQuestionPayload) -> dict:
    """Le colonne della chiave da scrivere, piena quella del tipo del test.

    Le altre restano vuote di proposito, anche quando il payload le porta:
    una traccia della risposta attesa salvata su un test a scelta multipla
    non la leggerebbe nessuno, e resterebbe lì a contraddire la domanda il
    giorno in cui qualcuno va a guardare la riga.
    """
    empty = {
        "options": None,
        "correct_option": None,
        "expected_answer": "",
        "ordered_steps": None,
        "pairs": None,
    }
    if kind == SIMULATION_KIND_OPEN:
        return {**empty, "expected_answer": question.expected_answer.strip()}
    if kind == SIMULATION_KIND_ORDERING:
        return {**empty, "ordered_steps": question.ordered_steps}
    if kind == SIMULATION_KIND_MATCHING:
        return {**empty, "pairs": [p.model_dump() for p in question.pairs or []]}
    return {**empty, "options": question.options, "correct_option": question.correct_option}


def _require_document_source(simulation: TechnicalSimulation) -> None:
    """Ferma le operazioni sul documento di una simulazione che non ne ha.

    Generare le domande e sostituire il documento sono gesti che presuppongono
    un documento. Su una simulazione scritta a mano non ce n'è mai stato uno,
    e la strada per averlo non è caricarlo qui: è creare una simulazione
    nuova, perché le domande scritte a mano non diventano domande generate
    solo perché adesso c'è un file da cui avrebbero potuto nascere.
    """
    if simulation.is_manual:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Questa simulazione ha le domande scritte a mano e non ha un documento. "
                "Per generarle da un documento, creane una nuova."
            ),
        )


def _document_chunks(filename: str, data: bytes) -> tuple[str, list[str]]:
    """Il testo del documento e i passaggi in cui è diviso.

    Gira in un thread (vedi ``_index_document``) perché è l'unico pezzo di
    questa applicazione che occupa il processore invece di aspettare
    qualcuno: aprire un PDF di dieci megabyte e ricavarne il testo sono
    secondi di calcolo, e fatti sull'event loop sono secondi in cui su
    questa replica non parla nessuno.
    """
    try:
        text = document_text.extract_text(filename, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossibile leggere il documento: {e!s}",
        )
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Il documento non contiene testo leggibile. Se è un PDF di pagine scansionate, "
                "serve una versione con il testo selezionabile."
            ),
        )
    return text, split_into_chunks(text)


def _store_chunks(
    db: Session,
    simulation: TechnicalSimulation,
    filename: str,
    text: str,
    chunks: list[str],
    embeddings: list,
) -> None:
    """Blocking write of the indexed passages (run via asyncio.to_thread).

    Non committa: chi chiama sta ancora componendo la simulazione, e il
    documento e la riga che lo possiede si salvano insieme o non si salvano.
    """
    simulation.document_name = filename
    simulation.document_text = text
    db.query(SimulationChunk).filter(SimulationChunk.simulation_id == simulation.id).delete()
    for ordinal, (content, embedding) in enumerate(zip(chunks, embeddings, strict=True), start=1):
        db.add(
            SimulationChunk(
                simulation_id=simulation.id,
                ordinal=ordinal,
                content=content,
                embedding=embedding,
            )
        )


async def _index_document(
    db: Session, simulation: TechnicalSimulation, filename: str, data: bytes, admin_id: UUID
) -> None:
    """Legge il documento, lo spezza in passaggi e li indicizza.

    Ricaricare un documento cancella i passaggi di prima e non le domande:
    le domande sono il test, e un test non si azzera perché è stata caricata
    una versione aggiornata della procedura. Restano lì, con le loro
    citazioni che puntano ai passaggi nuovi, ed è chi amministra a decidere
    se rigenerarle.

    Tre momenti, e solo quello di mezzo sta sull'event loop: la lettura del
    file è calcolo, la scrittura dei passaggi è una chiamata bloccante al
    database, e tutte e due girano in un thread. In mezzo c'è l'attesa dei
    vettori, che è la cosa per cui l'event loop esiste.
    """
    text, chunks = await asyncio.to_thread(_document_chunks, filename, data)
    # Dopo la lettura del file e prima della chiamata a pagamento: un
    # documento illeggibile è un errore di chi carica, e non deve consumare
    # il tetto di una cosa che non è mai partita.
    await llm_limits.consume(llm_limits.INDICIZZAZIONE, admin_id)
    try:
        embeddings = await embed_texts(chunks)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    await asyncio.to_thread(_store_chunks, db, simulation, filename, text, chunks, embeddings)


def _insert_simulation(
    db: Session,
    organization_id: UUID,
    title: str,
    description: str | None,
    kind: str,
    source: str,
) -> TechnicalSimulation:
    """Blocking insert of a simulation still being composed (run via asyncio.to_thread).

    Flush e non commit: quello che manca (il documento, i suoi passaggi)
    arriva subito dopo, e la riga e il suo documento si salvano insieme.
    """
    simulation = TechnicalSimulation(
        organization_id=organization_id,
        title=title,
        description=description,
        status=SIMULATION_STATUS_DRAFT,
        kind=kind,
        source=source,
    )
    db.add(simulation)
    db.flush()
    return simulation


def _commit_detail(db: Session, simulation: TechnicalSimulation, admin: User) -> dict:
    """Blocking commit, then the full card (run via asyncio.to_thread).

    Le due cose insieme perché sono inseparabili: la scheda si compone di
    domande, passaggi e statistiche riletti dal database, e comporla fuori
    di qui vorrebbe dire farlo sull'event loop, per giunta su una riga
    appena scaduta dal commit.
    """
    db.commit()
    db.refresh(simulation)
    return _admin_detail(db, simulation, admin)


@router.get("", response_model=list[AdminSimulationResponse])
def list_all_simulations(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Le simulazioni che questo admin amministra, bozze comprese.

    Tutte quelle di tutti i tenant per il super admin, quelle della propria
    organizzazione per un organization admin.
    """
    simulations = (
        visible_query(db, current_admin, include_drafts=True)
        .order_by(TechnicalSimulation.created_at.desc())
        .all()
    )
    ids = [s.id for s in simulations]
    # Il serbatoio si conta con una query sola: qui le domande non si
    # mostrano, se ne scrive il numero, e leggerle davvero vorrebbe dire
    # cinquanta righe di documento per ogni riga della tabella.
    counts = question_counts(db, ids)
    stats = attempt_stats(db, current_admin.id, ids)
    return [_admin_response(s, counts.get(s.id, 0), stats.get(s.id)) for s in simulations]


@router.get("/{simulation_id}", response_model=SimulationAdminDetailResponse)
def get_simulation_admin(
    simulation_id: UUID,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """La simulazione con le risposte esatte e il documento da cui nasce."""
    return _admin_detail(db, _scoped_or_404(db, current_admin, simulation_id), current_admin)


@router.post("", response_model=SimulationAdminDetailResponse, status_code=201)
async def create_simulation(
    http_request: Request,
    organization_id: UUID | None = Form(None),
    title: str = Form(...),
    description: str = Form(""),
    kind: str = Form(SIMULATION_KIND_MULTIPLE),
    source: str = Form(SIMULATION_SOURCE_AI),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Crea una simulazione, dal documento caricato o vuota da riempire.

    Con le domande generate nasce in bozza e senza domande: generarle è il
    passo successivo, e tenerlo separato significa che un modello non
    disponibile non fa perdere il documento appena caricato.

    Con le domande scritte a mano nasce in bozza, senza domande e senza
    documento: il documento serviva al modello per scrivere, e qui a scrivere
    è il docente. Quello che manca è lo stesso in tutti e due i casi, e il
    passo successivo è lo stesso pannello.

    Il tipo si sceglie qui perché è quello che le domande saranno: alternative
    con una giusta, oppure una traccia di risposta attesa. Non si cambia più
    (vedi ``update_simulation``), e nemmeno chi le scrive.

    L'organizzazione la nomina solo il super admin: per un organization
    admin è la propria, e il campo che arriva non viene guardato (vedi
    ``_target_organization``).
    """
    title = title.strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Il titolo è obbligatorio."
        )
    if kind not in ALL_SIMULATION_KINDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Tipo di test non valido: {kind}"
        )
    if source not in ALL_SIMULATION_SOURCES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Origine delle domande non valida: {source}",
        )
    organization = await asyncio.to_thread(_target_organization, db, current_admin, organization_id)

    manual = source == SIMULATION_SOURCE_MANUAL
    if manual and file is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un test scritto a mano non ha un documento da cui ricavare le domande.",
        )
    if not manual and file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Serve il documento da cui ricavare le domande.",
        )
    data = None if file is None else await _read_upload(file)

    simulation = await asyncio.to_thread(
        _insert_simulation,
        db,
        organization.id,
        title,
        description.strip() or None,
        kind,
        source,
    )
    if file is not None and data is not None:
        await _index_document(db, simulation, file.filename or "documento", data, current_admin.id)

    # Letto prima del commit, che fa scadere la riga: dopo, chiedere questo
    # campo sarebbe una query in più fatta dall'event loop.
    documento = simulation.document_name or "scritto a mano"
    detail = await asyncio.to_thread(_commit_detail, db, simulation, current_admin)

    audit.describe(http_request, titolo=title, documento=documento)
    return detail


@router.post("/{simulation_id}/document", response_model=SimulationAdminDetailResponse)
async def replace_document(
    simulation_id: UUID,
    http_request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Sostituisce il documento e reindicizza i passaggi."""
    simulation = await asyncio.to_thread(_scoped_or_404, db, current_admin, simulation_id)
    _require_document_source(simulation)
    data = await _read_upload(file)
    await _index_document(db, simulation, file.filename or "documento", data, current_admin.id)

    # Letti prima del commit, che fa scadere la riga.
    titolo, documento = simulation.title, simulation.document_name
    detail = await asyncio.to_thread(_commit_detail, db, simulation, current_admin)

    audit.describe(http_request, titolo=titolo, documento=documento)
    return detail


@dataclass(frozen=True)
class _GenerationInput:
    """Il documento indicizzato come lo legge il generatore, in soli valori."""

    contents: list[str]
    embeddings: list
    kind: str
    title: str


def _generation_input(db: Session, admin: User, simulation_id: UUID) -> _GenerationInput:
    """Blocking read of the passages questions are born from (run via asyncio.to_thread).

    Finisce con il commit che restituisce la connessione: quella che segue è
    l'attesa più lunga dell'applicazione, cinque scritture in parallelo su un
    modello di ragionamento, e per tutti quei minuti il database non serve.
    Tenerlo occupato voleva dire una connessione ferma per ogni generazione
    in corso, su un pool che è condiviso con i login e con tutto il resto.
    """
    simulation = _scoped_or_404(db, admin, simulation_id)
    _require_document_source(simulation)
    chunks = simulation.chunks
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nessun documento indicizzato per questa simulazione.",
        )

    material = _GenerationInput(
        contents=[c.content for c in chunks],
        embeddings=[c.embedding for c in chunks],
        kind=simulation.kind,
        title=simulation.title,
    )
    db.commit()
    return material


def _store_questions(db: Session, admin: User, simulation_id: UUID, generated: list[dict]) -> dict:
    """Blocking write of a fresh question pool (run via asyncio.to_thread)."""
    # Ricaricata e non riusata: dopo il commit di prima l'oggetto è staccato
    # dalla sessione, e il controllo del tenant si rifà da sé.
    simulation = _scoped_or_404(db, admin, simulation_id)

    db.query(SimulationQuestion).filter(SimulationQuestion.simulation_id == simulation.id).delete()
    for position, question in enumerate(generated, start=1):
        db.add(
            SimulationQuestion(
                simulation_id=simulation.id,
                position=position,
                text=question["text"],
                options=question["options"],
                correct_option=question["correct_option"],
                expected_answer=question["expected_answer"],
                ordered_steps=question["ordered_steps"],
                pairs=question["pairs"],
                explanation=question["explanation"],
                source_chunks=question["source_chunks"],
            )
        )
    simulation.status = SIMULATION_STATUS_DRAFT
    return _commit_detail(db, simulation, admin)


@router.post("/{simulation_id}/generate", response_model=SimulationAdminDetailResponse)
async def generate_simulation_questions(
    simulation_id: UUID,
    http_request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Genera il serbatoio di domande dal documento, sostituendo quello che
    c'era.

    Cinquanta domande, non dieci: dieci sono quelle che ogni tentativo
    estrae a caso al momento di cominciare. Se il modello ne restituisce
    meno, quelle che ci sono si scrivono lo stesso e la simulazione resta in
    bozza, che è il posto in cui chi amministra decide se rigenerare o
    completare a mano.

    Rigenerare riporta la simulazione in bozza anche se era pubblicata: le
    domande nuove non le ha ancora lette nessuno, e la revisione umana prima
    della pubblicazione è la regola, non un passaggio da saltare quando si ha
    fretta. I tentativi già consegnati non ne risentono, perché ognuno porta
    con sé la fotografia delle domande che ha ricevuto.
    """
    await llm_limits.consume(llm_limits.GENERAZIONE_DOMANDE, current_admin.id)

    material = await asyncio.to_thread(_generation_input, db, current_admin, simulation_id)

    try:
        generated = await generate_questions(material.contents, material.embeddings, material.kind)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    detail = await asyncio.to_thread(_store_questions, db, current_admin, simulation_id, generated)

    audit.describe(http_request, titolo=material.title, domande=len(generated))
    return detail


@dataclass(frozen=True)
class _ReviewInput:
    """Il serbatoio da controllare, staccato dalla sessione."""

    questions: list
    chunks: list
    fingerprint: str
    kind: str
    title: str


def _review_input(db: Session, admin: User, simulation_id: UUID) -> _ReviewInput:
    """Blocking read of the pool to check (run via asyncio.to_thread).

    Il serbatoio si stacca dalla sessione prima dell'attesa, e l'impronta si
    calcola su questa fotografia: è quella che dirà, più avanti, se l'esito
    parla ancora del serbatoio che qualcuno sta guardando.

    Come per la valutazione e per le altre chiamate lunghe: per tutti i
    secondi in cui si aspetta il modello il database non serve, e in aula le
    connessioni sono contate.
    """
    simulation = _scoped_or_404(db, admin, simulation_id)
    if not simulation.questions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Non c'è ancora nessuna domanda da controllare.",
        )

    questions = simulation_review.snapshot(simulation.questions)
    material = _ReviewInput(
        questions=questions,
        chunks=[simulation_review.ReviewChunk(c.ordinal, c.content) for c in simulation.chunks],
        fingerprint=simulation_review.fingerprint(questions),
        kind=simulation.kind,
        title=simulation.title,
    )
    db.commit()
    return material


def _local_findings(questions: list, embeddings: list) -> list:
    """Le segnalazioni che si ricavano senza chiedere niente a nessuno.

    Gira in un thread perché è calcolo e non attesa: i doppioni si trovano
    confrontando ogni domanda con ogni altra, cioè più di mille prodotti
    scalari fra vettori da millecinquecento numeri, fatti in Python. Sono
    decimi di secondo, ed è lo stesso event loop su cui in quel momento
    stanno passando delle telefonate.
    """
    findings = simulation_review.duplicate_findings([q.position for q in questions], embeddings)
    return findings + simulation_review.option_findings(questions)


def _store_review(
    db: Session, admin: User, simulation_id: UUID, report: dict, fingerprint: str
) -> dict:
    """Blocking write of the review outcome (run via asyncio.to_thread)."""
    # Ricaricata e non riusata: dopo il commit di prima l'oggetto è staccato.
    simulation = _scoped_or_404(db, admin, simulation_id)
    simulation.review_report = report
    simulation.review_at = datetime.now(UTC).replace(tzinfo=None)
    simulation.review_fingerprint = fingerprint
    return _commit_detail(db, simulation, admin)


@router.post("/{simulation_id}/review", response_model=SimulationAdminDetailResponse)
async def review_question_pool(
    simulation_id: UUID,
    http_request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Controlla il serbatoio e salva l'esito, sostituendo il precedente.

    **Non blocca niente.** La pubblicazione resta possibile con tutte le
    segnalazioni aperte, e le regole che la fermano restano quelle di prima:
    il serbatoio pieno e nessuna domanda a metà. Questo dice da quale delle
    cinquanta domande conviene cominciare a rileggere, che è l'unica cosa che
    mancava alla revisione umana.

    Tre controlli in una richiesta sola, perché sono la stessa domanda posta
    a un serbatoio: due domande che chiedono la stessa cosa, una risposta che
    il documento non sostiene, e le alternative che si riconoscono senza
    sapere la procedura. I primi due costano, e per questo si chiede a mano
    invece di girare da solo a ogni salvataggio: rifarlo a ogni virgola
    corretta sarebbe una chiamata a pagamento fatta da nessuno.
    """
    await llm_limits.consume(llm_limits.REVISIONE_SERBATOIO, current_admin.id)

    material = await asyncio.to_thread(_review_input, db, current_admin, simulation_id)

    try:
        embeddings = await embed_texts([q.text for q in material.questions])
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    findings = await asyncio.to_thread(_local_findings, material.questions, embeddings)
    # La passata del modello vale solo dove c'è un documento: su una
    # simulazione scritta a mano non c'è niente da cui una domanda debba
    # essere sostenuta, e la lista esce vuota da sé.
    findings += await grounding_findings(material.questions, material.chunks, material.kind)

    report = simulation_review.build_report(
        findings, verifiable_count(material.questions, material.chunks)
    )
    detail = await asyncio.to_thread(
        _store_review, db, current_admin, simulation_id, report, material.fingerprint
    )

    audit.describe(http_request, titolo=material.title, segnalazioni=len(findings))
    return detail


@router.put("/{simulation_id}", response_model=SimulationAdminDetailResponse)
def update_simulation(
    simulation_id: UUID,
    payload: SimulationUpdateRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Titolo e descrizione, e nient'altro.

    Il tenant non si cambia: una simulazione che cambia organizzazione si
    porterebbe dietro i tentativi di persone che nell'organizzazione nuova
    non esistono. Nemmeno il tipo: le domande sono già nate dell'una forma o
    dell'altra, e cambiarlo vorrebbe dire buttarle senza dirlo.
    """
    simulation = _scoped_or_404(db, current_admin, simulation_id)
    # Come alla creazione: un titolo di soli spazi passa la lunghezza minima
    # dello schema e diventa vuoto qui, e una riga senza titolo non si
    # riconosce più né in tabella né nell'elenco di chi il test lo deve
    # svolgere.
    title = payload.title.strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Il titolo è obbligatorio."
        )
    simulation.title = title
    simulation.description = (payload.description or "").strip() or None
    db.commit()
    db.refresh(simulation)
    audit.describe(http_request, titolo=simulation.title)
    return _admin_detail(db, simulation, current_admin)


@router.put("/{simulation_id}/questions", response_model=SimulationAdminDetailResponse)
def save_questions(
    simulation_id: UUID,
    payload: SimulationQuestionsPayload,
    http_request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Salva le domande riviste da chi amministra, in blocco.

    Le righe di prima si cancellano e si riscrivono invece di aggiornarle una
    per una: le domande arrivano già nell'ordine giusto, e riscriverle tutte
    rende impossibile lasciarne indietro una che l'admin aveva tolto. I
    tentativi già consegnati non puntano a queste righe, li porta con sé la
    loro fotografia.

    La chiave che una domanda deve portare dipende dal tipo del test, e il
    tipo si sa qui e non nel payload (vedi ``SimulationQuestionPayload``):
    alternative con l'indice di quella giusta, la traccia della risposta
    attesa, i passi in ordine, le coppie. Quelle degli altri tipi, se
    arrivano, si buttano invece di restare scritte in colonne che nessuno
    leggerà più.

    Qui si controlla la forma e non il contenuto: che una domanda a scelta
    multipla porti delle alternative, non che siano scritte. Una domanda a
    metà si salva, perché chi ne sta scrivendo trenta deve potersi fermare
    alla decima; a pretenderle finite è la pubblicazione (vedi
    ``update_status``).
    """
    simulation = _scoped_or_404(db, current_admin, simulation_id)
    for position, question in enumerate(payload.questions, start=1):
        missing = _missing_key(simulation, question)
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"La domanda {position} {missing}",
            )

    # Le citazioni al documento si conservano dove la domanda è rimasta la
    # stessa: sono ordinali di passaggi, non qualcosa che chi amministra
    # possa riscrivere nel form, e perderle a ogni correzione di un refuso
    # toglierebbe a chi sbaglia il rimando alla procedura.
    previous = {q.position: q for q in simulation.questions}
    db.query(SimulationQuestion).filter(SimulationQuestion.simulation_id == simulation.id).delete()
    for position, question in enumerate(payload.questions, start=1):
        old = previous.get(position)
        db.add(
            SimulationQuestion(
                simulation_id=simulation.id,
                position=position,
                text=question.text.strip(),
                **_key_columns(simulation.kind, question),
                explanation=question.explanation.strip(),
                source_chunks=old.source_chunks
                if old and old.text == question.text.strip()
                else None,
            )
        )
    db.commit()
    db.refresh(simulation)
    audit.describe(http_request, titolo=simulation.title, domande=len(payload.questions))
    return _admin_detail(db, simulation, current_admin)


@router.put("/{simulation_id}/status", response_model=SimulationAdminDetailResponse)
def update_status(
    simulation_id: UUID,
    payload: SimulationStatusRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Pubblica la simulazione o la ritira.

    Pubblicare chiede il serbatoio: cinquanta domande su una simulazione
    generata, di cui ogni tentativo ne estrarrà dieci. Il numero non è quello
    che chi svolge il test vede, è quello che rende diversa una prova dalla
    successiva, e pubblicarne una con venti domande vorrebbe dire un test che
    al terzo tentativo è già tutto noto. Su una scritta a mano il minimo è
    dieci, perché lì ogni domanda è tempo di qualcuno (vedi
    ``TechnicalSimulation.required_pool``).

    E le pretende finite, non solo contate: una domanda a metà si salva ma non
    si pubblica (vedi ``_unfinished_question``). Il messaggio dice quale, ed è
    l'unico modo perché chi ha davanti cinquanta domande sappia dove guardare.

    Ritirare invece non chiede niente, ed è la ragione per cui esiste: quando
    c'è qualcosa che non va, il primo gesto deve poter essere toglierla di
    mezzo.
    """
    simulation = _scoped_or_404(db, current_admin, simulation_id)
    if payload.status != SIMULATION_STATUS_DRAFT:
        required = simulation.required_pool
        if len(simulation.questions) < required:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Servono {required} domande per pubblicare: "
                    f"ce ne sono {len(simulation.questions)}."
                ),
            )
        unfinished = _unfinished_question(simulation)
        if unfinished:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=unfinished)
    simulation.status = payload.status
    db.commit()
    db.refresh(simulation)
    audit.describe(http_request, titolo=simulation.title, stato=payload.status)
    return _admin_detail(db, simulation, current_admin)


@router.delete("/{simulation_id}", response_model=MessageResponse)
def delete_simulation(
    simulation_id: UUID,
    http_request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Elimina la simulazione con i suoi passaggi, domande e tentativi.

    Definitiva, al contrario dell'archiviazione di un avatar: un avatar
    archiviato deve sopravvivere alle conversazioni che ci sono state giocate
    contro, mentre un tentativo si porta dietro la propria fotografia e non
    ha bisogno che la simulazione esista ancora. Chi vuole solo toglierla di
    mezzo la ritira.
    """
    simulation = _scoped_or_404(db, current_admin, simulation_id)
    audit.describe(http_request, titolo=simulation.title)
    db.delete(simulation)
    db.commit()
    return MessageResponse(message="Simulazione eliminata.")
