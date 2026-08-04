"""La creazione delle simulazioni tecniche, riservata al super admin.

Il ciclo di vita di una simulazione, in tre momenti distinti e in
quest'ordine, che è anche il motivo per cui sono tre chiamate e non una:

1. il caricamento del documento, che lo legge, lo spezza in passaggi e li
   indicizza (secondi);
2. la generazione delle domande, che sono due chiamate a un modello di
   ragionamento e possono prendersi minuti;
3. la revisione umana e la pubblicazione.

Separarli non è pignoleria: se fossero un'unica richiesta, un modello lento
riporterebbe indietro un errore dopo tre minuti lasciando il super admin
senza niente, documento compreso. Così un caricamento riuscito resta
riuscito, e una generazione che va storta si rilancia da sola.

Il passo 3 è la ragione per cui esiste lo stato di bozza. Le domande le
scrive una macchina che ha letto il documento, e quasi sempre le scrive bene:
"quasi sempre" è esattamente il motivo per cui nessuno le vede prima che un
umano le abbia rilette. Finché la simulazione è in bozza esiste solo qui.
"""

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
from auth_dependency import get_current_super_admin
from database import get_db
from models import (
    SIMULATION_QUESTION_COUNT,
    SIMULATION_STATUS_DRAFT,
    Organization,
    SimulationAttempt,
    SimulationChunk,
    SimulationQuestion,
    TechnicalSimulation,
    User,
)
from openai_service import embed_texts
from routers.simulations import attempt_stats, to_response
from schemas import (
    AdminSimulationResponse,
    MessageResponse,
    SimulationAdminDetailResponse,
    SimulationQuestionAdminResponse,
    SimulationQuestionsPayload,
    SimulationStatusRequest,
    SimulationUpdateRequest,
)
from simulation_questions import generate_questions
from simulation_rag import split_into_chunks

router = APIRouter(prefix="/api/admin/simulations", tags=["admin-simulations"])


def _get_or_404(db: Session, simulation_id: UUID) -> TechnicalSimulation:
    simulation = (
        db.query(TechnicalSimulation).filter(TechnicalSimulation.id == simulation_id).first()
    )
    if not simulation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Simulazione non trovata."
        )
    return simulation


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
                options=q.options,
                correct_option=q.correct_option,
                explanation=q.explanation,
                source_chunks=q.source_chunks,
            )
            for q in simulation.questions
        ],
        "document_text": simulation.document_text,
        "chunk_count": len(simulation.chunks),
        "total_attempts": total_attempts,
    }


async def _index_document(
    db: Session, simulation: TechnicalSimulation, filename: str, data: bytes
) -> None:
    """Legge il documento, lo spezza in passaggi e li indicizza.

    Ricaricare un documento cancella i passaggi di prima e non le domande:
    le domande sono il test, e un test non si azzera perché è stata caricata
    una versione aggiornata della procedura. Restano lì, con le loro
    citazioni che puntano ai passaggi nuovi, ed è il super admin a decidere
    se rigenerarle.
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

    chunks = split_into_chunks(text)
    try:
        embeddings = await embed_texts(chunks)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

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


@router.get("", response_model=list[AdminSimulationResponse])
def list_all_simulations(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin),
):
    """Tutte le simulazioni di tutti i tenant, bozze comprese."""
    simulations = (
        db.query(TechnicalSimulation).order_by(TechnicalSimulation.created_at.desc()).all()
    )
    stats = attempt_stats(db, current_admin.id, [s.id for s in simulations])
    return [_admin_response(s, len(s.questions), stats.get(s.id)) for s in simulations]


@router.get("/{simulation_id}", response_model=SimulationAdminDetailResponse)
def get_simulation_admin(
    simulation_id: UUID,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin),
):
    """La simulazione con le risposte esatte e il documento da cui nasce."""
    return _admin_detail(db, _get_or_404(db, simulation_id), current_admin)


@router.post("", response_model=SimulationAdminDetailResponse, status_code=201)
async def create_simulation(
    http_request: Request,
    organization_id: UUID = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin),
):
    """Crea una simulazione dal documento caricato, senza ancora le domande.

    Nasce in bozza e senza domande: generarle è il passo successivo, e
    tenerlo separato significa che un modello non disponibile non fa perdere
    il documento appena caricato.
    """
    title = title.strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Il titolo è obbligatorio."
        )
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organizzazione non trovata."
        )
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

    simulation = TechnicalSimulation(
        organization_id=organization_id,
        title=title,
        description=description.strip() or None,
        status=SIMULATION_STATUS_DRAFT,
    )
    db.add(simulation)
    db.flush()
    await _index_document(db, simulation, file.filename or "documento", data)
    db.commit()
    db.refresh(simulation)

    audit.describe(http_request, titolo=title, documento=simulation.document_name)
    return _admin_detail(db, simulation, current_admin)


@router.post("/{simulation_id}/document", response_model=SimulationAdminDetailResponse)
async def replace_document(
    simulation_id: UUID,
    http_request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin),
):
    """Sostituisce il documento e reindicizza i passaggi."""
    simulation = _get_or_404(db, simulation_id)
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

    await _index_document(db, simulation, file.filename or "documento", data)
    db.commit()
    db.refresh(simulation)
    audit.describe(http_request, titolo=simulation.title, documento=simulation.document_name)
    return _admin_detail(db, simulation, current_admin)


@router.post("/{simulation_id}/generate", response_model=SimulationAdminDetailResponse)
async def generate_simulation_questions(
    simulation_id: UUID,
    http_request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin),
):
    """Genera le domande dal documento, sostituendo quelle che c'erano.

    Rigenerare riporta la simulazione in bozza anche se era pubblicata: le
    domande nuove non le ha ancora lette nessuno, e la revisione umana prima
    della pubblicazione è la regola, non un passaggio da saltare quando si ha
    fretta. I tentativi già consegnati non ne risentono, perché ognuno porta
    con sé la fotografia delle domande che ha ricevuto.
    """
    simulation = _get_or_404(db, simulation_id)
    chunks = simulation.chunks
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nessun documento indicizzato per questa simulazione.",
        )

    try:
        generated = await generate_questions(
            [c.content for c in chunks], [c.embedding for c in chunks]
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    db.query(SimulationQuestion).filter(SimulationQuestion.simulation_id == simulation.id).delete()
    for position, question in enumerate(generated, start=1):
        db.add(
            SimulationQuestion(
                simulation_id=simulation.id,
                position=position,
                text=question["text"],
                options=question["options"],
                correct_option=question["correct_option"],
                explanation=question["explanation"],
                source_chunks=question["source_chunks"],
            )
        )
    simulation.status = SIMULATION_STATUS_DRAFT
    db.commit()
    db.refresh(simulation)

    audit.describe(http_request, titolo=simulation.title, domande=len(generated))
    return _admin_detail(db, simulation, current_admin)


@router.put("/{simulation_id}", response_model=SimulationAdminDetailResponse)
def update_simulation(
    simulation_id: UUID,
    payload: SimulationUpdateRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin),
):
    """Titolo e descrizione. Il tenant non si cambia: una simulazione che
    cambia organizzazione si porterebbe dietro i tentativi di persone che
    nell'organizzazione nuova non esistono."""
    simulation = _get_or_404(db, simulation_id)
    simulation.title = payload.title.strip()
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
    current_admin: User = Depends(get_current_super_admin),
):
    """Salva le domande riviste dal super admin, in blocco.

    Le righe di prima si cancellano e si riscrivono invece di aggiornarle una
    per una: le domande arrivano già nell'ordine giusto, e riscriverle tutte
    rende impossibile lasciarne indietro una che l'admin aveva tolto. I
    tentativi già consegnati non puntano a queste righe, li porta con sé la
    loro fotografia.
    """
    simulation = _get_or_404(db, simulation_id)
    # Le citazioni al documento si conservano dove la domanda è rimasta la
    # stessa: sono ordinali di passaggi, non qualcosa che il super admin
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
                options=question.options,
                correct_option=question.correct_option,
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
    current_admin: User = Depends(get_current_super_admin),
):
    """Pubblica la simulazione o la ritira.

    Pubblicare chiede il test completo: dieci domande, che è quello che la
    pagina promette a chi lo svolge. Ritirare invece non chiede niente, ed è
    la ragione per cui esiste: quando c'è qualcosa che non va, il primo
    gesto deve poter essere toglierla di mezzo.
    """
    simulation = _get_or_404(db, simulation_id)
    if payload.status != SIMULATION_STATUS_DRAFT and len(simulation.questions) < (
        SIMULATION_QUESTION_COUNT
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Servono {SIMULATION_QUESTION_COUNT} domande per pubblicare: "
                f"ce ne sono {len(simulation.questions)}."
            ),
        )
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
    current_admin: User = Depends(get_current_super_admin),
):
    """Elimina la simulazione con i suoi passaggi, domande e tentativi.

    Definitiva, al contrario dell'archiviazione di un avatar: un avatar
    archiviato deve sopravvivere alle conversazioni che ci sono state giocate
    contro, mentre un tentativo si porta dietro la propria fotografia e non
    ha bisogno che la simulazione esista ancora. Chi vuole solo toglierla di
    mezzo la ritira.
    """
    simulation = _get_or_404(db, simulation_id)
    audit.describe(http_request, titolo=simulation.title)
    db.delete(simulation)
    db.commit()
    return MessageResponse(message="Simulazione eliminata.")
