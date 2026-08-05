"""Tenant management: what the super admin can do to an organization, and
what suspending or deleting one does to everything that hangs off it.

Cognito is never reached: admin_delete_user is swapped for a recorder, so a
test can assert exactly which accounts the endpoint asked the identity
provider to remove, and simulate the provider failing halfway through.

The two login tests at the bottom live here on purpose. Suspension is only
worth anything if it is enforced at the door as well as on every request,
and the two halves of that rule are the kind that drift apart once they sit
in different files.
"""

import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event

import routers.auth as auth_router
import routers.organizations as organizations_router
from auth_dependency import ACCESS_TOKEN_COOKIE, MOCK_ADMIN_SUB, ensure_roles
from models import (
    DEFAULT_AVATAR_CATEGORY_NAME,
    ORG_STATUS_ACTIVE,
    ORG_STATUS_SUSPENDED,
    ROLE_USER,
    USER_STATUS_SUSPENDED,
    AuditLog,
    Avatar,
    AvatarCategory,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    Organization,
    TrainingAssignment,
    User,
    UserSelection,
)

BASE = "/api/admin/organizations"


@pytest.fixture
def cognito(monkeypatch):
    """Records the accounts the router asks Cognito to delete."""
    deleted: list[str] = []
    monkeypatch.setattr(organizations_router, "admin_delete_user", deleted.append)
    return deleted


@pytest.fixture
def make_org(db_session):
    def _factory(name: str, *, slug: str | None = None, status: str = ORG_STATUS_ACTIVE):
        org = Organization(
            name=name,
            slug=slug or name.lower().replace(" ", "-"),
            status=status,
        )
        db_session.add(org)
        db_session.flush()
        return org

    return _factory


@pytest.fixture
def make_member(db_session):
    """Inserts a user straight into a tenant, bypassing the endpoint."""

    def _factory(organization, *, cognito_sub: str | None = None) -> User:
        roles = ensure_roles(db_session)
        user = User(
            cognito_sub=cognito_sub or f"test-{uuid.uuid4()}",
            email=f"{uuid.uuid4()}@test.invalid",
            nome="Membro",
            cognome="Test",
            role_id=roles[ROLE_USER].id,
            organization_id=organization.id,
        )
        db_session.add(user)
        db_session.flush()
        return user

    return _factory


def _audit_row(db_session, action: str) -> AuditLog:
    return db_session.query(AuditLog).filter(AuditLog.action == action).one()


@contextmanager
def _orm_queries(db_session):
    """Collects the ORM statements run on the test session inside the block."""
    executed: list[str] = []

    def _record(state):
        executed.append(str(state.statement))

    event.listen(db_session, "do_orm_execute", _record)
    try:
        yield executed
    finally:
        event.remove(db_session, "do_orm_execute", _record)


# ── Elenco ────────────────────────────────────────────


def test_list_reports_the_counters_of_each_tenant(
    admin_client, db_session, organization, standard_user, make_avatar, make_org
):
    make_avatar()
    empty = make_org("Tenant vuoto")

    response = admin_client.get(BASE)
    assert response.status_code == 200

    by_id = {row["id"]: row for row in response.json()}
    assert by_id[str(organization.id)]["user_count"] == 1
    assert by_id[str(organization.id)]["avatar_count"] == 1
    assert by_id[str(empty.id)] == {**by_id[str(empty.id)], "user_count": 0, "avatar_count": 0}


def test_list_costs_the_same_whatever_the_number_of_tenants(
    admin_client, db_session, organization, standard_user, make_avatar, make_org
):
    """The counters come from one aggregate each, not from a pair of counts
    per row: this endpoint also feeds the organization dropdown of every
    admin page, and a per-row count would make each of those screens cost
    2N+1 round trips to the database."""
    make_avatar()
    # The very first request also pays for the fixtures' lazy loading: what
    # this test is about is the cost at steady state.
    assert admin_client.get(BASE).status_code == 200

    with _orm_queries(db_session) as one_tenant:
        assert admin_client.get(BASE).status_code == 200

    for n in range(4):
        make_org(f"Tenant {n}")

    with _orm_queries(db_session) as five_tenants:
        assert admin_client.get(BASE).status_code == 200

    # The list itself plus one aggregate per counter, whatever the row count
    assert len(one_tenant) == 3
    assert len(five_tenants) == 3


# ── Dettaglio ─────────────────────────────────────────


def test_detail_measures_how_much_the_tenant_trains(
    admin_client, db_session, organization, standard_user, make_avatar
):
    """Recent activity, average score and last access: the three figures that
    say whether a tenant is actually using the platform."""
    avatar = make_avatar()
    recent = ChatConversation(
        user_id=standard_user.id, avatar_id=avatar.id, title="Clienti 1", mode="voice"
    )
    old = ChatConversation(
        user_id=standard_user.id,
        avatar_id=avatar.id,
        title="Clienti 2",
        mode="text",
        created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=45),
    )
    db_session.add_all([recent, old])
    db_session.flush()
    db_session.add(
        ConversationEvaluation(
            conversation_id=recent.id, overall_score=8.0, result={"summary": "", "criteria": []}
        )
    )
    db_session.add(
        ConversationEvaluation(
            conversation_id=old.id, overall_score=7.0, result={"summary": "", "criteria": []}
        )
    )
    standard_user.last_login_at = datetime(2026, 7, 20, 9, 30)
    db_session.flush()

    response = admin_client.get(f"{BASE}/{organization.id}")
    assert response.status_code == 200

    body = response.json()
    assert body["conversations_total"] == 2
    assert body["conversations_last_30_days"] == 1
    assert body["average_score"] == 7.5
    assert body["evaluated_count"] == 2
    assert body["last_login_at"].startswith("2026-07-20T09:30")
    assert body["user_count"] == 1
    assert body["avatar_count"] == 1


def test_detail_counts_nothing_from_another_tenant(
    admin_client, db_session, organization, standard_user, make_avatar, make_org, make_member
):
    other = make_org("Altro tenant")
    other_member = make_member(other)
    other_avatar = make_avatar(organization_id=other.id)
    db_session.add(
        ChatConversation(
            user_id=other_member.id, avatar_id=other_avatar.id, title="Clienti 1", mode="voice"
        )
    )
    db_session.flush()

    body = admin_client.get(f"{BASE}/{organization.id}").json()

    assert body["conversations_total"] == 0
    assert body["user_count"] == 1


def test_detail_reports_no_average_when_nothing_was_evaluated(
    admin_client, organization, standard_user
):
    """None, not zero: a zero would read as "they score terribly" instead of
    "there is nothing to average yet"."""
    body = admin_client.get(f"{BASE}/{organization.id}").json()

    assert body["average_score"] is None
    assert body["evaluated_count"] == 0
    assert body["last_login_at"] is None


def test_detail_404s_on_an_unknown_organization(admin_client):
    assert admin_client.get(f"{BASE}/{uuid.uuid4()}").status_code == 404


# ── Creazione ─────────────────────────────────────────


def test_create_derives_the_slug_from_the_name(admin_client):
    response = admin_client.post(BASE, json={"name": "Banca Esempio S.p.A."})

    assert response.status_code == 201
    assert response.json()["slug"] == "banca-esempio-s-p-a"


def test_create_keeps_the_slug_unique(admin_client, make_org):
    make_org("Primo tenant", slug="tenant")

    response = admin_client.post(BASE, json={"name": "Secondo tenant", "slug": "tenant"})

    assert response.status_code == 201
    assert response.json()["slug"] == "tenant-2"


def test_create_gives_the_tenant_its_first_avatar_category(admin_client, db_session):
    """Un tenant nasce con una categoria, altrimenti il suo primo avatar non
    si potrebbe creare: la categoria è obbligatoria e non ce ne sarebbe
    nessuna da scegliere."""
    response = admin_client.post(BASE, json={"name": "Tenant Appena Nato"})
    assert response.status_code == 201

    categories = (
        db_session.query(AvatarCategory)
        .filter(AvatarCategory.organization_id == uuid.UUID(response.json()["id"]))
        .all()
    )
    assert [c.name for c in categories] == [DEFAULT_AVATAR_CATEGORY_NAME]


def test_create_rejects_a_duplicate_name_whatever_the_case(admin_client, make_org):
    """Two tenants nobody can tell apart in any admin table: only the slug
    would differ, with a numeric suffix nobody asked for."""
    make_org("Acme S.r.l.")

    response = admin_client.post(BASE, json={"name": "ACME S.R.L."})

    assert response.status_code == 400
    assert "già" in response.json()["detail"]


def test_creation_names_the_new_tenant_in_the_audit_trail(admin_client, db_session):
    """A creation has no id in its path: the endpoint has to put it in the
    details itself, or the row would not say what was created."""
    response = admin_client.post(BASE, json={"name": "Nuovo tenant"})
    assert response.status_code == 201

    row = _audit_row(db_session, "organization.create")
    assert row.details["nome"] == "Nuovo tenant"
    assert row.details["target_id"] == response.json()["id"]


# ── Modifica ──────────────────────────────────────────


def test_rename_records_the_previous_name(admin_client, db_session, organization):
    """Renaming is the one change that makes the older rows of the trail
    unreadable: without the previous name nothing connects them."""
    response = admin_client.put(f"{BASE}/{organization.id}", json={"name": "Nome nuovo"})
    assert response.status_code == 200

    row = _audit_row(db_session, "organization.update")
    assert row.details["nome"] == "Nome nuovo"
    assert row.details["nome_da"] == "Org di test"


def test_changing_the_slug_records_both_sides(admin_client, db_session, organization):
    response = admin_client.put(f"{BASE}/{organization.id}", json={"slug": "slug-nuovo"})
    assert response.status_code == 200

    row = _audit_row(db_session, "organization.update")
    assert row.details["slug_da"] == "org-di-test"
    assert row.details["slug_a"] == "slug-nuovo"


def test_a_rename_that_changes_nothing_invents_no_changes(admin_client, db_session, organization):
    response = admin_client.put(f"{BASE}/{organization.id}", json={"name": organization.name})
    assert response.status_code == 200

    row = _audit_row(db_session, "organization.update")
    assert row.details == {"nome": "Org di test"}


def test_rename_rejects_a_name_another_tenant_already_uses(admin_client, organization, make_org):
    make_org("Acme S.r.l.")

    response = admin_client.put(f"{BASE}/{organization.id}", json={"name": "acme s.r.l."})

    assert response.status_code == 400


def test_rename_rejects_a_blank_name(admin_client, organization):
    response = admin_client.put(f"{BASE}/{organization.id}", json={"name": "   "})

    assert response.status_code == 400


# ── Sospensione ───────────────────────────────────────


def test_suspension_spells_out_the_direction_in_the_audit_trail(
    admin_client, db_session, organization
):
    """Cutting off a whole tenant is the action the trail has to name:
    "stato modificato" alone does not say which way it went."""
    response = admin_client.put(
        f"{BASE}/{organization.id}/status", json={"status": ORG_STATUS_SUSPENDED}
    )
    assert response.status_code == 200
    assert response.json()["status"] == ORG_STATUS_SUSPENDED

    row = _audit_row(db_session, "organization.status")
    assert row.details == {
        "nome": "Org di test",
        "da": ORG_STATUS_ACTIVE,
        "a": ORG_STATUS_SUSPENDED,
    }


def test_reactivation_is_recorded_the_same_way(admin_client, db_session, organization):
    organization.status = ORG_STATUS_SUSPENDED
    db_session.flush()

    response = admin_client.put(
        f"{BASE}/{organization.id}/status", json={"status": ORG_STATUS_ACTIVE}
    )
    assert response.status_code == 200

    row = _audit_row(db_session, "organization.status")
    assert row.details["da"] == ORG_STATUS_SUSPENDED
    assert row.details["a"] == ORG_STATUS_ACTIVE


def test_status_rejects_an_unknown_value(admin_client, organization):
    response = admin_client.put(f"{BASE}/{organization.id}/status", json={"status": "archiviata"})

    assert response.status_code == 400


def test_the_suspension_reason_travels_with_the_suspension(admin_client, db_session, organization):
    """It is shown to the locked-out users, so it is stored with the state
    rather than left in the audit trail alone."""
    response = admin_client.put(
        f"{BASE}/{organization.id}/status",
        json={"status": ORG_STATUS_SUSPENDED, "reason": "  Contratto scaduto il 30/06  "},
    )
    assert response.status_code == 200
    assert response.json()["suspension_reason"] == "Contratto scaduto il 30/06"

    db_session.refresh(organization)
    assert organization.suspension_reason == "Contratto scaduto il 30/06"
    assert _audit_row(db_session, "organization.status").details["motivo"] == (
        "Contratto scaduto il 30/06"
    )


def test_reactivating_clears_the_reason(admin_client, db_session, organization):
    """It describes the suspension in force, not a history: the trail keeps
    the record of why it happened."""
    organization.status = ORG_STATUS_SUSPENDED
    organization.suspension_reason = "Contratto scaduto"
    db_session.flush()

    response = admin_client.put(
        f"{BASE}/{organization.id}/status", json={"status": ORG_STATUS_ACTIVE}
    )
    assert response.status_code == 200
    assert response.json()["suspension_reason"] is None

    db_session.refresh(organization)
    assert organization.suspension_reason is None


def test_a_suspension_without_a_reason_stays_empty(admin_client, organization):
    response = admin_client.put(
        f"{BASE}/{organization.id}/status", json={"status": ORG_STATUS_SUSPENDED, "reason": "   "}
    )

    assert response.status_code == 200
    assert response.json()["suspension_reason"] is None


# ── Eliminazione ──────────────────────────────────────


def test_delete_takes_the_whole_tenant_with_it(
    admin_client, cognito, db_session, organization, standard_user, make_avatar, super_admin_user
):
    """Every table that hangs off a tenant, in one irreversible sweep."""
    avatar = make_avatar()
    conversation = ChatConversation(
        user_id=standard_user.id, avatar_id=avatar.id, title="Clienti 1", mode="voice"
    )
    db_session.add(conversation)
    db_session.flush()
    db_session.add(ChatMessage(conversation_id=conversation.id, role="user", content="ciao"))
    db_session.add(
        ConversationEvaluation(
            conversation_id=conversation.id,
            overall_score=7.0,
            result={"summary": "s", "criteria": []},
        )
    )
    db_session.add(UserSelection(user_id=standard_user.id, avatar_id=avatar.id))
    db_session.add(
        TrainingAssignment(
            user_id=standard_user.id,
            avatar_id=avatar.id,
            assigned_by_id=super_admin_user.id,
            target_score=8.0,
        )
    )
    db_session.flush()

    # Everything is read before the sweep: these rows are about to be gone,
    # and the objects that carry them would raise on any access afterwards.
    org_id, user_id, email = organization.id, standard_user.id, standard_user.email
    conversation_id, avatar_id, category_id = conversation.id, avatar.id, avatar.category_id

    response = admin_client.delete(f"{BASE}/{org_id}")
    assert response.status_code == 200, response.text

    assert cognito == [email]
    assert db_session.query(Organization).filter(Organization.id == org_id).first() is None
    assert db_session.query(User).filter(User.id == user_id).first() is None
    assert db_session.query(Avatar).filter(Avatar.id == avatar_id).first() is None
    # Le categorie sono del tenant come gli avatar: se ne vanno con lui.
    assert db_session.query(AvatarCategory).filter(AvatarCategory.id == category_id).first() is None
    assert (
        db_session.query(ChatConversation).filter(ChatConversation.id == conversation_id).first()
        is None
    )
    assert (
        db_session.query(ChatMessage).filter(ChatMessage.conversation_id == conversation_id).count()
        == 0
    )
    assert (
        db_session.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation_id)
        .count()
        == 0
    )
    assert db_session.query(UserSelection).filter(UserSelection.user_id == user_id).count() == 0
    assert (
        db_session.query(TrainingAssignment).filter(TrainingAssignment.user_id == user_id).count()
        == 0
    )


def test_delete_leaves_the_other_tenants_alone(
    admin_client, cognito, db_session, organization, standard_user, make_org, make_member
):
    other = make_org("Altro tenant")
    survivor_id = make_member(other).id
    other_id = other.id
    email = standard_user.email

    assert admin_client.delete(f"{BASE}/{organization.id}").status_code == 200

    assert cognito == [email]
    assert db_session.query(Organization).filter(Organization.id == other_id).first() is not None
    assert db_session.query(User).filter(User.id == survivor_id).first() is not None


def test_delete_refuses_the_tenant_holding_the_system_account(
    admin_client, cognito, db_session, organization, make_member
):
    """The mock super admin is the way back in: deleting it would lock the
    platform owner out of its own installation."""
    system = db_session.query(User).filter(User.cognito_sub == MOCK_ADMIN_SUB).first()
    if system is None:
        make_member(organization, cognito_sub=MOCK_ADMIN_SUB)
    else:
        # It exists once per installation: moved into the tenant for the
        # length of the test, put back by the transaction rollback.
        system.organization_id = organization.id
        db_session.flush()

    response = admin_client.delete(f"{BASE}/{organization.id}")

    assert response.status_code == 400
    assert "account di sistema" in response.json()["detail"]
    assert cognito == []
    assert db_session.query(Organization).filter(Organization.id == organization.id).first()


def test_delete_records_how_far_it_got_when_cognito_fails(
    admin_client, monkeypatch, db_session, organization, standard_user, make_member
):
    """A provider failure halfway leaves accounts that cannot log in while
    their rows are still there: the trail has to say how many, because the
    retry that fixes it will not be able to tell."""
    make_member(organization)
    attempts: list[str] = []

    def _delete(email: str) -> None:
        attempts.append(email)
        if len(attempts) == 2:
            raise RuntimeError("Errore di comunicazione con AWS Cognito")

    monkeypatch.setattr(organizations_router, "admin_delete_user", _delete)

    response = admin_client.delete(f"{BASE}/{organization.id}")

    assert response.status_code == 502
    assert "1 utenti su 2" in response.json()["detail"]
    # Nothing local was touched: the delete can be retried as it stands
    assert db_session.query(Organization).filter(Organization.id == organization.id).first()
    assert db_session.query(User).filter(User.organization_id == organization.id).count() == 2

    row = _audit_row(db_session, "organization.delete")
    assert row.status_code == 502
    assert row.details["cognito_eliminati"] == 1
    assert row.details["cognito_totali"] == 2
    assert row.details["cognito_errore_su"] == attempts[-1]


def test_deleted_tenant_stays_named_in_the_audit_trail(
    admin_client, cognito, db_session, organization, standard_user
):
    """The row outlives the organization it names and its FK is nulled:
    the name snapshot is all that keeps it readable."""
    assert admin_client.delete(f"{BASE}/{organization.id}").status_code == 200

    row = _audit_row(db_session, "organization.delete")
    assert row.details["nome"] == "Org di test"
    assert row.details["utenti_eliminati"] == 1


# ── Chi può ───────────────────────────────────────────


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("get", BASE, None),
        ("get", f"{BASE}/{uuid.uuid4()}", None),
        ("post", BASE, {"name": "Tenant abusivo"}),
        ("put", f"{BASE}/{uuid.uuid4()}", {"name": "Rinominata"}),
        ("put", f"{BASE}/{uuid.uuid4()}/status", {"status": ORG_STATUS_SUSPENDED}),
        ("delete", f"{BASE}/{uuid.uuid4()}", None),
    ],
)
def test_tenant_management_is_super_admin_only(org_admin_client, method, path, body):
    """An organization admin reads its own tenant, it never administers the
    list of tenants."""
    response = getattr(org_admin_client, method)(path, **({"json": body} if body else {}))

    assert response.status_code == 403


# ── Il blocco, visto dal login ────────────────────────


def _cognito_signs_in(monkeypatch) -> None:
    monkeypatch.setattr(
        auth_router,
        "authenticate",
        lambda email, password: {"access_token": "access", "refresh_token": "refresh"},
    )
    monkeypatch.setattr(auth_router, "_bind_fresh_token", lambda *args, **kwargs: None)


def test_login_is_refused_while_the_organization_is_suspended(
    client, db_session, monkeypatch, organization, standard_user
):
    """Credentials are valid and Cognito says yes: the platform still has to
    say no here. Letting the login through would hand out the cookies, stamp
    last_login_at and record an access for a session every following request
    rejects."""
    _cognito_signs_in(monkeypatch)
    organization.status = ORG_STATUS_SUSPENDED
    db_session.flush()

    response = client.post(
        "/api/auth/login", json={"email": standard_user.email, "password": "irrilevante"}
    )

    assert response.status_code == 403
    assert "organizzazione" in response.json()["detail"].lower()
    assert ACCESS_TOKEN_COOKIE not in response.cookies
    db_session.refresh(standard_user)
    assert standard_user.last_login_at is None
    assert db_session.query(AuditLog).filter(AuditLog.action == "auth.login").count() == 0
    assert (
        _audit_row(db_session, "auth.login_failed").details["motivo"] == response.json()["detail"]
    )


def test_the_locked_out_user_reads_the_reason_the_admin_wrote(
    client, db_session, monkeypatch, organization, standard_user
):
    """Which is the whole point of storing it: a generic wall tells the user
    nothing they can act on."""
    _cognito_signs_in(monkeypatch)
    organization.status = ORG_STATUS_SUSPENDED
    organization.suspension_reason = "Contratto scaduto, contatta il tuo referente"
    db_session.flush()

    response = client.post(
        "/api/auth/login", json={"email": standard_user.email, "password": "irrilevante"}
    )

    assert response.status_code == 403
    assert "Contratto scaduto, contatta il tuo referente" in response.json()["detail"]


def test_login_is_refused_while_the_account_is_suspended(
    client, db_session, monkeypatch, standard_user
):
    _cognito_signs_in(monkeypatch)
    standard_user.status = USER_STATUS_SUSPENDED
    db_session.flush()

    response = client.post(
        "/api/auth/login", json={"email": standard_user.email, "password": "irrilevante"}
    )

    assert response.status_code == 403
    assert "account" in response.json()["detail"].lower()
    db_session.refresh(standard_user)
    assert standard_user.last_login_at is None


def test_login_works_again_once_the_organization_is_reactivated(
    client, db_session, monkeypatch, organization, standard_user
):
    _cognito_signs_in(monkeypatch)
    organization.status = ORG_STATUS_SUSPENDED
    db_session.flush()
    assert (
        client.post(
            "/api/auth/login", json={"email": standard_user.email, "password": "irrilevante"}
        ).status_code
        == 403
    )

    organization.status = ORG_STATUS_ACTIVE
    db_session.flush()

    response = client.post(
        "/api/auth/login", json={"email": standard_user.email, "password": "irrilevante"}
    )
    assert response.status_code == 200
    assert response.json()["user"]["id"] == str(standard_user.id)
