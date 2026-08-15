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
- i **tentativi delle simulazioni tecniche** hanno il proprio orologio: sono
  le risposte che una persona ha dato a un test e il voto che ne è uscito,
  quindi un dato di valutazione come gli altri, ma senza voce registrata né
  trascrizione, e chi li conserva di solito li conserva per un tempo diverso.
  La simulazione resta, se ne vanno i tentativi.
- i **debriefing** non hanno un orologio proprio e non ne meritano uno: sono
  una sintesi delle conversazioni, quindi non possono sopravvivere alle
  conversazioni che riassumono. A misurarli è ``covered_until``, cioè la
  prova più recente che il modello aveva letto, contro la finestra delle
  conversazioni: quando quella data è scaduta, tutto il materiale su cui il
  testo si fonda è già stato cancellato, e quello che resterebbe è un
  giudizio su una persona senza più niente dietro a cui riferirlo.

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
    CONVERSATION_CHILDREN,
    ChatConversation,
    ConversationRecording,
    SimulationAttempt,
    UserDebriefing,
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
SIMULATION_ATTEMPT_RETENTION_DAYS = _required_days(
    "SIMULATION_ATTEMPT_RETENTION_DAYS", "dei tentativi delle simulazioni tecniche"
)

# The age of a conversation is counted from when it stopped being used, not
# from when it was opened: the hang-up for a call, the last activity for a
# written chat (which is never closed, see ChatConversation.ended_at). A
# rename bumps updated_at and so postpones the deletion, which is the right
# way round: a transcript someone is still working on is not expired data.
_last_used_at = func.coalesce(
    ChatConversation.ended_at, ChatConversation.updated_at, ChatConversation.created_at
)

# The children (see models.CONVERSATION_CHILDREN) are deleted explicitly
# rather than left to the FK cascades: the schema is built by create_all
# with no migration tool, so a table created before its ondelete was
# declared can still be carrying a plain constraint in Postgres. One
# statement each, and no dependence on what the live schema happens to say.


class PurgeResult(NamedTuple):
    """What a purge actually removed."""

    conversations: int
    recordings: int
    simulation_attempts: int
    debriefings: int


def _cutoff(days: int) -> datetime:
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)


def audio_cutoff() -> datetime:
    """Timestamp before which a call recording has expired (naive UTC)."""
    return _cutoff(AUDIO_RETENTION_DAYS)


def conversation_cutoff() -> datetime:
    """Timestamp before which a whole conversation has expired (naive UTC)."""
    return _cutoff(CONVERSATION_RETENTION_DAYS)


def simulation_attempt_cutoff() -> datetime:
    """Timestamp before which a simulation attempt has expired (naive UTC)."""
    return _cutoff(SIMULATION_ATTEMPT_RETENTION_DAYS)


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

    for model in CONVERSATION_CHILDREN:
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

    # I tentativi dei test tecnici, sul proprio orologio. La riga se ne va
    # intera, fotografia delle risposte compresa: è quella la parte personale,
    # mentre la simulazione con le sue domande non riguarda nessuno in
    # particolare e resta.
    simulation_attempts = conn.execute(
        delete(SimulationAttempt).where(SimulationAttempt.created_at < simulation_attempt_cutoff())
    ).rowcount

    # Il debriefing si misura sulla prova più recente che aveva letto e non
    # su quando è stato scritto: quando quella data è oltre la finestra
    # delle conversazioni, tutto il materiale che riassume è appena stato
    # cancellato qui sopra, e la sintesi non deve sopravvivergli.
    debriefings = conn.execute(
        delete(UserDebriefing).where(UserDebriefing.covered_until < conv_cutoff)
    ).rowcount

    if conversations or recordings or simulation_attempts or debriefings:
        logger.info(
            "Retention: %d conversazioni eliminate (oltre %d giorni), "
            "%d registrazioni audio eliminate (oltre %d giorni), "
            "%d tentativi di simulazione eliminati (oltre %d giorni), "
            "%d debriefing eliminati (sulla finestra delle conversazioni)",
            conversations,
            CONVERSATION_RETENTION_DAYS,
            recordings,
            AUDIO_RETENTION_DAYS,
            simulation_attempts,
            SIMULATION_ATTEMPT_RETENTION_DAYS,
            debriefings,
        )
    return PurgeResult(
        conversations=conversations,
        recordings=recordings,
        simulation_attempts=simulation_attempts,
        debriefings=debriefings,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    result = purge_expired()
    logger.info(
        "Purge completato: %d conversazioni, %d registrazioni, %d tentativi, %d debriefing.",
        result.conversations,
        result.recordings,
        result.simulation_attempts,
        result.debriefings,
    )
