"""Le dashboard: tre domande sulle prove che l'applicazione registra.

La dashboard dei punteggi vive in ``routers/admin`` insieme ai rendiconti da
cui legge, e risponde a "chi è messo bene". Qui stanno le altre tre, che
guardano le stesse prove da altri lati:

- ``/paths`` — **il programma funziona?** Quante assegnazioni si chiudono, in
  quanti giorni, e quante sono scadute;
- ``/usage`` — **chi sta usando la piattaforma?** Utilizzo per organizzazione,
  del solo super admin, perché è l'unico che guarda più di un tenant;
- ``/me`` — **sto migliorando?** La stessa domanda fatta su di sé da chi si
  allena, senza niente che riguardi gli altri: qui non c'è nessun confronto
  fra colleghi, che è una domanda diversa con altre conseguenze in aula.

Sono tutte letture, tutte derivate e nessuna salva niente: i numeri si rifanno
a ogni apertura dalle righe che li descrivono già, come il progresso di un
percorso. Il confine del tenant è quello di sempre (``resolve_admin_scope``),
e il periodo è lo stesso ``days`` del resto dell'area di amministrazione.
"""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Date, cast, func
from sqlalchemy.orm import Session

import reviews
from auth_dependency import (
    get_current_admin,
    get_current_standard_user,
    get_current_super_admin,
    resolve_admin_scope,
)
from dashboard_stats import paths_dashboard
from database import get_db
from models import (
    CONVERSATION_MODE_TEXT,
    CONVERSATION_MODE_VOICE,
    ROLE_USER,
    Avatar,
    ChatConversation,
    ConversationEvaluation,
    ConversationReview,
    Organization,
    Role,
    SimulationAttempt,
    TechnicalSimulation,
    TrainingPathAssignment,
    User,
)
from report_rows import (
    REPORT_ROW_CAP,
    conversation_scope,
    criteria_scores,
    duration_seconds,
    message_stats,
    since_from_days,
)
from routers.training import _loaded_assignments
from schemas import (
    MyProgress,
    MyProgressConversation,
    MyProgressSimulation,
    OrganizationUsage,
    PathsDashboard,
    UsageDashboard,
    UsageDay,
)
from simulation_scoring import attempt_score
from training_progress import proofs_by_key

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


@router.get("/paths", response_model=PathsDashboard)
def paths_dashboard_view(
    organization_id: UUID | None = None,
    days: int | None = Query(None, ge=1, le=3650),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """I percorsi assegnati in quattro numeri: quanti, chiusi, in quanti
    giorni, scaduti.

    Legge le stesse assegnazioni della gestione percorsi e con lo stesso
    caricamento anticipato: là si guarda una persona per riga, qui si contano
    tutte insieme. Il progresso resta quello di ``training_progress``, che è
    l'unico posto in cui si decide se una tappa è superata.

    `days` restringe alle assegnazioni **assegnate** negli ultimi N giorni, e
    non alle prove svolte: quello che si sta guardando è come vanno i
    percorsi consegnati in questo periodo, e tagliare le prove renderebbe non
    superata una tappa che qualcuno ha chiuso il mese scorso.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    since = since_from_days(days)
    query = _loaded_assignments(db).join(User, User.id == TrainingPathAssignment.user_id)
    if scope_org_id is not None:
        query = query.filter(User.organization_id == scope_org_id)
    if since is not None:
        query = query.filter(TrainingPathAssignment.created_at >= since)
    assignments = query.order_by(TrainingPathAssignment.created_at.desc()).all()
    return paths_dashboard(assignments, proofs_by_key(db, assignments))


@router.get("/usage", response_model=UsageDashboard)
def usage_dashboard_view(
    days: int | None = Query(None, ge=1, le=3650),
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Quanto la piattaforma viene usata, organizzazione per organizzazione.

    Del solo super admin, ed è l'unica dashboard che lo è: la domanda è quali
    organizzazioni si stanno allenando e quali sono ferme, e ha senso solo
    per chi ne guarda più di una. Un organization admin la stessa cosa sulla
    propria la legge dal report attività, che è per persona.

    Le organizzazioni ci sono tutte, anche quelle che nel periodo non hanno
    fatto niente: **una riga a zero è la risposta**, e un elenco delle sole
    attive nasconderebbe esattamente quelle che si stanno cercando.

    Cinque aggregati e nessuna riga materializzata: i conti li fa il
    database, come nel report attività.
    """
    since = since_from_days(days)
    organizations = db.query(Organization).order_by(Organization.name).all()

    # Quante persone ci sono, cioè quanti account si allenano: gli
    # amministratori non entrano nel conto perché la sezione in cui si svolge
    # una prova non è la loro, e comparirebbero come gente che non si allena
    # mai.
    #
    # Il ruolo si filtra passando dalla tabella dei ruoli, come ovunque:
    # ``User.ruolo`` è una property Python che legge la riga collegata, quindi
    # nominarla in una query non restringe niente.
    people = {
        row.organization_id: row.total
        for row in db.query(
            User.organization_id.label("organization_id"),
            func.count(User.id).label("total"),
        )
        .join(Role, Role.id == User.role_id)
        .filter(Role.name == ROLE_USER)
        .group_by(User.organization_id)
    }

    conversation_filters = conversation_scope(None, since)
    stats = message_stats(db, conversation_filters)
    # Le due forme si contano separate: una chiamata e una chat non sono la
    # stessa prova, e la somma da sola non direbbe su quale canale si allena
    # questa organizzazione.
    conversations_query = (
        db.query(
            User.organization_id.label("organization_id"),
            func.count(ChatConversation.id).label("total"),
            func.count(ChatConversation.id)
            .filter(ChatConversation.mode == CONVERSATION_MODE_VOICE)
            .label("voice"),
            func.count(ChatConversation.id)
            .filter(ChatConversation.mode == CONVERSATION_MODE_TEXT)
            .label("text"),
            func.coalesce(func.sum(duration_seconds(stats)), 0).label("duration"),
            func.count(func.distinct(ChatConversation.user_id)).label("people"),
            func.max(ChatConversation.created_at).label("last_at"),
        )
        .join(User, User.id == ChatConversation.user_id)
        .outerjoin(stats, stats.c.conversation_id == ChatConversation.id)
    )
    for condition in conversation_filters:
        conversations_query = conversations_query.filter(condition)
    conversations = {
        row.organization_id: row for row in conversations_query.group_by(User.organization_id)
    }

    attempts_query = db.query(
        User.organization_id.label("organization_id"),
        func.count(SimulationAttempt.id).label("total"),
        func.count(func.distinct(SimulationAttempt.user_id)).label("people"),
        func.max(SimulationAttempt.created_at).label("last_at"),
    ).join(User, User.id == SimulationAttempt.user_id)
    if since is not None:
        attempts_query = attempts_query.filter(SimulationAttempt.created_at >= since)
    attempts = {row.organization_id: row for row in attempts_query.group_by(User.organization_id)}

    # Chi ha svolto almeno una prova, in una forma o nell'altra. Un insieme e
    # non la somma dei due conteggi: la stessa persona può aver fatto tutte e
    # due le cose, e sommando comparirebbe due volte.
    active_ids = _active_people(db, since)

    rows = []
    for organization in organizations:
        conversation_row = conversations.get(organization.id)
        attempt_row = attempts.get(organization.id)
        last_at = max(
            [
                moment
                for moment in (
                    conversation_row.last_at if conversation_row else None,
                    attempt_row.last_at if attempt_row else None,
                )
                if moment is not None
            ],
            default=None,
        )
        rows.append(
            OrganizationUsage(
                organization_id=organization.id,
                organization_name=organization.name,
                people=people.get(organization.id, 0),
                active_people=len(active_ids.get(organization.id, set())),
                conversations=conversation_row.total if conversation_row else 0,
                voice_conversations=conversation_row.voice if conversation_row else 0,
                text_conversations=conversation_row.text if conversation_row else 0,
                attempts=attempt_row.total if attempt_row else 0,
                total_duration_seconds=int(conversation_row.duration or 0)
                if conversation_row
                else 0,
                last_activity_at=last_at,
            )
        )

    return UsageDashboard(
        organizations=rows,
        people=sum(row.people for row in rows),
        active_people=sum(row.active_people for row in rows),
        conversations=sum(row.conversations for row in rows),
        attempts=sum(row.attempts for row in rows),
        total_duration_seconds=sum(row.total_duration_seconds for row in rows),
        daily=_usage_days(db, since),
    )


def _active_people(db: Session, since) -> dict[UUID, set[UUID]]:
    """Organizzazione -> chi ci ha svolto almeno una prova nel periodo.

    Due query, una per forma di prova, e l'unione si fa qui: sono le stesse
    due letture separate del resto dell'applicazione, e chi non usa il
    simulatore non deve pagarne la scansione per sapere quanti si allenano.
    """
    active: dict[UUID, set[UUID]] = {}

    conversations = db.query(User.organization_id, ChatConversation.user_id).join(
        ChatConversation, ChatConversation.user_id == User.id
    )
    if since is not None:
        conversations = conversations.filter(ChatConversation.created_at >= since)

    attempts = db.query(User.organization_id, SimulationAttempt.user_id).join(
        SimulationAttempt, SimulationAttempt.user_id == User.id
    )
    if since is not None:
        attempts = attempts.filter(SimulationAttempt.created_at >= since)

    for organization_id, user_id in conversations.distinct():
        active.setdefault(organization_id, set()).add(user_id)
    for organization_id, user_id in attempts.distinct():
        active.setdefault(organization_id, set()).add(user_id)
    return active


def _usage_days(db: Session, since) -> list[UsageDay]:
    """Le prove svolte giorno per giorno, le due forme separate.

    Raggruppate dal database e non contate in Python: sono l'unico grafico di
    questa pagina, e materializzare una riga per prova per poi contarle
    sarebbe tutto lo storico in memoria per disegnare trenta punti.
    """
    by_day: dict[date, list[int]] = {}

    conversations = db.query(
        cast(ChatConversation.created_at, Date).label("day"),
        func.count(ChatConversation.id).label("total"),
    )
    if since is not None:
        conversations = conversations.filter(ChatConversation.created_at >= since)
    for row in conversations.group_by("day"):
        by_day.setdefault(row.day, [0, 0])[0] = row.total

    attempts = db.query(
        cast(SimulationAttempt.created_at, Date).label("day"),
        func.count(SimulationAttempt.id).label("total"),
    )
    if since is not None:
        attempts = attempts.filter(SimulationAttempt.created_at >= since)
    for row in attempts.group_by("day"):
        by_day.setdefault(row.day, [0, 0])[1] = row.total

    return [
        UsageDay(day=day, conversations=counts[0], attempts=counts[1])
        for day, counts in sorted(by_day.items())
    ]


@router.get("/me", response_model=MyProgress)
def my_progress(
    days: int | None = Query(None, ge=1, le=3650),
    current_user: User = Depends(get_current_standard_user),
    db: Session = Depends(get_db),
):
    """Le proprie prove, per la pagina dei propri progressi.

    Solo per il ruolo `user`, come i percorsi affidati: chi amministra guarda
    l'andamento dalla dashboard, e la sua curva personale sarebbe la curva di
    qualcuno che non si allena. È un 403 e non un elenco vuoto, la stessa
    risposta che dà la pagina che non gli si apre.

    Il voto è quello finale, correzione del docente compresa: è il voto che
    la persona si è vista dare, e una curva disegnata su quello della
    macchina contraddirebbe la pagella che ha in mano.

    Niente qui riguarda gli altri: nessuna media di gruppo, nessuna
    posizione. La domanda della schermata è "sto migliorando", e la risposta
    non ha bisogno di sapere come vanno i colleghi.
    """
    since = since_from_days(days)

    conversations_query = (
        db.query(
            ChatConversation.id,
            ChatConversation.title,
            ChatConversation.mode,
            ChatConversation.created_at,
            Avatar.name,
            ConversationEvaluation.overall_score,
            ConversationEvaluation.result,
            ConversationReview.override_score,
        )
        .join(ChatConversation, ChatConversation.id == ConversationEvaluation.conversation_id)
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
        .outerjoin(ConversationReview, ConversationReview.conversation_id == ChatConversation.id)
        .filter(ChatConversation.user_id == current_user.id)
    )
    if since is not None:
        conversations_query = conversations_query.filter(ChatConversation.created_at >= since)

    labels: dict[str, str] = {}
    conversations = []
    for (
        conversation_id,
        title,
        mode,
        conversation_at,
        avatar_name,
        ai_score,
        result,
        override_score,
    ) in conversations_query.order_by(ChatConversation.created_at.desc()).limit(REPORT_ROW_CAP):
        conversations.append(
            MyProgressConversation(
                conversation_id=conversation_id,
                title=title,
                mode=mode,
                avatar_name=avatar_name,
                conversation_at=conversation_at,
                score=reviews.grade(ai_score, override_score),
                has_override=override_score is not None,
                criteria=criteria_scores(result, labels),
            )
        )
    conversations.reverse()

    attempts_query = (
        db.query(
            SimulationAttempt.id,
            SimulationAttempt.simulation_id,
            SimulationAttempt.created_at,
            SimulationAttempt.correct_count,
            SimulationAttempt.question_count,
            SimulationAttempt.earned_points,
            TechnicalSimulation.title,
            TechnicalSimulation.kind,
        )
        .join(TechnicalSimulation, TechnicalSimulation.id == SimulationAttempt.simulation_id)
        .filter(SimulationAttempt.user_id == current_user.id)
    )
    if since is not None:
        attempts_query = attempts_query.filter(SimulationAttempt.created_at >= since)

    simulations = [
        MyProgressSimulation(
            attempt_id=attempt_id,
            simulation_id=simulation_id,
            simulation_title=title,
            simulation_kind=kind,
            attempted_at=attempted_at,
            score=attempt_score(earned_points or 0.0, question_count),
            correct_count=correct_count,
            question_count=question_count,
        )
        for (
            attempt_id,
            simulation_id,
            attempted_at,
            correct_count,
            question_count,
            earned_points,
            title,
            kind,
        ) in attempts_query.order_by(SimulationAttempt.created_at.desc()).limit(REPORT_ROW_CAP)
    ]
    simulations.reverse()

    return MyProgress(
        criteria_labels=labels,
        conversations=conversations,
        simulations=simulations,
    )
