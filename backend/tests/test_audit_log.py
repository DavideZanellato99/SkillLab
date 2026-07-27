"""The audit trail: what gets recorded, and who is allowed to read it."""

import uuid

import audit
from models import AuditLog


def _logs(db_session, action: str | None = None) -> list[AuditLog]:
    query = db_session.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    return query.order_by(AuditLog.created_at.asc()).all()


# ── Cosa finisce nel registro ─────────────────────────


def test_mutating_request_is_recorded(user_client, db_session, standard_user, make_avatar):
    """A plain user's action lands in the log with its actor and target."""
    avatar = make_avatar()

    response = user_client.post("/api/avatars/select", json={"avatar_id": str(avatar.id)})
    assert response.status_code == 200

    rows = _logs(db_session, "avatar.select")
    assert len(rows) == 1
    row = rows[0]
    assert row.user_id == standard_user.id
    assert row.user_email == standard_user.email
    assert row.user_role == "user"
    assert row.organization_id == standard_user.organization_id
    assert row.method == "POST"
    assert row.path == "/api/avatars/select"
    assert row.status_code == 200


def test_read_only_request_is_not_recorded(user_client, db_session, make_avatar):
    """GETs stay out: navigation is not an action."""
    make_avatar()

    assert user_client.get("/api/avatars").status_code == 200

    assert _logs(db_session) == []


def test_failed_action_is_recorded_with_its_status(user_client, db_session):
    """A rejected attempt is an action too, and keeps its status code."""
    response = user_client.post("/api/avatars/select", json={"avatar_id": str(uuid.uuid4())})
    assert response.status_code == 404

    rows = _logs(db_session, "avatar.select")
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
    assert (
        client.post("/api/avatars/select", json={"avatar_id": str(uuid.uuid4())}).status_code == 401
    )

    assert _logs(db_session) == []


def test_details_never_carry_the_request_body(user_client, db_session, make_avatar):
    """Only what an endpoint whitelists reaches `details`."""
    avatar = make_avatar()
    user_client.post("/api/avatars/select", json={"avatar_id": str(avatar.id)})

    assert _logs(db_session, "avatar.select")[0].details is None


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
    admin_client, act_as, standard_user, super_admin_user, make_avatar
):
    avatar = make_avatar()
    act_as(standard_user)
    admin_client.post("/api/avatars/select", json={"avatar_id": str(avatar.id)})
    act_as(super_admin_user)
    admin_client.put(f"/api/admin/users/{standard_user.id}", json={"nome": "Filtrato"})

    by_user = admin_client.get(
        "/api/admin/audit-logs", params={"user_id": str(standard_user.id)}
    ).json()
    assert by_user["total"] == 1
    assert by_user["items"][0]["action"] == "avatar.select"

    by_action = admin_client.get("/api/admin/audit-logs", params={"action": "user.update"}).json()
    assert by_action["total"] == 1
    assert by_action["items"][0]["resource_id"] == str(standard_user.id)


def test_registry_returns_newest_first_and_labels_actions(
    admin_client, act_as, standard_user, super_admin_user, make_avatar
):
    avatar = make_avatar()
    act_as(standard_user)
    admin_client.post("/api/avatars/select", json={"avatar_id": str(avatar.id)})
    act_as(super_admin_user)
    admin_client.put(f"/api/admin/users/{standard_user.id}", json={"nome": "Ultimo"})

    items = admin_client.get("/api/admin/audit-logs").json()["items"]
    assert [i["action"] for i in items] == ["user.update", "avatar.select"]
    assert items[0]["action_label"] == audit.action_label("user.update")


def test_registry_window_is_bounded(
    admin_client, act_as, standard_user, super_admin_user, make_avatar
):
    """`total` counts every match, the page returns only the window asked for."""
    avatar = make_avatar()
    act_as(standard_user)
    for _ in range(3):
        admin_client.post("/api/avatars/select", json={"avatar_id": str(avatar.id)})

    act_as(super_admin_user)
    page = admin_client.get("/api/admin/audit-logs", params={"limit": 2}).json()
    assert page["total"] == 3
    assert len(page["items"]) == 2


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
