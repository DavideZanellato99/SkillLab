"""The sweep that has to keep running on an install nobody ever touches.

The retention windows are only as real as the loop that applies them, so
what is pinned here is the loop's survival as much as its effect: a sweep
that failed once must not leave retention silently off for the lifetime of
the process, which is the one failure nobody would ever notice.
"""

import asyncio
import uuid
from contextlib import suppress
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

import audit
import housekeeping
import retention
from database import engine
from models import AuditLog, ChatConversation, TokenSession
from tests.test_retention import _days_ago, _seed_conversation


def _seed_audit_log(db_session, *, age_days: int) -> AuditLog:
    row = AuditLog(
        user_email="vecchio@test.invalid",
        user_role="user",
        action="auth.login",
        method="POST",
        path="/auth/login",
        status_code=200,
        client_ip="203.0.113.7",
        user_agent="pytest",
        created_at=_days_ago(age_days),
    )
    db_session.add(row)
    db_session.flush()
    return row


def _drive(coro_factory, *, for_seconds: float):
    """Run a never-ending coroutine for a moment, then cancel it cleanly."""

    async def _run():
        task = asyncio.create_task(coro_factory())
        await asyncio.sleep(for_seconds)
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    asyncio.run(_run())


# ── Un giro applica tutte le finestre, non una sola ────────────────────


def test_a_sweep_applies_every_retention_window(db_session, standard_user, make_avatar):
    log = _seed_audit_log(db_session, age_days=audit.RETENTION_DAYS + 1)
    log_id = log.id
    conversation = _seed_conversation(
        db_session,
        standard_user,
        make_avatar(),
        age_days=retention.CONVERSATION_RETENTION_DAYS + 1,
    )
    conversation_id = conversation.id

    housekeeping.purge_now(db_session.connection())
    db_session.expire_all()

    assert db_session.query(AuditLog).filter(AuditLog.id == log_id).count() == 0
    assert (
        db_session.query(ChatConversation).filter(ChatConversation.id == conversation_id).count()
        == 0
    )


def test_a_sweep_drops_the_session_bindings_that_expired(db_session, standard_user):
    """token_session holds an IP and a User-Agent per open session, and
    only cleans itself up when somebody happens to sign in."""
    now = datetime.now(UTC).replace(tzinfo=None)
    stale = TokenSession(
        jti=f"jti-{uuid.uuid4()}",
        user_id=standard_user.id,
        client_ip="203.0.113.7",
        user_agent="Mozilla/5.0",
        expires_at=now - timedelta(hours=1),
    )
    live = TokenSession(
        jti=f"jti-{uuid.uuid4()}",
        user_id=standard_user.id,
        client_ip="203.0.113.8",
        user_agent="Mozilla/5.0",
        expires_at=now + timedelta(hours=1),
    )
    db_session.add_all([stale, live])
    db_session.flush()
    stale_jti, live_jti = stale.jti, live.jti

    housekeeping.purge_now(db_session.connection())
    db_session.expunge_all()

    assert db_session.query(TokenSession).filter(TokenSession.jti == stale_jti).count() == 0
    assert db_session.query(TokenSession).filter(TokenSession.jti == live_jti).count() == 1


def test_a_sweep_leaves_data_inside_its_window_alone(db_session, standard_user, make_avatar):
    log = _seed_audit_log(db_session, age_days=1)
    log_id = log.id
    conversation = _seed_conversation(db_session, standard_user, make_avatar(), age_days=1)
    conversation_id = conversation.id

    housekeeping.purge_now(db_session.connection())
    db_session.expire_all()

    assert db_session.query(AuditLog).filter(AuditLog.id == log_id).count() == 1
    assert (
        db_session.query(ChatConversation).filter(ChatConversation.id == conversation_id).count()
        == 1
    )


# ── Una replica per volta ──────────────────────────────────────────────


def test_only_one_replica_sweeps_at_a_time(db_session, standard_user, make_avatar):
    """Con più repliche il ciclo parte in tutte nello stesso momento: chi non
    si aggiudica il giro lo salta invece di fare DELETE in concorrenza sulle
    stesse righe scadute."""
    log = _seed_audit_log(db_session, age_days=audit.RETENTION_DAYS + 1)
    log_id = log.id

    with engine.connect() as altra_replica, altra_replica.begin():
        altra_replica.execute(
            text("SELECT pg_advisory_xact_lock(:k)"), {"k": housekeeping._SWEEP_LOCK_KEY}
        )

        housekeeping.purge_now(db_session.connection())

        db_session.expire_all()
        assert db_session.query(AuditLog).filter(AuditLog.id == log_id).count() == 1


def test_the_sweep_lock_is_handed_back_on_its_own():
    """Legato alla transazione: finita quella il lock è già andato,
    altrimenti la prima replica bloccherebbe per sempre tutte le altre.

    Un giro vero, che apre e chiude una transazione sua: è l'unico modo di
    vedere il rilascio, perché un purge sulla connessione del test terrebbe
    il lock fino al rollback di fine test. Gira sul database di test senza
    la rete della transazione, e non ha niente da cancellare.
    """
    housekeeping.purge_now()

    with engine.connect() as verifica, verifica.begin():
        libero = verifica.execute(
            text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": housekeeping._SWEEP_LOCK_KEY}
        ).scalar()

    assert libero


# ── Il ciclo sopravvive ai propri errori ───────────────────────────────


def test_a_failing_sweep_is_swallowed(monkeypatch):
    """One bad sweep must not propagate: the caller is the loop itself."""

    def _boom(conn=None):
        raise RuntimeError("database irraggiungibile")

    monkeypatch.setattr(housekeeping, "purge_now", _boom)

    asyncio.run(housekeeping.run_once())


def test_the_loop_keeps_going_after_a_failure(monkeypatch):
    """The sweep that follows a failure still runs.

    This is the property the whole module exists for: a transient database
    outage must cost one sweep, not every sweep until someone restarts the
    container.
    """
    calls = []

    def _fail_once(conn=None):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("database irraggiungibile")

    monkeypatch.setattr(housekeeping, "purge_now", _fail_once)

    _drive(lambda: housekeeping._run_forever(0.01), for_seconds=0.1)

    assert len(calls) > 1


def test_the_first_sweep_runs_immediately(monkeypatch):
    """Startup is a sweep too: a restarted container purges at once."""
    calls = []
    monkeypatch.setattr(housekeeping, "purge_now", lambda conn=None: calls.append(1))

    # Un intervallo lunghissimo: se il primo giro non fosse immediato,
    # nell'attesa non succederebbe niente.
    _drive(lambda: housekeeping._run_forever(3600), for_seconds=0.05)

    assert len(calls) == 1


# ── L'interruttore ─────────────────────────────────────────────────────


def test_the_loop_can_be_switched_off(monkeypatch):
    """Interval 0 means no task at all (what the suite itself runs with)."""
    monkeypatch.setattr(housekeeping, "INTERVAL_SECONDS", 0)

    async def _start_and_check():
        housekeeping.start()
        assert housekeeping._task is None
        await housekeeping.stop()

    asyncio.run(_start_and_check())


def test_stopping_the_loop_leaves_nothing_running(monkeypatch):
    monkeypatch.setattr(housekeeping, "INTERVAL_SECONDS", 3600)
    monkeypatch.setattr(housekeeping, "purge_now", lambda conn=None: None)

    async def _start_then_stop():
        housekeeping.start()
        task = housekeeping._task
        assert task is not None
        await housekeeping.stop()
        assert task.cancelled() or task.done()
        assert housekeeping._task is None

    asyncio.run(_start_then_stop())
