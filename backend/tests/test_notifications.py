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
)


def _naive(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None)


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


# ── Percorsi ──────────────────────────────────────────
#
# La scadenza di una tappa è una data scritta sulla tappa (vedi
# ``TrainingPathStep.due_at``): per farla passare la si mette nel passato,
# senza dover retrodatare niente altro.


def _in(days: float) -> datetime:
    """Un momento a distanza di giorni da adesso, nel verso che si chiede."""
    return _naive(datetime.now(UTC) + timedelta(days=days))


def _overdue(make_assigned_path, user, avatar, *, target=7.0):
    """Un percorso la cui prima tappa è scaduta ieri."""
    return make_assigned_path(
        user,
        [{"avatar": avatar, "target": target, "due_at": _in(-1)}],
    )


def test_an_assigned_path_is_announced(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    make_assigned_path(
        standard_user, [{"avatar": make_avatar(name="Mario Rossi")}], title="Onboarding"
    )

    body = user_client.get("/api/notifications").json()

    assert body["unread"] == 1
    item = body["items"][0]
    assert item["kind"] == "assignment.assigned"
    assert "Onboarding" in item["body"]
    assert item["read"] is False


def test_an_unlocked_step_is_announced(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    """La prima tappa non lo è: l'ha già detto l'assegnazione."""
    first = make_avatar(name="Mario Rossi")
    second = make_avatar(name="Luisa Bianchi")
    make_assigned_path(standard_user, [{"avatar": first}, {"avatar": second}])
    assert "assignment.unlocked" not in _kinds(user_client.get("/api/notifications"))

    _evaluated_conversation(db_session, standard_user, first, score=8.0)

    items = user_client.get("/api/notifications").json()["items"]
    unlocked = next(i for i in items if i["kind"] == "assignment.unlocked")
    assert "Luisa Bianchi" in unlocked["body"]


def test_a_locked_step_still_in_time_announces_nothing(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    """Una scadenza che deve ancora arrivare, su una tappa che non si può
    cominciare, sarebbe una data da temere senza motivo."""
    make_assigned_path(
        standard_user,
        [
            {"avatar": make_avatar(name="Mario Rossi")},
            {"avatar": make_avatar(name="Luisa Bianchi"), "due_at": _in(2)},
        ],
    )

    kinds = _kinds(user_client.get("/api/notifications"))

    assert "assignment.due_soon" not in kinds
    assert kinds.count("assignment.overdue") == 0


def test_a_locked_step_past_its_date_is_announced(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    """La data sta sul calendario e passa anche a tappa chiusa: il ritardo
    c'è davvero, e si dice come uscirne invece di dire "riprova"."""
    make_assigned_path(
        standard_user,
        [
            {"avatar": make_avatar(name="Mario Rossi")},
            {"avatar": make_avatar(name="Luisa Bianchi"), "due_at": _in(-1)},
        ],
    )

    items = user_client.get("/api/notifications").json()["items"]

    overdue = next(i for i in items if i["kind"] == "assignment.overdue")
    assert "Luisa Bianchi" in overdue["body"]
    assert "superi la tappa 1" in overdue["body"]


def test_a_completed_path_is_announced(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    avatar = make_avatar()
    make_assigned_path(standard_user, [{"avatar": avatar, "target": 7.0}], title="Onboarding")
    _evaluated_conversation(db_session, standard_user, avatar, score=8.0)

    kinds = _kinds(user_client.get("/api/notifications"))

    assert "assignment.completed" in kinds


def test_a_deadline_three_days_out_is_announced(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    make_assigned_path(standard_user, [{"avatar": make_avatar(), "due_at": _in(2)}])

    kinds = _kinds(user_client.get("/api/notifications"))

    assert "assignment.due_soon" in kinds


def test_a_distant_deadline_is_not_announced(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    make_assigned_path(standard_user, [{"avatar": make_avatar(), "due_at": _in(30)}])

    kinds = _kinds(user_client.get("/api/notifications"))

    assert "assignment.due_soon" not in kinds
    assert "assignment.overdue" not in kinds


def test_a_passed_deadline_is_announced(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    _overdue(make_assigned_path, standard_user, make_avatar())

    kinds = _kinds(user_client.get("/api/notifications"))

    assert "assignment.overdue" in kinds
    # Scaduto e "sta per scadere" si escludono: sono due stati della stessa
    # tappa, non due notizie diverse
    assert "assignment.due_soon" not in kinds


def test_reaching_the_target_silences_the_deadline(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    """La notifica non viene cancellata da nessuno: smette di essere vera."""
    avatar = make_avatar()
    _overdue(make_assigned_path, standard_user, avatar)
    assert "assignment.overdue" in _kinds(user_client.get("/api/notifications"))

    _evaluated_conversation(db_session, standard_user, avatar, score=8.0)

    assert "assignment.overdue" not in _kinds(user_client.get("/api/notifications"))


def test_moving_a_deadline_further_out_silences_the_warning(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    assignment = make_assigned_path(standard_user, [{"avatar": make_avatar(), "due_at": _in(1)}])
    assert "assignment.due_soon" in _kinds(user_client.get("/api/notifications"))

    assignment.path.steps[0].due_at = _in(40)
    db_session.flush()

    assert "assignment.due_soon" not in _kinds(user_client.get("/api/notifications"))


def test_a_withdrawn_path_takes_its_notifications_with_it(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    assignment = _overdue(make_assigned_path, standard_user, make_avatar())
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
    assert item["link"] == f"/app/chat/{conversation.avatar_id}?conversation={conversation.id}"


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


def test_marking_one_as_read(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    _overdue(make_assigned_path, standard_user, make_avatar())
    items = user_client.get("/api/notifications").json()["items"]
    assert len(items) == 2

    body = user_client.post("/api/notifications/read", json={"keys": [items[0]["key"]]}).json()

    assert body["unread"] == 1
    assert [i["read"] for i in body["items"]] == [True, False]


def test_marking_everything_as_read(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    _overdue(make_assigned_path, standard_user, make_avatar())

    body = user_client.post("/api/notifications/read", json={}).json()

    assert body["unread"] == 0
    assert all(i["read"] for i in body["items"])


def test_the_read_mark_is_not_moved_by_a_second_call(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    """Registra la prima volta che l'utente l'ha vista, non l'ultima."""
    make_assigned_path(standard_user, [{"avatar": make_avatar()}])
    user_client.post("/api/notifications/read", json={})
    first = db_session.query(NotificationRead).one().read_at

    user_client.post("/api/notifications/read", json={})

    assert db_session.query(NotificationRead).one().read_at == first


# ── L'impronta della risposta ─────────────────────────
#
# La campanella ricontrolla ogni due minuti finché una scheda resta aperta, e
# quasi sempre non è cambiato niente: l'ETag fa tornare quelle riletture
# senza corpo. Quello che questi test fissano è che l'impronta cambi
# esattamente quando cambia la risposta, perché un'impronta ferma su una
# lista che si è mossa è una notifica che non arriva.


def test_the_same_list_comes_back_without_a_body(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    _overdue(make_assigned_path, standard_user, make_avatar())
    first = user_client.get("/api/notifications")
    etag = first.headers["etag"]

    again = user_client.get("/api/notifications", headers={"If-None-Match": etag})

    assert first.status_code == 200
    assert again.status_code == 304
    assert again.content == b""
    # L'impronta torna anche sul 304: senza, il giro dopo il browser non
    # avrebbe più niente da presentare e ricomincerebbe a scaricare tutto.
    assert again.headers["etag"] == etag


def test_an_unknown_fingerprint_gets_the_whole_list(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    _overdue(make_assigned_path, standard_user, make_avatar())

    response = user_client.get("/api/notifications", headers={"If-None-Match": '"inventata"'})

    assert response.status_code == 200
    assert response.json()["items"]


def test_reading_a_notification_changes_the_fingerprint(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    """Il segno di lettura è dentro la risposta, quindi ne cambia l'impronta.

    Se non lo facesse, la campanella continuerebbe a mostrare il pallino su
    notifiche che l'utente ha appena letto da un'altra scheda.
    """
    _overdue(make_assigned_path, standard_user, make_avatar())
    etag = user_client.get("/api/notifications").headers["etag"]

    user_client.post("/api/notifications/read", json={})

    assert user_client.get("/api/notifications", headers={"If-None-Match": etag}).status_code == 200


def test_a_new_path_changes_the_fingerprint(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    make_assigned_path(standard_user, [{"avatar": make_avatar()}])
    etag = user_client.get("/api/notifications").headers["etag"]

    make_assigned_path(standard_user, [{"avatar": make_avatar()}])

    fresh = user_client.get("/api/notifications", headers={"If-None-Match": etag})
    assert fresh.status_code == 200
    assert len(fresh.json()["items"]) == 2


def test_the_response_is_never_reused_without_asking(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    """Una scadenza che si avvicina non è la scrittura di nessuno: la
    risposta cambia col tempo, quindi non si può dare per buona senza
    chiedere, e non è di chi la conserva ma di una persona sola."""
    make_assigned_path(standard_user, [{"avatar": make_avatar()}])

    headers = user_client.get("/api/notifications").headers

    assert headers["cache-control"] == "private, no-cache"
    assert "Cookie" in headers["vary"]


# ── Confini ───────────────────────────────────────────


def test_notifications_are_strictly_first_person(
    client, act_as, db_session, standard_user, org_admin_user, make_avatar, make_assigned_path
):
    """L'admin che apre la propria campanella non legge quella dei suoi
    studenti: l'endpoint risponde sempre e solo sul chiamante."""
    make_assigned_path(standard_user, [{"avatar": make_avatar()}])

    act_as(org_admin_user)
    assert client.get("/api/notifications").json()["items"] == []

    act_as(standard_user)
    assert client.get("/api/notifications").json()["unread"] == 1


def test_notifications_require_authentication(client):
    assert client.get("/api/notifications").status_code == 401
