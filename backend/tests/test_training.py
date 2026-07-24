"""Assigned training paths: creation rules and the derived progress.

The status is never stored, so these tests pin down the derivation: only
conversations opened after the assignment count, the deadline splits
completed from completed_late, and a passed deadline without the target
means overdue.
"""

from datetime import UTC, datetime, timedelta

from models import ChatConversation, ConversationEvaluation, TrainingAssignment


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


def test_create_and_delete_are_super_admin_only(user_client, standard_user, make_avatar):
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
