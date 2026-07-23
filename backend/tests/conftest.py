"""Shared pytest fixtures for the backend suite.

Two things have to happen before the application is imported, and this
module (loaded by pytest before any test) is where they happen:

1. Every REQUIRED environment variable is set to a harmless placeholder, so
   importing `main` doesn't raise. Real values never appear here — the
   tests never talk to Cognito, OpenAI, Cartesia or ElevenLabs (the clients
   stay uninitialised with empty keys, and the auth dependency is
   overridden per test).
2. DATABASE_URL is pointed at a *test* database. `setdefault` means CI can
   override it (its Postgres service container sets the real value); locally
   it falls back to the compose Postgres on 5433, database `skilllab_test`.

The app runs Postgres-specific DDL at import (JSONB, STORAGE EXTERNAL,
ADD COLUMN IF NOT EXISTS), so the suite needs a real Postgres — SQLite is
not an option. Each test runs inside a transaction that is rolled back at
the end, so nothing leaks between tests.
"""

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5433/skilllab_test",
)
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("COGNITO_REGION", "eu-west-1")
os.environ.setdefault("OPENAI_MODEL", "gpt-4o")
os.environ.setdefault("OPENAI_EVAL_MODEL", "gpt-4o")
os.environ.setdefault("CARTESIA_MODEL", "sonic-2")
os.environ.setdefault("CARTESIA_VERSION", "2024-11-13")
os.environ.setdefault("CARTESIA_LANGUAGE", "it")
os.environ.setdefault("CARTESIA_TTS_WS_URL", "wss://example.invalid/tts")
os.environ.setdefault("ELEVENLABS_STT_MODEL", "scribe_v1")
os.environ.setdefault("ELEVENLABS_STT_LANGUAGE", "it")
os.environ.setdefault("ELEVENLABS_VAD_SILENCE_SECS", "0.8")
os.environ.setdefault("ELEVENLABS_VAD_THRESHOLD", "0.5")
os.environ.setdefault("ELEVENLABS_STT_WS_URL", "wss://example.invalid/stt")
os.environ.setdefault("VOICE_LATENCY_LOG", "0")

import uuid  # noqa: E402  (must follow the env setup above)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import main  # noqa: E402  (importing runs create_all + migrations on the test DB)
from auth_dependency import ensure_roles, get_current_user  # noqa: E402
from database import engine, get_db  # noqa: E402
from models import (  # noqa: E402
    ROLE_SUPER_ADMIN,
    ROLE_USER,
    Avatar,
    Organization,
    User,
)

app = main.app


@pytest.fixture
def db_session():
    """A Session bound to a transaction that is rolled back after the test.

    `join_transaction_mode="create_savepoint"` (SQLAlchemy 2.0) turns the
    endpoints' own db.commit() calls into SAVEPOINTs on this outer
    transaction, so committed rows are still discarded at teardown and tests
    stay isolated without truncating tables.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    ensure_roles(session)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session):
    """TestClient with the DB wired to the rolled-back session, no auth.

    Leaving get_current_user un-overridden means the real dependency runs,
    so requests with no cookie/token get the genuine 401 — this is the
    client used to test the auth guards.
    """
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _make_user(db_session, role_name: str, organization_id=None) -> User:
    roles = ensure_roles(db_session)
    user = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@test.invalid",
        nome="Test",
        cognome="User",
        role_id=roles[role_name].id,
        organization_id=organization_id,
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def organization(db_session) -> Organization:
    """The tenant that owns the standard user and the test avatars."""
    org = Organization(name="Org di test", slug="org-di-test")
    db_session.add(org)
    db_session.flush()
    return org


@pytest.fixture
def standard_user(db_session, organization) -> User:
    # A plain user always belongs to an organization.
    return _make_user(db_session, ROLE_USER, organization_id=organization.id)


@pytest.fixture
def super_admin_user(db_session) -> User:
    # The super admin stands above every tenant: organization_id stays NULL.
    return _make_user(db_session, ROLE_SUPER_ADMIN)


@pytest.fixture
def user_client(client, standard_user):
    """TestClient authenticated as a plain user."""
    app.dependency_overrides[get_current_user] = lambda: standard_user
    yield client
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def admin_client(client, super_admin_user):
    """TestClient authenticated as the super admin."""
    app.dependency_overrides[get_current_user] = lambda: super_admin_user
    yield client
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def make_avatar(db_session, organization):
    """Factory that inserts an avatar (a valid persona sheet is required).

    The avatar is owned by the same organization as the standard user, so
    the two share a tenant and the avatar is visible to that user. Pass
    `organization_id` explicitly to place it in a different tenant.
    """

    def _factory(
        *, name="Mario Rossi", category="clienti", organization_id=None, **profile_extra
    ) -> Avatar:
        profile = {"NOME": name, "GRADO_DIFFICOLTA": "5/10", **profile_extra}
        avatar = Avatar(
            name=name,
            image_url="/static/avatars/test.png",
            category=category,
            description="Persona di test",
            profile=profile,
            organization_id=organization_id or organization.id,
        )
        db_session.add(avatar)
        db_session.flush()
        return avatar

    return _factory
