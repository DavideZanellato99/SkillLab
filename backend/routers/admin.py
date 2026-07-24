"""Admin API endpoints for managing users (super admin only)."""

from collections import defaultdict
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

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
from exports import evaluations_report_xlsx
from models import (
    ALL_ROLES,
    ALL_USER_STATUSES,
    ROLE_SUPER_ADMIN,
    USER_STATUS_ACTIVE,
    USER_STATUS_DISABLED,
    Avatar,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    Organization,
    User,
    UserSelection,
)
from routers.chat import _evaluation_response
from schemas import (
    AdminConversationDetail,
    ChatMessageResponse,
    ConversationReport,
    CreateUserRequest,
    EvaluationCriterionScore,
    EvaluationReportRow,
    MessageResponse,
    UpdateUserRequest,
    UpdateUserStatusRequest,
    UserActivityReport,
    UserResponse,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
    db: Session, ruolo: str, organization_id: UUID | None
) -> UUID | None:
    """Validate the tenant assignment against the role and return it.

    A super_admin stands above tenants, so it must carry NO organization; an
    organization_admin or a plain user must belong to exactly one existing,
    non-suspended-blocking organization.
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


@router.get("/users", response_model=list[UserResponse])
def list_users(
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """List all registered users (Super Admin only), optionally filtered by
    organization."""
    query = db.query(User)
    if organization_id is not None:
        query = query.filter(User.organization_id == organization_id)
    users = query.order_by(User.created_at.desc()).all()
    return [UserResponse.model_validate(u) for u in users]


@router.get("/users-report", response_model=list[UserActivityReport])
def users_activity_report(
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Read-only activity recap: every user with their conversations per avatar,
    the duration of each conversation (first-to-last message span) and the
    total duration. A Super Admin sees every organization (optionally
    filtered by `organization_id`); an Organization Admin only its own.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)

    # Message stats aggregated per conversation in a single query
    stats = {
        row.conversation_id: row
        for row in db.query(
            ChatMessage.conversation_id.label("conversation_id"),
            func.count(ChatMessage.id).label("message_count"),
            func.min(ChatMessage.created_at).label("first_at"),
            func.max(ChatMessage.created_at).label("last_at"),
        ).group_by(ChatMessage.conversation_id)
    }

    rows = (
        db.query(ChatConversation, Avatar.name, Avatar.category)
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
        .order_by(ChatConversation.created_at.desc())
        .all()
    )

    conversations_by_user: dict[UUID, list[ConversationReport]] = defaultdict(list)
    for conv, avatar_name, avatar_category in rows:
        s = stats.get(conv.id)
        message_count = s.message_count if s else 0
        duration = (
            int((s.last_at - s.first_at).total_seconds()) if s and s.message_count >= 2 else 0
        )
        conversations_by_user[conv.user_id].append(
            ConversationReport(
                id=conv.id,
                title=conv.title,
                mode=conv.mode,
                avatar_id=conv.avatar_id,
                avatar_name=avatar_name,
                avatar_category=avatar_category,
                created_at=conv.created_at,
                message_count=message_count,
                duration_seconds=duration,
            )
        )

    users_query = db.query(User)
    if scope_org_id is not None:
        users_query = users_query.filter(User.organization_id == scope_org_id)
    users = users_query.order_by(User.created_at.desc()).all()
    return [
        UserActivityReport(
            id=u.id,
            email=u.email,
            nome=u.nome,
            cognome=u.cognome,
            ruolo=u.ruolo,
            organization_id=u.organization_id,
            organization_name=u.organization_name,
            created_at=u.created_at,
            conversation_count=len(conversations_by_user.get(u.id, [])),
            total_duration_seconds=sum(
                c.duration_seconds for c in conversations_by_user.get(u.id, [])
            ),
            conversations=conversations_by_user.get(u.id, []),
        )
        for u in users
    ]


@router.get("/evaluations-report", response_model=list[EvaluationReportRow])
def evaluations_report(
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Read-only recap of every evaluated conversation: user, avatar, dates and
    the evaluation scores, the data source for the dashboard charts. A Super
    Admin sees every organization (optionally filtered by `organization_id`);
    an Organization Admin only its own.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    return _evaluation_report_rows(db, scope_org_id)


def _evaluation_report_rows(db: Session, scope_org_id) -> list[EvaluationReportRow]:
    """Every evaluated conversation in scope, oldest first (chart order)."""
    query = (
        db.query(ConversationEvaluation, ChatConversation, User, Avatar.name)
        .join(ChatConversation, ChatConversation.id == ConversationEvaluation.conversation_id)
        .join(User, User.id == ChatConversation.user_id)
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
    )
    if scope_org_id is not None:
        query = query.filter(User.organization_id == scope_org_id)
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
            overall_score=evaluation.overall_score,
            criteria=[
                EvaluationCriterionScore(
                    key=str(c.get("key", "")),
                    label=str(c.get("label", "")),
                    score=float(c.get("score", 0) or 0),
                )
                for c in ((evaluation.result or {}).get("criteria") or [])
            ],
        )
        for evaluation, conv, user, avatar_name in rows
    ]


@router.get("/evaluations-report/export")
def export_evaluations_report(
    organization_id: UUID | None = None,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """The evaluations report as a formatted .xlsx download.

    Same scope rules as /evaluations-report: a Super Admin exports every
    organization (optionally one via `organization_id`), an Organization
    Admin only its own. Finer slicing (user, channel, dates) is what the
    spreadsheet's own autofilter is for.
    """
    scope_org_id = resolve_admin_scope(current_admin, organization_id)
    content = evaluations_report_xlsx(_evaluation_report_rows(db, scope_org_id))
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
    return AdminConversationDetail(
        conversation_id=conversation.id,
        messages=[ChatMessageResponse.model_validate(m) for m in messages],
        evaluation=_evaluation_response(db, conversation, evaluation) if evaluation else None,
    )


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


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    request: CreateUserRequest,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """
    Create a new user both in AWS Cognito and in the local database (Super Admin only).
    Cognito sends a temporary password to the user's email.
    """
    # Check if email already exists locally
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utente con questa email è già registrato nel sistema locale.",
        )

    role = _resolve_role_or_400(db, request.ruolo)
    organization_id = _resolve_organization_for_role(db, request.ruolo, request.organization_id)

    # Create user in AWS Cognito
    try:
        cognito_sub = admin_create_user(request.email)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Create user in local database
    new_user = User(
        cognito_sub=cognito_sub,
        email=request.email,
        nome=request.nome,
        cognome=request.cognome,
        role_id=role.id,
        organization_id=organization_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return UserResponse.model_validate(new_user)


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    request: UpdateUserRequest,
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Update a user's profile fields, role and/or organization (Super Admin
    only)."""
    user = _get_user_or_404(db, user_id)

    if request.nome is not None:
        user.nome = request.nome
    if request.cognome is not None:
        user.cognome = request.cognome

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
        user.organization_id = _resolve_organization_for_role(db, target_ruolo, target_org)

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.put("/users/{user_id}/status", response_model=UserResponse)
def set_user_status(
    user_id: UUID,
    request: UpdateUserStatusRequest,
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

    return UserResponse.model_validate(user)


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

    # Remove from Cognito first: if this fails the local data stays intact
    # and the operation can be retried (a user already missing on Cognito
    # is tolerated by admin_delete_user).
    try:
        admin_delete_user(user.email)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )

    # Local cleanup: selections, conversations (with messages), then the user
    conv_ids = [
        row[0]
        for row in db.query(ChatConversation.id).filter(ChatConversation.user_id == user.id).all()
    ]
    if conv_ids:
        db.query(ChatMessage).filter(ChatMessage.conversation_id.in_(conv_ids)).delete(
            synchronize_session=False
        )
        db.query(ChatConversation).filter(ChatConversation.id.in_(conv_ids)).delete(
            synchronize_session=False
        )
    db.query(UserSelection).filter(UserSelection.user_id == user.id).delete(
        synchronize_session=False
    )
    db.delete(user)
    db.commit()

    return MessageResponse(message=f"Utente {user.email} eliminato con successo.", success=True)
