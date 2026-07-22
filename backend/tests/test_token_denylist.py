"""Server-side access-token denylist (jti)."""

from datetime import UTC, datetime, timedelta

import pytest

import token_denylist
from token_denylist import is_jti_revoked, revoke_jtis


@pytest.fixture(autouse=True)
def _reset_cache():
    """The module keeps a process-wide cache; clear it around each test so
    a jti revoked in one test can't leak into the next."""
    token_denylist._cache.clear()
    token_denylist._cache_loaded_at = None
    yield
    token_denylist._cache.clear()
    token_denylist._cache_loaded_at = None


def _future():
    return datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1)


def test_unknown_jti_is_not_revoked(db_session):
    assert is_jti_revoked(db_session, "never-seen") is False


def test_none_values_are_ignored(db_session):
    assert is_jti_revoked(db_session, None, None) is False


def test_revoked_jti_is_reported_immediately(db_session):
    revoke_jtis(db_session, [("jti-123", _future())])
    assert is_jti_revoked(db_session, "jti-123") is True


def test_matches_when_any_of_the_values_is_revoked(db_session):
    revoke_jtis(db_session, [("origin-xyz", _future())])
    # get_current_user passes both jti and origin_jti; a hit on either counts.
    assert is_jti_revoked(db_session, "some-jti", "origin-xyz") is True


def test_revoking_the_same_jti_twice_is_a_noop(db_session):
    entry = [("jti-dup", _future())]
    revoke_jtis(db_session, entry)
    revoke_jtis(db_session, entry)
    assert is_jti_revoked(db_session, "jti-dup") is True
