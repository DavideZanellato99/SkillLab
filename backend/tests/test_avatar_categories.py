"""L'anagrafica delle categorie: chi la governa, cosa impedisce, cosa cambia.

Le tre cose che devono restare vere: una categoria appartiene a
un'organizzazione sola, non si può eliminare finché la usa qualcuno, e
rinominarla la cambia dappertutto invece di lasciare in giro il nome vecchio.
"""

import uuid

import pytest

from models import AvatarCategory, Organization

CATEGORIES = "/api/admin/avatar-categories"
AVATARS = "/api/admin/avatars"


@pytest.fixture
def other_organization(db_session) -> Organization:
    org = Organization(name="Altra organizzazione", slug="altra-organizzazione")
    db_session.add(org)
    db_session.flush()
    return org


def _payload(organization, **overrides) -> dict:
    return {
        "name": "Fornitori",
        "color": "cyan",
        "organization_id": str(organization.id),
        **overrides,
    }


def _avatar_payload(organization, category, **overrides) -> dict:
    return {
        "category_id": str(category.id),
        "description": "Persona di prova",
        "image_url": "/static/avatars/test.png",
        "voice_id": None,
        "organization_id": str(organization.id),
        "profile": {"NOME": "Giovanni", "COGNOME": "Salemmi", "GRADO_DIFFICOLTA": "5/10"},
        **overrides,
    }


# ── Chi può toccarla ───────────────────────────────────────────────────


def test_a_plain_user_cannot_manage_categories(user_client, organization):
    assert user_client.get(CATEGORIES).status_code == 403
    assert user_client.post(CATEGORIES, json=_payload(organization)).status_code == 403


def test_an_organization_admin_cannot_manage_categories(org_admin_client, organization):
    """L'anagrafica è del super admin, come gli avatar che raggruppa."""
    assert org_admin_client.post(CATEGORIES, json=_payload(organization)).status_code == 403


# ── Creazione e unicità ────────────────────────────────────────────────


def test_creating_a_category_returns_it_with_its_tenant(admin_client, organization):
    response = admin_client.post(CATEGORIES, json=_payload(organization))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Fornitori"
    assert body["color"] == "cyan"
    assert body["organization_id"] == str(organization.id)
    assert body["organization_name"] == organization.name
    assert body["avatar_count"] == 0


def test_the_same_name_twice_in_one_tenant_is_refused(admin_client, organization):
    assert admin_client.post(CATEGORIES, json=_payload(organization)).status_code == 201
    duplicate = admin_client.post(CATEGORIES, json=_payload(organization, name="  fornitori  "))
    assert duplicate.status_code == 409


def test_the_same_name_in_another_tenant_is_fine(admin_client, organization, other_organization):
    """Due organizzazioni possono avere una categoria che si chiama uguale:
    non è la stessa categoria, e nessuna delle due vede quella dell'altra."""
    assert admin_client.post(CATEGORIES, json=_payload(organization)).status_code == 201
    assert admin_client.post(CATEGORIES, json=_payload(other_organization)).status_code == 201


def test_an_unknown_color_is_refused(admin_client, organization):
    response = admin_client.post(CATEGORIES, json=_payload(organization, color="fucsia"))
    assert response.status_code == 422


def test_the_list_can_be_narrowed_to_one_tenant(
    admin_client, organization, other_organization, make_category
):
    make_category("Solo qui", organization.id)
    make_category("Solo là", other_organization.id)

    response = admin_client.get(CATEGORIES, params={"organization_id": str(organization.id)})
    assert response.status_code == 200
    names = {c["name"] for c in response.json()}
    assert "Solo qui" in names
    assert "Solo là" not in names


# ── Un avatar resta nel suo tenant ─────────────────────────────────────


def test_an_avatar_cannot_take_a_category_of_another_tenant(
    admin_client, organization, other_organization, make_category
):
    """La categoria di un altro tenant è rifiutata: accettarla sposterebbe
    l'avatar di organizzazione senza dirlo a nessuno."""
    foreign = make_category("Loro", other_organization.id)
    response = admin_client.post(AVATARS, json=_avatar_payload(organization, foreign))
    assert response.status_code == 400
    assert "altra organizzazione" in response.json()["detail"]


def test_an_unknown_category_is_refused(admin_client, organization, make_category):
    payload = _avatar_payload(organization, make_category())
    payload["category_id"] = str(uuid.uuid4())
    response = admin_client.post(AVATARS, json=payload)
    assert response.status_code == 400


# ── Rinominare, e la cancellazione bloccata ────────────────────────────


def test_renaming_a_category_changes_it_on_every_avatar(
    admin_client, db_session, make_avatar, make_category
):
    avatar = make_avatar(category="clienti")
    category = make_category("clienti")

    response = admin_client.put(
        f"{CATEGORIES}/{category.id}",
        json={"name": "Clienti storici", "color": "amber"},
    )
    assert response.status_code == 200
    assert response.json()["avatar_count"] == 1

    db_session.expire_all()
    listed = admin_client.get(AVATARS).json()
    mine = next(a for a in listed if a["id"] == str(avatar.id))
    assert mine["category"] == "Clienti storici"
    assert mine["category_color"] == "amber"


def test_a_category_in_use_cannot_be_deleted(admin_client, db_session, make_avatar, make_category):
    make_avatar(category="clienti")
    category = make_category("clienti")

    response = admin_client.delete(f"{CATEGORIES}/{category.id}")
    assert response.status_code == 409
    assert "spostali" in response.json()["detail"]
    assert db_session.query(AvatarCategory).filter(AvatarCategory.id == category.id).first()


def test_an_archived_avatar_still_blocks_the_deletion(
    admin_client, db_session, make_avatar, make_category
):
    """Anche archiviato, l'avatar ha una categoria e la sua scheda resta
    leggibile: toglierla da sotto significherebbe rompere quella riga."""
    avatar = make_avatar(category="clienti")
    category = make_category("clienti")
    assert admin_client.delete(f"{AVATARS}/{avatar.id}").status_code == 200

    assert admin_client.delete(f"{CATEGORIES}/{category.id}").status_code == 409


def test_a_category_nobody_uses_is_deleted(admin_client, db_session, make_category):
    category = make_category("Mai usata")

    response = admin_client.delete(f"{CATEGORIES}/{category.id}")
    assert response.status_code == 200
    assert db_session.query(AvatarCategory).filter(AvatarCategory.id == category.id).first() is None
