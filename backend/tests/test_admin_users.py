"""User management: what the super admin can do to an account, and the rules
that hold whoever asks.

Cognito is never reached: the four admin_* calls the router makes are swapped
for recorders, so a test can assert exactly what the endpoint asked the
identity provider to do without a network round trip.

The login case-insensitivity test lives here too, on purpose: it is the other
half of the email contract this API writes, and splitting the two would let
them drift apart, which is precisely the bug it guards against.
"""

import uuid
from datetime import datetime

import pytest

import routers.admin as admin_router
import routers.auth as auth_router
from auth_dependency import ensure_roles
from models import (
    ORG_STATUS_SUSPENDED,
    ROLE_ORGANIZATION_ADMIN,
    ROLE_SUPER_ADMIN,
    ROLE_USER,
    USER_STATUS_ACTIVE,
    USER_STATUS_DISABLED,
    USER_STATUS_SUSPENDED,
    AuditLog,
    Organization,
    User,
)


@pytest.fixture
def cognito(monkeypatch):
    """Records what the router asks Cognito to do, and answers plausibly."""
    calls = {"created": [], "deleted": [], "enabled": [], "resent": []}

    def _create(email):
        calls["created"].append(email)
        return f"cognito-sub-{uuid.uuid4()}"

    def _delete(email):
        calls["deleted"].append(email)

    def _set_enabled(email, enabled):
        calls["enabled"].append((email, enabled))

    def _resend(email):
        calls["resent"].append(email)
        return f"cognito-sub-{uuid.uuid4()}"

    monkeypatch.setattr(admin_router, "admin_create_user", _create)
    monkeypatch.setattr(admin_router, "admin_delete_user", _delete)
    monkeypatch.setattr(admin_router, "admin_set_user_enabled", _set_enabled)
    monkeypatch.setattr(admin_router, "admin_resend_credentials", _resend)
    return calls


@pytest.fixture
def suspended_organization(db_session) -> Organization:
    org = Organization(name="Org sospesa", slug="org-sospesa", status=ORG_STATUS_SUSPENDED)
    db_session.add(org)
    db_session.flush()
    return org


@pytest.fixture
def make_user(db_session):
    """Inserts a user directly, bypassing the endpoint (and so Cognito)."""

    def _factory(
        *,
        organization,
        nome="Mario",
        cognome="Rossi",
        email=None,
        ruolo=ROLE_USER,
        status=USER_STATUS_ACTIVE,
        last_login_at=None,
    ) -> User:
        roles = ensure_roles(db_session)
        user = User(
            cognito_sub=f"test-{uuid.uuid4()}",
            email=email or f"{uuid.uuid4()}@test.invalid",
            nome=nome,
            cognome=cognome,
            role_id=roles[ruolo].id,
            organization_id=None if ruolo == ROLE_SUPER_ADMIN else organization.id,
            status=status,
            last_login_at=last_login_at,
        )
        db_session.add(user)
        db_session.flush()
        return user

    return _factory


def _list_users(admin_client, **params):
    """GET /api/admin/users, always scoped to one organization.

    The fixtures put other users in the database (the acting super admin,
    for one), so every assertion here filters by tenant: otherwise `total`
    would depend on which fixtures a test happened to pull in.
    """
    response = admin_client.get("/api/admin/users", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _payload(organization, **overrides) -> dict:
    return {
        "email": "mario.rossi@example.com",
        "nome": "Mario",
        "cognome": "Rossi",
        "ruolo": "user",
        "organization_id": str(organization.id),
        **overrides,
    }


# ── Elenco: finestra e filtri ─────────────────────────


def test_list_returns_a_window_and_the_full_total(admin_client, make_user, organization):
    """`total` conta le righe che soddisfano i filtri, non quelle restituite:
    è così che il client sa quanto gli manca ancora."""
    for _ in range(5):
        make_user(organization=organization)

    page = _list_users(admin_client, organization_id=str(organization.id), limit=2)

    assert page["total"] == 5
    assert len(page["items"]) == 2


def test_the_window_slides_without_skipping_or_repeating(admin_client, make_user, organization):
    """Le pagine consecutive coprono l'elenco esattamente una volta: è quello
    che l'ordinamento con l'id come spareggio deve garantire."""
    for _ in range(6):
        make_user(organization=organization)

    seen: list[str] = []
    for offset in (0, 2, 4):
        page = _list_users(
            admin_client, organization_id=str(organization.id), limit=2, offset=offset
        )
        seen.extend(item["id"] for item in page["items"])

    assert len(seen) == 6
    assert len(set(seen)) == 6


def test_filter_by_role(admin_client, make_user, organization):
    make_user(organization=organization, ruolo=ROLE_USER)
    make_user(organization=organization, ruolo=ROLE_USER)
    admin = make_user(organization=organization, ruolo=ROLE_ORGANIZATION_ADMIN)

    page = _list_users(
        admin_client, organization_id=str(organization.id), ruolo=ROLE_ORGANIZATION_ADMIN
    )

    assert page["total"] == 1
    assert page["items"][0]["id"] == str(admin.id)


def test_filter_by_status(admin_client, make_user, organization):
    make_user(organization=organization)
    suspended = make_user(organization=organization, status=USER_STATUS_SUSPENDED)

    page = _list_users(
        admin_client, organization_id=str(organization.id), status=USER_STATUS_SUSPENDED
    )

    assert [item["id"] for item in page["items"]] == [str(suspended.id)]


def test_filter_by_organization_excludes_the_other_tenants(
    admin_client, make_user, db_session, organization
):
    other = Organization(name="Altro tenant", slug="altro-tenant")
    db_session.add(other)
    db_session.flush()
    mine = make_user(organization=organization)
    make_user(organization=other)

    page = _list_users(admin_client, organization_id=str(organization.id))

    assert [item["id"] for item in page["items"]] == [str(mine.id)]


def test_filter_by_never_logged_in(admin_client, make_user, organization):
    """Gli inviti rimasti in sospeso, che è il motivo per cui la colonna
    ultimo accesso esiste."""
    pending = make_user(organization=organization)
    make_user(organization=organization, last_login_at=datetime(2026, 7, 1, 9, 0))

    page = _list_users(admin_client, organization_id=str(organization.id), never_logged_in="true")
    assert [item["id"] for item in page["items"]] == [str(pending.id)]

    page = _list_users(admin_client, organization_id=str(organization.id), never_logged_in="false")
    assert [item["id"] for item in page["items"]] != [str(pending.id)]


@pytest.mark.parametrize("query", ["giulia", "verdi", "giulia verdi", "GIULIA", "verd"])
def test_search_matches_the_name_in_any_form(admin_client, make_user, organization, query):
    """Anche "nome cognome" per intero, che nessuno dei due campi da solo
    conterrebbe."""
    target = make_user(organization=organization, nome="Giulia", cognome="Verdi")
    make_user(organization=organization, nome="Marco", cognome="Neri")

    page = _list_users(admin_client, organization_id=str(organization.id), q=query)

    assert [item["id"] for item in page["items"]] == [str(target.id)]


def test_search_matches_the_email_and_the_organization(admin_client, make_user, organization):
    target = make_user(organization=organization, email="referente@cliente.example")
    make_user(organization=organization, nome="Altro", cognome="Utente")

    by_email = _list_users(admin_client, organization_id=str(organization.id), q="referente")
    assert [item["id"] for item in by_email["items"]] == [str(target.id)]

    # Il nome dell'organizzazione è su un'altra tabella: senza la join la
    # ricerca non lo vedrebbe
    by_org = _list_users(admin_client, q=organization.name)
    assert str(target.id) in [item["id"] for item in by_org["items"]]


def test_search_applies_before_the_window(admin_client, make_user, organization):
    """La ricerca gira sul server, quindi `total` è il totale dei risultati e
    non delle righe già caricate: una ricerca lato client risponderebbe
    "nessun utente" su qualcuno che esiste."""
    for _ in range(4):
        make_user(organization=organization, nome="Giulia", cognome="Verdi")
    make_user(organization=organization, nome="Marco", cognome="Neri")

    page = _list_users(admin_client, organization_id=str(organization.id), q="giulia", limit=2)

    assert page["total"] == 4
    assert len(page["items"]) == 2


@pytest.mark.parametrize("params", [{"ruolo": "capo"}, {"status": "archiviato"}])
def test_list_rejects_an_unknown_filter_value(admin_client, params):
    """Filtrare su un valore inesistente non deve rispondere «nessun utente»,
    che si legge come un elenco vuoto legittimo."""
    response = admin_client.get("/api/admin/users", params=params)

    assert response.status_code == 400


# ── Creazione ─────────────────────────────────────────


def test_create_user_normalises_the_email(admin_client, cognito, organization):
    """The address is stored (and sent to Cognito) trimmed and lowercased."""
    response = admin_client.post(
        "/api/admin/users", json=_payload(organization, email="  Mario.Rossi@Example.COM ")
    )

    assert response.status_code == 201
    assert response.json()["email"] == "mario.rossi@example.com"
    assert cognito["created"] == ["mario.rossi@example.com"]


def test_create_user_trims_the_names(admin_client, cognito, organization):
    response = admin_client.post(
        "/api/admin/users", json=_payload(organization, nome="  Mario ", cognome=" Rossi ")
    )

    assert response.status_code == 201
    assert response.json()["nome"] == "Mario"
    assert response.json()["cognome"] == "Rossi"


def test_create_user_rejects_a_duplicate_whatever_the_case(admin_client, cognito, organization):
    """Cognito would resolve both spellings to one account: two local rows for
    one identity must never exist."""
    first = admin_client.post("/api/admin/users", json=_payload(organization))
    assert first.status_code == 201

    second = admin_client.post(
        "/api/admin/users", json=_payload(organization, email="MARIO.ROSSI@example.com")
    )

    assert second.status_code == 400
    assert "già registrato" in second.json()["detail"]
    # The duplicate was stopped before Cognito was touched a second time
    assert len(cognito["created"]) == 1


@pytest.mark.parametrize("email", ["non-una-email", "manca@dominio", "due@@chiocciole.it", ""])
def test_create_user_rejects_a_malformed_email(admin_client, cognito, organization, email):
    response = admin_client.post("/api/admin/users", json=_payload(organization, email=email))

    assert response.status_code == 400
    assert response.json()["detail"] == "L'indirizzo email non è valido."
    assert cognito["created"] == []


@pytest.mark.parametrize("field, label", [("nome", "nome"), ("cognome", "cognome")])
def test_create_user_rejects_a_blank_name(admin_client, cognito, organization, field, label):
    response = admin_client.post("/api/admin/users", json=_payload(organization, **{field: "   "}))

    assert response.status_code == 400
    assert response.json()["detail"] == f"Il {label} non può essere vuoto."
    assert cognito["created"] == []


def test_create_user_refuses_a_suspended_organization(
    admin_client, cognito, suspended_organization
):
    """The invitation email would reach someone who cannot log in even once."""
    response = admin_client.post("/api/admin/users", json=_payload(suspended_organization))

    assert response.status_code == 400
    assert "sospesa" in response.json()["detail"]
    assert cognito["created"] == []


def test_create_user_undoes_the_cognito_account_when_the_insert_fails(
    admin_client, cognito, monkeypatch, organization, standard_user, db_session
):
    """Without the compensation the account would be an orphan: taken on
    Cognito, absent locally, and impossible to create again."""
    # A sub that is already taken makes the local insert fail at commit
    monkeypatch.setattr(admin_router, "admin_create_user", lambda email: standard_user.cognito_sub)

    response = admin_client.post("/api/admin/users", json=_payload(organization))

    assert response.status_code == 500
    assert cognito["deleted"] == ["mario.rossi@example.com"]
    assert db_session.query(User).filter(User.email == "mario.rossi@example.com").first() is None


def test_super_admin_cannot_carry_an_organization(admin_client, cognito, organization):
    response = admin_client.post(
        "/api/admin/users", json=_payload(organization, ruolo="super_admin")
    )

    assert response.status_code == 400
    assert "non appartiene ad alcuna organizzazione" in response.json()["detail"]


def test_plain_user_must_have_an_organization(admin_client, cognito, organization):
    response = admin_client.post(
        "/api/admin/users", json=_payload(organization, organization_id=None)
    )

    assert response.status_code == 400
    assert cognito["created"] == []


# ── Modifica ──────────────────────────────────────────


@pytest.mark.parametrize("field, label", [("nome", "nome"), ("cognome", "cognome")])
def test_update_user_rejects_a_blank_name(admin_client, standard_user, field, label):
    """The admin API holds the same rule as the self-service profile: an
    account must never be left without a readable name."""
    response = admin_client.put(f"/api/admin/users/{standard_user.id}", json={field: "  "})

    assert response.status_code == 400
    assert response.json()["detail"] == f"Il {label} non può essere vuoto."


def test_update_user_can_still_edit_someone_inside_a_suspended_organization(
    admin_client, db_session, standard_user, organization
):
    """Suspension blocks arrivals, not maintenance of who is already there."""
    organization.status = ORG_STATUS_SUSPENDED
    db_session.flush()

    response = admin_client.put(
        f"/api/admin/users/{standard_user.id}",
        json={"nome": "Corretto", "organization_id": str(organization.id)},
    )

    assert response.status_code == 200
    assert response.json()["nome"] == "Corretto"


def test_update_user_cannot_move_someone_into_a_suspended_organization(
    admin_client, standard_user, suspended_organization
):
    response = admin_client.put(
        f"/api/admin/users/{standard_user.id}",
        json={"organization_id": str(suspended_organization.id)},
    )

    assert response.status_code == 400
    assert "sospesa" in response.json()["detail"]


def test_admin_cannot_change_their_own_role(admin_client, super_admin_user):
    response = admin_client.put(
        f"/api/admin/users/{super_admin_user.id}", json={"ruolo": "user", "organization_id": None}
    )

    assert response.status_code == 400
    assert "tuo stesso account" in response.json()["detail"]


def test_role_change_is_spelled_out_in_the_audit_trail(admin_client, db_session, standard_user):
    """ "Utente modificato" alone would hide the one transition worth auditing."""
    response = admin_client.put(
        f"/api/admin/users/{standard_user.id}", json={"ruolo": "super_admin"}
    )
    assert response.status_code == 200

    row = db_session.query(AuditLog).filter(AuditLog.action == "user.update").one()
    assert row.details["email"] == standard_user.email
    assert row.details["ruolo_da"] == "user"
    assert row.details["ruolo_a"] == "super_admin"
    # Promoting to super admin drops the tenant: the trail says so
    assert row.details["organizzazione_a"] == "nessuna"


def test_organization_move_is_spelled_out_in_the_audit_trail(
    admin_client, db_session, standard_user, organization
):
    destination = Organization(name="Org di arrivo", slug="org-di-arrivo")
    db_session.add(destination)
    db_session.flush()

    response = admin_client.put(
        f"/api/admin/users/{standard_user.id}", json={"organization_id": str(destination.id)}
    )
    assert response.status_code == 200

    row = db_session.query(AuditLog).filter(AuditLog.action == "user.update").one()
    assert row.details["organizzazione_da"] == organization.name
    assert row.details["organizzazione_a"] == destination.name


def test_renaming_records_the_target_without_inventing_changes(
    admin_client, db_session, standard_user
):
    response = admin_client.put(f"/api/admin/users/{standard_user.id}", json={"nome": "Nuovo"})
    assert response.status_code == 200

    row = db_session.query(AuditLog).filter(AuditLog.action == "user.update").one()
    assert row.details == {"email": standard_user.email}


# ── Stato dell'account ────────────────────────────────


def test_status_change_reaches_cognito(admin_client, cognito, standard_user):
    response = admin_client.put(
        f"/api/admin/users/{standard_user.id}/status", json={"status": USER_STATUS_SUSPENDED}
    )

    assert response.status_code == 200
    assert response.json()["status"] == USER_STATUS_SUSPENDED
    assert cognito["enabled"] == [(standard_user.email, False)]


def test_admin_cannot_change_their_own_status(admin_client, cognito, super_admin_user):
    response = admin_client.put(
        f"/api/admin/users/{super_admin_user.id}/status", json={"status": USER_STATUS_SUSPENDED}
    )

    assert response.status_code == 400
    assert cognito["enabled"] == []


def test_a_disabled_account_can_no_longer_change_state(
    admin_client, cognito, db_session, standard_user
):
    """Disabling is final: the only way out is deletion."""
    standard_user.status = USER_STATUS_DISABLED
    db_session.flush()

    response = admin_client.put(
        f"/api/admin/users/{standard_user.id}/status", json={"status": "active"}
    )

    assert response.status_code == 400
    assert "definitivamente" in response.json()["detail"]


def test_credentials_are_not_resent_to_a_suspended_account(
    admin_client, cognito, db_session, standard_user
):
    """A resend recreates the account on Cognito, which would silently
    re-enable a login the admin had just blocked."""
    standard_user.status = USER_STATUS_SUSPENDED
    db_session.flush()

    response = admin_client.post(f"/api/admin/users/{standard_user.id}/resend-credentials")

    assert response.status_code == 400
    assert cognito["resent"] == []


# ── Eliminazione ──────────────────────────────────────


def test_delete_removes_the_user_from_cognito_and_the_database(
    admin_client, cognito, db_session, standard_user
):
    user_id = standard_user.id
    email = standard_user.email

    response = admin_client.delete(f"/api/admin/users/{user_id}")

    assert response.status_code == 200
    assert cognito["deleted"] == [email]
    assert db_session.query(User).filter(User.id == user_id).first() is None


def test_admin_cannot_delete_themselves(admin_client, cognito, super_admin_user):
    response = admin_client.delete(f"/api/admin/users/{super_admin_user.id}")

    assert response.status_code == 400
    assert cognito["deleted"] == []


def test_deleted_user_stays_named_in_the_audit_trail(
    admin_client, cognito, db_session, standard_user
):
    """The row outlives the user it names and its user_id is nulled by the FK:
    the email snapshot is all that keeps it readable."""
    email = standard_user.email

    assert admin_client.delete(f"/api/admin/users/{standard_user.id}").status_code == 200

    row = db_session.query(AuditLog).filter(AuditLog.action == "user.delete").one()
    assert row.details["email"] == email


# ── Il contratto sull'email, visto dal login ──────────


def test_login_finds_the_account_whatever_case_was_typed(
    client, db_session, standard_user, monkeypatch
):
    """Cognito authenticates the address case-insensitively, so an exact match
    here would reject a valid login with an undiagnosable 401."""
    monkeypatch.setattr(
        auth_router,
        "authenticate",
        lambda email, password: {"access_token": "access", "refresh_token": "refresh"},
    )
    monkeypatch.setattr(auth_router, "_bind_fresh_token", lambda *args, **kwargs: None)

    response = client.post(
        "/api/auth/login", json={"email": standard_user.email.upper(), "password": "irrilevante"}
    )

    assert response.status_code == 200
    assert response.json()["user"]["id"] == str(standard_user.id)


# ── Ultimo accesso ────────────────────────────────────


def test_a_never_used_account_reports_no_last_access(admin_client, cognito, organization):
    """An account created and never signed into is what the admin table has
    to single out: the invitation went out and nobody accepted it."""
    response = admin_client.post("/api/admin/users", json=_payload(organization))

    assert response.status_code == 201
    assert response.json()["last_login_at"] is None


def test_login_stamps_the_last_access(client, db_session, standard_user, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "authenticate",
        lambda email, password: {"access_token": "access", "refresh_token": "refresh"},
    )
    monkeypatch.setattr(auth_router, "_bind_fresh_token", lambda *args, **kwargs: None)
    assert standard_user.last_login_at is None

    response = client.post(
        "/api/auth/login", json={"email": standard_user.email, "password": "irrilevante"}
    )
    assert response.status_code == 200

    db_session.refresh(standard_user)
    assert standard_user.last_login_at is not None
    assert response.json()["user"]["last_login_at"] is not None


def test_setting_the_first_password_counts_as_an_access(
    client, db_session, standard_user, monkeypatch
):
    """The challenge that closes an invitation hands out a session, so it is
    the moment the account stops being unused."""
    monkeypatch.setattr(
        auth_router,
        "respond_to_new_password_challenge",
        lambda **kwargs: {"access_token": "access", "refresh_token": "refresh"},
    )
    monkeypatch.setattr(auth_router, "_bind_fresh_token", lambda *args, **kwargs: None)

    response = client.post(
        "/api/auth/new-password",
        json={
            "email": standard_user.email,
            "new_password": "PasswordNuova1!",
            "session": "sessione-cognito",
        },
    )
    assert response.status_code == 200

    db_session.refresh(standard_user)
    assert standard_user.last_login_at is not None
