"""Archiving an avatar: the deletion is logical and destroys no history.

The whole point of these tests is the promise the admin page now makes:
removing an avatar from the catalogue must leave every conversation,
message and evaluation produced against it exactly where it was, and must
stay reversible.
"""

from models import Avatar, ChatConversation, ChatMessage, ConversationEvaluation


def _seed_evaluated_conversation(db_session, user, avatar) -> ChatConversation:
    """One finished conversation with a message and its evaluation."""
    conversation = ChatConversation(
        user_id=user.id, avatar_id=avatar.id, title="Clienti 1", mode="voice"
    )
    db_session.add(conversation)
    db_session.flush()
    db_session.add(ChatMessage(conversation_id=conversation.id, role="user", content="buongiorno"))
    db_session.add(
        ConversationEvaluation(
            conversation_id=conversation.id,
            overall_score=7.5,
            result={"summary": "sintesi", "criteria": []},
        )
    )
    db_session.flush()
    return conversation


def _payload(avatar: Avatar) -> dict:
    """The admin form payload that re-sends an avatar unchanged."""
    return {
        "category_id": str(avatar.category_id),
        "description": avatar.description,
        "image_url": avatar.image_url,
        "voice_id": avatar.voice_id,
        "organization_id": str(avatar.organization_id),
        "profile": avatar.profile,
    }


def test_delete_archives_the_avatar_and_keeps_every_conversation(
    admin_client, db_session, standard_user, make_avatar
):
    avatar = make_avatar(name="Cliente Storico", category="clienti")
    conversation = _seed_evaluated_conversation(db_session, standard_user, avatar)

    response = admin_client.delete(f"/api/admin/avatars/{avatar.id}")
    assert response.status_code == 200

    # The avatar row survives, marked with the moment it was archived
    stored = db_session.query(Avatar).filter(Avatar.id == avatar.id).first()
    assert stored is not None
    assert stored.deleted_at is not None
    # ...and so does its persona sheet, which is what an old transcript is
    # re-evaluated against
    assert stored.profile

    # Nothing the students produced was touched
    assert (
        db_session.query(ChatConversation).filter(ChatConversation.id == conversation.id).count()
        == 1
    )
    assert (
        db_session.query(ChatMessage).filter(ChatMessage.conversation_id == conversation.id).count()
        == 1
    )
    assert (
        db_session.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation.id)
        .count()
        == 1
    )


def test_deleting_twice_is_harmless(admin_client, make_avatar):
    avatar = make_avatar(name="Doppio Colpo")
    assert admin_client.delete(f"/api/admin/avatars/{avatar.id}").status_code == 200
    assert admin_client.delete(f"/api/admin/avatars/{avatar.id}").status_code == 200


def test_archived_avatar_leaves_the_gallery(
    client, act_as, standard_user, super_admin_user, make_avatar
):
    avatar = make_avatar(name="Fuori Catalogo", category="archiviati")

    act_as(super_admin_user)
    assert client.delete(f"/api/admin/avatars/{avatar.id}").status_code == 200

    act_as(standard_user)
    listed = client.get("/api/avatars").json()
    assert all(a["id"] != str(avatar.id) for a in listed)
    # its category goes with it, or the gallery would offer an empty filter
    assert "archiviati" not in client.get("/api/avatars/categories").json()


def test_archived_avatar_history_stays_reachable(
    client, act_as, db_session, standard_user, super_admin_user, make_avatar
):
    """A student must keep reading the training they already did."""
    avatar = make_avatar(name="Ricordo Vivo")
    conversation = _seed_evaluated_conversation(db_session, standard_user, avatar)

    act_as(super_admin_user)
    assert client.delete(f"/api/admin/avatars/{avatar.id}").status_code == 200

    act_as(standard_user)
    detail = client.get(f"/api/avatars/{avatar.id}")
    assert detail.status_code == 200
    assert detail.json()["name"] == "Ricordo Vivo"

    conversations = client.get(f"/api/chat/avatar/{avatar.id}/conversations")
    assert conversations.status_code == 200
    assert [c["id"] for c in conversations.json()] == [str(conversation.id)]


def test_no_new_training_can_start_on_an_archived_avatar(
    client, act_as, standard_user, super_admin_user, make_avatar
):
    avatar = make_avatar(name="Non Più Disponibile")

    act_as(super_admin_user)
    assert client.delete(f"/api/admin/avatars/{avatar.id}").status_code == 200

    act_as(standard_user)
    started = client.post(
        "/api/chat/message",
        json={"avatar_id": str(avatar.id), "content": "buongiorno"},
    )
    assert started.status_code == 409
    assert "archiviato" in started.json()["detail"]


def test_restore_puts_the_avatar_back_in_the_catalogue(
    client, act_as, standard_user, super_admin_user, make_avatar
):
    avatar = make_avatar(name="Torna In Scena")

    act_as(super_admin_user)
    assert client.delete(f"/api/admin/avatars/{avatar.id}").status_code == 200
    restored = client.post(f"/api/admin/avatars/{avatar.id}/restore")
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None

    act_as(standard_user)
    listed = client.get("/api/avatars").json()
    assert any(a["id"] == str(avatar.id) for a in listed)


def test_archived_avatar_is_read_only(admin_client, db_session, make_avatar):
    """The sheet records what the students trained against: restore, then edit."""
    avatar = make_avatar(name="Scheda Congelata")
    payload = _payload(avatar)
    assert admin_client.delete(f"/api/admin/avatars/{avatar.id}").status_code == 200

    refused = admin_client.put(f"/api/admin/avatars/{avatar.id}", json=payload)
    assert refused.status_code == 409

    assert admin_client.post(f"/api/admin/avatars/{avatar.id}/restore").status_code == 200
    assert admin_client.put(f"/api/admin/avatars/{avatar.id}", json=payload).status_code == 200


def test_admin_list_hides_the_archive_unless_asked(admin_client, make_avatar):
    kept = make_avatar(name="In Catalogo")
    archived = make_avatar(name="In Archivio")
    assert admin_client.delete(f"/api/admin/avatars/{archived.id}").status_code == 200

    default_ids = {a["id"] for a in admin_client.get("/api/admin/avatars").json()}
    assert str(kept.id) in default_ids
    assert str(archived.id) not in default_ids

    with_archive = admin_client.get("/api/admin/avatars", params={"include_deleted": "true"})
    by_id = {a["id"]: a for a in with_archive.json()}
    assert str(archived.id) in by_id
    assert by_id[str(archived.id)]["deleted_at"] is not None
    assert by_id[str(kept.id)]["deleted_at"] is None


def test_a_training_step_cannot_target_an_archived_avatar(
    admin_client, organization, standard_user, make_avatar
):
    """Una tappa che nessuno può superare terrebbe chiuse tutte quelle dopo."""
    avatar = make_avatar(name="Obiettivo Impossibile")
    assert admin_client.delete(f"/api/admin/avatars/{avatar.id}").status_code == 200

    response = admin_client.post(
        "/api/training/paths",
        json={
            "title": "Impossibile",
            "organization_id": str(organization.id),
            "steps": [{"avatar_id": str(avatar.id), "target_score": 7.0}],
        },
    )
    assert response.status_code == 409


def test_organization_avatar_count_ignores_the_archive(admin_client, organization, make_avatar):
    make_avatar(name="Attivo Uno")
    archived = make_avatar(name="Archiviato Uno")
    assert admin_client.delete(f"/api/admin/avatars/{archived.id}").status_code == 200

    rows = admin_client.get("/api/admin/organizations").json()
    row = next(o for o in rows if o["id"] == str(organization.id))
    assert row["avatar_count"] == 1
