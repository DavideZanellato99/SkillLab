"""Notifiche in app, derivate e mai memorizzate.

Il punto di questi test è proprio la derivazione: una notifica che non
descrive più la realtà deve sparire da sola, senza che nessuno la cancelli.
Sposta la scadenza e "sta per scadere" smette di comparire; raggiungi il
target e "scaduto" non c'è più. Un sistema che le salvasse avrebbe bisogno
di un lavoro di pulizia per ognuno di questi casi, e qui non c'è.
"""

from datetime import UTC, datetime, timedelta

from models import (
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationReview,
    MessageAnnotation,
    NotificationRead,
    TrainingAssignment,
)


def _naive(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None)


def _assign(db_session, user, avatar, *, target=7.0, due_in_days=None):
    assignment = TrainingAssignment(
        user_id=user.id,
        avatar_id=avatar.id,
        target_score=target,
        due_at=(
            _naive(datetime.now(UTC) + timedelta(days=due_in_days))
            if due_in_days is not None
            else None
        ),
    )
    db_session.add(assignment)
    db_session.flush()
    return assignment


def _evaluated_conversation(db_session, user, avatar, *, score=8.0):
    conversation = ChatConversation(
        user_id=user.id, avatar_id=avatar.id, title="Clienti 1", mode="text"
    )
    db_session.add(conversation)
    db_session.flush()
    db_session.add(
        ConversationEvaluation(
            conversation_id=conversation.id,
            overall_score=score,
            result={"summary": "", "criteria": []},
        )
    )
    db_session.flush()
    return conversation


def _kinds(response):
    return [i["kind"] for i in response.json()["items"]]


# ── Obiettivi ─────────────────────────────────────────


def test_an_assigned_goal_is_announced(user_client, db_session, standard_user, make_avatar):
    avatar = make_avatar(name="Mario Rossi")
    _assign(db_session, standard_user, avatar, target=7.0)

    body = user_client.get("/api/notifications").json()

    assert body["unread"] == 1
    item = body["items"][0]
    assert item["kind"] == "assignment.assigned"
    assert "Mario Rossi" in item["body"]
    assert "7" in item["body"]
    assert item["read"] is False


def test_a_deadline_three_days_out_is_announced(
    user_client, db_session, standard_user, make_avatar
):
    _assign(db_session, standard_user, make_avatar(), due_in_days=2)

    kinds = _kinds(user_client.get("/api/notifications"))

    assert "assignment.due_soon" in kinds


def test_a_distant_deadline_is_not_announced(user_client, db_session, standard_user, make_avatar):
    _assign(db_session, standard_user, make_avatar(), due_in_days=30)

    kinds = _kinds(user_client.get("/api/notifications"))

    assert "assignment.due_soon" not in kinds
    assert "assignment.overdue" not in kinds


def test_a_passed_deadline_is_announced(user_client, db_session, standard_user, make_avatar):
    _assign(db_session, standard_user, make_avatar(), due_in_days=-1)

    kinds = _kinds(user_client.get("/api/notifications"))

    assert "assignment.overdue" in kinds
    # Scaduto e "sta per scadere" si escludono: sono due stati dello stesso
    # obiettivo, non due notizie diverse
    assert "assignment.due_soon" not in kinds


def test_reaching_the_target_silences_the_deadline(
    user_client, db_session, standard_user, make_avatar
):
    """La notifica non viene cancellata da nessuno: smette di essere vera."""
    avatar = make_avatar()
    _assign(db_session, standard_user, avatar, target=7.0, due_in_days=-1)
    assert "assignment.overdue" in _kinds(user_client.get("/api/notifications"))

    _evaluated_conversation(db_session, standard_user, avatar, score=8.0)

    assert "assignment.overdue" not in _kinds(user_client.get("/api/notifications"))


def test_moving_the_deadline_forward_silences_the_warning(
    user_client, db_session, standard_user, make_avatar
):
    assignment = _assign(db_session, standard_user, make_avatar(), due_in_days=1)
    assert "assignment.due_soon" in _kinds(user_client.get("/api/notifications"))

    assignment.due_at = _naive(datetime.now(UTC) + timedelta(days=40))
    db_session.flush()

    assert "assignment.due_soon" not in _kinds(user_client.get("/api/notifications"))


def test_a_deleted_assignment_takes_its_notifications_with_it(
    user_client, db_session, standard_user, make_avatar
):
    assignment = _assign(db_session, standard_user, make_avatar(), due_in_days=-1)
    assert user_client.get("/api/notifications").json()["unread"] == 2

    db_session.delete(assignment)
    db_session.flush()

    assert user_client.get("/api/notifications").json()["items"] == []


# ── Revisione del docente ─────────────────────────────


def test_a_published_review_is_announced(user_client, db_session, standard_user, make_avatar):
    conversation = _evaluated_conversation(db_session, standard_user, make_avatar())
    db_session.add(
        ConversationReview(
            conversation_id=conversation.id,
            reviewer_name="Prof Bianchi",
            summary_note="Buona apertura.",
        )
    )
    db_session.flush()

    item = user_client.get("/api/notifications").json()["items"][0]

    assert item["kind"] == "review.published"
    assert "Clienti 1" in item["body"]
    assert item["link"] == f"/chat/{conversation.avatar_id}?conversation={conversation.id}"


def test_an_annotation_alone_is_announced(user_client, db_session, standard_user, make_avatar):
    """Un docente che passa la trascrizione appuntando note ha fatto la cosa
    che lo studente deve sapere, anche senza scrivere una sintesi."""
    conversation = _evaluated_conversation(db_session, standard_user, make_avatar())
    message = ChatMessage(conversation_id=conversation.id, role="user", content="Buongiorno.")
    db_session.add(message)
    db_session.flush()
    db_session.add(
        MessageAnnotation(
            conversation_id=conversation.id,
            message_id=message.id,
            reviewer_name="Prof Bianchi",
            note="Manca il cognome.",
        )
    )
    db_session.flush()

    assert _kinds(user_client.get("/api/notifications")) == ["review.published"]


def test_a_revised_review_becomes_unread_again(user_client, db_session, standard_user, make_avatar):
    """Il docente cambia idea: è una versione che lo studente non ha letto."""
    conversation = _evaluated_conversation(db_session, standard_user, make_avatar())
    review = ConversationReview(
        conversation_id=conversation.id,
        reviewer_name="Prof Bianchi",
        summary_note="Prima stesura.",
    )
    db_session.add(review)
    db_session.flush()
    user_client.post("/api/notifications/read", json={})
    assert user_client.get("/api/notifications").json()["unread"] == 0

    review.summary_note = "Ci ho ripensato."
    review.updated_at = _naive(datetime.now(UTC) + timedelta(minutes=5))
    db_session.flush()

    assert user_client.get("/api/notifications").json()["unread"] == 1


# ── Lettura ───────────────────────────────────────────


def test_marking_one_as_read(user_client, db_session, standard_user, make_avatar):
    _assign(db_session, standard_user, make_avatar(), due_in_days=-1)
    items = user_client.get("/api/notifications").json()["items"]
    assert len(items) == 2

    body = user_client.post("/api/notifications/read", json={"keys": [items[0]["key"]]}).json()

    assert body["unread"] == 1
    assert [i["read"] for i in body["items"]] == [True, False]


def test_marking_everything_as_read(user_client, db_session, standard_user, make_avatar):
    _assign(db_session, standard_user, make_avatar(), due_in_days=-1)

    body = user_client.post("/api/notifications/read", json={}).json()

    assert body["unread"] == 0
    assert all(i["read"] for i in body["items"])


def test_the_read_mark_is_not_moved_by_a_second_call(
    user_client, db_session, standard_user, make_avatar
):
    """Registra la prima volta che l'utente l'ha vista, non l'ultima."""
    _assign(db_session, standard_user, make_avatar())
    user_client.post("/api/notifications/read", json={})
    first = db_session.query(NotificationRead).one().read_at

    user_client.post("/api/notifications/read", json={})

    assert db_session.query(NotificationRead).one().read_at == first


# ── Confini ───────────────────────────────────────────


def test_notifications_are_strictly_first_person(
    client, act_as, db_session, standard_user, org_admin_user, make_avatar
):
    """L'admin che apre la propria campanella non legge quella dei suoi
    studenti: l'endpoint risponde sempre e solo sul chiamante."""
    _assign(db_session, standard_user, make_avatar())

    act_as(org_admin_user)
    assert client.get("/api/notifications").json()["items"] == []

    act_as(standard_user)
    assert client.get("/api/notifications").json()["unread"] == 1


def test_notifications_require_authentication(client):
    assert client.get("/api/notifications").status_code == 401
