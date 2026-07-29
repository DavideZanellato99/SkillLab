"""Assigned training paths: creation rules and the derived progress.

The status is never stored, so these tests pin down the derivation: only
conversations opened after the assignment count, the deadline splits
completed from completed_late, and a passed deadline without the target
means overdue.
"""

import uuid
from datetime import UTC, datetime, timedelta

from auth_dependency import ensure_roles
from models import (
    ROLE_USER,
    ChatConversation,
    ConversationEvaluation,
    Organization,
    TrainingAssignment,
    User,
)


def _make_user_in(db_session, organization) -> User:
    """A plain user of `organization`.

    The conftest factory only builds users of the test's own tenant, and
    what the tenant tests need is precisely somebody on the other side of
    the boundary.
    """
    roles = ensure_roles(db_session)
    user = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@test.invalid",
        nome="Utente",
        cognome="Vicino",
        role_id=roles[ROLE_USER].id,
        organization_id=organization.id,
    )
    db_session.add(user)
    db_session.flush()
    return user


def _seed_evaluated_conversation(db_session, user, avatar, score, opened_at=None):
    conversation = ChatConversation(
        user_id=user.id,
        avatar_id=avatar.id,
        title="Clienti 1",
        mode="text",
        created_at=opened_at or datetime.now(UTC),
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


def _assign(admin_client, avatar, user, target=7.0, due_at=None):
    payload = {"avatar_id": str(avatar.id), "user_ids": [str(user.id)], "target_score": target}
    if due_at is not None:
        payload["due_at"] = due_at.isoformat()
    response = admin_client.post("/api/training/assignments", json=payload)
    assert response.status_code == 201
    return response.json()[0]


def test_create_and_read_own_assignments(admin_client, db_session, standard_user, make_avatar):
    avatar = make_avatar(category="clienti")
    created = _assign(admin_client, avatar, standard_user, target=7.0)
    assert created["status"] == "active"
    assert created["attempts"] == 0
    assert created["best_score"] is None
    assert created["avatar_name"] == avatar.name
    assert created["user_email"] == standard_user.email


def test_only_conversations_after_the_assignment_count(
    admin_client, db_session, standard_user, make_avatar
):
    avatar = make_avatar(category="clienti")
    # Excellent evaluation, but from BEFORE the goal existed
    _seed_evaluated_conversation(
        db_session,
        standard_user,
        avatar,
        9.0,
        opened_at=datetime.now(UTC) - timedelta(days=1),
    )
    created = _assign(admin_client, avatar, standard_user, target=7.0)
    assert created["status"] == "active"
    assert created["attempts"] == 0

    # A new attempt below target counts but does not complete
    _seed_evaluated_conversation(db_session, standard_user, avatar, 6.0)
    listed = admin_client.get("/api/training/assignments").json()[0]
    assert listed["status"] == "active"
    assert listed["attempts"] == 1
    assert listed["best_score"] == 6.0

    # Reaching the target completes the goal
    _seed_evaluated_conversation(db_session, standard_user, avatar, 7.5)
    listed = admin_client.get("/api/training/assignments").json()[0]
    assert listed["status"] == "completed"
    assert listed["best_score"] == 7.5
    assert listed["achieved_at"] is not None


def test_deadline_states(admin_client, db_session, standard_user, make_avatar):
    avatar = make_avatar(category="clienti")
    past_due = datetime.now(UTC) - timedelta(days=2)

    # Deadline passed, target never reached: overdue
    overdue = _assign(admin_client, avatar, standard_user, target=9.5, due_at=past_due)
    listed = admin_client.get("/api/training/assignments").json()
    by_id = {row["id"]: row for row in listed}
    assert by_id[overdue["id"]]["status"] == "overdue"

    # Target reached, but after the deadline: completed_late
    _seed_evaluated_conversation(db_session, standard_user, avatar, 9.6)
    listed = admin_client.get("/api/training/assignments").json()
    by_id = {row["id"]: row for row in listed}
    assert by_id[overdue["id"]]["status"] == "completed_late"


def test_user_sees_own_goals_only(user_client, db_session, standard_user, make_avatar):
    # Seeded directly: user_client and admin_client cannot coexist in one
    # test, they fight over the same get_current_user override
    avatar = make_avatar(category="clienti")
    db_session.add(
        TrainingAssignment(user_id=standard_user.id, avatar_id=avatar.id, target_score=7.0)
    )
    db_session.flush()

    mine = user_client.get("/api/training/assignments/me").json()
    assert len(mine) == 1
    assert mine[0]["avatar_id"] == str(avatar.id)
    assert mine[0]["status"] == "active"


def test_assignment_requires_same_organization(
    admin_client, db_session, super_admin_user, make_avatar
):
    avatar = make_avatar(category="clienti")
    # The super admin has no organization, so it can never be a trainee
    response = admin_client.post(
        "/api/training/assignments",
        json={
            "avatar_id": str(avatar.id),
            "user_ids": [str(super_admin_user.id)],
            "target_score": 7,
        },
    )
    assert response.status_code == 400


def test_create_and_delete_are_admin_only(user_client, standard_user, make_avatar):
    avatar = make_avatar(category="clienti")
    response = user_client.post(
        "/api/training/assignments",
        json={
            "avatar_id": str(avatar.id),
            "user_ids": [str(standard_user.id)],
            "target_score": 7,
        },
    )
    assert response.status_code == 403


def test_delete_assignment(admin_client, db_session, standard_user, make_avatar):
    avatar = make_avatar(category="clienti")
    created = _assign(admin_client, avatar, standard_user)
    response = admin_client.delete(f"/api/training/assignments/{created['id']}")
    assert response.status_code == 200
    assert db_session.query(TrainingAssignment).count() == 0


# ── Chi può ricevere un obiettivo ─────────────────────
#
# L'endpoint che alimenta il selettore vive accanto alla validazione che
# rifiuta l'assegnazione: questi test tengono le due definizioni allineate.


def test_assignable_users_are_the_active_ones_of_the_tenant(
    admin_client, db_session, standard_user, organization
):
    response = admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(organization.id)}
    )

    assert response.status_code == 200
    assert [u["id"] for u in response.json()] == [str(standard_user.id)]


def test_a_suspended_account_cannot_receive_a_goal(
    admin_client, db_session, standard_user, organization
):
    """Non potrebbe nemmeno accedere per lavorarci."""
    standard_user.status = "suspended"
    db_session.flush()

    response = admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(organization.id)}
    )

    assert response.status_code == 200
    assert response.json() == []


def test_the_super_admin_is_never_assignable(
    admin_client, super_admin_user, standard_user, organization
):
    """Sta sopra i tenant, quindi non appartiene a quello dell'avatar: è la
    stessa ragione per cui create_assignments lo rifiuta."""
    response = admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(organization.id)}
    )

    assert str(super_admin_user.id) not in [u["id"] for u in response.json()]


def test_assignable_users_of_another_tenant_are_not_listed(
    admin_client, db_session, standard_user, organization
):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()

    response = admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(other.id)}
    )

    assert response.status_code == 200
    assert response.json() == []


def test_assignable_users_is_admin_only(user_client, organization):
    response = user_client.get(
        "/api/training/assignable-users", params={"organization_id": str(organization.id)}
    )

    assert response.status_code == 403


def test_the_super_admin_must_name_an_organization(admin_client):
    """Sta sopra i tenant: senza organizzazione la domanda non ha risposta."""
    response = admin_client.get("/api/training/assignable-users")

    assert response.status_code == 400


# ── L'organization admin assegna nel proprio tenant ───
#
# È il professore dei suoi studenti: assegna e ritira gli obiettivi senza
# passare dal super admin. Il confine è il tenant, e passa dall'avatar: può
# partire solo dai propri, e un obiettivo atterra sempre su utenti
# dell'organizzazione dell'avatar.


def test_org_admin_assigns_within_its_own_organization(
    org_admin_client, db_session, standard_user, make_avatar
):
    avatar = make_avatar(category="clienti")

    created = _assign(org_admin_client, avatar, standard_user, target=7.0)

    assert created["user_email"] == standard_user.email
    assert created["status"] == "active"
    assignment = db_session.query(TrainingAssignment).one()
    assert assignment.assigned_by_id is not None


def test_org_admin_cannot_assign_an_avatar_of_another_tenant(
    org_admin_client, db_session, standard_user, make_avatar
):
    """L'avatar di un altro tenant non esiste, per questo admin: 404, non 403."""
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_avatar = make_avatar(category="clienti", organization_id=other.id)

    response = org_admin_client.post(
        "/api/training/assignments",
        json={
            "avatar_id": str(foreign_avatar.id),
            "user_ids": [str(standard_user.id)],
            "target_score": 7,
        },
    )

    assert response.status_code == 404


def test_org_admin_assignable_users_ignore_the_requested_tenant(
    org_admin_client, db_session, standard_user, organization
):
    """Il tenant lo impone il server: chiederne un altro non lo cambia."""
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_user = _make_user_in(db_session, other)

    forced = org_admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(other.id)}
    )
    implicit = org_admin_client.get("/api/training/assignable-users")

    assert forced.status_code == 200
    returned = [u["id"] for u in forced.json()]
    assert str(standard_user.id) in returned
    assert str(foreign_user.id) not in returned
    assert implicit.json() == forced.json()


def test_org_admin_cannot_delete_a_goal_of_another_tenant(
    org_admin_client, db_session, make_avatar
):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_avatar = make_avatar(category="clienti", organization_id=other.id)
    foreign_user = _make_user_in(db_session, other)
    assignment = TrainingAssignment(
        user_id=foreign_user.id, avatar_id=foreign_avatar.id, target_score=7.0
    )
    db_session.add(assignment)
    db_session.flush()

    response = org_admin_client.delete(f"/api/training/assignments/{assignment.id}")

    assert response.status_code == 404
    assert db_session.query(TrainingAssignment).count() == 1


def test_org_admin_deletes_a_goal_of_its_own_users(
    org_admin_client, db_session, standard_user, make_avatar
):
    avatar = make_avatar(category="clienti")
    created = _assign(org_admin_client, avatar, standard_user)

    response = org_admin_client.delete(f"/api/training/assignments/{created['id']}")

    assert response.status_code == 200
    assert db_session.query(TrainingAssignment).count() == 0
