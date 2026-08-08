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
from auth_dependency import (
    get_current_admin,
    get_current_user,
    resolve_admin_scope,
)
from database import get_db
from models import (
    ROLE_SUPER_ADMIN,
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
from routers.avatars import ensure_trainable
from schemas import (
    STEP_KIND_AVATAR,
    AssignableAvatar,
    AssignableContentResponse,
    AssignableSimulation,
    MessageResponse,
    TrainingPathAssignmentCreate,
    TrainingPathAssignmentResponse,
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


def _step_fields(step: TrainingPathStep, position: int) -> dict:
    """I campi di una tappa comuni a chi la compone e a chi la percorre."""
    kind = step_kind(step)
    fields = {
        "id": step.id,
        "position": position,
        "kind": kind,
        "target_score": step.target_score,
        "due_days": step.due_days,
    }
    if kind == STEP_KIND_AVATAR:
        avatar = step.avatar
        fields |= {
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
                user_name=f"{user.nome} {user.cognome}".strip() or user.email,
                user_email=user.email,
                organization_id=user.organization_id,
                organization_name=user.organization_name,
                created_at=assignment.created_at,
                status=progress.status,
                steps=[
                    TrainingStepProgressResponse(
                        **_step_fields(step, index),
                        status=step_progress.status,
                        unlocked_at=step_progress.unlocked_at,
                        due_at=step_progress.due_at,
                        attempts=step_progress.attempts,
                        best_score=step_progress.best_score,
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
            due_days=item.due_days,
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
    avatars = (
        db.query(Avatar)
        .filter(Avatar.organization_id == scope_org_id, Avatar.deleted_at.is_(None))
        .order_by(Avatar.name.asc())
        .all()
    )
    simulations = (
        db.query(TechnicalSimulation)
        .filter(
            TechnicalSimulation.organization_id == scope_org_id,
            TechnicalSimulation.status == SIMULATION_STATUS_PUBLISHED,
        )
        .order_by(TechnicalSimulation.title.asc())
        .all()
    )
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
    percorrerlo. Il super admin resta fuori perché non appartiene a nessun
    tenant.

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
            Role.name != ROLE_SUPER_ADMIN,
        )
        .order_by(User.cognome.asc(), User.nome.asc())
        .all()
    )
    return [UserResponse.model_validate(u) for u in users]


# ── Le assegnazioni ───────────────────────────────────


@router.get("/assignments/me", response_model=list[TrainingPathAssignmentResponse])
def my_assignments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """I percorsi di chi guarda, con il progresso, i più recenti in cima."""
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

    Tutte devono appartenere all'organizzazione del percorso: le sue tappe
    puntano ad avatar e simulazioni di quel tenant, quindi fuori sarebbe un
    percorso fatto di cose che l'utente non può nemmeno vedere.

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
