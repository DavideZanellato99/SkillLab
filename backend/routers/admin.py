"""Admin API endpoints for managing users (super admin only)."""

from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User,
    UserSelection,
    Avatar,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ALL_ROLES,
    ROLE_SUPER_ADMIN,
    ALL_USER_STATUSES,
    USER_STATUS_ACTIVE,
    USER_STATUS_DISABLED,
)
from auth_dependency import (
    get_current_super_admin,
    get_current_admin,
    get_role_by_name,
    MOCK_ADMIN_SUB,
)
from cognito_service import (
    admin_create_user,
    admin_delete_user,
    admin_resend_credentials,
    admin_set_user_enabled,
)
from schemas import (
    CreateUserRequest,
    UpdateUserRequest,
    UpdateUserStatusRequest,
    UserResponse,
    MessageResponse,
    ConversationReport,
    UserActivityReport,
    EvaluationCriterionScore,
    EvaluationReportRow,
    AdminConversationDetail,
    ChatMessageResponse,
)
from routers.chat import _evaluation_response

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


@router.get("/users", response_model=list[UserResponse])
def list_users(
    current_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """List all registered users in the database (Super Admin only)."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [UserResponse.model_validate(u) for u in users]


@router.get("/users-report", response_model=list[UserActivityReport])
def users_activity_report(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Read-only activity recap (Super Admin + Organization Admin): every user
    with their conversations per avatar, the duration of each conversation
    (first-to-last message span) and the total duration.
    """
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
            int((s.last_at - s.first_at).total_seconds())
            if s and s.message_count >= 2
            else 0
        )
        conversations_by_user[conv.user_id].append(
            ConversationReport(
                id=conv.id,
                avatar_id=conv.avatar_id,
                avatar_name=avatar_name,
                avatar_category=avatar_category,
                created_at=conv.created_at,
                message_count=message_count,
                duration_seconds=duration,
            )
        )

    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        UserActivityReport(
            id=u.id,
            email=u.email,
            nome=u.nome,
            cognome=u.cognome,
            ruolo=u.ruolo,
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
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Read-only recap of every evaluated conversation (Super Admin +
    Organization Admin): user, avatar, dates and the evaluation scores —
    the data source for the dashboard charts.
    """
    rows = (
        db.query(ConversationEvaluation, ChatConversation, User, Avatar.name)
        .join(ChatConversation, ChatConversation.id == ConversationEvaluation.conversation_id)
        .join(User, User.id == ChatConversation.user_id)
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
        .order_by(ChatConversation.created_at.asc())
        .all()
    )
    return [
        EvaluationReportRow(
            conversation_id=conv.id,
            user_id=user.id,
            user_email=user.email,
            user_nome=user.nome,
            user_cognome=user.cognome,
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
    conversation = (
        db.query(ChatConversation).filter(ChatConversation.id == conversation_id).first()
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversazione non trovata."
        )

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
        evaluation=_evaluation_response(evaluation) if evaluation else None,
    )


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
    """Update a user's profile fields and/or role (Super Admin only)."""
    user = _get_user_or_404(db, user_id)

    if request.nome is not None:
        user.nome = request.nome
    if request.cognome is not None:
        user.cognome = request.cognome

    if request.ruolo is not None and request.ruolo != user.ruolo:
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
