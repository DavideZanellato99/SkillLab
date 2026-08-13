"""Il limitatore dei tentativi di accesso, ora condiviso via database.

Il test che descrive il cambiamento è l'ultimo: due limitatori distinti,
come due repliche del backend, contano sullo stesso secchiello. Finché il
conteggio stava nella memoria del processo, quattro repliche concedevano a
un attaccante quattro volte i tentativi, e nessuna delle quattro vedeva mai
l'attacco per intero.

Tutti i test prendono ``db_session`` anche quando non la usano: è la fixture
che lega il limitatore alla transazione annullata a fine test.
"""

from datetime import UTC, datetime, timedelta

from models import LoginAttempt
from rate_limit import SlidingWindowLimiter, purge_expired


def test_allows_until_the_limit_is_reached(db_session):
    limiter = SlidingWindowLimiter(scope="ip", max_events=3, window_seconds=60)
    assert limiter.retry_after("ip") == 0
    limiter.record("ip")
    limiter.record("ip")
    # Still under the limit (2 < 3).
    assert limiter.retry_after("ip") == 0


def test_blocks_once_the_limit_is_hit(db_session):
    limiter = SlidingWindowLimiter(scope="ip", max_events=3, window_seconds=60)
    for _ in range(3):
        limiter.record("ip")
    assert limiter.retry_after("ip") > 0


def test_reset_clears_the_key(db_session):
    limiter = SlidingWindowLimiter(scope="ip", max_events=1, window_seconds=60)
    limiter.record("ip")
    assert limiter.retry_after("ip") > 0
    limiter.reset("ip")
    assert limiter.retry_after("ip") == 0


def test_keys_are_independent(db_session):
    limiter = SlidingWindowLimiter(scope="ip", max_events=1, window_seconds=60)
    limiter.record("attacker")
    assert limiter.retry_after("attacker") > 0
    # A different caller is unaffected.
    assert limiter.retry_after("victim") == 0


def test_expired_failures_leave_the_window(db_session):
    """A window in the past no longer counts (elapsed > window_seconds)."""
    limiter = SlidingWindowLimiter(scope="ip", max_events=1, window_seconds=0)
    limiter.record("ip")
    # With a zero-length window the recorded failure is already outside it.
    assert limiter.retry_after("ip") == 0


def test_the_two_buckets_do_not_count_each_other(db_session):
    """Email e indirizzi IP finiscono nella stessa tabella: senza lo scope
    una chiave potrebbe consumare i tentativi dell'altra."""
    per_email = SlidingWindowLimiter(scope="email", max_events=1, window_seconds=60)
    per_ip = SlidingWindowLimiter(scope="ip", max_events=1, window_seconds=60)

    per_email.record("stessa-chiave")

    assert per_email.retry_after("stessa-chiave") > 0
    assert per_ip.retry_after("stessa-chiave") == 0


# ── Le righe portano un indirizzo IP, quindi non restano in giro ───────


def _invecchia(db_session, quanto: timedelta) -> None:
    db_session.query(LoginAttempt).update(
        {"created_at": datetime.now(UTC).replace(tzinfo=None) - quanto},
        synchronize_session=False,
    )
    db_session.flush()


def test_recording_a_failure_drops_what_left_the_window(db_session):
    """Quello che esce dalla finestra sparisce mentre si conta, senza
    aspettare nessuno."""
    limiter = SlidingWindowLimiter(scope="ip", max_events=5, window_seconds=60)
    limiter.record("203.0.113.7")
    _invecchia(db_session, timedelta(hours=2))

    limiter.record("203.0.113.7")

    # Resta solo il tentativo appena registrato
    assert db_session.query(LoginAttempt).count() == 1


def test_the_sweep_collects_what_nobody_went_back_to_count(db_session):
    """Su un'installazione dove nessuno sbaglia più la password la pulizia
    opportunistica non passa mai: ci pensa lo sweep di housekeeping."""
    limiter = SlidingWindowLimiter(scope="ip", max_events=5, window_seconds=60)
    limiter.record("203.0.113.7")
    _invecchia(db_session, timedelta(days=7))

    eliminati = purge_expired(db_session.connection())

    assert eliminati == 1
    assert db_session.query(LoginAttempt).count() == 0


def test_the_sweep_leaves_the_attempts_still_being_counted(db_session):
    """Prudente di proposito: una pulizia che passasse prima del conteggio
    allenterebbe il limite senza che nessuno se ne accorga."""
    limiter = SlidingWindowLimiter(scope="ip", max_events=1, window_seconds=15 * 60)
    limiter.record("203.0.113.7")

    eliminati = purge_expired(db_session.connection())

    assert eliminati == 0
    assert limiter.retry_after("203.0.113.7") > 0


# ── Il motivo per cui il conteggio ha lasciato la memoria ──────────────


def test_two_replicas_share_one_bucket(db_session):
    """Il fix, detto in un test: due limitatori distinti (due processi, in
    produzione) contano gli stessi fallimenti. Con lo stato in RAM il secondo
    sarebbe ripartito da zero e il limite sarebbe valso il doppio."""
    replica_uno = SlidingWindowLimiter(scope="ip", max_events=3, window_seconds=60)
    replica_due = SlidingWindowLimiter(scope="ip", max_events=3, window_seconds=60)

    replica_uno.record("203.0.113.7")
    replica_uno.record("203.0.113.7")
    replica_due.record("203.0.113.7")

    assert replica_uno.retry_after("203.0.113.7") > 0
    assert replica_due.retry_after("203.0.113.7") > 0
