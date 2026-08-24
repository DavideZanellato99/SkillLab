"""I debriefing di una persona: rileggerli tutti, e farne scrivere uno nuovo.

Due rotte sole, e stanno in un file loro per la stessa ragione per cui ci
stanno quelle degli avatar e delle simulazioni: ``routers/admin`` amministra
gli account, questo amministra una cosa che si scrive **sugli** account, e
mescolarle vorrebbe dire un file in cui la creazione di un utente e una
chiamata a un modello di ragionamento si leggono di seguito.

Il confine è quello di sempre e viene da un punto solo: il super admin vede
tutti, un organization admin i propri, e una persona fuori dalla propria
organizzazione risponde 404 e non 403, perché chi non ha diritto di leggere
quella riga non ha diritto di sapere che esiste.

**Ogni generazione aggiunge, nessuna sostituisce.** La lettura restituisce
tutte le versioni dal più recente, e ciascuna arriva con lo scarto delle
medie rispetto a quella prima: la domanda che si fa chi apre questa
schermata non è "com'è messo", è "come si è mosso", e a quella risponde una
riga letta accanto alla precedente. Per la stessa ragione un quadro nuovo
non si scrive finché non c'è una prova nuova da leggere.

**Chi si allena non passa di qui.** Il debriefing è materiale di chi insegna:
dice cosa ripetere a voce a qualcuno, non è la pagella di quel qualcuno,
che invece è la valutazione e la revisione, e quelle lo studente le legge già
entrambe. Nell'esportazione dei dati personali il debriefing però c'è
(vedi ``personal_data``): chi può sfogliarlo nell'interfaccia e chi ha
diritto a una copia di quello che la piattaforma tiene su di sé sono due
domande diverse, e la seconda ha una sola risposta possibile.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

import audit
import debriefing_source
import llm_limits
from auth_dependency import get_current_admin, resolve_admin_scope
from database import get_db
from models import User, UserDebriefing
from schemas import UserDebriefingResponse
from user_debriefing import write_debriefing

router = APIRouter(prefix="/api/admin/users", tags=["admin"])


def _user_in_scope_or_404(db: Session, admin: User, user_id: UUID) -> User:
    """La persona, se chi chiede può vederla. 404 in ogni altro caso.

    Il filtro nasce da ``resolve_admin_scope`` e non da un controllo scritto
    qui: un organization admin che passa l'id di qualcuno di un altro tenant
    non riceve un rifiuto, riceve la stessa risposta che riceverebbe per un
    id inventato.
    """
    scope_org_id = resolve_admin_scope(admin)
    query = db.query(User).filter(User.id == user_id)
    if scope_org_id is not None:
        query = query.filter(User.organization_id == scope_org_id)
    user = query.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utente non trovato.")
    return user


def _response(
    db: Session,
    debriefing: UserDebriefing,
    previous: UserDebriefing | None,
    *,
    is_latest: bool,
) -> UserDebriefingResponse:
    """Un quadro salvato, più le due cose che si ricavano in lettura.

    Gli scarti delle medie e il segnale di vecchio. Il primo confronta due
    fotografie ferme, il secondo guarda le prove di adesso, e solo sul
    quadro più recente: su una versione vecchia dello storico "non ha visto
    le ultime prove" è ovvio e sarebbe rumore su ogni riga.
    """
    content = debriefing.content or {}
    facts = content.get("facts") or {}
    scarti = debriefing_source.deltas(debriefing, previous)
    return UserDebriefingResponse(
        id=debriefing.id,
        user_id=debriefing.user_id,
        summary=content.get("summary", ""),
        themes=content.get("themes") or [],
        improving=content.get("improving"),
        next_step=content.get("next_step", ""),
        direction=content.get("direction"),
        change=content.get("change"),
        covered_conversations=debriefing.covered_conversations,
        covered_attempts=debriefing.covered_attempts,
        covered_until=debriefing.covered_until,
        conversation_average=facts.get("conversation_average"),
        attempt_average=facts.get("attempt_average"),
        criteria_averages=[
            {**c, "delta": scarti.criteria.get(c.get("key"))}
            for c in facts.get("criteria_averages") or []
        ],
        conversation_average_delta=scarti.conversation_average,
        attempt_average_delta=scarti.attempt_average,
        is_stale=is_latest and debriefing_source.is_stale(db, debriefing),
        created_at=debriefing.created_at,
        requested_by=debriefing.created_by_email,
    )


def _history_response(db: Session, user_id: UUID) -> list[UserDebriefingResponse]:
    """Lo storico dal più recente, ciascuno confrontato con quello di prima.

    Il confronto si fa qui e non a una riga per volta perché la lista è già
    in mano: il quadro precedente di ciascuno è quello che lo segue
    nell'elenco, e chiederlo al database una volta per riga sarebbe una
    query per ogni versione mai scritta su quella persona.
    """
    rows = debriefing_source.history(db, user_id)
    return [
        _response(
            db,
            debriefing,
            rows[index + 1] if index + 1 < len(rows) else None,
            is_latest=index == 0,
        )
        for index, debriefing in enumerate(rows)
    ]


@router.get("/{user_id}/debriefings", response_model=list[UserDebriefingResponse])
def read_user_debriefings(
    user_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Tutti i quadri scritti su questa persona, dal più recente.

    Lista vuota e non 404: la persona esiste, semplicemente nessuno ha
    ancora fatto scrivere il suo quadro d'insieme, e quella è la schermata
    da cui lo si chiede. Il 404 resta per la persona che chi guarda non può
    vedere.

    Tutte le versioni in una richiesta sola, e non l'ultima con lo storico
    dietro un secondo comando: chi apre questa schermata vuole sapere se la
    persona sta migliorando, e quella risposta è la riga di adesso letta
    accanto a quelle di prima.
    """
    _user_in_scope_or_404(db, current_admin, user_id)
    return _history_response(db, user_id)


@router.post("/{user_id}/debriefings", response_model=UserDebriefingResponse)
async def generate_user_debriefing(
    user_id: UUID,
    http_request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Fa scrivere un nuovo quadro d'insieme su questa persona, e lo salva.

    Si aggiunge allo storico invece di sostituire il precedente, e il
    precedente entra nel materiale che il modello legge: il quadro nuovo
    dice anche come la persona si è mossa da allora, che è la sola cosa che
    una fotografia sola non può dire.

    Il tetto viene prima di tutto il resto, perché è l'unico controllo che
    parla del costo della richiesta invece che di cosa contiene, ed è una
    chiamata che si può rilanciare all'infinito sulla stessa persona.
    """
    await llm_limits.consume(llm_limits.DEBRIEFING, current_admin.id)

    user = _user_in_scope_or_404(db, current_admin, user_id)
    previous = debriefing_source.latest(db, user.id)
    material = debriefing_source.collect(db, user.id)

    if material.evidence_count < debriefing_source.MIN_EVIDENCE:
        # 409 e non 400: la persona esiste e la richiesta è scritta bene,
        # è lo stato delle cose a non permetterla ancora. Stessa forma della
        # simulazione che non si pubblica finché il serbatoio non è pieno, e
        # come lì il messaggio dice quante ne servono e quante ce ne sono.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Servono almeno {debriefing_source.MIN_EVIDENCE} prove svolte per un "
                f"quadro d'insieme, e questa persona ne ha {material.evidence_count}. "
                "Con meno prove il debriefing ripeterebbe le valutazioni che ci sono già."
            ),
        )

    if previous is not None and not debriefing_source.has_new_evidence(
        db, user.id, previous.covered_until
    ):
        # Stesso materiale, stesso prompt: quello che tornerebbe è il quadro
        # di prima riscritto con altre parole, e finirebbe nello storico
        # come una versione da confrontare con sé stessa. Che l'unica
        # differenza fra due righe sia il giro di frasi del modello è
        # esattamente ciò che rende illeggibile uno storico.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Questa persona non ha svolto nessuna prova dopo l'ultimo quadro d'insieme. "
                "Un quadro nuovo leggerebbe lo stesso materiale e direbbe le stesse cose."
            ),
        )

    audit.describe(
        http_request,
        conversations=material.conversations,
        attempts=material.attempts,
    )

    # La connessione torna al pool prima dell'attesa, come per la valutazione
    # di una conversazione: il modello di ragionamento qui legge cinque
    # trascrizioni intere prima di scrivere, quindi l'attesa è la più lunga
    # dell'applicazione dopo la generazione delle domande, e per tutto quel
    # tempo il database non serve. `material` è già fatto di soli valori
    # staccati dalla sessione, quindi sopravvive alla scadenza degli oggetti.
    #
    # `commit` e non `close`: tutti e due restituiscono la connessione, ma
    # close annulla la transazione in corso, e nei test quella transazione
    # contiene i dati che il test ha appena creato.
    db.commit()

    try:
        content = await write_debriefing(material)
    except RuntimeError as e:
        # Il fornitore non ha risposto, o non ha risposto niente di
        # utilizzabile: 502, come per la valutazione e per la bozza di scheda.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    # I numeri li ha calcolati il backend e non il modello, e vengono
    # salvati accanto al testo invece di essere ricalcolati in lettura: sono
    # quello che il modello aveva davanti, e una media che cambia sotto un
    # testo che non l'ha mai vista è il modo in cui i due si contraddicono.
    content["facts"] = {
        "conversation_average": material.conversation_average,
        "attempt_average": material.attempt_average,
        "criteria_averages": [
            {"key": c.key, "label": c.label, "average": c.average}
            for c in material.criteria_averages
        ],
    }

    # Ricaricato, non riusato: gli oggetti di prima sono staccati dalla
    # sessione dopo il commit.
    user = _user_in_scope_or_404(db, current_admin, user_id)
    debriefing = UserDebriefing(
        user_id=user.id,
        content=content,
        covered_until=material.covered_until,
        covered_conversations=material.conversations,
        covered_attempts=material.attempts,
    )
    db.add(debriefing)
    db.commit()
    db.refresh(debriefing)

    # Il precedente riletto dopo il commit, per la stessa ragione: quello di
    # prima dell'attesa è staccato, e gli scarti si calcolano sui suoi
    # numeri. È il secondo della lista, perché il primo è appena nato.
    storico = debriefing_source.history(db, user.id)
    return _response(
        db,
        debriefing,
        storico[1] if len(storico) > 1 else None,
        is_latest=True,
    )
