"""Automatic conversation titles."""

import pytest

from conversation_titles import category_label, next_conversation_title
from models import CONVERSATION_MODE_TEXT, ChatConversation


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("clienti", "Clienti"),
        ("sci-fi", "Sci-fi"),
        ("", "Conversazione"),
        ("   ", "Conversazione"),
    ],
)
def test_category_label(raw, expected):
    assert category_label(raw) == expected


def test_first_title_is_number_one(db_session, standard_user, make_avatar):
    avatar = make_avatar(category="clienti")
    title = next_conversation_title(db_session, standard_user.id, avatar.category)
    assert title == "Clienti 1"


def test_next_title_skips_taken_numbers(db_session, standard_user, make_avatar):
    avatar = make_avatar(category="clienti")
    db_session.add(
        ChatConversation(
            user_id=standard_user.id,
            avatar_id=avatar.id,
            title="Clienti 1",
            mode=CONVERSATION_MODE_TEXT,
        )
    )
    db_session.flush()

    title = next_conversation_title(db_session, standard_user.id, avatar.category)
    assert title == "Clienti 2"
