"""Admin API endpoints for managing users (super admin only)."""

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

import audit
import reviews
from auth_dependency import (
    MOCK_ADMIN_SUB,
    get_current_admin,
    get_current_super_admin,
    get_role_by_name,
    resolve_admin_scope,
)
from cognito_service import (
    admin_create_user,
    admin_delete_user,
    admin_resend_credentials,
    admin_set_user_enabled,
)
from database import get_db
from erasure import erase_users
from exports import evaluations_report_xlsx
from models import (
    ALL_ROLES,
    ALL_USER_STATUSES,
    ORG_STATUS_ACTIVE,
    ROLE_SUPER_ADMIN,
    USER_STATUS_ACTIVE,
    USER_STATUS_DISABLED,
    Avatar,
    AvatarCategory,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationReview,
    Organization,
    Role,
    SimulationAttempt,
    TechnicalSimulation,
    User,
)
from routers.chat import _evaluation_response, evaluation_pdf_response
from schemas import (
    AdminConversationDetail,
    AdminUserResponse,
    ChatMessageResponse,
    ConversationReport,
    CreateUserRequest,
    EvaluationCriterionScore,
    EvaluationReportRow,
    MessageResponse,
    SimulationAttemptReport,
    SimulationReportRow,
    UpdateUserRequest,
    UpdateUserStatusRequest,
    UserActivityDetail,
    UserActivityReport,
    UserPage,
)
from user_fields import clean_email_or_400, clean_name_or_400, find_user_by_email

router = APIRouter(prefix="/api/admin", tags=["admin"])

logger = logging.getLogger(__name__)


def _get_user_or_404(db: Session, user_id: UUID) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utente non trovato.")
    return user


def _resolve_role_or_400(db: Session, ruolo: str):
    if ruolo not in ALL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Il ruolo deve essere uno tra: {', '.join(ALL_ROLES)}.",
        )
    role = get_role_by_name(db, ruolo)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ruolo '{ruolo}' non presente nel database.",
        )
    return role


def _resolve_organization_for_role(
    db: Session,
    ruolo: str,
    organization_id: UUID | None,
    *,
    current_organization_id: UUID | None = None,
) -> UUID | None:
    """Validate the tenant assignment against the role and return it.

    A super_admin stands above tenants, so it must carry NO organization; an
    organization_admin or a plain user must belong to exactly one existing
    organization that is not suspended.

    `current_organization_id` is where the user already is, and it is exempt
    from the suspension check: landing a user in a suspended tenant must be
    refused, but an admin still has to be able to fix the name of someone
    who is already inside one.
    """
    if ruolo == ROLE_SUPER_ADMIN:
        if organization_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un super admin non appartiene ad alcuna organizzazione.",
            )
        return None

    if organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utente o un admin di organizzazione deve avere un'organizzazione.",
        )
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organizzazione non trovata.",
        )
    # A suspended organization locks out every one of its users on every
    # request: putting someone there would send out an invitation email for
    # an account that cannot log in even once.
    if org.status != ORG_STATUS_ACTIVE and org.id != current_organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"L'organizzazione «{org.name}» è sospesa: riattivala prima di "
                "assegnarle degli utenti."
            ),
        )
    return org.id


def _conversation_in_scope_or_404(
    db: Session, conversation: ChatConversation, scope_org_id: UUID | None
) -> None:
    """Reject (as 404) a conversation outside the admin's organization scope.

    scope_org_id None means "all organizations" (super admin, no filter).
    Otherwise the conversation's owner must belong to that organization.
    """
    if scope_org_id is None:
        return
    owner = db.query(User).filter(User.id == conversation.user_id).first()
    if not owner or owner.organization_id != scope_org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversazione non trovata."
        )


@router.get("/users", response_model=UserPage)
def list_users(
    organization_id: UUID | None = None,
    ruolo: str | None = None,
    # `status` is the fastapi module in this file: the parameter takes
    # another name and keeps the query string it exposes.
    account_status: str | None = Query(None, alias="status"),
    never_logged_in: bool | None = None,
    q: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """A window of the registered users, newest first (Super Admin only).

    `total` counts the rows matching the filters, not the ones returned:
    the list grows with every tenant, so the client reads a window of it
    (`limit`/`offset`) and uses the count to know what is left behind.

    Every filter is applied here rather than in the browser. That is the
    point of the endpoint: a search that ran on the client would only ever
    look at the window already loaded, and would quietly answer "nessun
    utente" about someone who exists.
    """
    if ruolo is not None and ruolo not in ALL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Il ruolo deve essere uno tra: {', '.join(ALL_ROLES)}.",
        )
    if account_status is not None and account_status not in ALL_USER_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lo stato deve essere uno tra: {', '.join(ALL_USER_STATUSES)}.",
        )

    # Both joins exist for the filters below, not to load the relationships:
    # role and organization are already eager-loaded by the model. The
    # organization join is an OUTER one because a super admin has none.
    query = (
        db.query(User)
        .join(Role, Role.id == User.role_id)
        .outerjoin(Organization, Organization.id == User.organization_id)
    )

    if organization_id is not None:
        query = query.filter(User.organization_id == organization_id)
    if ruolo is not None:
        query = query.filter(Role.name == ruolo)
    if account_status is not None:
        query = query.filter(User.status == account_status)
    if never_logged_in is not None:
        query = query.filter(
            User.last_login_at.is_(None) if never_logged_in else User.last_login_at.isnot(None)
        )
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.email.ilike(pattern),
                User.nome.ilike(pattern),
                User.cognome.ilike(pattern),
                # So that "mario rossi" matches, not just either half
                (User.nome + " " + User.cognome).ilike(pattern),
                Organization.name.ilike(pattern),
            )
        )

    total = query.count()
    # The id breaks ties on created_at: two users created in the same
    # instant would otherwise be free to swap places between two requests,
    # and an offset window would skip one of them and repeat the other.
    users = query.order_by(User.created_at.desc(), User.id.desc()).offset(offset).limit(limit).all()
    return UserPage(total=total, items=[AdminUserResponse.model_validate(u) for u in users])


@router.get("/users-report", response_model=list[UserActivityReport])
def users_activity_report(
    organization_id: UUID | None = None,
    days: int | None = Query(None, ge=1, le=3650),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Read-only activity recap, one row per person: quante conversazioni ha
    tenuto con gli avatar, quante simulazioni ha consegnato e quanto tempo ci
    ha passato. A Super Admin sees every organization (optionally filtered by
    `organization_id`); an Organization Admin only its own.

    Le due prove stanno insieme di proposito: la dashboard risponde a "come va
    il gruppo" e le tiene separate, questo è l'unico posto dove si guarda una
    persona sola, e lì chi ha solo svolto simulazioni sembrerebbe fermo.

    Le prove una per una non stanno qui: le porta `/users-report/{user_id}`,
    che la schermata chiede quando una riga si apre. Erano dentro questa
    risposta, cioè ogni conversazione e ogni tentativo di ogni persona
    scaricati per aprirne una riga alla volta, e su un tenant avviato sono
    decine di migliaia di righe a ogni apertura della pagina.

    `days` restringe i conteggi agli ultimi N giorni: senza, il numero di chi
    si allena da un anno non dice cosa ha fatto adesso.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    since = _since(days)
    tenant_users = _tenant_user_ids(db, scope_org_id)

    users_query = db.query(User)
    if scope_org_id is not None:
        users_query = users_query.filter(User.organization_id == scope_org_id)
    users = users_query.order_by(User.created_at.desc()).all()

    # I conteggi li fa il database. Prima si materializzava ogni prova di ogni
    # persona per poi contarle in Python, cioè la stessa somma fatta due
    # volte: una dal server per costruire le liste, una da chi le riceveva
    # per non guardarle.
    conversation_filters = _conversation_scope(tenant_users, since)
    stats = _message_stats(db, conversation_filters)
    totals_query = db.query(
        ChatConversation.user_id.label("user_id"),
        func.count(ChatConversation.id).label("conversation_count"),
        func.coalesce(func.sum(_duration_seconds(stats)), 0).label("total_duration"),
    ).outerjoin(stats, stats.c.conversation_id == ChatConversation.id)
    for condition in conversation_filters:
        totals_query = totals_query.filter(condition)
    conversation_totals = {
        row.user_id: row for row in totals_query.group_by(ChatConversation.user_id)
    }

    attempts_query = db.query(
        SimulationAttempt.user_id.label("user_id"),
        func.count(SimulationAttempt.id).label("simulation_count"),
    )
    if tenant_users is not None:
        attempts_query = attempts_query.filter(SimulationAttempt.user_id.in_(tenant_users))
    if since is not None:
        attempts_query = attempts_query.filter(SimulationAttempt.created_at >= since)
    attempt_totals = {
        row.user_id: row.simulation_count
        for row in attempts_query.group_by(SimulationAttempt.user_id)
    }

    report = []
    for u in users:
        totals = conversation_totals.get(u.id)
        report.append(
            UserActivityReport(
                id=u.id,
                email=u.email,
                nome=u.nome,
                cognome=u.cognome,
                ruolo=u.ruolo,
                organization_id=u.organization_id,
                organization_name=u.organization_name,
                created_at=u.created_at,
                conversation_count=totals.conversation_count if totals else 0,
                total_duration_seconds=int(totals.total_duration) if totals else 0,
                simulation_count=attempt_totals.get(u.id, 0),
            )
        )
    return report


@router.get("/users-report/{user_id}", response_model=UserActivityDetail)
def user_activity_detail(
    user_id: UUID,
    days: int | None = Query(None, ge=1, le=3650),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Le prove di una persona sola, una per una: con chi ha parlato, quanto è
    durata, che voto ha preso, e i test consegnati con quante risposte erano
    giuste.

    Si legge quando nel report attività si apre una riga, e non insieme
    all'elenco: la schermata ne guarda una alla volta, e tenerle tutte nella
    risposta dell'elenco voleva dire scaricare le prove di tutti per leggere
    quelle di uno.

    `days` è lo stesso periodo dell'elenco e taglia le prove allo stesso modo:
    la riga dice "tre conversazioni" e sotto se ne devono aprire tre.

    Fuori dal proprio tenant la persona non esiste, come ovunque nell'area di
    amministrazione: la risposta è quella che riceverebbe per un id inventato.
    """
    scope_org_id = resolve_admin_scope(current_admin, None)
    user = _get_user_or_404(db, user_id)
    if scope_org_id is not None and user.organization_id != scope_org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utente non trovato.")

    since = _since(days)
    return UserActivityDetail(
        conversations=_user_conversation_reports(db, user_id, since),
        simulation_attempts=_user_attempt_reports(db, user_id, since),
    )


def _tenant_user_ids(db: Session, scope_org_id: UUID | None):
    """Le persone di un tenant come sottoquery, o None quando si guarda tutto.

    Il confine viaggia dentro il database e non come lista di id letta prima e
    legata a ogni interrogazione: quella lista cresce con il tenant, e a
    qualche migliaio di persone sono altrettanti parametri per query.
    """
    if scope_org_id is None:
        return None
    return db.query(User.id).filter(User.organization_id == scope_org_id).scalar_subquery()


def _conversation_scope(tenant_users, since) -> list:
    """Le condizioni che dicono quali conversazioni si stanno guardando."""
    conditions = []
    if tenant_users is not None:
        conditions.append(ChatConversation.user_id.in_(tenant_users))
    if since is not None:
        conditions.append(ChatConversation.created_at >= since)
    return conditions


def _message_stats(db: Session, conversation_filters: list):
    """Quanti messaggi e da quando a quando, per ogni conversazione in vista.

    I filtri delle conversazioni stanno dentro l'aggregato e non fuori.
    Stavano fuori, quindi il raggruppamento girava su tutta la tabella dei
    messaggi e si scartava dopo, anche quando a guardare era l'admin di una
    sola organizzazione o il periodo era una settimana. Qui il raggruppamento
    vede solo le conversazioni in vista, e quando si guarda una persona sola
    sono le sue.
    """
    query = (
        db.query(
            ChatMessage.conversation_id.label("conversation_id"),
            func.count(ChatMessage.id).label("message_count"),
            func.min(ChatMessage.created_at).label("first_at"),
            func.max(ChatMessage.created_at).label("last_at"),
        )
        .join(ChatConversation, ChatConversation.id == ChatMessage.conversation_id)
        .group_by(ChatMessage.conversation_id)
    )
    for condition in conversation_filters:
        query = query.filter(condition)
    return query.subquery()


def _duration_seconds(stats):
    """Dal primo all'ultimo messaggio, ai secondi interi.

    Zero sotto i due messaggi: una conversazione aperta e mai iniziata non è
    durata un istante. Il troncamento è per conversazione e non sulla somma,
    perché la durata della riga e quelle delle prove che si aprono sotto
    devono tornare.
    """
    return case(
        (
            stats.c.message_count >= 2,
            func.floor(func.extract("epoch", stats.c.last_at - stats.c.first_at)),
        ),
        else_=0,
    )


def _user_conversation_reports(db: Session, user_id: UUID, since) -> list[ConversationReport]:
    """Le conversazioni di una persona, dalla più recente.

    La valutazione e la revisione arrivano in outer join: la maggior parte
    delle conversazioni non ha né l'una né l'altra, e il voto che conta è
    quello finale, lo stesso che chi si allena legge sulla propria pagella.
    """
    filters = [ChatConversation.user_id == user_id]
    if since is not None:
        filters.append(ChatConversation.created_at >= since)

    stats = _message_stats(db, filters)
    query = (
        db.query(
            ChatConversation,
            Avatar.name,
            AvatarCategory.name,
            AvatarCategory.color,
            ConversationEvaluation.overall_score,
            ConversationReview.override_score,
            func.coalesce(stats.c.message_count, 0),
            _duration_seconds(stats),
        )
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
        .join(AvatarCategory, AvatarCategory.id == Avatar.category_id)
        .outerjoin(
            ConversationEvaluation,
            ConversationEvaluation.conversation_id == ChatConversation.id,
        )
        .outerjoin(ConversationReview, ConversationReview.conversation_id == ChatConversation.id)
        .outerjoin(stats, stats.c.conversation_id == ChatConversation.id)
    )
    for condition in filters:
        query = query.filter(condition)

    return [
        ConversationReport(
            id=conv.id,
            title=conv.title,
            mode=conv.mode,
            avatar_id=conv.avatar_id,
            avatar_name=avatar_name,
            avatar_category=avatar_category,
            avatar_category_color=color,
            created_at=conv.created_at,
            message_count=message_count,
            duration_seconds=int(duration or 0),
            score=(
                None
                if ai_score is None
                else round(override_score if override_score is not None else ai_score, 1)
            ),
        )
        for (
            conv,
            avatar_name,
            avatar_category,
            color,
            ai_score,
            override_score,
            message_count,
            duration,
        ) in query.order_by(ChatConversation.created_at.desc())
    ]


def _user_attempt_reports(db: Session, user_id: UUID, since) -> list[SimulationAttemptReport]:
    """I test consegnati da una persona, dal più recente.

    In una query a parte e non in join con le conversazioni: le due prove non
    hanno niente in comune se non chi le ha svolte, e chi non usa il
    simulatore non deve pagarne la scansione.
    """
    query = (
        db.query(
            SimulationAttempt,
            TechnicalSimulation.title,
            TechnicalSimulation.kind,
            TechnicalSimulation.source,
        )
        .join(TechnicalSimulation, TechnicalSimulation.id == SimulationAttempt.simulation_id)
        .filter(SimulationAttempt.user_id == user_id)
    )
    if since is not None:
        query = query.filter(SimulationAttempt.created_at >= since)

    return [
        SimulationAttemptReport(
            id=attempt.id,
            simulation_id=attempt.simulation_id,
            simulation_title=title,
            simulation_kind=kind,
            simulation_source=source,
            created_at=attempt.created_at,
            correct_count=attempt.correct_count,
            question_count=attempt.question_count,
            score=round(attempt.score, 1),
        )
        for attempt, title, kind, source in query.order_by(SimulationAttempt.created_at.desc())
    ]


@router.get("/evaluations-report", response_model=list[EvaluationReportRow])
def evaluations_report(
    organization_id: UUID | None = None,
    days: int | None = Query(None, ge=1, le=3650),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Read-only recap of every evaluated conversation: user, avatar, dates and
    the evaluation scores, the data source for the dashboard charts. A Super
    Admin sees every organization (optionally filtered by `organization_id`);
    an Organization Admin only its own.

    `days` restringe le righe alle conversazioni degli ultimi N giorni, come
    nel report attività: è tutto quello che la dashboard poi aggrega, e senza
    un limite chi si allena da un anno se lo porta dietro intero a ogni
    apertura della pagina, criteri di ogni valutazione compresi.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    return _evaluation_report_rows(db, scope_org_id, _since(days))


def _since(days: int | None):
    """L'istante da cui contare, o None per «da sempre»."""
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days) if days else None


def _evaluation_report_rows(db: Session, scope_org_id, since=None) -> list[EvaluationReportRow]:
    """Every evaluated conversation in scope, oldest first (chart order).

    The trainer's review rides along on an outer join (most conversations
    have none), so `overall_score` is the grade that counts and the charts
    plot what the student was actually given.
    """
    query = (
        db.query(ConversationEvaluation, ChatConversation, User, Avatar.name, ConversationReview)
        .join(ChatConversation, ChatConversation.id == ConversationEvaluation.conversation_id)
        .join(User, User.id == ChatConversation.user_id)
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
        .outerjoin(ConversationReview, ConversationReview.conversation_id == ChatConversation.id)
    )
    if scope_org_id is not None:
        query = query.filter(User.organization_id == scope_org_id)
    if since is not None:
        query = query.filter(ChatConversation.created_at >= since)
    rows = query.order_by(ChatConversation.created_at.asc()).all()
    return [
        EvaluationReportRow(
            conversation_id=conv.id,
            conversation_title=conv.title,
            mode=conv.mode,
            user_id=user.id,
            user_email=user.email,
            user_nome=user.nome,
            user_cognome=user.cognome,
            organization_id=user.organization_id,
            organization_name=user.organization_name,
            avatar_id=conv.avatar_id,
            avatar_name=avatar_name,
            conversation_at=conv.created_at,
            evaluated_at=evaluation.created_at,
            overall_score=reviews.final_score(evaluation.overall_score, review),
            ai_overall_score=evaluation.overall_score,
            has_override=review is not None and review.override_score is not None,
            has_review=review is not None,
            criteria=[
                EvaluationCriterionScore(
                    key=str(c.get("key", "")),
                    label=str(c.get("label", "")),
                    score=float(c.get("score", 0) or 0),
                )
                for c in ((evaluation.result or {}).get("criteria") or [])
            ],
        )
        for evaluation, conv, user, avatar_name, review in rows
    ]


@router.get("/simulations-report", response_model=list[SimulationReportRow])
def simulations_report(
    organization_id: UUID | None = None,
    days: int | None = Query(None, ge=1, le=3650),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Read-only recap of every technical test delivered: who took it, when, and
    how it went. The written half of the dashboard, with the same scope rules
    as /evaluations-report: a Super Admin sees every organization (optionally
    filtered by `organization_id`), an Organization Admin only its own.

    Scoped by the taker's organization and not by the simulation's: what the
    dashboard of a tenant is about is how ITS people are doing, and a test
    borrowed from elsewhere would otherwise disappear from their own numbers.

    `days` restringe ai tentativi degli ultimi N giorni, come nella metà
    parlata: i due selettori della dashboard sono lo stesso periodo.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    since = _since(days)
    query = (
        db.query(
            SimulationAttempt,
            TechnicalSimulation.title,
            TechnicalSimulation.kind,
            TechnicalSimulation.source,
            User,
        )
        .join(TechnicalSimulation, TechnicalSimulation.id == SimulationAttempt.simulation_id)
        .join(User, User.id == SimulationAttempt.user_id)
    )
    if scope_org_id is not None:
        query = query.filter(User.organization_id == scope_org_id)
    if since is not None:
        query = query.filter(SimulationAttempt.created_at >= since)
    # Oldest first, like the evaluations report: the charts plot in this order.
    rows = query.order_by(SimulationAttempt.created_at.asc()).all()
    return [
        SimulationReportRow(
            attempt_id=attempt.id,
            simulation_id=attempt.simulation_id,
            simulation_title=title,
            simulation_kind=kind,
            simulation_source=source,
            user_id=user.id,
            user_email=user.email,
            user_nome=user.nome,
            user_cognome=user.cognome,
            organization_id=user.organization_id,
            organization_name=user.organization_name,
            attempted_at=attempt.created_at,
            correct_count=attempt.correct_count,
            question_count=attempt.question_count,
            score=attempt.score,
        )
        for attempt, title, kind, source, user in rows
    ]


@router.get("/evaluations-report/export")
def export_evaluations_report(
    organization_id: UUID | None = None,
    days: int | None = Query(None, ge=1, le=3650),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """The evaluations report as a formatted .xlsx download.

    Same scope rules as /evaluations-report: a Super Admin exports every
    organization (optionally one via `organization_id`), an Organization
    Admin only its own, e lo stesso `days`: il foglio è quello che si sta
    guardando, e un file che ignorasse il periodo scelto risponderebbe a una
    domanda diversa da quella sullo schermo. Le fette più fini (persona,
    canale) restano all'autofiltro del foglio.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    content = evaluations_report_xlsx(_evaluation_report_rows(db, scope_org_id, _since(days)))
    filename = f"report-valutazioni-{datetime.now(UTC).strftime('%Y-%m-%d')}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/conversations/{conversation_id}", response_model=AdminConversationDetail)
def conversation_detail(
    conversation_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Full transcript and stored evaluation of a single conversation (Super
    Admin + Organization Admin) — backs the dashboard detail modal.
    """
    conversation = db.query(ChatConversation).filter(ChatConversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversazione non trovata."
        )
    _conversation_in_scope_or_404(db, conversation, resolve_admin_scope(current_admin))

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    evaluation = (
        db.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation_id)
        .first()
    )
    review = (
        db.query(ConversationReview)
        .filter(ConversationReview.conversation_id == conversation_id)
        .first()
    )
    return AdminConversationDetail(
        conversation_id=conversation.id,
        messages=[ChatMessageResponse.model_validate(m) for m in messages],
        evaluation=_evaluation_response(db, conversation, evaluation) if evaluation else None,
        # Also outside the evaluation: a trainer can have annotated a
        # transcript the AI never judged, and the modal still has to show it.
        review=reviews.review_response(
            review,
            reviews.annotations_of(db, conversation_id),
            evaluation.overall_score if evaluation else None,
        ),
    )


@router.get("/conversations/{conversation_id}/evaluation/pdf")
def download_conversation_evaluation_pdf(
    conversation_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """The same evaluation PDF the student can download, from the detail modal.

    Scope rules are those of `conversation_detail`: a conversation outside
    the admin's organization does not exist. The document is byte for byte
    the student's own, the operator on the sheet being the person who held
    the conversation, not the admin who asked for it.
    """
    conversation = db.query(ChatConversation).filter(ChatConversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversazione non trovata."
        )
    _conversation_in_scope_or_404(db, conversation, resolve_admin_scope(current_admin))

    evaluation = (
        db.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation_id)
        .first()
    )
    if not evaluation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Questa conversazione non ha ancora una valutazione.",
        )

    owner = db.query(User).filter(User.id == conversation.user_id).first()
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversazione non trovata."
        )

    return evaluation_pdf_response(db, conversation, evaluation, owner)


@router.delete("/conversations/{conversation_id}", response_model=MessageResponse)
def delete_conversation(
    conversation_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Delete any user's conversation together with its messages and evaluation
    (Super Admin + Organization Admin). Normal users cannot delete their own
    conversation history — there is no equivalent endpoint for role 'user'.
    """
    conversation = db.query(ChatConversation).filter(ChatConversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversazione non trovata."
        )
    _conversation_in_scope_or_404(db, conversation, resolve_admin_scope(current_admin))

    db.delete(conversation)
    db.commit()

    return MessageResponse(message="Conversazione eliminata con successo.", success=True)


@router.delete("/simulation-attempts/{attempt_id}", response_model=MessageResponse)
def delete_simulation_attempt(
    attempt_id: UUID,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Elimina un test tecnico consegnato (Super Admin + Organization Admin).

    Il gemello di `delete_conversation`, e per la stessa ragione: le due prove
    si cancellano dallo stesso posto, il report attività, e una prova che si
    può togliere solo se è una conversazione lascerebbe lì per sempre il
    tentativo aperto per sbaglio o svolto da chi non doveva.

    Lo scope è l'organizzazione di **chi ha svolto** il test, non quella della
    simulazione, come nel report che lo elenca: un test preparato altrove ma
    svolto dalla propria gente è una riga del proprio tenant.

    La simulazione non viene toccata: sparisce il tentativo, cioè la
    fotografia di quelle dieci risposte, e il test resta lì da rifare.
    """
    scope_org_id = resolve_admin_scope(current_admin)
    query = db.query(SimulationAttempt).filter(SimulationAttempt.id == attempt_id)
    if scope_org_id is not None:
        query = query.join(User, User.id == SimulationAttempt.user_id).filter(
            User.organization_id == scope_org_id
        )
    attempt = query.first()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tentativo non trovato.")

    db.delete(attempt)
    db.commit()

    return MessageResponse(message="Tentativo eliminato con successo.", success=True)


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    request: CreateUserRequest,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Create a new user both in AWS Cognito and in the local database (Super Admin only).
    Cognito sends a temporary password to the user's email.
    """
    email = clean_email_or_400(request.email)
    nome = clean_name_or_400(request.nome, "nome")
    cognome = clean_name_or_400(request.cognome, "cognome")

    # Case-insensitively: Cognito resolves both spellings of an address to
    # the same account, so two local rows for one identity must never exist.
    if find_user_by_email(db, email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utente con questa email è già registrato nel sistema locale.",
        )

    role = _resolve_role_or_400(db, request.ruolo)
    organization_id = _resolve_organization_for_role(db, request.ruolo, request.organization_id)

    # Create user in AWS Cognito
    try:
        cognito_sub = admin_create_user(email)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Create user in local database
    new_user = User(
        cognito_sub=cognito_sub,
        email=email,
        nome=nome,
        cognome=cognome,
        role_id=role.id,
        organization_id=organization_id,
    )
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
    except Exception:
        # The Cognito account already exists at this point. Left behind it
        # would be an orphan nobody can clear from the UI, and it would also
        # make every retry fail: the email is taken on Cognito while still
        # free locally. Undo it so the operation is simply repeatable.
        db.rollback()
        try:
            admin_delete_user(email)
        except RuntimeError:
            logger.exception("Utente Cognito orfano non rimosso: %s", email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Errore nel salvataggio dell'utente. Riprova.",
        )

    # The created user's id is not in the path: without this the audit row
    # would say "utente creato" without saying which one.
    audit.describe(
        http_request, target_id=str(new_user.id), email=new_user.email, ruolo=request.ruolo
    )

    return AdminUserResponse.model_validate(new_user)


@router.put("/users/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: UUID,
    request: UpdateUserRequest,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Update a user's profile fields, role and/or organization (Super Admin
    only)."""
    user = _get_user_or_404(db, user_id)

    if request.nome is not None:
        user.nome = clean_name_or_400(request.nome, "nome")
    if request.cognome is not None:
        user.cognome = clean_name_or_400(request.cognome, "cognome")

    # What the audit row carries beyond the target's email. The path only
    # identifies WHICH user was touched: without this the trail would say
    # "utente modificato" without saying that someone became a super admin.
    changes: dict[str, str] = {}
    previous_org_name = user.organization_name

    role_changing = request.ruolo is not None and request.ruolo != user.ruolo
    if role_changing:
        if user.id == current_admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Non puoi modificare il ruolo del tuo stesso account.",
            )
        if user.cognito_sub == MOCK_ADMIN_SUB and request.ruolo != ROLE_SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Non è possibile cambiare il ruolo dell'account di sistema.",
            )
        role = _resolve_role_or_400(db, request.ruolo)
        changes["ruolo_da"] = user.ruolo
        changes["ruolo_a"] = request.ruolo
        user.role_id = role.id

    # Keep role and organization consistent: a super_admin never has one, a
    # user/organization_admin always does. Re-validate whenever either the
    # role or the organization changes.
    target_ruolo = request.ruolo if request.ruolo is not None else user.ruolo
    org_explicit = "organization_id" in request.model_fields_set
    if role_changing or org_explicit:
        if target_ruolo == ROLE_SUPER_ADMIN:
            target_org = None
        elif org_explicit:
            target_org = request.organization_id
        else:
            target_org = user.organization_id
        user.organization_id = _resolve_organization_for_role(
            db, target_ruolo, target_org, current_organization_id=user.organization_id
        )

    db.commit()
    db.refresh(user)

    # Read after the refresh: the tenant is compared by name, which is what
    # stays readable in the log once the organization itself is gone.
    if user.organization_name != previous_org_name:
        changes["organizzazione_da"] = previous_org_name or "nessuna"
        changes["organizzazione_a"] = user.organization_name or "nessuna"
    audit.describe(http_request, email=user.email, **changes)

    return AdminUserResponse.model_validate(user)


@router.put("/users/{user_id}/status", response_model=AdminUserResponse)
def set_user_status(
    user_id: UUID,
    request: UpdateUserStatusRequest,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Change an account's state (Super Admin only): suspend (reversible),
    reactivate, or disable permanently. Any non-active state blocks new
    logins on Cognito AND kills the sessions already open. A disabled
    account is final: it can only be deleted.
    """
    user = _get_user_or_404(db, user_id)

    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non puoi modificare lo stato del tuo stesso account.",
        )
    if user.cognito_sub == MOCK_ADMIN_SUB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non è possibile modificare lo stato dell'account di sistema.",
        )
    if request.status not in ALL_USER_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lo stato deve essere uno tra: {', '.join(ALL_USER_STATUSES)}.",
        )
    if user.status == USER_STATUS_DISABLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'account è disabilitato definitivamente e non può cambiare stato.",
        )

    audit.describe(http_request, email=user.email, da=user.status, a=request.status)

    if request.status != user.status:
        try:
            admin_set_user_enabled(user.email, enabled=request.status == USER_STATUS_ACTIVE)
        except RuntimeError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(e),
            )
        user.status = request.status
        db.commit()
        db.refresh(user)

    return AdminUserResponse.model_validate(user)


@router.post("/users/{user_id}/resend-credentials", response_model=MessageResponse)
def resend_credentials(
    user_id: UUID,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Send the user a fresh temporary password via Cognito email (Super Admin
    only). Works both before the first login (the invitation is re-sent)
    and after (the account is re-invited): in both cases only the emailed
    temporary password is accepted from now on, and on the next login the
    user must set a new password.
    """
    user = _get_user_or_404(db, user_id)

    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non puoi rinviare le credenziali del tuo stesso account.",
        )
    if user.cognito_sub == MOCK_ADMIN_SUB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non è possibile rinviare le credenziali dell'account di sistema.",
        )
    # A resend on a confirmed account recreates it on Cognito, which would
    # silently re-enable a suspended/disabled login: block it explicitly.
    if user.status != USER_STATUS_ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'account non è attivo: riattivalo prima di rinviare le credenziali.",
        )

    try:
        new_sub = admin_resend_credentials(user.email)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )

    # Re-invited confirmed accounts get a new Cognito identity: persist it
    # (this also kills any session still bound to the old sub)
    if new_sub != user.cognito_sub:
        user.cognito_sub = new_sub
        db.commit()

    return MessageResponse(
        message=(
            f"Nuova password temporanea inviata a {user.email}. "
            "Le vecchie credenziali non sono più valide: al prossimo accesso "
            "l'utente dovrà impostare una nuova password."
        ),
        success=True,
    )


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: UUID,
    http_request: Request,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Delete a user from Cognito and from the local database, together with
    their selections and conversations (Super Admin only).
    """
    user = _get_user_or_404(db, user_id)

    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non puoi eliminare il tuo stesso account.",
        )
    if user.cognito_sub == MOCK_ADMIN_SUB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non è possibile eliminare l'account di sistema.",
        )

    # Read before the erasure: afterwards there is no row left to reload
    # these from, and the response still has to name who was deleted.
    target_id, email = user.id, user.email

    # The audit row outlives the user it names, and its user_id is nulled
    # by the FK: the email is the only thing that keeps it readable.
    audit.describe(http_request, email=email, ruolo=user.ruolo)

    # Remove from Cognito first: if this fails the local data stays intact
    # and the operation can be retried (a user already missing on Cognito
    # is tolerated by admin_delete_user).
    try:
        admin_delete_user(email)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )

    # Local cleanup: conversations, sessions, selections, goals, then the
    # account. What exactly a user is made of lives in `erasure`, shared
    # with the tenant deletion, so neither path can forget a table.
    erase_users(db, [target_id])
    db.commit()

    return MessageResponse(message=f"Utente {email} eliminato con successo.", success=True)
