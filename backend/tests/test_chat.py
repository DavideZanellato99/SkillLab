"""Text-chat lifecycle: create on first message, then close.

The LLM call (generate_avatar_reply) is monkeypatched to a canned reply, so
these tests never reach OpenAI and stay fast and deterministic.
"""

import pytest

import routers.chat as chat_router


@pytest.fixture
def fake_llm(monkeypatch):
    async def _reply(history, profile):
        return "Risposta simulata dell'avatar."

    monkeypatch.setattr(chat_router, "generate_avatar_reply", _reply)


def test_first_message_opens_a_titled_conversation(user_client, make_avatar, fake_llm):
    avatar = make_avatar(category="clienti")

    response = user_client.post(
        "/api/chat/message",
        json={"avatar_id": str(avatar.id), "content": "Buongiorno"},
    )
    assert response.status_code == 200
    body = response.json()
    # A brand-new conversation is born with the "<Category> <n>" default.
    assert body["title"] == "Clienti 1"
    assert body["user_message"]["content"] == "Buongiorno"
    assert body["assistant_message"]["content"] == "Risposta simulata dell'avatar."
    assert body["conversation_id"]


def test_end_conversation_sets_ended_at(user_client, make_avatar, fake_llm):
    avatar = make_avatar(category="clienti")
    created = user_client.post(
        "/api/chat/message",
        json={"avatar_id": str(avatar.id), "content": "Ciao"},
    ).json()
    conv_id = created["conversation_id"]

    response = user_client.post(f"/api/chat/conversation/{conv_id}/end")
    assert response.status_code == 200
    assert response.json()["ended_at"] is not None


def test_writing_into_a_closed_chat_is_rejected(user_client, make_avatar, fake_llm):
    avatar = make_avatar(category="clienti")
    conv_id = user_client.post(
        "/api/chat/message",
        json={"avatar_id": str(avatar.id), "content": "Ciao"},
    ).json()["conversation_id"]
    user_client.post(f"/api/chat/conversation/{conv_id}/end")

    response = user_client.post(
        "/api/chat/message",
        json={
            "avatar_id": str(avatar.id),
            "conversation_id": conv_id,
            "content": "Ci sei ancora?",
        },
    )
    assert response.status_code == 409
