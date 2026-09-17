"""Le richieste di avatar: chi le manda, chi le vede, come si chiudono.

Le cose che devono restare vere: solo un organization admin chiede, solo
per il proprio tenant e con una categoria scritta a mano, anche una che
nella sua galleria non c'è ancora; solo il super admin evade;
una richiesta si chiude una volta sola, e la pubblicazione è il salvataggio
della scheda intera, non un bottone a parte. E la campanella la racconta da
tutte e due le parti dello sportello.
"""

import uuid

import pytest

from models import ROLE_ORGANIZATION_ADMIN, AvatarRequest, Organization
from tests.conftest import _make_user

REQUESTS = "/api/avatar-requests"
AVATARS = "/api/admin/avatars"


@pytest.fixture
def other_organization(db_session) -> Organization:
    org = Organization(name="Altra organizzazione", slug="altra-organizzazione")
    db_session.add(org)
    db_session.flush()
    return org


def _payload(**overrides) -> dict:
    return {
        "first_name": "Giovanni",
        "last_name": "Salemmi",
        "category": "clienti",
        "scenario_type": "Reclamo",
        "problem": "Vede due addebiti uguali sulla carta e crede di essere stato truffato.",
        **overrides,
    }


def _avatar_payload(organization, category, **overrides) -> dict:
    return {
        "category_id": str(category.id),
        "description": "Persona di prova",
        "image_url": "/static/avatars/test.png",
        "voice_id": None,
        "organization_id": str(organization.id),
        "profile": {"NOME": "Giovanni", "COGNOME": "Salemmi"},
        **overrides,
    }


def _send(org_admin_client, **overrides) -> dict:
    response = org_admin_client.post(REQUESTS, json=_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def _kinds(client) -> list[str]:
    return [i["kind"] for i in client.get("/api/notifications").json()["items"]]


# ── Chi può chiedere ───────────────────────────────────────────────────


def test_a_plain_user_cannot_request_an_avatar(user_client):
    assert user_client.post(REQUESTS, json=_payload()).status_code == 403


def test_the_super_admin_has_nobody_to_ask(admin_client):
    """Il super admin crea gli avatar da sé: una richiesta a se stesso non esiste."""
    assert admin_client.post(REQUESTS, json=_payload()).status_code == 403


def test_an_organization_admin_sends_a_request_for_their_tenant(
    org_admin_client, org_admin_user, organization
):
    body = _send(org_admin_client)

    assert body["status"] == "pending"
    assert body["organization_id"] == str(organization.id)
    assert body["organization_name"] == organization.name
    assert body["category"] == "clienti"
    assert body["first_name"] == "Giovanni"
    assert body["created_by_email"] == org_admin_user.email
    assert body["avatar_id"] is None
    assert body["resolved_at"] is None


def test_the_category_can_be_one_the_tenant_does_not_have_yet(org_admin_client):
    """Il nome resta com'è scritto: nessuna riga in `avatar_categories` da cercare."""
    body = _send(org_admin_client, category="Sportello reclami")
    assert body["category"] == "Sportello reclami"


def test_a_category_longer_than_a_category_name_is_refused(org_admin_client):
    """Il super admin deve poterla creare tale e quale, e il nome ha 50 caratteri."""
    response = org_admin_client.post(REQUESTS, json=_payload(category="x" * 51))
    assert response.status_code == 422


def test_blank_fields_are_refused(org_admin_client):
    response = org_admin_client.post(REQUESTS, json=_payload(problem="   "))
    assert response.status_code == 422


# ── Chi vede cosa ──────────────────────────────────────────────────────


def test_an_organization_admin_sees_only_their_tenants_requests(
    client, act_as, db_session, org_admin_user, other_organization
):
    act_as(org_admin_user)
    mine = _send(client)

    foreign_admin = _make_user(db_session, ROLE_ORGANIZATION_ADMIN, other_organization.id)
    act_as(foreign_admin)
    theirs = _send(client, first_name="Luisa")

    # Il parametro con l'altro tenant viene ignorato, non rifiutato
    listed = client.get(REQUESTS, params={"organization_id": str(org_admin_user.organization_id)})
    assert [r["id"] for r in listed.json()] == [theirs["id"]]

    act_as(org_admin_user)
    assert [r["id"] for r in client.get(REQUESTS).json()] == [mine["id"]]


def test_the_super_admin_sees_every_request_and_can_filter(
    client, act_as, db_session, org_admin_user, super_admin_user, other_organization
):
    act_as(org_admin_user)
    first = _send(client)
    foreign_admin = _make_user(db_session, ROLE_ORGANIZATION_ADMIN, other_organization.id)
    act_as(foreign_admin)
    second = _send(client, first_name="Luisa")

    act_as(super_admin_user)
    assert {r["id"] for r in client.get(REQUESTS).json()} == {first["id"], second["id"]}
    only_theirs = client.get(REQUESTS, params={"organization_id": str(other_organization.id)})
    assert [r["id"] for r in only_theirs.json()] == [second["id"]]
    assert client.get(REQUESTS, params={"status": "rejected"}).json() == []
    assert client.get(REQUESTS, params={"status": "boh"}).status_code == 400


def test_a_plain_user_cannot_list_requests(user_client):
    assert user_client.get(REQUESTS).status_code == 403


# ── Il rifiuto ─────────────────────────────────────────────────────────


def test_the_super_admin_rejects_with_a_reason(client, act_as, org_admin_user, super_admin_user):
    act_as(org_admin_user)
    request = _send(client)

    act_as(super_admin_user)
    response = client.post(
        f"{REQUESTS}/{request['id']}/reject", json={"reason": "Troppo simile a Rossi."}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "rejected"
    assert body["rejection_reason"] == "Troppo simile a Rossi."
    assert body["resolved_at"] is not None
    assert body["updated_by_email"] == super_admin_user.email


def test_a_rejection_needs_a_reason(client, act_as, org_admin_user, super_admin_user):
    act_as(org_admin_user)
    request = _send(client)
    act_as(super_admin_user)
    assert (
        client.post(f"{REQUESTS}/{request['id']}/reject", json={"reason": "  "}).status_code == 422
    )


def test_an_organization_admin_cannot_reject(org_admin_client):
    request = _send(org_admin_client)
    response = org_admin_client.post(f"{REQUESTS}/{request['id']}/reject", json={"reason": "No."})
    assert response.status_code == 403


def test_a_closed_request_does_not_close_twice(client, act_as, org_admin_user, super_admin_user):
    act_as(org_admin_user)
    request = _send(client)
    act_as(super_admin_user)
    assert (
        client.post(f"{REQUESTS}/{request['id']}/reject", json={"reason": "No."}).status_code == 200
    )
    assert (
        client.post(f"{REQUESTS}/{request['id']}/reject", json={"reason": "No."}).status_code == 409
    )


def test_rejecting_a_missing_request_is_404(admin_client):
    response = admin_client.post(f"{REQUESTS}/{uuid.uuid4()}/reject", json={"reason": "No."})
    assert response.status_code == 404


# ── La pubblicazione, che è la creazione dell'avatar ───────────────────


def test_saving_the_sheet_with_the_request_publishes_it(
    client, act_as, db_session, org_admin_user, super_admin_user, organization, make_category
):
    category = make_category()
    act_as(org_admin_user)
    request = _send(client)

    act_as(super_admin_user)
    created = client.post(
        AVATARS, json=_avatar_payload(organization, category, request_id=request["id"])
    )
    assert created.status_code == 201, created.text

    row = db_session.get(AvatarRequest, uuid.UUID(request["id"]))
    db_session.refresh(row)
    assert row.status == "published"
    assert str(row.avatar_id) == created.json()["id"]
    assert row.resolved_at is not None


def test_the_avatar_must_land_in_the_requesting_tenant(
    client,
    act_as,
    db_session,
    org_admin_user,
    super_admin_user,
    organization,
    make_category,
    other_organization,
):
    """Un avatar di un altro tenant non evade la richiesta di questo."""
    act_as(org_admin_user)
    request = _send(client)

    act_as(super_admin_user)
    foreign_category = make_category("clienti", other_organization.id)
    response = client.post(
        AVATARS,
        json=_avatar_payload(other_organization, foreign_category, request_id=request["id"]),
    )
    assert response.status_code == 400
    assert db_session.get(AvatarRequest, uuid.UUID(request["id"])).status == "pending"


def test_a_closed_request_cannot_be_published(
    client, act_as, org_admin_user, super_admin_user, organization, make_category
):
    category = make_category()
    act_as(org_admin_user)
    request = _send(client)
    act_as(super_admin_user)
    client.post(f"{REQUESTS}/{request['id']}/reject", json={"reason": "No."})

    response = client.post(
        AVATARS, json=_avatar_payload(organization, category, request_id=request["id"])
    )
    assert response.status_code == 409


def test_an_unknown_request_id_is_refused(admin_client, organization, make_category):
    response = admin_client.post(
        AVATARS, json=_avatar_payload(organization, make_category(), request_id=str(uuid.uuid4()))
    )
    assert response.status_code == 400


# ── Ritirare una richiesta ─────────────────────────────────────────────


def test_the_sender_withdraws_a_pending_request(org_admin_client):
    request = _send(org_admin_client)
    assert org_admin_client.delete(f"{REQUESTS}/{request['id']}").status_code == 200
    assert org_admin_client.get(REQUESTS).json() == []


def test_a_rejected_request_can_be_dismissed(client, act_as, org_admin_user, super_admin_user):
    act_as(org_admin_user)
    request = _send(client)
    act_as(super_admin_user)
    client.post(f"{REQUESTS}/{request['id']}/reject", json={"reason": "No."})

    act_as(org_admin_user)
    assert client.delete(f"{REQUESTS}/{request['id']}").status_code == 200


def test_a_published_request_stays(
    client, act_as, org_admin_user, super_admin_user, organization, make_category
):
    category = make_category()
    act_as(org_admin_user)
    request = _send(client)
    act_as(super_admin_user)
    client.post(AVATARS, json=_avatar_payload(organization, category, request_id=request["id"]))

    act_as(org_admin_user)
    assert client.delete(f"{REQUESTS}/{request['id']}").status_code == 409


def test_another_tenants_admin_cannot_withdraw_it(
    client, act_as, db_session, org_admin_user, other_organization
):
    """404 e non 403: da fuori la richiesta non esiste."""
    act_as(org_admin_user)
    request = _send(client)
    act_as(_make_user(db_session, ROLE_ORGANIZATION_ADMIN, other_organization.id))
    assert client.delete(f"{REQUESTS}/{request['id']}").status_code == 404


# ── La campanella ──────────────────────────────────────────────────────


def test_the_super_admin_is_told_about_a_pending_request(
    client, act_as, org_admin_user, super_admin_user, organization
):
    act_as(org_admin_user)
    _send(client)

    act_as(super_admin_user)
    body = client.get("/api/notifications").json()
    assert body["unread"] == 1
    item = body["items"][0]
    assert item["kind"] == "avatar_request.pending"
    assert organization.name in item["body"]
    assert "Giovanni Salemmi" in item["body"]
    assert item["link"] == "/app/admin/avatars"


def test_a_closed_request_leaves_the_super_admins_bell(
    client, act_as, org_admin_user, super_admin_user
):
    act_as(org_admin_user)
    request = _send(client)
    act_as(super_admin_user)
    client.post(f"{REQUESTS}/{request['id']}/reject", json={"reason": "No."})
    assert "avatar_request.pending" not in _kinds(client)


def test_the_sender_is_told_about_the_rejection(client, act_as, org_admin_user, super_admin_user):
    act_as(org_admin_user)
    request = _send(client)
    assert _kinds(client) == []

    act_as(super_admin_user)
    client.post(f"{REQUESTS}/{request['id']}/reject", json={"reason": "Troppo simile a Rossi."})

    act_as(org_admin_user)
    items = client.get("/api/notifications").json()["items"]
    assert [i["kind"] for i in items] == ["avatar_request.rejected"]
    assert "Troppo simile a Rossi." in items[0]["body"]


def test_the_sender_is_told_about_the_publication(
    client, act_as, org_admin_user, super_admin_user, organization, make_category
):
    category = make_category()
    act_as(org_admin_user)
    request = _send(client)
    act_as(super_admin_user)
    client.post(AVATARS, json=_avatar_payload(organization, category, request_id=request["id"]))

    act_as(org_admin_user)
    items = client.get("/api/notifications").json()["items"]
    assert [i["kind"] for i in items] == ["avatar_request.published"]
    assert "Giovanni Salemmi" in items[0]["body"]
    assert items[0]["link"] == "/app"


def test_another_admin_of_the_same_tenant_is_not_the_one_waiting(
    client, act_as, db_session, org_admin_user, super_admin_user, organization
):
    act_as(org_admin_user)
    request = _send(client)
    act_as(super_admin_user)
    client.post(f"{REQUESTS}/{request['id']}/reject", json={"reason": "No."})

    act_as(_make_user(db_session, ROLE_ORGANIZATION_ADMIN, organization.id))
    assert _kinds(client) == []
