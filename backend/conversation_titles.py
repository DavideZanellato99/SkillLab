"""Automatic names for conversations.

The title is mandatory, but a conversation is created when the call starts,
before any content exists: every new conversation therefore gets a
"<Category> <n>" default that the owner is free to rename afterwards.
"""

import re
from uuid import UUID

from sqlalchemy.orm import Session

from models import ChatConversation

MAX_TITLE_LENGTH = 120


def category_label(category: str) -> str:
    """"sci-fi" -> "Sci-fi"; a blank category falls back to "Conversazione"."""
    label = (category or "").strip()
    if not label:
        return "Conversazione"
    return label[0].upper() + label[1:]


def next_conversation_title(db: Session, user_id: UUID, category: str) -> str:
    """"Clienti 3": the category followed by the first number this user has free."""
    label = category_label(category)
    pattern = re.compile(rf"^{re.escape(label)} (\d+)$", re.IGNORECASE)

    taken = set()
    for (title,) in db.query(ChatConversation.title).filter(
        ChatConversation.user_id == user_id,
        ChatConversation.title.ilike(f"{label} %"),
    ):
        match = pattern.match(title or "")
        if match:
            taken.add(int(match.group(1)))

    number = 1
    while number in taken:
        number += 1
    return f"{label} {number}"[:MAX_TITLE_LENGTH]
