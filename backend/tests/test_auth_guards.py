"""Access-control guards: the highest-value tests for the cheapest setup.

They lock in the contract that protected endpoints reject the unauthenticated
(401) and that admin-only endpoints reject a plain user (403), so a future
refactor of the dependencies can't silently open a hole.
"""

import pytest


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/api/avatars"),
        ("get", "/api/avatars/categories"),
        ("get", "/api/admin/users"),
        ("get", "/api/chat/conversation/00000000-0000-0000-0000-000000000000"),
    ],
)
def test_protected_endpoints_reject_anonymous(client, method, path):
    """No cookie and no bearer token -> 401 on every protected route."""
    response = getattr(client, method)(path)
    assert response.status_code == 401


def test_admin_route_forbidden_for_standard_user(user_client):
    """A signed-in plain user hitting a super-admin route -> 403, not 401."""
    response = user_client.get("/api/admin/users")
    assert response.status_code == 403


def test_admin_route_allowed_for_super_admin(admin_client):
    """The same route succeeds for the super admin."""
    response = admin_client.get("/api/admin/users")
    assert response.status_code == 200


@pytest.mark.parametrize("client_fixture", ["user_client", "org_admin_client"])
def test_own_name_not_editable_by_non_super_admin(request, client_fixture):
    """L'anagrafica la tiene l'amministrazione: il profilo non la scrive.

    Il modulo mostra nome e cognome in sola lettura, ma la porta la chiude
    il server: una PUT costruita a mano non deve poter riscrivere il nome
    che compare nei report e nelle revisioni.
    """
    api_client = request.getfixturevalue(client_fixture)

    response = api_client.put("/api/auth/me", json={"nome": "Altro", "cognome": "Nome"})

    assert response.status_code == 403


def test_own_name_editable_by_super_admin(admin_client, super_admin_user):
    """Chi amministra la piattaforma resta padrone del proprio nome."""
    response = admin_client.put("/api/auth/me", json={"nome": "Nuovo", "cognome": "Nome"})

    assert response.status_code == 200
    assert response.json()["nome"] == "Nuovo"
    assert super_admin_user.nome == "Nuovo"
