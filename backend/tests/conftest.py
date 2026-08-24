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
   it falls back to the compose Postgres on 5432, database `skilllab_test`.

The app runs Postgres-specific DDL at import (JSONB, STORAGE EXTERNAL,
ADD COLUMN IF NOT EXISTS), so the suite needs a real Postgres — SQLite is
not an option. Each test runs inside a transaction that is rolled back at
the end, so nothing leaks between tests.
"""

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/skilllab_test",
)
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("COGNITO_REGION", "eu-west-1")
os.environ.setdefault("OPENAI_MODEL", "gpt-4o")
os.environ.setdefault("OPENAI_EVAL_MODEL", "gpt-4o")
os.environ.setdefault("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
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
os.environ.setdefault("VOICE_STT_DEBUG", "0")
# L'accesso admin/admin locale, che diverse prove usano per entrare senza
# Cognito. Acceso qui e non ereditato dall'ambiente: la suite deve dare lo
# stesso esito sulla macchina di sviluppo e nella pipeline.
os.environ.setdefault("DEV_ADMIN_LOGIN", "1")
os.environ.setdefault("MAX_CONCURRENT_CALLS", "20")
os.environ.setdefault("DB_POOL_SIZE", "5")
os.environ.setdefault("DB_MAX_OVERFLOW", "15")
os.environ.setdefault("AUDIT_LOG_RETENTION_DAYS", "180")
os.environ.setdefault("AUDIO_RECORDING_RETENTION_DAYS", "90")
os.environ.setdefault("CONVERSATION_RETENTION_DAYS", "730")
os.environ.setdefault("SIMULATION_ATTEMPT_RETENTION_DAYS", "730")
# The background purge loop stays off under test: `with TestClient(app)`
# triggers the lifespan, and a sweep firing mid-test would run its DELETEs
# on its own connection, outside the transaction the test rolls back.
# test_housekeeping drives the loop explicitly instead.
os.environ.setdefault("HOUSEKEEPING_INTERVAL_HOURS", "0")

import uuid

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import activity
import audit
import main
import rate_limit
import voice_sessions
from auth_dependency import ensure_roles, get_current_user
from database import SessionLocal, engine, get_db
from models import (
    ROLE_ORGANIZATION_ADMIN,
    ROLE_SUPER_ADMIN,
    ROLE_USER,
    Avatar,
    AvatarCategory,
    Organization,
    TrainingPath,
    TrainingPathAssignment,
    TrainingPathStep,
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
    # The audit writer deliberately uses a session of its own (a log row
    # must survive the failure of the request it describes), so it would
    # otherwise write outside the test transaction and leak between tests.
    # Bound to the same connection here, its rows roll back with everything else.
    audit.session_factory = lambda: Session(
        bind=connection, join_transaction_mode="create_savepoint"
    )
    # Same reason for the voice session registry: the WebSocket path opens a
    # session of its own (it must not hold a pooled connection for the whole
    # call), which would otherwise miss the rows this transaction holds.
    voice_sessions.session_factory = audit.session_factory
    # And for the login limiter, which records a failed attempt on a session
    # of its own so the row survives the failure of the request it counts.
    rate_limit.session_factory = audit.session_factory
    # And for the last-activity stamp, written on its own session for the
    # same reason: the account was in use even if the request it was made by
    # ends in an error.
    activity.session_factory = audit.session_factory
    try:
        yield session
    finally:
        audit.session_factory = SessionLocal
        voice_sessions.session_factory = SessionLocal
        rate_limit.session_factory = SessionLocal
        activity.session_factory = SessionLocal
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


@pytest.fixture
def voice_socket(client):
    """Apre il socket vocale come lo apre il browser.

    L'id di sessione sta nei sottoprotocolli dell'handshake e non nella
    query string (vedi ``routers.voice``), quindi ogni test che tocca quel
    socket deve aprirlo così: passa da qui invece di ricostruire la
    chiamata a mano, che è come i test si erano accorti in ritardo del
    cambiamento la prima volta.
    """
    from routers.voice import VOICE_WS_PROTOCOL

    def _open(session_id: str | None = None):
        protocols = [VOICE_WS_PROTOCOL, session_id] if session_id else None
        return client.websocket_connect("/api/voice/ws", subprotocols=protocols)

    return _open


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
def org_admin_user(db_session, organization) -> User:
    # An organization admin is confined to its own tenant.
    return _make_user(db_session, ROLE_ORGANIZATION_ADMIN, organization_id=organization.id)


@pytest.fixture
def super_admin_user(db_session) -> User:
    # The super admin stands above every tenant: organization_id stays NULL.
    return _make_user(db_session, ROLE_SUPER_ADMIN)


def _authenticated_as(user: User):
    """Stand-in for get_current_user that keeps its side effect.

    The real dependency also publishes the caller on the request, which is
    how the audit middleware learns who acted: an override that only
    returned the user would silently switch the whole trail off under test.
    """

    def _override(request: Request) -> User:
        request.state.audit_user = user
        return user

    return _override


@pytest.fixture
def user_client(client, standard_user):
    """TestClient authenticated as a plain user."""
    app.dependency_overrides[get_current_user] = _authenticated_as(standard_user)
    yield client
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def act_as(client):
    """Switch who the shared TestClient is authenticated as, mid-test.

    The overrides live on the app, so two authenticated client fixtures in
    one test would fight over the same key: a test that needs several
    actors takes one client and switches identity with this instead.
    """

    def _switch(user: User) -> None:
        app.dependency_overrides[get_current_user] = _authenticated_as(user)

    yield _switch
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def org_admin_client(client, org_admin_user):
    """TestClient authenticated as an organization admin."""
    app.dependency_overrides[get_current_user] = _authenticated_as(org_admin_user)
    yield client
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def admin_client(client, super_admin_user):
    """TestClient authenticated as the super admin."""
    app.dependency_overrides[get_current_user] = _authenticated_as(super_admin_user)
    yield client
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def make_category(db_session, organization):
    """Factory that returns a category of a tenant, creating it once.

    Categories are an anagraphic table now, so a test that wants an avatar
    in "clienti" wants the row named "clienti" of that organization, not a
    second one every time it asks.
    """

    def _factory(name="clienti", organization_id=None, **fields) -> AvatarCategory:
        organization_id = organization_id or organization.id
        existing = (
            db_session.query(AvatarCategory)
            .filter(
                AvatarCategory.organization_id == organization_id,
                AvatarCategory.name == name,
            )
            .first()
        )
        if existing:
            return existing
        category = AvatarCategory(organization_id=organization_id, name=name, **fields)
        db_session.add(category)
        db_session.flush()
        return category

    return _factory


@pytest.fixture
def make_assigned_path(db_session, organization):
    """Factory che semina un percorso già affidato a una persona.

    Sta qui e non nei singoli test perché un percorso assegnato serve a
    quattro suite diverse (notifiche, cancellazione di un tenant, diritto
    all'oblio, esportazione dei dati) e nessuna di quelle sta verificando
    come si compone: se lo ricostruissero a mano, il giorno in cui una
    tappa cambia forma sarebbero quattro posti da correggere.

    Le tappe si passano come dizionari, uno per tappa e nell'ordine in cui
    devono stare: ``{"avatar": ..., "target": 7.0, "due_at": <datetime>}``
    oppure ``{"simulation": ..., "target": 6.0}``. Il posto in fila lo mette
    la factory, che è l'unica cosa che chi semina non deve stare a contare.

    ``created_at`` si può retrodatare: è il momento da cui la prima tappa
    conta, quindi è il modo di far svolgere una prova prima dello sblocco
    senza aspettare davvero. La scadenza invece non dipende da lui: è una
    data, e per farla passare la si scrive nel passato.
    """

    def _factory(user, steps, *, title="Percorso di test", assigned_by=None, created_at=None):
        path = TrainingPath(
            organization_id=user.organization_id or organization.id,
            title=title,
        )
        path.steps = [
            TrainingPathStep(
                position=position,
                avatar_id=getattr(step.get("avatar"), "id", None),
                simulation_id=getattr(step.get("simulation"), "id", None),
                target_score=step.get("target", 7.0),
                due_at=step.get("due_at"),
            )
            for position, step in enumerate(steps, start=1)
        ]
        db_session.add(path)
        db_session.flush()
        assignment = TrainingPathAssignment(
            path_id=path.id,
            user_id=user.id,
            assigned_by_id=getattr(assigned_by, "id", None),
        )
        if created_at is not None:
            assignment.created_at = created_at
        db_session.add(assignment)
        db_session.flush()
        return assignment

    return _factory


@pytest.fixture
def make_avatar(db_session, organization, make_category):
    """Factory that inserts an avatar (a valid persona sheet is required).

    The avatar is owned by the same organization as the standard user, so
    the two share a tenant and the avatar is visible to that user. Pass
    `organization_id` explicitly to place it in a different tenant.

    `category` is the name of the group: the row is created in the avatar's
    own organization the first time that name is asked for.
    """

    def _factory(
        *, name="Mario Rossi", category="clienti", organization_id=None, **profile_extra
    ) -> Avatar:
        profile = {"NOME": name, **profile_extra}
        organization_id = organization_id or organization.id
        avatar = Avatar(
            name=name,
            image_url="/static/avatars/test.png",
            category_id=make_category(category, organization_id).id,
            description="Persona di test",
            profile=profile,
            organization_id=organization_id,
        )
        db_session.add(avatar)
        db_session.flush()
        return avatar

    return _factory
