"""Sliding-window rate limiter (pure in-memory logic, no DB)."""

from rate_limit import SlidingWindowLimiter


def test_allows_until_the_limit_is_reached():
    limiter = SlidingWindowLimiter(max_failures=3, window_seconds=60)
    assert limiter.retry_after("ip") == 0
    limiter.record_failure("ip")
    limiter.record_failure("ip")
    # Still under the limit (2 < 3).
    assert limiter.retry_after("ip") == 0


def test_blocks_once_the_limit_is_hit():
    limiter = SlidingWindowLimiter(max_failures=3, window_seconds=60)
    for _ in range(3):
        limiter.record_failure("ip")
    assert limiter.retry_after("ip") > 0


def test_reset_clears_the_key():
    limiter = SlidingWindowLimiter(max_failures=1, window_seconds=60)
    limiter.record_failure("ip")
    assert limiter.retry_after("ip") > 0
    limiter.reset("ip")
    assert limiter.retry_after("ip") == 0


def test_keys_are_independent():
    limiter = SlidingWindowLimiter(max_failures=1, window_seconds=60)
    limiter.record_failure("attacker")
    assert limiter.retry_after("attacker") > 0
    # A different caller is unaffected.
    assert limiter.retry_after("victim") == 0


def test_expired_failures_leave_the_window():
    """A window in the past no longer counts (elapsed > window_seconds)."""
    limiter = SlidingWindowLimiter(max_failures=1, window_seconds=0)
    limiter.record_failure("ip")
    # With a zero-length window the recorded failure is already outside it.
    assert limiter.retry_after("ip") == 0
