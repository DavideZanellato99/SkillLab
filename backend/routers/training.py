"""Training paths: composing them, handing them out, following them.

A path is a reusable model: an admin composes "Onboarding vendite" once, as
a numbered sequence of steps, and hands it to as many users as it wants.
Every step is a goal on one avatar or on one technical simulation, and the
next one only opens when the one before it has been passed, so a path is
read from top to bottom and never all at once.

That is what replaced the single goal this router used to hand out. One
avatar, one score, one user was fine as long as training was one
conversation; it could not say "first talk to this customer, then pass the
procedures test", which is what teaching a job actually looks like.

Both admin roles compose and assign: an organization admin is the one who
actually teaches its students, so waiting on the super admin to hand out
every path would put a stranger to the course in the middle of it. What
confines it is the tenant, here as everywhere else: a path belongs to one
organization, its steps can only point at that organization's avatars and
simulations, and it can only be handed to that organization's users. Every
read is scoped through ``resolve_admin_scope``, so an organization admin
never sees, assigns or deletes outside its own.

Progress is derived at read time and never stored: a step is passed when a
proof taken AFTER it unlocked reaches the target score, and the whole
derivation lives in ``training_progress``, since the notifications read the
very same steps.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

import audit
import llm_limits
from auth_dependency import (
    get_current_admin,
    get_current_standard_user,
    resolve_admin_scope,
)
from database import get_db
from models import (
    ROLE_USER,
    SIMULATION_STATUS_PUBLISHED,
    USER_STATUS_ACTIVE,
    Avatar,
    Organization,
    Role,
    TechnicalSimulation,
    TrainingPath,
    TrainingPathAssignment,
    TrainingPathStep,
    User,
)
from openai_service import EVALUATION_CRITERIA
from path_draft import CatalogAvatar, CatalogSimulation, draft_path
from routers.avatars import ensure_trainable
from schemas import (
    STEP_KIND_AVATAR,
    AssignableAvatar,
    AssignableContentResponse,
    AssignableCriterion,
    AssignableSimulation,
    MessageResponse,
    StepCriterionTarget,
    TrainingPathAssignmentCreate,
    TrainingPathAssignmentResponse,
    TrainingPathDraftRequest,
    TrainingPathDraftResponse,
    TrainingPathResponse,
    TrainingPathStepResponse,
    TrainingPathWrite,
    TrainingStepProgressResponse,
    UserResponse,
)
from training_progress import progress_of, proofs_by_key, step_kind

router = APIRouter(prefix="/api/training", tags=["training"])


# ── Come si legge una tappa ───────────────────────────
#
# Il percorso porta gli id, ma un elenco di id non si legge: il nome del
# bersaglio viaggia con la tappa, una volta sola, e le due schermate che la
# mostrano non hanno una seconda chiamata da fare.


# L'etichetta di ogni criterio, per chiave: le soglie di una tappa si salvano
# per chiave, e chi le legge deve vedere lo stesso nome che leggerà nel
# referto (vedi ``StepCriterionTarget``).
_CRITERION_LABELS = {key: label for key, label, _ in EVALUATION_CRITERIA}


def _criteria_targets(step: TrainingPathStep) -> list[StepCriterionTarget]:
    """Le soglie di una tappa, nell'ordine in cui i criteri stanno nel referto.

    L'ordine è quello canonico e non quello in cui sono state scritte: chi
    legge una tappa e chi legge un giudizio devono scorrere la stessa fila.

    Una chiave che nella lista canonica non c'è più esce comunque, in coda e
    con la propria chiave per nome: continua a valere come condizione (vedi
    ``training_progress``), e una condizione che vale ma non si vede sarebbe
    una tappa che non si supera senza che si capisca perché.
    """
    saved = step.criteria_targets or {}
    keys = [key for key in _CRITERION_LABELS if key in saved]
    keys += [key for key in saved if key not in _CRITERION_LABELS]
    return [
        StepCriterionTarget(key=key, label=_CRITERION_LABELS.get(key, key), target=saved[key])
        for key in keys
    ]


def _step_fields(step: TrainingPathStep, position: int) -> dict:
    """I campi di una tappa comuni a chi la compone e a chi la percorre."""
    kind = step_kind(step)
    fields = {
        "id": step.id,
        "position": position,
        "kind": kind,
        "target_score": step.target_score,
        "due_at": step.due_at,
    }
    if kind == STEP_KIND_AVATAR:
        avatar = step.avatar
        fields |= {
            # Le soglie sui criteri esistono solo qui: su un test la colonna
            # è vuota, e la risposta non porta un campo che non vuol dire
            # niente per quella forma di tappa.
            "criteria_targets": _criteria_targets(step),
            "avatar_id": step.avatar_id,
            "avatar_name": avatar.name,
            "avatar_category": avatar.category_name,
            "avatar_category_color": avatar.category_color,
        }
    else:
        simulation = step.simulation
        fields |= {
            "simulation_id": step.simulation_id,
            "simulation_title": simulation.title,
            "simulation_kind": simulation.kind,
        }
    return fields


def _path_response(path: TrainingPath, assigned_count: int = 0) -> TrainingPathResponse:
    """Un percorso con le sue tappe, numerate per posto nella fila.

    Il numero è l'indice nell'elenco ordinato e non la colonna ``position``:
    un avatar cancellato si porta via la sua tappa, e chi legge deve vedere
    "1, 2, 3" invece del buco che quella cancellazione ha lasciato.
    """
    return TrainingPathResponse(
        id=path.id,
        organization_id=path.organization_id,
        organization_name=path.organization.name,
        title=path.title,
        description=path.description,
        steps=[
            TrainingPathStepResponse(**_step_fields(step, index))
            for index, step in enumerate(path.steps, start=1)
        ],
        assigned_count=assigned_count,
        created_at=path.created_at,
        updated_at=path.updated_at,
    )


def _display_name(user: User) -> str:
    """Come si chiama una persona nelle risposte: nome e cognome, o l'email.

    L'email è il ripiego e non la regola: un account appena creato può non
    avere ancora l'anagrafica, e una riga senza nessun nome non si sa di chi
    sia.
    """
    return f"{user.nome} {user.cognome}".strip() or user.email


def _assignment_responses(
    db: Session, assignments: list[TrainingPathAssignment]
) -> list[TrainingPathAssignmentResponse]:
    """Le assegnazioni con il progresso di ogni tappa, in due query sole."""
    by_key = proofs_by_key(db, assignments)
    responses = []
    for assignment in assignments:
        progress = progress_of(assignment, by_key)
        user = assignment.user
        path = assignment.path
        responses.append(
            TrainingPathAssignmentResponse(
                id=assignment.id,
                path_id=path.id,
                path_title=path.title,
                path_description=path.description,
                user_id=user.id,
                user_name=_display_name(user),
                user_email=user.email,
                organization_id=user.organization_id,
                organization_name=user.organization_name,
                created_at=assignment.created_at,
                assigned_by_name=(
                    _display_name(assignment.assigned_by) if assignment.assigned_by else None
                ),
                status=progress.status,
                steps=[
                    TrainingStepProgressResponse(
                        **_step_fields(step, index),
                        status=step_progress.status,
                        unlocked_at=step_progress.unlocked_at,
                        attempts=step_progress.attempts,
                        best_score=step_progress.best_score,
                        best_criteria_scores=step_progress.best_criteria_scores,
                        achieved_at=step_progress.achieved_at,
                    )
                    for index, (step, step_progress) in enumerate(
                        zip(path.steps, progress.steps, strict=True), start=1
                    )
                ],
                completed_steps=progress.completed_steps,
                current_position=(
                    progress.current_index + 1 if progress.current_index is not None else None
                ),
            )
        )
    return responses


def _loaded_assignments(db: Session):
    """La query delle assegnazioni con dentro tutto quello che la risposta legge.

    Le tappe di un percorso, il loro avatar e la loro simulazione si leggono
    per ognuna delle assegnazioni: senza questo caricamento, una pagina con
    trenta allievi sullo stesso percorso farebbe una query per ogni tappa di
    ognuno.
    """
    return db.query(TrainingPathAssignment).options(
        selectinload(TrainingPathAssignment.user),
        selectinload(TrainingPathAssignment.assigned_by),
        selectinload(TrainingPathAssignment.path)
        .selectinload(TrainingPath.steps)
        .selectinload(TrainingPathStep.avatar),
        selectinload(TrainingPathAssignment.path)
        .selectinload(TrainingPath.steps)
        .selectinload(TrainingPathStep.simulation),
    )


# ── I percorsi, cioè i modelli ────────────────────────


def _scoped_path_or_404(db: Session, admin: User, path_id: UUID) -> TrainingPath:
    """Il percorso, se questo admin ha diritto di vederlo.

    Fuori dal proprio tenant un percorso non esiste, quindi 404 e non 403:
    è lo stesso niente che l'elenco gli mostra.
    """
    query = (
        db.query(TrainingPath)
        .options(
            selectinload(TrainingPath.steps).selectinload(TrainingPathStep.avatar),
            selectinload(TrainingPath.steps).selectinload(TrainingPathStep.simulation),
        )
        .filter(TrainingPath.id == path_id)
    )
    scope_org_id = resolve_admin_scope(admin, None)
    if scope_org_id is not None:
        query = query.filter(TrainingPath.organization_id == scope_org_id)
    path = query.first()
    if not path:
        raise HTTPException(status_code=404, detail="Percorso non trovato.")
    return path


def _target_organization(db: Session, admin: User, requested: UUID | None) -> Organization:
    """Il tenant a cui un percorso appartiene, deciso dal server.

    L'organization admin non lo nomina: è il proprio, e quello che chiede
    viene ignorato invece che obbedito. Il super admin deve nominarlo,
    perché un percorso di "tutte le organizzazioni" non esiste: le sue tappe
    puntano ad avatar e simulazioni, che di un tenant solo sono.
    """
    scope_org_id = resolve_admin_scope(admin, requested)
    if scope_org_id is None:
        raise HTTPException(
            status_code=400,
            detail="Specificare l'organizzazione a cui il percorso appartiene.",
        )
    organization = db.query(Organization).filter(Organization.id == scope_org_id).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Organizzazione non trovata.")
    return organization


def _build_steps(
    db: Session, organization_id: UUID, payload: TrainingPathWrite
) -> list[TrainingPathStep]:
    """Le tappe della richiesta, verificate contro il tenant del percorso.

    Ogni bersaglio deve essere di quell'organizzazione ed essere ancora
    percorribile: un avatar archiviato o una simulazione in bozza sono
    tappe che nessuno potrebbe superare, e siccome quelle dopo si sbloccano
    solo quando questa è chiusa, fermerebbero il percorso intero.

    Il controllo è per id e non per elenco: chi compone il percorso sceglie
    da ``/assignable-content``, che applica già queste regole, ma una
    richiesta può arrivare comunque con un id che quell'elenco non conteneva.
    """
    steps: list[TrainingPathStep] = []
    for position, item in enumerate(payload.steps, start=1):
        step = TrainingPathStep(
            position=position,
            target_score=round(item.target_score, 1),
            due_at=item.due_at,
        )
        if item.avatar_id is not None:
            avatar = (
                db.query(Avatar)
                .filter(
                    Avatar.id == item.avatar_id,
                    Avatar.organization_id == organization_id,
                )
                .first()
            )
            if not avatar:
                raise HTTPException(
                    status_code=404,
                    detail=f"Tappa {position}: avatar non trovato in questa organizzazione.",
                )
            # Archiviato è diverso da inesistente, e il codice lo dice: quello
            # esiste ancora e la sua storia si rilegge, solo non ci si allena
            # più. Stessa distinzione della galleria.
            ensure_trainable(avatar)
            step.avatar_id = avatar.id
            # Vuoto è NULL e non ``{}``: una tappa che non pone soglie sui
            # criteri e una che ne poneva e non ne pone più devono finire
            # nella stessa riga, altrimenti la colonna racconterebbe la
            # storia delle modifiche invece dello stato della tappa.
            step.criteria_targets = item.criteria_targets or None
        else:
            simulation = (
                db.query(TechnicalSimulation)
                .filter(
                    TechnicalSimulation.id == item.simulation_id,
                    TechnicalSimulation.organization_id == organization_id,
                )
                .first()
            )
            if not simulation:
                raise HTTPException(
                    status_code=404,
                    detail=f"Tappa {position}: simulazione non trovata in questa organizzazione.",
                )
            if simulation.status != SIMULATION_STATUS_PUBLISHED:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"La simulazione '{simulation.title}' è ancora in bozza: "
                        "nessuno potrebbe svolgerla."
                    ),
                )
            step.simulation_id = simulation.id
        steps.append(step)
    return steps


@router.get("/paths", response_model=list[TrainingPathResponse])
def list_paths(
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """I percorsi componibili nello scope dell'admin, i più recenti in cima."""
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    query = db.query(TrainingPath).options(
        selectinload(TrainingPath.organization),
        selectinload(TrainingPath.steps).selectinload(TrainingPathStep.avatar),
        selectinload(TrainingPath.steps).selectinload(TrainingPathStep.simulation),
    )
    if scope_org_id is not None:
        query = query.filter(TrainingPath.organization_id == scope_org_id)
    paths = query.order_by(TrainingPath.created_at.desc()).all()
    if not paths:
        return []

    # Quante persone hanno ciascun percorso, in una query invece che in una
    # per riga: è un numero che l'elenco mostra su ogni percorso.
    counts = dict(
        db.query(TrainingPathAssignment.path_id, func.count(TrainingPathAssignment.id))
        .filter(TrainingPathAssignment.path_id.in_([p.id for p in paths]))
        .group_by(TrainingPathAssignment.path_id)
        .all()
    )
    return [_path_response(path, counts.get(path.id, 0)) for path in paths]


@router.post("/paths", response_model=TrainingPathResponse, status_code=status.HTTP_201_CREATED)
def create_path(
    payload: TrainingPathWrite,
    http_request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Compone un percorso: titolo, descrizione e le tappe nel loro ordine."""
    organization = _target_organization(db, current_admin, payload.organization_id)
    path = TrainingPath(
        organization_id=organization.id,
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
    )
    path.steps = _build_steps(db, organization.id, payload)
    db.add(path)
    db.commit()
    db.refresh(path)

    audit.describe(
        http_request,
        target_id=str(path.id),
        percorso=path.title,
        organizzazione=organization.name,
        tappe=len(path.steps),
    )
    return _path_response(path)


@router.post("/paths/draft", response_model=TrainingPathDraftResponse)
async def draft_training_path(
    payload: TrainingPathDraftRequest,
    http_request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Una bozza di percorso da un obiettivo formativo raccontato a parole.

    È il gemello della bozza di scheda persona, e segue lo stesso patto: il
    modello propone, una persona rilegge, e solo dopo si salva. **Questa
    rotta non scrive niente**: restituisce una proposta al form di chi l'ha
    chiesta, e il percorso nasce con la richiesta successiva, che è quella
    normale di creazione.

    Il catalogo da cui il modello sceglie è lo stesso di
    ``assignable-content``, chiesto dalla stessa funzione: una bozza che
    proponesse prove che il form non offre sarebbe una proposta che chi la
    riceve non può nemmeno salvare.
    """
    await llm_limits.consume(llm_limits.BOZZA_PERCORSO, current_admin.id)

    organization = _target_organization(db, current_admin, payload.organization_id)
    avatars, simulations = _assignable_catalog(db, organization.id)
    if not avatars and not simulations:
        # 409 e non 400: la richiesta è scritta bene, è l'organizzazione a non
        # avere ancora niente di cui un percorso possa essere fatto. Stessa
        # forma della simulazione che non si pubblica a serbatoio vuoto.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Questa organizzazione non ha ancora avatar attivi né test pubblicati: "
                "non c'è niente di cui comporre un percorso."
            ),
        )

    audit.describe(
        http_request,
        organizzazione=organization.name,
        avatar=len(avatars),
        test=len(simulations),
    )

    # Il catalogo viene staccato dalla sessione **prima** dell'attesa, e poi
    # la connessione torna al pool come per la valutazione e per il
    # debriefing: la rotta non scrive niente e per tutti quei secondi il
    # database non serve. Al commit gli oggetti della sessione scadono, e una
    # riga di avatar a cui si chiedesse il nome dopo tornerebbe a interrogare
    # il database proprio mentre la connessione è stata restituita. Le due
    # dataclass sono fatte di soli valori, quindi sopravvivono.
    catalog_avatars = [
        CatalogAvatar(
            id=a.id,
            name=a.name,
            category_name=a.category_name,
            description=a.description,
        )
        for a in avatars
    ]
    catalog_simulations = [
        CatalogSimulation(id=s.id, title=s.title, kind=s.kind, description=s.description)
        for s in simulations
    ]
    db.commit()

    try:
        draft = await draft_path(payload.goal, catalog_avatars, catalog_simulations)
    except ValueError as e:
        # Il catalogo si è svuotato fra la lettura e la chiamata: non è un
        # guasto del fornitore, quindi non è un 502.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except RuntimeError as e:
        # Il fornitore non ha risposto, o non ha risposto niente di
        # utilizzabile: 502, come per la bozza di scheda persona.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    return TrainingPathDraftResponse(**draft)


@router.put("/paths/{path_id}", response_model=TrainingPathResponse)
def update_path(
    path_id: UUID,
    payload: TrainingPathWrite,
    http_request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Riscrive un percorso, tappe comprese.

    Le tappe si sostituiscono in blocco invece di essere modificate una a
    una: sono la forma del percorso, e mandarle intere è anche quello che
    permette di riordinarle e di toglierne una di mezzo senza endpoint
    apposta.

    Vale subito per chi lo sta percorrendo, ed è il motivo per cui un
    percorso è un modello: correggere l'obiettivo di una tappa deve valere
    per tutti, non solo per chi lo riceverà domani. Il progresso non ne
    soffre perché non è salvato da nessuna parte: si rilegge dalle prove
    contro le tappe che ci sono adesso.

    L'organizzazione non si cambia: le tappe puntano a roba del tenant, e
    spostare il percorso altrove le lascerebbe a puntare fuori.
    """
    path = _scoped_path_or_404(db, current_admin, path_id)
    path.title = payload.title.strip()
    path.description = (payload.description or "").strip() or None
    # Le vecchie se ne vanno prima che le nuove arrivino, e non nello stesso
    # flush: due tappe non possono occupare lo stesso posto nella fila, e
    # lasciando decidere l'ordine a SQLAlchemy la prima INSERT arriverebbe
    # mentre la riga che teneva quel posto è ancora lì.
    path.steps.clear()
    db.flush()
    path.steps = _build_steps(db, path.organization_id, payload)
    db.commit()
    db.refresh(path)

    audit.describe(http_request, percorso=path.title, tappe=len(path.steps))
    return _path_response(path)


@router.delete("/paths/{path_id}", response_model=MessageResponse)
def delete_path(
    path_id: UUID,
    http_request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Elimina un percorso e le assegnazioni che ne dipendono.

    Le prove svolte restano tutte: se ne va l'obiettivo, non le
    conversazioni e i test che ci sono passati sotto.
    """
    path = _scoped_path_or_404(db, current_admin, path_id)
    audit.describe(http_request, percorso=path.title, assegnati=len(path.assignments))
    db.delete(path)
    db.commit()
    return MessageResponse(message="Percorso eliminato.", success=True)


# ── Di cosa può essere fatta una tappa ────────────────


def _assignable_catalog(db: Session, organization_id: UUID) -> tuple[list, list]:
    """Di cosa può essere fatta una tappa, in un'organizzazione.

    Una definizione sola, e sono due i posti che la chiedono: il selettore
    del form (``assignable-content``) e il modello che compone una bozza di
    percorso, che deve poter proporre esattamente quello che una persona
    potrebbe scegliere a mano. Due liste diverse vorrebbero dire una bozza
    che nomina prove che il form non offre.

    Solo avatar attivi e simulazioni pubblicate: una tappa su una bozza o su
    un avatar archiviato è una tappa che nessuno potrebbe superare, e siccome
    quelle dopo si sbloccano solo quando è chiusa, fermerebbe il percorso.
    """
    avatars = (
        db.query(Avatar)
        .filter(Avatar.organization_id == organization_id, Avatar.deleted_at.is_(None))
        .order_by(Avatar.name.asc())
        .all()
    )
    simulations = (
        db.query(TechnicalSimulation)
        .filter(
            TechnicalSimulation.organization_id == organization_id,
            TechnicalSimulation.status == SIMULATION_STATUS_PUBLISHED,
        )
        .order_by(TechnicalSimulation.title.asc())
        .all()
    )
    return avatars, simulations


@router.get("/assignable-content", response_model=AssignableContentResponse)
def assignable_content(
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Gli avatar e i test di un'organizzazione, per comporre le tappe.

    Sta accanto alla validazione che rifiuta una tappa sbagliata, per la
    stessa ragione per cui ci sta ``assignable-users``: il selettore e il
    controllo devono condividere una definizione sola, invece di lasciarne
    una copia nel frontend che col tempo se ne discosta.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    if scope_org_id is None:
        raise HTTPException(
            status_code=400,
            detail="Specificare l'organizzazione di cui elencare i contenuti.",
        )
    avatars, simulations = _assignable_catalog(db, scope_org_id)
    return AssignableContentResponse(
        avatars=[
            AssignableAvatar(
                id=a.id,
                name=a.name,
                category=a.category_name,
                category_color=a.category_color,
            )
            for a in avatars
        ],
        simulations=[
            AssignableSimulation(id=s.id, title=s.title, kind=s.kind) for s in simulations
        ],
        # I criteri della valutazione, gli stessi che il giudice assegna: il
        # form ci scrive le soglie di una tappa di conversazione, e prenderli
        # di qui è quello che tiene i nomi uguali a quelli del referto.
        criteria=[
            AssignableCriterion(key=key, label=label, weight=weight)
            for key, label, weight in EVALUATION_CRITERIA
        ],
    )


@router.get("/assignable-users", response_model=list[UserResponse])
def assignable_users(
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Le persone a cui un percorso di `organization_id` può essere affidato.

    Vive accanto a ``assign_path`` così il selettore e il controllo che
    rifiuta una richiesta sbagliata condividono una sola definizione di chi
    è assegnabile, invece che il frontend ne tenga una copia libera di
    divergere: un percorso è privato al suo tenant, quindi non si affida
    fuori, e un account sospeso non potrebbe nemmeno accedere per
    percorrerlo.

    Solo il ruolo `user`, cioè chi si allena. Gli amministratori compongono
    i percorsi e ne seguono l'avanzamento, ma non hanno la sezione in cui
    percorrerli: affidarne uno a loro vorrebbe dire scrivere un incarico
    che il destinatario non può nemmeno aprire.

    Un organization admin non nomina il tenant: ``resolve_admin_scope`` lo
    fissa al proprio, quindi un `organization_id` che punta altrove viene
    ignorato invece che obbedito. Il super admin deve passarne uno, perché
    "tutte le organizzazioni" non è una risposta a questa domanda.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    if scope_org_id is None:
        raise HTTPException(
            status_code=400,
            detail="Specificare l'organizzazione di cui elencare gli utenti.",
        )
    users = (
        db.query(User)
        .join(Role, Role.id == User.role_id)
        .filter(
            User.organization_id == scope_org_id,
            User.status == USER_STATUS_ACTIVE,
            Role.name == ROLE_USER,
        )
        .order_by(User.cognome.asc(), User.nome.asc())
        .all()
    )
    return [UserResponse.model_validate(u) for u in users]


# ── Le assegnazioni ───────────────────────────────────


@router.get("/assignments/me", response_model=list[TrainingPathAssignmentResponse])
def my_assignments(
    current_user: User = Depends(get_current_standard_user),
    db: Session = Depends(get_db),
):
    """I percorsi di chi guarda, con il progresso, i più recenti in cima.

    Solo per il ruolo `user`: un admin non ne riceve, e la sezione da cui
    si percorrono non esiste per lui. Chiedere qui è quindi un 403 e non
    una lista vuota, la stessa risposta che dà la pagina che non gli si
    apre.
    """
    assignments = (
        _loaded_assignments(db)
        .filter(TrainingPathAssignment.user_id == current_user.id)
        .order_by(TrainingPathAssignment.created_at.desc())
        .all()
    )
    return _assignment_responses(db, assignments)


@router.get("/assignments", response_model=list[TrainingPathAssignmentResponse])
def list_assignments(
    organization_id: UUID | None = None,
    path_id: UUID | None = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Ogni percorso affidato nello scope, con il progresso (admin, lettura).

    Il filtro per percorso serve a leggere una classe alla volta: "a che
    punto sono i dodici che stanno facendo l'onboarding" è la domanda che si
    fa dopo aver assegnato, e senza di esso vorrebbe dire cercarli in mezzo
    a tutti gli altri.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    query = _loaded_assignments(db).join(User, User.id == TrainingPathAssignment.user_id)
    if scope_org_id is not None:
        query = query.filter(User.organization_id == scope_org_id)
    if path_id is not None:
        query = query.filter(TrainingPathAssignment.path_id == path_id)
    assignments = query.order_by(TrainingPathAssignment.created_at.desc()).all()
    return _assignment_responses(db, assignments)


@router.post(
    "/assignments",
    response_model=list[TrainingPathAssignmentResponse],
    status_code=status.HTTP_201_CREATED,
)
def assign_path(
    payload: TrainingPathAssignmentCreate,
    http_request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Affida un percorso a una o più persone, una riga ciascuna.

    Tutte devono avere il ruolo `user` e appartenere all'organizzazione del
    percorso: le tappe puntano ad avatar e simulazioni di quel tenant,
    quindi fuori sarebbe un percorso fatto di cose che l'utente non può
    nemmeno vedere, e su un account amministratore sarebbe un incarico
    senza la sezione in cui svolgerlo.

    Chi ce l'ha già viene lasciato stare invece di essere rifiutato:
    selezionare tutta l'organizzazione e affidare il percorso ai tre nuovi
    arrivati è il gesto normale, e un errore su tutta la richiesta
    costringerebbe a spuntare a mano chi c'era già.
    """
    path = _scoped_path_or_404(db, current_admin, payload.path_id)

    unique_ids = set(payload.user_ids)
    users = db.query(User).filter(User.id.in_(unique_ids)).all()
    if len(users) != len(unique_ids):
        raise HTTPException(status_code=404, detail="Uno o più utenti non trovati.")
    for user in users:
        if user.ruolo != ROLE_USER:
            raise HTTPException(
                status_code=400,
                detail=f"{user.email} amministra: un percorso si affida a chi si allena.",
            )
        if user.organization_id != path.organization_id:
            raise HTTPException(
                status_code=400,
                detail=f"{user.email} non appartiene all'organizzazione del percorso.",
            )

    already = {
        user_id
        for (user_id,) in db.query(TrainingPathAssignment.user_id).filter(
            TrainingPathAssignment.path_id == path.id,
            TrainingPathAssignment.user_id.in_(unique_ids),
        )
    }
    assignments = [
        TrainingPathAssignment(
            path_id=path.id,
            user_id=user.id,
            assigned_by_id=current_admin.id,
        )
        for user in users
        if user.id not in already
    ]
    db.add_all(assignments)
    db.commit()
    for assignment in assignments:
        db.refresh(assignment)

    # Una chiamata affida lo stesso percorso a più persone: la riga di audit
    # le nomina tutte invece di perdere tutto tranne il conteggio.
    audit.describe(
        http_request,
        percorso=path.title,
        utenti=[u.email for u in users if u.id not in already],
        gia_assegnato=[u.email for u in users if u.id in already] or None,
    )
    return _assignment_responses(db, assignments)


@router.delete("/assignments/{assignment_id}", response_model=MessageResponse)
def delete_assignment(
    assignment_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Ritira un percorso a una persona. Le prove svolte restano dove sono:
    se ne va l'obiettivo, non quello che ci si è fatto sotto.

    Un organization admin raggiunge solo i percorsi dei propri utenti: uno
    di un altro tenant risponde 404, lo stesso niente che l'elenco gli
    mostra.
    """
    scope_org_id = resolve_admin_scope(current_admin, None)
    query = db.query(TrainingPathAssignment).filter(TrainingPathAssignment.id == assignment_id)
    if scope_org_id is not None:
        query = query.join(User, User.id == TrainingPathAssignment.user_id).filter(
            User.organization_id == scope_org_id
        )
    assignment = query.first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Percorso assegnato non trovato.")
    db.delete(assignment)
    db.commit()
    return MessageResponse(message="Percorso ritirato.", success=True)
