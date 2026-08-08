"""What the platform has to tell a user, derived from what it already knows.

Things happen to a student while nobody is looking: a path is handed out, a
step of it unlocks, its deadline gets close, the deadline passes, the last
step closes, a trainer publishes a review of one of their conversations.
Until now each was discovered by chance, on the next login.

None of them is stored as a notification. They are all read out of the rows
that already describe them, exactly like the progress of a training
assignment is (see routers/training), and for the same reason: a stored
notification is a copy that goes stale. Move a deadline forward and a saved
"scaduto" keeps announcing something that is no longer true; delete an
assignment and its notification outlives it. Derived, they simply stop
being produced, and there is nothing to reconcile.

The only thing written down is what the user has already read
(NotificationRead), because that is the one fact no query can reconstruct.

Every item carries a stable `key`: it identifies the event across requests,
so a read mark keeps matching it. The key of a review contains the moment
it was last touched, which is deliberate — a trainer who revises their
verdict produces a new key, and therefore an unread notification, because
the student has genuinely not seen that version.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import (
    Avatar,
    ChatConversation,
    ConversationReview,
    MessageAnnotation,
    NotificationRead,
    TrainingPathAssignment,
    User,
)
from schemas import (
    ASSIGNMENT_STATUS_ACTIVE,
    ASSIGNMENT_STATUS_COMPLETED,
    ASSIGNMENT_STATUS_COMPLETED_LATE,
    ASSIGNMENT_STATUS_LOCKED,
    ASSIGNMENT_STATUS_OVERDUE,
)

# Kinds, which are also what the UI picks an icon by
KIND_ASSIGNED = "assignment.assigned"
KIND_UNLOCKED = "assignment.unlocked"
KIND_DUE_SOON = "assignment.due_soon"
KIND_OVERDUE = "assignment.overdue"
KIND_PATH_COMPLETED = "assignment.completed"
KIND_REVIEW = "review.published"

# How early a deadline starts being announced. Three days is enough to do
# something about it and short enough that the notice does not sit around
# for a fortnight becoming furniture.
DUE_SOON_DAYS = 3


@dataclass
class NotificationItem:
    """One thing to tell the user, assembled at read time."""

    key: str
    kind: str
    title: str
    body: str
    # When the event became true, which is what the list is sorted by. Not
    # "when it was generated": these are generated on every request.
    at: datetime
    read: bool
    # Where clicking it takes the user, or None when there is nowhere to go.
    # Sono percorsi del frontend, e stanno tutti sotto `/app`: chi legge una
    # notifica ha una sessione aperta, quindi la destinazione è sempre
    # dentro l'area collegata.
    link: str | None = None


def _now() -> datetime:
    """Naive UTC, the convention of every datetime column in this schema."""
    return datetime.now(UTC).replace(tzinfo=None)


def _naive(value: datetime) -> datetime:
    """Bring a timestamp into the schema's convention, naive UTC.

    A row read back from the database is already naive, but one still in the
    session carries the tz-aware default of its Python column, and the two
    cannot be compared: without this the ordering of the list raises as soon
    as a freshly created assignment meets an older one. Same precaution as
    routers/training._naive_utc, for the same reason.
    """
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _fmt_date(value: datetime) -> str:
    return value.strftime("%d/%m/%Y")


def _fmt_score(score: float) -> str:
    return f"{score:.1f}".rstrip("0").rstrip(".").replace(".", ",")


def _step_target(step) -> str:
    """Di cosa parla una tappa: il nome dell'avatar o il titolo del test."""
    return step.avatar_name or step.simulation_title or ""


def _assignment_items(db: Session, user: User) -> list[NotificationItem]:
    """The paths of a user, and whatever their current step says.

    The status comes from routers/training, imported here rather than
    reimplemented: "completed" has one definition in this codebase and a
    second copy of it would eventually disagree with the page the student
    reads.

    Le tappe chiuse e quelle ancora bloccate non producono niente: le prime
    non chiedono più nulla, le seconde non si possono nemmeno cominciare, e
    annunciare una scadenza per una tappa a cui non si è arrivati sarebbe
    una data da temere senza motivo. Quello che si racconta è il percorso
    quando arriva, la tappa quando si apre, la sua scadenza mentre è aperta
    e il percorso quando si chiude.
    """
    # Local import: routers/training pulls in the whole FastAPI stack, and
    # this module is also used by plain queries in the tests.
    from routers.training import _assignment_responses, _loaded_assignments

    assignments = (
        _loaded_assignments(db)
        .filter(TrainingPathAssignment.user_id == user.id)
        .order_by(TrainingPathAssignment.created_at.desc())
        .all()
    )
    if not assignments:
        return []

    now = _now()
    items: list[NotificationItem] = []
    for response in _assignment_responses(db, assignments):
        path = response.path_title
        total = len(response.steps)

        items.append(
            NotificationItem(
                key=f"{KIND_ASSIGNED}:{response.id}",
                kind=KIND_ASSIGNED,
                title="Nuovo percorso di training",
                body=(
                    f"«{path}» ti è stato assegnato: {total} "
                    f"{'tappa' if total == 1 else 'tappe'} da superare in ordine."
                ),
                at=_naive(response.created_at),
                read=False,
                link="/app",
            )
        )

        if response.status in (ASSIGNMENT_STATUS_COMPLETED, ASSIGNMENT_STATUS_COMPLETED_LATE):
            # Il percorso è finito: l'ultima tappa chiusa è il momento in cui
            # lo è diventato, e non c'è nessuna scadenza di cui parlare.
            closed_at = max(_naive(s.achieved_at) for s in response.steps)
            items.append(
                NotificationItem(
                    key=f"{KIND_PATH_COMPLETED}:{response.id}",
                    kind=KIND_PATH_COMPLETED,
                    title="Percorso completato",
                    body=f"Hai superato tutte le tappe di «{path}».",
                    at=closed_at,
                    read=False,
                    link="/app",
                )
            )
            continue

        for step in response.steps:
            if step.status == ASSIGNMENT_STATUS_LOCKED:
                continue
            target = _fmt_score(step.target_score)
            what = _step_target(step)

            # La prima tappa si apre insieme al percorso, e l'ha già
            # annunciata l'assegnazione: dirlo due volte nello stesso
            # istante sarebbe la stessa notizia scritta in due modi.
            if step.position > 1 and step.unlocked_at is not None:
                items.append(
                    NotificationItem(
                        key=f"{KIND_UNLOCKED}:{response.id}:{step.id}",
                        kind=KIND_UNLOCKED,
                        title="Nuova tappa sbloccata",
                        body=(
                            f"Tappa {step.position} di «{path}»: ora tocca a {what}, "
                            f"obiettivo {target} su 10."
                        ),
                        at=_naive(step.unlocked_at),
                        read=False,
                        link="/app",
                    )
                )

            if step.due_at is None:
                continue
            due_at = _naive(step.due_at)

            # Una tappa già superata non ha più una scadenza da temere,
            # nemmeno se la data passa: lo status lo dice già.
            if step.status == ASSIGNMENT_STATUS_ACTIVE:
                opens_at = due_at - timedelta(days=DUE_SOON_DAYS)
                if opens_at <= now:
                    items.append(
                        NotificationItem(
                            key=f"{KIND_DUE_SOON}:{response.id}:{step.id}",
                            kind=KIND_DUE_SOON,
                            title="Una tappa sta per scadere",
                            body=(
                                f"{what} scade il {_fmt_date(due_at)} e non hai "
                                f"ancora raggiunto {target}."
                            ),
                            # Datata a quando è entrata nella finestra, non alla
                            # scadenza: altrimenti si ordinerebbe nel futuro,
                            # sopra a tutto il resto.
                            at=opens_at,
                            read=False,
                            link="/app",
                        )
                    )
            elif step.status == ASSIGNMENT_STATUS_OVERDUE:
                items.append(
                    NotificationItem(
                        key=f"{KIND_OVERDUE}:{response.id}:{step.id}",
                        kind=KIND_OVERDUE,
                        title="Tappa scaduta",
                        body=(
                            f"La scadenza per {what} era il {_fmt_date(due_at)}. "
                            "Puoi ancora riprovare."
                        ),
                        at=due_at,
                        read=False,
                        link="/app",
                    )
                )

    return items


def _review_items(db: Session, user: User) -> list[NotificationItem]:
    """The trainer's passages over this user's conversations.

    One notification per conversation, dated at the most recent thing the
    trainer did to it: writing the review header or pinning a note to a
    message count the same, because from the student's side they are the
    same event, "someone has been through my call".
    """
    reviews = dict(
        db.query(ConversationReview.conversation_id, ConversationReview.updated_at)
        .join(ChatConversation, ChatConversation.id == ConversationReview.conversation_id)
        .filter(ChatConversation.user_id == user.id)
        .all()
    )
    annotated = dict(
        db.query(MessageAnnotation.conversation_id, func.max(MessageAnnotation.updated_at))
        .join(ChatConversation, ChatConversation.id == MessageAnnotation.conversation_id)
        .filter(ChatConversation.user_id == user.id)
        .group_by(MessageAnnotation.conversation_id)
        .all()
    )

    touched: dict[UUID, datetime] = {}
    for conversation_id, at in [*reviews.items(), *annotated.items()]:
        if at is None:
            continue
        at = _naive(at)
        touched[conversation_id] = max(touched.get(conversation_id, at), at)
    if not touched:
        return []

    rows = (
        db.query(ChatConversation, Avatar.name)
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
        .filter(ChatConversation.id.in_(touched.keys()))
        .all()
    )
    return [
        NotificationItem(
            # Il momento fa parte della chiave: se il docente rivede il
            # proprio giudizio, quella è una notifica nuova, perché è una
            # versione che lo studente non ha davvero letto.
            key=f"{KIND_REVIEW}:{conversation.id}:{touched[conversation.id].isoformat(timespec='seconds')}",
            kind=KIND_REVIEW,
            title="Il docente ha rivisto una tua conversazione",
            body=f"«{conversation.title}» con {avatar_name} ha un commento del docente.",
            at=touched[conversation.id],
            read=False,
            link=f"/app/chat/{conversation.avatar_id}?conversation={conversation.id}",
        )
        for conversation, avatar_name in rows
    ]


def for_user(db: Session, user: User) -> list[NotificationItem]:
    """Everything there is to tell `user`, newest first, read flag included."""
    items = _assignment_items(db, user) + _review_items(db, user)
    read_keys = {
        key for (key,) in db.query(NotificationRead.key).filter(NotificationRead.user_id == user.id)
    }
    for item in items:
        item.read = item.key in read_keys
    items.sort(key=lambda i: i.at, reverse=True)
    return items


def mark_read(db: Session, user: User, keys: list[str]) -> int:
    """Record `keys` as read by `user`; returns how many were newly marked.

    Keys already marked are skipped rather than rewritten: the read mark
    records the first time the user saw it, and a second call must not move
    that date.
    """
    if not keys:
        return 0
    unique = {k.strip() for k in keys if k and k.strip()}
    already = {
        key
        for (key,) in db.query(NotificationRead.key).filter(
            NotificationRead.user_id == user.id,
            NotificationRead.key.in_(unique),
        )
    }
    fresh = unique - already
    if fresh:
        db.add_all([NotificationRead(user_id=user.id, key=key) for key in fresh])
        db.commit()
    return len(fresh)
