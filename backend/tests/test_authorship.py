"""Paternità delle righe: chi ha creato e chi ha modificato, su ogni scrittura.

Le colonne non le riempie nessun endpoint, le riempie un listener sul flush
della sessione (vedi ``authorship``), e questi test guardano proprio quello:
non che un endpoint si ricordi di scriverle, ma che una riga non riesca ad
arrivare nel database senza. Per questo passano tutti dall'API vera invece di
istanziare i modelli a mano, e per questo ce n'è uno che scrive fuori da una
richiesta e pretende l'etichetta "sistema" invece di un campo vuoto.
"""

import uuid

import pytest

import routers.admin as admin_router
import routers.auth as auth_router
from authorship import DELETED_ACTOR_EMAIL, SYSTEM_ACTOR_EMAIL
from models import Avatar, Organization, User

AVATARS = "/api/admin/avatars"
ORGS = "/api/admin/organizations"
USERS = "/api/admin/users"


@pytest.fixture
def cognito(monkeypatch):
    """Le chiamate a Cognito che gli endpoint di amministrazione fanno."""

    def _create(email):
        return f"cognito-sub-{uuid.uuid4()}"

    monkeypatch.setattr(admin_router, "admin_create_user", _create)
    monkeypatch.setattr(admin_router, "admin_delete_user", lambda email: None)
    monkeypatch.setattr(admin_router, "admin_set_user_enabled", lambda email, enabled: None)


@pytest.fixture
def second_admin(db_session, super_admin_user):
    """Un secondo super admin, per distinguere chi crea da chi modifica."""
    from auth_dependency import ensure_roles
    from models import ROLE_SUPER_ADMIN

    admin = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email="secondo.admin@test.invalid",
        nome="Secondo",
        cognome="Admin",
        role_id=ensure_roles(db_session)[ROLE_SUPER_ADMIN].id,
    )
    db_session.add(admin)
    db_session.flush()
    return admin


def _avatar_payload(organization, **overrides) -> dict:
    return {
        "category": "Clienti",
        "description": "Persona di prova",
        "image_url": "/static/avatars/test.png",
        "voice_id": None,
        "organization_id": str(organization.id),
        "profile": {"NOME": "Giovanni", "COGNOME": "Salemmi", "GRADO_DIFFICOLTA": "5/10"},
        **overrides,
    }


def _user_payload(organization, **overrides) -> dict:
    return {
        "email": f"{uuid.uuid4()}@test.invalid",
        "nome": "Mario",
        "cognome": "Rossi",
        "ruolo": "user",
        "organization_id": str(organization.id),
        **overrides,
    }


def _reload(db_session, model, row_id):
    db_session.expire_all()
    return db_session.query(model).filter(model.id == row_id).first()


# ── Chi crea resta scritto ─────────────────────────────


def test_a_new_user_carries_the_admin_who_created_them(
    admin_client, db_session, cognito, organization, super_admin_user
):
    response = admin_client.post(USERS, json=_user_payload(organization))
    assert response.status_code == 201

    created = _reload(db_session, User, uuid.UUID(response.json()["id"]))
    assert created.created_by == super_admin_user.id
    assert created.created_by_email == super_admin_user.email
    assert created.created_at is not None
    # Mai modificato: chi l'ha creato è anche l'ultimo che l'ha toccato.
    assert created.updated_by == super_admin_user.id
    assert created.updated_at == created.created_at


def test_a_new_organization_carries_the_admin_who_created_it(
    admin_client, db_session, super_admin_user
):
    response = admin_client.post(ORGS, json={"name": "Tenant nuovo"})
    assert response.status_code == 201

    created = _reload(db_session, Organization, uuid.UUID(response.json()["id"]))
    assert created.created_by == super_admin_user.id
    assert created.created_by_email == super_admin_user.email
    assert created.updated_by == super_admin_user.id


def test_a_new_avatar_carries_the_admin_who_created_it(
    admin_client, db_session, organization, super_admin_user
):
    response = admin_client.post(AVATARS, json=_avatar_payload(organization))
    assert response.status_code == 201

    created = _reload(db_session, Avatar, uuid.UUID(response.json()["id"]))
    assert created.created_by == super_admin_user.id
    assert created.created_by_email == super_admin_user.email
    assert created.created_at is not None
    assert created.updated_at is not None


# ── Chi modifica prende il posto, senza cancellare chi ha creato ──


def test_modifying_a_user_records_the_second_admin(
    admin_client, act_as, db_session, cognito, organization, super_admin_user, second_admin
):
    created_id = uuid.UUID(admin_client.post(USERS, json=_user_payload(organization)).json()["id"])

    act_as(second_admin)
    assert admin_client.put(f"{USERS}/{created_id}", json={"nome": "Rinominato"}).status_code == 200

    stored = _reload(db_session, User, created_id)
    assert stored.created_by == super_admin_user.id, "chi ha creato non si sovrascrive"
    assert stored.updated_by == second_admin.id
    assert stored.updated_by_email == second_admin.email
    assert stored.updated_at > stored.created_at


def test_modifying_an_organization_records_the_second_admin(
    admin_client, act_as, db_session, super_admin_user, second_admin
):
    created_id = uuid.UUID(admin_client.post(ORGS, json={"name": "Tenant"}).json()["id"])

    act_as(second_admin)
    response = admin_client.put(f"{ORGS}/{created_id}", json={"name": "Tenant rinominato"})
    assert response.status_code == 200

    stored = _reload(db_session, Organization, created_id)
    assert stored.created_by == super_admin_user.id
    assert stored.updated_by == second_admin.id
    assert stored.updated_at > stored.created_at


def test_editing_a_persona_sheet_records_the_second_admin(
    admin_client, act_as, db_session, organization, super_admin_user, second_admin
):
    """La modifica di una scheda persona è la cosa che prima non lasciava
    traccia sulla riga: l'avatar non aveva nemmeno una data di modifica."""
    payload = _avatar_payload(organization)
    created_id = uuid.UUID(admin_client.post(AVATARS, json=payload).json()["id"])

    act_as(second_admin)
    payload["profile"] = {**payload["profile"], "SEGRETI": "Ha un conto altrove"}
    assert admin_client.put(f"{AVATARS}/{created_id}", json=payload).status_code == 200

    stored = _reload(db_session, Avatar, created_id)
    assert stored.created_by == super_admin_user.id
    assert stored.updated_by == second_admin.id
    assert stored.updated_by_email == second_admin.email
    assert stored.updated_at > stored.created_at


def test_archiving_an_avatar_is_a_modification_too(
    admin_client, act_as, db_session, make_avatar, second_admin
):
    avatar = make_avatar(name="Da Archiviare")

    act_as(second_admin)
    assert admin_client.delete(f"{AVATARS}/{avatar.id}").status_code == 200

    stored = _reload(db_session, Avatar, avatar.id)
    assert stored.deleted_at is not None
    assert stored.updated_by == second_admin.id
    assert stored.updated_at > stored.created_at


def test_suspending_a_user_records_who_did_it(
    admin_client, act_as, db_session, cognito, standard_user, second_admin
):
    act_as(second_admin)
    response = admin_client.put(f"{USERS}/{standard_user.id}/status", json={"status": "suspended"})
    assert response.status_code == 200

    stored = _reload(db_session, User, standard_user.id)
    assert stored.updated_by == second_admin.id
    assert stored.updated_by_email == second_admin.email


# ── Quando dietro non c'è nessuno ──────────────────────


def test_a_row_written_outside_a_request_says_sistema(db_session):
    """Migrazioni, seed e lavori periodici non hanno un autore da citare, e la
    colonna deve dirlo invece di restare vuota."""
    org = Organization(name="Tenant di sistema", slug=f"sistema-{uuid.uuid4().hex[:8]}")
    db_session.add(org)
    db_session.flush()

    assert org.created_by is None
    assert org.created_by_email == SYSTEM_ACTOR_EMAIL
    assert org.updated_by_email == SYSTEM_ACTOR_EMAIL
    assert org.created_at is not None
    assert org.updated_at is not None


def test_the_login_signs_the_row_as_the_user_themselves(
    client, db_session, standard_user, monkeypatch
):
    """L'accesso scrive last_login_at, quindi è una modifica della riga: senza
    un attore pubblicato direbbe "sistema" a ogni login."""
    monkeypatch.setattr(
        auth_router,
        "authenticate",
        lambda email, password: {"access_token": "access", "refresh_token": "refresh"},
    )
    monkeypatch.setattr(auth_router, "_bind_fresh_token", lambda *args, **kwargs: None)

    response = client.post(
        "/api/auth/login", json={"email": standard_user.email, "password": "irrilevante"}
    )
    assert response.status_code == 200

    stored = _reload(db_session, User, standard_user.id)
    assert stored.updated_by == standard_user.id
    assert stored.updated_by_email == standard_user.email


# ── Quello che le pagine di amministrazione leggono ────


def test_the_three_apis_answer_with_the_same_four_fields(
    admin_client, db_session, cognito, organization, make_avatar, super_admin_user
):
    """Le schede di utente, organizzazione e avatar mostrano gli stessi
    quattro campi con lo stesso componente: se un'API smettesse di
    rispondere con uno di loro, la scheda mostrerebbe un buco."""
    make_avatar(name="Da Elencare")
    admin_client.post(USERS, json=_user_payload(organization))

    for url in (USERS, ORGS, AVATARS):
        response = admin_client.get(url)
        assert response.status_code == 200, url
        body = response.json()
        rows = body["items"] if isinstance(body, dict) else body
        assert rows, f"nessuna riga da {url}"
        for row in rows:
            assert set(row) >= {
                "created_at",
                "created_by_email",
                "updated_at",
                "updated_by_email",
            }, url
            assert row["created_by_email"]
            assert row["updated_by_email"]


# ── Quando l'autore se ne va ───────────────────────────


def test_deleting_the_author_takes_their_name_off_what_they_created(
    admin_client, act_as, db_session, cognito, organization, super_admin_user, second_admin
):
    """Cancellare un account significa cancellarlo davvero: la firma sulla
    riga resta, il nome di chi l'ha messa no."""
    act_as(second_admin)
    response = admin_client.post(AVATARS, json=_avatar_payload(organization))
    avatar_id = uuid.UUID(response.json()["id"])
    assert _reload(db_session, Avatar, avatar_id).created_by == second_admin.id

    act_as(super_admin_user)
    assert admin_client.delete(f"{USERS}/{second_admin.id}").status_code == 200

    stored = _reload(db_session, Avatar, avatar_id)
    assert stored.created_by is None
    assert stored.created_by_email == DELETED_ACTOR_EMAIL
    assert stored.updated_by is None
    assert stored.updated_by_email == DELETED_ACTOR_EMAIL
