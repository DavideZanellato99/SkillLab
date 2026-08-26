"""The audit trail: what gets recorded, and who is allowed to read it."""

import uuid

import audit
from models import AuditLog, ChatConversation


def _conversazione(db_session, user, avatar) -> ChatConversation:
    """Una conversazione della persona, da rinominare.

    Rinominare è l'azione mutante più semplice che un utente semplice possa
    fare davvero: non chiama nessun fornitore esterno e non chiede nessun
    ruolo di amministrazione.
    """
    conversation = ChatConversation(
        user_id=user.id, avatar_id=avatar.id, title="Clienti 1", mode="text"
    )
    db_session.add(conversation)
    db_session.commit()
    return conversation


def _logs(db_session, action: str | None = None) -> list[AuditLog]:
    query = db_session.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    return query.order_by(AuditLog.created_at.asc()).all()


# ── Cosa finisce nel registro ─────────────────────────


def test_mutating_request_is_recorded(user_client, db_session, standard_user, make_avatar):
    """A plain user's action lands in the log with its actor and target."""
    conversazione = _conversazione(db_session, standard_user, make_avatar())

    response = user_client.patch(
        f"/api/chat/conversation/{conversazione.id}", json={"title": "Rinominata"}
    )
    assert response.status_code == 200

    rows = _logs(db_session, "conversation.rename")
    assert len(rows) == 1
    row = rows[0]
    assert row.user_id == standard_user.id
    assert row.user_email == standard_user.email
    assert row.user_role == "user"
    assert row.organization_id == standard_user.organization_id
    assert row.method == "PATCH"
    assert row.path == f"/api/chat/conversation/{conversazione.id}"
    assert row.status_code == 200


def test_read_only_request_is_not_recorded(user_client, db_session, make_avatar):
    """GETs stay out: navigation is not an action."""
    make_avatar()

    assert user_client.get("/api/avatars").status_code == 200

    assert _logs(db_session) == []


def test_failed_action_is_recorded_with_its_status(user_client, db_session):
    """A rejected attempt is an action too, and keeps its status code."""
    response = user_client.patch(
        f"/api/chat/conversation/{uuid.uuid4()}", json={"title": "Mai esistita"}
    )
    assert response.status_code == 404

    rows = _logs(db_session, "conversation.rename")
    assert len(rows) == 1
    assert rows[0].status_code == 404


def test_resource_id_comes_from_the_path(admin_client, db_session, standard_user):
    """The id of what was touched is filled in without the endpoint's help."""
    response = admin_client.put(f"/api/admin/users/{standard_user.id}", json={"nome": "Nuovo nome"})
    assert response.status_code == 200

    rows = _logs(db_session, "user.update")
    assert len(rows) == 1
    assert rows[0].resource_type == "user"
    assert rows[0].resource_id == str(standard_user.id)


def test_super_admin_actions_are_recorded_too(admin_client, db_session, super_admin_user):
    """No role is exempt from the registry, the super admin included."""
    response = admin_client.put("/api/auth/me", json={"nome": "Super", "cognome": "Admin"})
    assert response.status_code == 200

    rows = _logs(db_session, "profile.update")
    assert len(rows) == 1
    assert rows[0].user_id == super_admin_user.id
    assert rows[0].user_role == "super_admin"


def test_unauthenticated_attempt_is_not_recorded(client, db_session):
    """Rejected before the endpoint, with no identifiable actor: nothing to log."""
    assert client.put("/api/auth/me", json={"nome": "Anna", "cognome": "Rossi"}).status_code == 401

    assert _logs(db_session) == []


def test_details_never_carry_the_request_body(user_client, db_session, standard_user, make_avatar):
    """Only what an endpoint whitelists reaches the details column."""
    conversazione = _conversazione(db_session, standard_user, make_avatar())
    user_client.patch(
        f"/api/chat/conversation/{conversazione.id}", json={"title": "Titolo scritto a mano"}
    )

    assert _logs(db_session, "conversation.rename")[0].details is None


# ── Chi può leggerlo ──────────────────────────────────


def test_super_admin_reads_the_registry(admin_client):
    response = admin_client.get("/api/admin/audit-logs")
    assert response.status_code == 200
    assert response.json().keys() >= {"total", "items"}


def test_plain_user_cannot_read_the_registry(user_client):
    assert user_client.get("/api/admin/audit-logs").status_code == 403


def test_organization_admin_cannot_read_the_registry(org_admin_client):
    """Not even for its own tenant: the log is the super admin's alone."""
    assert org_admin_client.get("/api/admin/audit-logs").status_code == 403


# ── Filtri e ordinamento ──────────────────────────────


def test_registry_filters_by_user_and_action(
    admin_client, act_as, standard_user, super_admin_user, make_avatar, db_session
):
    conversazione = _conversazione(db_session, standard_user, make_avatar())
    act_as(standard_user)
    admin_client.patch(f"/api/chat/conversation/{conversazione.id}", json={"title": "Rinominata"})
    act_as(super_admin_user)
    admin_client.put(f"/api/admin/users/{standard_user.id}", json={"nome": "Filtrato"})

    by_user = admin_client.get(
        "/api/admin/audit-logs", params={"user_id": str(standard_user.id)}
    ).json()
    assert by_user["total"] == 1
    assert by_user["items"][0]["action"] == "conversation.rename"

    by_action = admin_client.get("/api/admin/audit-logs", params={"action": "user.update"}).json()
    assert by_action["total"] == 1
    assert by_action["items"][0]["resource_id"] == str(standard_user.id)


def test_registry_returns_newest_first_and_labels_actions(
    admin_client, act_as, standard_user, super_admin_user, make_avatar, db_session
):
    conversazione = _conversazione(db_session, standard_user, make_avatar())
    act_as(standard_user)
    admin_client.patch(f"/api/chat/conversation/{conversazione.id}", json={"title": "Rinominata"})
    act_as(super_admin_user)
    admin_client.put(f"/api/admin/users/{standard_user.id}", json={"nome": "Ultimo"})

    items = admin_client.get("/api/admin/audit-logs").json()["items"]
    assert [i["action"] for i in items] == ["user.update", "conversation.rename"]
    assert items[0]["action_label"] == audit.action_label("user.update")


def test_registry_window_is_bounded(
    admin_client, act_as, standard_user, super_admin_user, make_avatar, db_session
):
    """`total` counts every match, the page returns only the window asked for."""
    conversazione = _conversazione(db_session, standard_user, make_avatar())
    act_as(standard_user)
    for _ in range(3):
        admin_client.patch(
            f"/api/chat/conversation/{conversazione.id}", json={"title": "Rinominata"}
        )

    act_as(super_admin_user)
    page = admin_client.get("/api/admin/audit-logs", params={"limit": 2}).json()
    assert page["total"] == 3
    assert len(page["items"]) == 2


def test_registry_filters_by_organization(
    admin_client, act_as, standard_user, super_admin_user, organization, make_avatar, db_session
):
    """The tenant is stamped on the row when the action happens, so filtering
    by it still finds the actions of someone who has moved since."""
    conversazione = _conversazione(db_session, standard_user, make_avatar())
    act_as(standard_user)
    admin_client.patch(f"/api/chat/conversation/{conversazione.id}", json={"title": "Rinominata"})
    act_as(super_admin_user)

    page = admin_client.get(
        "/api/admin/audit-logs", params={"organization_id": str(organization.id)}
    ).json()
    assert [i["action"] for i in page["items"]] == ["conversation.rename"]

    other = admin_client.get(
        "/api/admin/audit-logs", params={"organization_id": str(uuid.uuid4())}
    ).json()
    assert other["total"] == 0


def test_registry_filters_by_date_range(
    admin_client, act_as, standard_user, super_admin_user, db_session, make_avatar
):
    """The column is naive UTC and the client sends an ISO datetime with its
    offset: without dropping it the comparison would raise instead of
    filtering."""
    from datetime import UTC, datetime, timedelta

    conversazione = _conversazione(db_session, standard_user, make_avatar())
    act_as(standard_user)
    admin_client.patch(f"/api/chat/conversation/{conversazione.id}", json={"title": "Rinominata"})
    act_as(super_admin_user)
    now = datetime.now(UTC)

    inside = admin_client.get(
        "/api/admin/audit-logs",
        params={
            "date_from": (now - timedelta(hours=1)).isoformat(),
            "date_to": (now + timedelta(hours=1)).isoformat(),
        },
    ).json()
    assert inside["total"] >= 1

    before = admin_client.get(
        "/api/admin/audit-logs", params={"date_to": (now - timedelta(days=1)).isoformat()}
    ).json()
    assert before["total"] == 0


def test_registry_date_range_applies_the_offset_it_is_given(
    admin_client, act_as, standard_user, super_admin_user, db_session, make_avatar
):
    """A calendar day belongs to whoever picked it, not to Greenwich.

    The client sends the two ends of its own day as real instants, offset
    written. Dropping that offset instead of applying it moved the boundary
    by a whole timezone, which is how "today's actions" turned into the
    actions of a UTC day nobody lived through. Both bounds here sit around
    the row on the timeline and would fall on the wrong side of it if the
    offset were stripped.
    """
    from datetime import UTC, datetime, timedelta, timezone

    conversazione = _conversazione(db_session, standard_user, make_avatar())
    act_as(standard_user)
    admin_client.patch(f"/api/chat/conversation/{conversazione.id}", json={"title": "Rinominata"})
    act_as(super_admin_user)
    now = datetime.now(UTC)

    # Mezz'ora prima della riga, scritto in un fuso avanti: buttato via
    # l'offset diventerebbe un'ora e mezza DOPO, e la riga sparirebbe.
    da = (now - timedelta(minutes=30)).astimezone(timezone(timedelta(hours=2)))
    dopo = admin_client.get("/api/admin/audit-logs", params={"date_from": da.isoformat()}).json()
    assert dopo["total"] >= 1

    # Mezz'ora dopo la riga, scritto in un fuso indietro: buttato via
    # l'offset diventerebbe quattro ore e mezza PRIMA, stessa sparizione.
    al = (now + timedelta(minutes=30)).astimezone(timezone(timedelta(hours=-5)))
    prima = admin_client.get("/api/admin/audit-logs", params={"date_to": al.isoformat()}).json()
    assert prima["total"] >= 1

    # E il confine resta un confine: mezz'ora dopo la riga, come inizio.
    vuoto = admin_client.get(
        "/api/admin/audit-logs",
        params={
            "date_from": (now + timedelta(minutes=30))
            .astimezone(timezone(timedelta(hours=2)))
            .isoformat()
        },
    ).json()
    assert vuoto["total"] == 0


def test_registry_search_spans_the_columns_that_name_things(
    admin_client, act_as, standard_user, super_admin_user, make_avatar, db_session
):
    """One box for the four columns anyone would type into: who acted, which
    tenant, which route, which row."""
    conversazione = _conversazione(db_session, standard_user, make_avatar())
    act_as(standard_user)
    admin_client.patch(f"/api/chat/conversation/{conversazione.id}", json={"title": "Rinominata"})
    act_as(super_admin_user)

    by_email = admin_client.get(
        "/api/admin/audit-logs", params={"q": standard_user.email[:12]}
    ).json()
    assert by_email["total"] == 1

    by_path = admin_client.get("/api/admin/audit-logs", params={"q": "chat/conversation"}).json()
    assert by_path["total"] == 1

    # L'identificativo della riga toccata: lo porta chi ce l'ha nel percorso
    admin_client.put(f"/api/admin/users/{standard_user.id}", json={"nome": "Cercato"})
    by_resource = admin_client.get(
        "/api/admin/audit-logs", params={"q": str(standard_user.id)}
    ).json()
    assert by_resource["total"] == 1
    assert by_resource["items"][0]["action"] == "user.update"

    assert admin_client.get("/api/admin/audit-logs", params={"q": "  "}).json()["total"] >= 1
    assert (
        admin_client.get("/api/admin/audit-logs", params={"q": "mai-scritto"}).json()["total"] == 0
    )


def test_actions_catalogue_is_static(admin_client):
    """The filter offers every action, including ones nobody performed yet."""
    options = admin_client.get("/api/admin/audit-logs/actions").json()
    keys = {o["key"] for o in options}
    assert "auth.login" in keys
    assert "user.delete" in keys
    assert all(o["label"] for o in options)


# ── Immutabilità ──────────────────────────────────────


def test_registry_has_no_delete_endpoint(admin_client):
    """Nobody edits the trail, not even the super admin: only retention does."""
    assert admin_client.delete("/api/admin/audit-logs").status_code == 405
