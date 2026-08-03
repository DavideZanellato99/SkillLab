"""The periodic sweep that keeps the retention windows real.

Every window this app declares (the audit trail's, the call recordings',
the conversations') is a promise made to the people whose data it holds,
and a promise kept only on restart is not kept at all: a container that
stays up for eight months would sit on eight months of expired personal
data and be exactly as compliant, on paper, as one that purges nightly.

So the purge runs on a clock of its own, inside the app. Not a cron on the
host, not a manual command: this has to keep working on a deployment that
is installed once and never touched again, on a machine nobody logs into.

Three properties the loop is built around, all of them for that same
"never touched again" reason:

- it **runs once at startup**, then every ``HOUSEKEEPING_INTERVAL_HOURS``,
  so a restart and a long uptime both end up purged.
- it **can never die**. A failed sweep (the database briefly gone, a lock
  held too long) is logged and forgotten; the loop stays alive and tries
  again next time. An exception escaping here would silently switch
  retention off for the lifetime of the process, which is the one failure
  mode nobody would ever notice.
- it **can never take the app down with it**. The purge is synchronous DB
  work, so it goes to a worker thread: the event loop keeps serving
  requests while a large delete runs.

Setting the interval to 0 disables the loop, which is what the test suite
does and what a deployment that genuinely prefers an external scheduler
can do.

The loop lives in *every* process, so on a deployment with several replicas
it fires several times at once. That part is settled by an advisory lock
(see ``purge_now``): one replica sweeps, the others skip the round.
"""

import asyncio
import logging
import os
from contextlib import suppress
from datetime import UTC, datetime

from sqlalchemy import delete, text
from sqlalchemy.engine import Connection

import audit
import rate_limit
import retention
import voice_sessions
from database import engine
from models import RevokedJti, TokenSession

logger = logging.getLogger(__name__)

# How often the sweep runs. Unlike the retention windows themselves (which
# are required configuration, because how long data is kept is a policy
# decision), this one has a sane default: it is the frequency of a cleanup,
# not a promise made to anyone, and a deployment must not have to know it
# exists in order to be compliant.
_DEFAULT_INTERVAL_HOURS = 24.0

# Advisory lock key for the sweep. A different number from the schema job's
# (see ``startup_migrations``) because they are different pieces of work and
# must never end up waiting on each other.
_SWEEP_LOCK_KEY = 774_155_002


def _interval_hours() -> float:
    raw = (os.getenv("HOUSEKEEPING_INTERVAL_HOURS") or "").strip()
    if not raw:
        return _DEFAULT_INTERVAL_HOURS
    try:
        hours = float(raw)
    except ValueError:
        raise RuntimeError(
            "HOUSEKEEPING_INTERVAL_HOURS non valido (ore tra un purge e il "
            "successivo, numero >= 0; 0 disattiva). Correggilo nel file .env "
            "del backend."
        ) from None
    if hours < 0:
        raise RuntimeError("HOUSEKEEPING_INTERVAL_HOURS non può essere negativo.")
    return hours


INTERVAL_SECONDS = _interval_hours() * 3600

_task: asyncio.Task | None = None


def _purge_expired_sessions(conn: Connection) -> int:
    """Drop session bindings and denylisted tokens that have expired.

    Both tables clean themselves up as a side effect of a login or a
    logout, which is enough on a busy deployment and nothing at all on a
    quiet one. The rows matter: ``token_session`` holds the client IP and
    User-Agent of every session it describes, so on an install where
    nobody signs in for a month they should not sit there for a month.
    """
    now = datetime.now(UTC).replace(tzinfo=None)
    sessions = conn.execute(delete(TokenSession).where(TokenSession.expires_at < now)).rowcount
    conn.execute(delete(RevokedJti).where(RevokedJti.expires_at < now))
    return sessions


def _won_the_sweep(conn: Connection) -> bool:
    """True when this process gets to run the sweep, False when someone else is.

    Transaction-scoped (``xact``), so it is released by the commit or the
    rollback of the very transaction doing the purge: there is no way to
    leave it hanging, not even if the sweep blows up halfway through.

    Deliberately non-blocking, unlike the schema lock in
    ``startup_migrations``: there the replicas queueing up have to wait,
    because they cannot serve a request until the schema is ready. Here the
    work is being done right now by somebody else, so there is nothing left
    to wait for, and the honest answer is to skip this round.
    """
    return bool(
        conn.execute(
            text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": _SWEEP_LOCK_KEY}
        ).scalar()
    )


def purge_now(conn: Connection | None = None) -> None:
    """Apply every retention window once, in one transaction.

    All of them together because they are the same promise: the trail's
    rows carry IP and User-Agent, the sessions carry the same, the
    conversations carry the recorded voice and the score. Either the
    windows hold or they do not.

    One replica at a time. Four containers started together wake up for
    their first sweep in the same instant, and four concurrent DELETEs over
    the same expired rows only manage to block each other while holding
    locks on tables the app is serving calls from. The rows that go are the
    same either way, so the extra three buy nothing at all.
    """
    if conn is None:
        with engine.begin() as owned:
            return purge_now(owned)

    if not _won_the_sweep(conn):
        logger.info("Housekeeping: un'altra replica sta già purgando, questo giro lo salto.")
        return

    logs = audit.purge_expired(conn)
    sessions = _purge_expired_sessions(conn)
    calls = voice_sessions.purge_expired(conn)
    attempts = rate_limit.purge_expired(conn)
    removed = retention.purge_expired(conn)
    logger.info(
        "Housekeeping: %d righe di audit, %d sessioni scadute, %d chiamate mai "
        "iniziate, %d tentativi di accesso, %d conversazioni, %d registrazioni "
        "audio, %d tentativi di simulazione eliminati.",
        logs,
        sessions,
        calls,
        attempts,
        removed.conversations,
        removed.recordings,
        removed.simulation_attempts,
    )


async def run_once() -> None:
    """One sweep, off the event loop, never raising.

    A sweep that blew up would take the loop with it and leave retention
    silently off until the next restart, so the failure stops here and the
    next tick tries again.
    """
    try:
        await asyncio.to_thread(purge_now)
    except Exception:
        logger.exception("Housekeeping: purge fallito, riprovo al prossimo giro")


async def _run_forever(interval_seconds: float) -> None:
    while True:
        await run_once()
        await asyncio.sleep(interval_seconds)


def start() -> None:
    """Start the sweep loop (no-op if disabled or already running)."""
    global _task
    if INTERVAL_SECONDS <= 0:
        logger.warning(
            "Housekeeping disattivato (HOUSEKEEPING_INTERVAL_HOURS=0): "
            "le finestre di conservazione non vengono applicate da questo processo."
        )
        return
    if _task is not None and not _task.done():
        return
    _task = asyncio.create_task(_run_forever(INTERVAL_SECONDS), name="housekeeping")
    logger.info("Housekeeping avviato: purge ogni %g ore.", INTERVAL_SECONDS / 3600)


async def stop() -> None:
    """Cancel the loop and wait for it to actually be gone."""
    global _task
    if _task is None:
        return
    _task.cancel()
    with suppress(asyncio.CancelledError):
        await _task
    _task = None
