"""Avatar listing, category filter and the not-found path."""


def test_list_avatars_returns_visible_ones(user_client, make_avatar):
    make_avatar(name="Cliente Uno", category="clienti")
    make_avatar(name="Fornitore Due", category="fornitori")

    response = user_client.get("/api/avatars")
    assert response.status_code == 200
    names = {a["name"] for a in response.json()}
    assert {"Cliente Uno", "Fornitore Due"} <= names


def test_filter_by_category(user_client, make_avatar):
    make_avatar(name="Solo Clienti", category="clienti")
    make_avatar(name="Solo Fornitori", category="fornitori")

    response = user_client.get("/api/avatars", params={"category": "fornitori"})
    assert response.status_code == 200
    categories = {a["category"] for a in response.json()}
    assert categories == {"fornitori"}


def test_persona_sheet_is_never_exposed(user_client, make_avatar):
    """The profile (secrets, hidden objectives) must not leak; only difficulty."""
    make_avatar(name="Segreto", category="clienti")
    response = user_client.get("/api/avatars")
    assert response.status_code == 200
    first = response.json()[0]
    assert "profile" not in first
    assert first["difficulty"] == "5/10"


def test_get_missing_avatar_is_404(user_client):
    response = user_client.get("/api/avatars/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
