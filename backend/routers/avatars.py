"""Avatar API endpoints."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth_dependency import get_current_user
from database import get_db
from models import ROLE_SUPER_ADMIN, Avatar, AvatarCategory, ChatConversation, User
from schemas import AvatarCategoryResponse, AvatarResponse

router = APIRouter(prefix="/api/avatars", tags=["avatars"])


def _visible_avatars(query, user: User):
    """Restrict an avatar query to what `user` may see.

    A plain user or an organization_admin sees only the avatars owned by their
    own organization. The super admin stands above tenants and sees every
    avatar.

    Tenant scoping only: archived avatars are still *visible* here on purpose,
    so a student keeps reaching the transcripts and evaluations of the
    training they already did. What archiving forbids is starting anything
    new, which is `active_avatars` / `ensure_trainable` below.
    """
    if user.ruolo == ROLE_SUPER_ADMIN:
        return query
    return query.filter(Avatar.organization_id == user.organization_id)


def active_avatars(query):
    """Restrict an avatar query to the ones that are not archived.

    Used where the catalogue is offered for training, which is the gallery:
    an archived persona must not be proposed to anyone, in any tenant. The
    single-avatar route below serves them on purpose, because a past session
    still needs a name and a face.
    """
    return query.filter(Avatar.deleted_at.is_(None))


def ensure_trainable(avatar: Avatar) -> None:
    """Refuse to open new training on an archived avatar.

    Conflict rather than not-found: the avatar exists and its history is
    still there to read, it just cannot be trained on any more.
    """
    if avatar.is_deleted:
        raise HTTPException(
            status_code=409,
            detail=(
                f"L'avatar '{avatar.name}' è archiviato: non è più possibile "
                "iniziare nuove sessioni con questo cliente."
            ),
        )


def _own_history(
    db: Session, user: User, avatar_ids: list[UUID]
) -> dict[UUID, tuple[int, datetime]]:
    """Quante sessioni ha già fatto chi guarda con ciascun avatar, e quando.

    Sono le proprie e basta: la galleria dice a ognuno cosa ha fatto lui, non
    quanto è frequentato un interlocutore, che sarebbe il lavoro altrui messo
    in vetrina. Per questo il filtro è sull'utente della richiesta e non c'è
    nessun parametro con cui chiedere quello di un altro.

    Una riga di chat_conversations è una sessione davvero cominciata: nasce
    alla prima battuta di una telefonata o al primo messaggio scritto, non
    aprendo la schermata (vedi routers/chat.py e routers/voice.py).

    Una query sola e raggruppata, non una per avatar: quelli mai affrontati
    sono semplicemente assenti dalla mappa, e chi la legge ricade su zero.
    """
    if not avatar_ids:
        return {}
    return {
        avatar_id: (sessions, last_at)
        for avatar_id, sessions, last_at in db.query(
            ChatConversation.avatar_id,
            func.count(ChatConversation.id),
            func.max(ChatConversation.created_at),
        )
        .filter(
            ChatConversation.user_id == user.id,
            ChatConversation.avatar_id.in_(avatar_ids),
        )
        .group_by(ChatConversation.avatar_id)
        .all()
    }


def _avatar_response(avatar: Avatar, history: tuple[int, datetime] | None = None) -> AvatarResponse:
    """Serialize one avatar with the viewer's own history already computed."""
    own_sessions, last_session_at = history or (0, None)
    return AvatarResponse(
        id=avatar.id,
        name=avatar.name,
        image_url=avatar.image_url,
        category=avatar.category_name,
        category_id=avatar.category_id,
        category_color=avatar.category_color,
        description=avatar.description,
        created_at=avatar.created_at,
        own_sessions=own_sessions,
        last_session_at=last_session_at,
    )


@router.get("", response_model=list[AvatarResponse])
def get_avatars(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Il catalogo visibile a chi guarda, intero.

    Nessun filtro per categoria: c'era, ed era una query string che finiva in
    una voce di cache per categoria, cioè una richiesta e un'attesa a ogni
    pastiglia premuta nella galleria. Il catalogo di un'organizzazione sta in
    una risposta sola, quindi la galleria lo legge una volta e filtra sui dati
    che ha già (vedi `avatarFilters` nel frontend), che è anche il motivo per
    cui può cercare per nome e dire quanti avatar contiene ogni categoria
    senza chiedere niente.
    """
    avatars = (
        active_avatars(_visible_avatars(db.query(Avatar), current_user)).order_by(Avatar.id).all()
    )

    history = _own_history(db, current_user, [a.id for a in avatars])
    return [_avatar_response(a, history.get(a.id)) for a in avatars]


@router.get("/categories", response_model=list[AvatarCategoryResponse])
def get_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Le categorie dell'organizzazione di chi guarda, in ordine alfabetico.

    L'anagrafica intera e non solo le categorie che hanno un avatar: un
    gruppo appena creato e ancora vuoto deve comunque comparire nei filtri,
    altrimenti sembrerebbe non essere stato salvato. Il super admin, che non
    sta in nessun tenant, le vede tutte.
    """
    query = db.query(AvatarCategory)
    if current_user.ruolo != ROLE_SUPER_ADMIN:
        query = query.filter(AvatarCategory.organization_id == current_user.organization_id)
    return query.order_by(AvatarCategory.name.asc()).all()


@router.get("/{avatar_id}", response_model=AvatarResponse)
def get_avatar(
    avatar_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific avatar by ID.

    Archived avatars are served too: this is what the conversation screen
    reads to put a name and a face on a past session.
    """
    avatar = _visible_avatars(db.query(Avatar), current_user).filter(Avatar.id == avatar_id).first()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar non trovato.")

    return _avatar_response(avatar, _own_history(db, current_user, [avatar.id]).get(avatar.id))


# Le selezioni non esistono più. C'erano una tabella `user_selections`,
# l'endpoint `POST /select` che la scriveva e un contatore in ogni risposta,
# ma nessuna schermata chiamava quell'endpoint: la galleria apre direttamente
# la chat, quindi la tabella è rimasta vuota mentre il contatore, sempre a
# zero, costava una query aggregata a ogni caricamento e una sezione vuota
# nell'export dell'articolo 15.
#
# Quello che serviva davvero lo dà `_own_history` qui sopra, contando le
# conversazioni: chi ha parlato con un avatar, e quando, invece di chi ci ha
# cliccato sopra. Un dato personale in meno da conservare, e senza perderne
# nessuno, perché non ce n'era nessuno (vedi `_drop_user_selections` in
# startup_migrations).
