"""Text-chat lifecycle: create on first message (streamed reply), then close.

The LLM stream (stream_avatar_response) is monkeypatched to canned
fragments, so these tests never reach OpenAI and stay fast and
deterministic. /api/chat/message answers in Server-Sent Events: the
helpers below parse the event blocks out of the buffered response body.
"""

import json

import pytest

import routers.chat as chat_router
from openai_service import EVALUATION_CRITERIA


def _sse_events(text: str) -> list[tuple[str, dict]]:
    """Parse an SSE body into (event, data) pairs."""
    events = []
    for block in text.strip().split("\n\n"):
        event = "message"
        data_lines = []
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line[len("event:") :].strip()
            elif line.startswith("data:"):
                data_lines.append(line[len("data:") :].strip())
        events.append((event, json.loads("\n".join(data_lines))))
    return events


def _done_payload(response) -> dict:
    """The persisted exchange carried by the final done event."""
    assert response.status_code == 200
    events = _sse_events(response.text)
    assert events[-1][0] == "done"
    return events[-1][1]


@pytest.fixture
def fake_llm(monkeypatch):
    async def _stream(history, profile, channel):
        yield "Risposta simulata "
        yield "dell'avatar."

    monkeypatch.setattr(chat_router, "stream_avatar_response", _stream)


def _fake_evaluation(score: float) -> dict:
    """A stored-shape evaluation where every criterion has the same score."""
    return {
        "overall_score": score,
        "summary": "sintesi",
        "criteria": [
            {
                "key": key,
                "label": label,
                "weight": weight,
                "score": score,
                "comment": "",
                "suggestions": None,
                "citations": [],
            }
            for key, label, weight in EVALUATION_CRITERIA
        ],
    }


@pytest.fixture
def fake_judge(monkeypatch):
    """Each evaluation call returns the next canned overall score."""
    scores = iter([5.0, 7.5])

    async def _evaluate(history, profile, channel):
        return _fake_evaluation(next(scores))

    monkeypatch.setattr(chat_router, "evaluate_conversation", _evaluate)


@pytest.fixture
def broken_llm(monkeypatch):
    async def _stream(history, profile, channel):
        yield "Metà rispo"
        raise RuntimeError("Errore nella comunicazione con OpenAI: saturo")

    monkeypatch.setattr(chat_router, "stream_avatar_response", _stream)


def test_first_message_opens_a_titled_conversation(user_client, make_avatar, fake_llm):
    avatar = make_avatar(category="clienti")

    response = user_client.post(
        "/api/chat/message",
        json={"avatar_id": str(avatar.id), "content": "Buongiorno"},
    )
    events = _sse_events(response.text)
    # The reply streams fragment by fragment before the final done event
    assert [d["text"] for e, d in events if e == "delta"] == [
        "Risposta simulata ",
        "dell'avatar.",
    ]
    body = _done_payload(response)
    # A brand-new conversation is born with the "<Category> <n>" default.
    assert body["title"] == "Clienti 1"
    assert body["user_message"]["content"] == "Buongiorno"
    assert body["assistant_message"]["content"] == "Risposta simulata dell'avatar."
    assert body["conversation_id"]


def test_failed_stream_persists_nothing(user_client, make_avatar, broken_llm):
    avatar = make_avatar(category="clienti")

    response = user_client.post(
        "/api/chat/message",
        json={"avatar_id": str(avatar.id), "content": "Buongiorno"},
    )
    assert response.status_code == 200
    events = _sse_events(response.text)
    assert events[-1][0] == "error"
    assert "OpenAI" in events[-1][1]["detail"]
    # No half exchange was written: the avatar still has no conversations
    conversations = user_client.get(f"/api/chat/avatar/{avatar.id}/conversations").json()
    assert conversations == []


def test_second_attempt_is_compared_with_the_first(user_client, make_avatar, fake_llm, fake_judge):
    avatar = make_avatar(category="clienti")

    def attempt(text):
        conv_id = _done_payload(
            user_client.post(
                "/api/chat/message",
                json={"avatar_id": str(avatar.id), "content": text},
            )
        )["conversation_id"]
        user_client.post(f"/api/chat/conversation/{conv_id}/end")
        evaluation = user_client.post(f"/api/chat/conversation/{conv_id}/evaluate").json()
        return conv_id, evaluation

    first_id, first_eval = attempt("Buongiorno")
    # The first attempt has no baseline to compare against
    assert first_eval["previous"] is None

    second_id, second_eval = attempt("Buongiorno di nuovo")
    previous = second_eval["previous"]
    assert previous["conversation_id"] == first_id
    assert previous["title"] == "Clienti 1"
    assert previous["overall_score"] == 5.0
    # One score per criterion: the UI derives the per-criterion deltas
    assert set(previous["criteria_scores"]) == {key for key, _, _ in EVALUATION_CRITERIA}
    assert all(score == 5.0 for score in previous["criteria_scores"].values())

    # The stored evaluation serves the same comparison on later reads
    reread = user_client.get(f"/api/chat/conversation/{second_id}/evaluation").json()
    assert reread["previous"]["conversation_id"] == first_id


def test_evaluation_pdf_download(user_client, make_avatar, fake_llm, fake_judge):
    avatar = make_avatar(category="clienti")
    conv_id = _done_payload(
        user_client.post(
            "/api/chat/message",
            json={"avatar_id": str(avatar.id), "content": "Buongiorno"},
        )
    )["conversation_id"]
    user_client.post(f"/api/chat/conversation/{conv_id}/end")

    # Before the evaluation exists there is nothing to print
    assert user_client.get(f"/api/chat/conversation/{conv_id}/evaluation/pdf").status_code == 404

    user_client.post(f"/api/chat/conversation/{conv_id}/evaluate")
    response = user_client.get(f"/api/chat/conversation/{conv_id}/evaluation/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "valutazione-clienti-1.pdf" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_end_conversation_sets_ended_at(user_client, make_avatar, fake_llm):
    avatar = make_avatar(category="clienti")
    created = _done_payload(
        user_client.post(
            "/api/chat/message",
            json={"avatar_id": str(avatar.id), "content": "Ciao"},
        )
    )
    conv_id = created["conversation_id"]

    response = user_client.post(f"/api/chat/conversation/{conv_id}/end")
    assert response.status_code == 200
    assert response.json()["ended_at"] is not None


def test_writing_into_a_closed_chat_is_rejected(user_client, make_avatar, fake_llm):
    avatar = make_avatar(category="clienti")
    conv_id = _done_payload(
        user_client.post(
            "/api/chat/message",
            json={"avatar_id": str(avatar.id), "content": "Ciao"},
        )
    )["conversation_id"]
    user_client.post(f"/api/chat/conversation/{conv_id}/end")

    # Validation still travels as an ordinary HTTP error, before any stream
    response = user_client.post(
        "/api/chat/message",
        json={
            "avatar_id": str(avatar.id),
            "conversation_id": conv_id,
            "content": "Ci sei ancora?",
        },
    )
    assert response.status_code == 409
