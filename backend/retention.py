"""Storage limitation: conversation data expires instead of living for ever.

The registry of actions has its own clock (see ``audit.RETENTION_DAYS``);
this module owns the other half, the training data itself, which is far more
sensitive: the operator's recorded voice, the transcript of what they said
and the score a model gave them for saying it.

Two clocks, not one, because the two halves stop being useful at very
different moments:

- the **audio** is the heaviest and the most invasive thing we hold, and it
  adds nothing to the transcript once the debrief is over. It expires first,
  and its conversation survives it: the trainee keeps the transcript, the
  evaluation and the trainer's notes, minus the recording of their voice.
- the **conversation** as a whole (messages, evaluation, review,
  annotations, recording) expires later, and takes everything with it.

Nothing here is a soft delete. A row past its window is gone, which is the
only thing that makes a retention policy worth writing down.

Both windows are required configuration with no fallback in code, exactly
like the audit one: how long personal data is kept is a decision that must
be visible in the configuration, not buried in a default nobody reads.

Runs at startup (see ``startup_migrations``) and is also runnable on its
own, so a deployment that stays up for months can schedule it instead of
waiting for the next restart::

    python retention.py
"""

import logging
import os
from datetime import UTC, datetime, timedelta
from typing import NamedTuple

from sqlalchemy import delete, func, select
from sqlalchemy.engine import Connection

from database import engine
from models import (
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationRecording,
    ConversationReview,
    MessageAnnotation,
)

logger = logging.getLogger(__name__)


def _required_days(name: str, what: str) -> int:
    """Read a retention window from the environment, or refuse to start."""
    raw = (os.getenv(name) or "").strip()
    if not raw.isdigit() or int(raw) < 1:
        raise RuntimeError(
            f"{name} non configurato o non valido (giorni di conservazione "
            f"{what}, intero positivo). Aggiungilo al file .env del backend."
        )
    return int(raw)


AUDIO_RETENTION_DAYS = _required_days(
    "AUDIO_RECORDING_RETENTION_DAYS", "delle registrazioni audio delle chiamate"
)
CONVERSATION_RETENTION_DAYS = _required_days(
    "CONVERSATION_RETENTION_DAYS", "delle conversazioni, trascrizioni e valutazioni"
)

# The age of a conversation is counted from when it stopped being used, not
# from when it was opened: the hang-up for a call, the last activity for a
# written chat (which is never closed, see ChatConversation.ended_at). A
# rename bumps updated_at and so postpones the deletion, which is the right
# way round: a transcript someone is still working on is not expired data.
_last_used_at = func.coalesce(
    ChatConversation.ended_at, ChatConversation.updated_at, ChatConversation.created_at
)

# Children of a conversation, deleted before it. The FK cascades would cover
# most of these, but the schema is built by create_all with no migration
# tool, so a table created before its ondelete was declared can still be
# carrying a plain constraint in Postgres. Deleting explicitly costs one
# statement each and does not depend on what the live schema happens to say.
_CHILD_MODELS = (
    MessageAnnotation,
    ConversationReview,
    ConversationEvaluation,
    ConversationRecording,
    ChatMessage,
)


class PurgeResult(NamedTuple):
    """What a purge actually removed."""

    conversations: int
    recordings: int


def audio_cutoff() -> datetime:
    """Timestamp before which a call recording has expired (naive UTC)."""
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=AUDIO_RETENTION_DAYS)


def conversation_cutoff() -> datetime:
    """Timestamp before which a whole conversation has expired (naive UTC)."""
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=CONVERSATION_RETENTION_DAYS)


def purge_expired(conn: Connection | None = None) -> PurgeResult:
    """Delete expired conversations, then strip the audio of the survivors.

    In that order on purpose: a conversation past the longer window takes
    its own recording with it, so the audio pass afterwards only has to
    look at the ones that are staying.

    Idempotent and safe to run at any time: a second run finds nothing
    left to remove.
    """
    if conn is not None:
        return _purge(conn)
    with engine.begin() as owned:
        return _purge(owned)


def _older_than(cutoff: datetime):
    """Ids of the conversations whose last use predates ``cutoff``."""
    return select(ChatConversation.id).where(_last_used_at < cutoff)


def _purge(conn: Connection) -> PurgeResult:
    # One predicate, two cutoffs: the same subquery selects the conversations
    # to delete outright and, bound to the shorter window, the ones that only
    # lose their audio.
    conv_cutoff = conversation_cutoff()
    expired = _older_than(conv_cutoff)

    for model in _CHILD_MODELS:
        conn.execute(delete(model).where(model.conversation_id.in_(expired)))
    conversations = conn.execute(
        delete(ChatConversation).where(_last_used_at < conv_cutoff)
    ).rowcount

    # The recording is the only thing that goes: the conversation it belongs
    # to stays readable, transcript, evaluation and trainer notes included.
    recordings = conn.execute(
        delete(ConversationRecording).where(
            ConversationRecording.conversation_id.in_(_older_than(audio_cutoff()))
        )
    ).rowcount

    if conversations or recordings:
        logger.info(
            "Retention: %d conversazioni eliminate (oltre %d giorni), "
            "%d registrazioni audio eliminate (oltre %d giorni)",
            conversations,
            CONVERSATION_RETENTION_DAYS,
            recordings,
            AUDIO_RETENTION_DAYS,
        )
    return PurgeResult(conversations=conversations, recordings=recordings)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    result = purge_expired()
    logger.info(
        "Purge completato: %d conversazioni, %d registrazioni.",
        result.conversations,
        result.recordings,
    )
