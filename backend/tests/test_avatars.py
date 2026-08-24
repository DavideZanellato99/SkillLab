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
    fornitori = make_avatar(name="Solo Fornitori", category="fornitori")

    response = user_client.get("/api/avatars", params={"category_id": str(fornitori.category_id)})
    assert response.status_code == 200
    categories = {a["category"] for a in response.json()}
    assert categories == {"fornitori"}


def test_categories_are_the_tenant_anagraphic(
    user_client, make_avatar, make_category, organization
):
    """L'elenco è l'anagrafica dell'organizzazione, non i valori in uso.

    Una categoria appena creata e ancora senza avatar deve comparire lo
    stesso, altrimenti sembrerebbe non essere stata salvata.
    """
    make_avatar(name="Cliente", category="clienti")
    make_category("ancora vuota", organization.id)

    response = user_client.get("/api/avatars/categories")
    assert response.status_code == 200
    names = {c["name"] for c in response.json()}
    assert {"clienti", "ancora vuota"} <= names


def test_categories_of_another_tenant_stay_hidden(user_client, make_category, db_session):
    from models import Organization

    other = Organization(name="Altro tenant", slug="altro-tenant")
    db_session.add(other)
    db_session.flush()
    make_category("solo loro", other.id)

    response = user_client.get("/api/avatars/categories")
    assert response.status_code == 200
    assert "solo loro" not in {c["name"] for c in response.json()}


def test_persona_sheet_is_never_exposed(user_client, make_avatar):
    """The profile (secrets, hidden objectives) must not leak."""
    make_avatar(name="Segreto", category="clienti")
    response = user_client.get("/api/avatars")
    assert response.status_code == 200
    first = response.json()[0]
    assert "profile" not in first


def test_get_missing_avatar_is_404(user_client):
    response = user_client.get("/api/avatars/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_nessuna_rotta_elenca_le_selezioni(user_client):
    """Le selezioni si scrivono e si contano, non si sfogliano.

    Ce n'era una che le elencava senza nessun filtro, quindi rispondeva le
    ultime della piattaforma intera: gli avatar privati di ogni tenant, letti
    da chiunque avesse un account. Il conto degli avatar visibili e la copia
    personale dell'articolo 15 bastano a tutti e due gli usi legittimi.
    """
    from main import app

    rotte = {getattr(r, "path", "") for r in app.routes}
    assert not [p for p in rotte if "selection" in p and p != "/api/avatars/select"]
    assert user_client.get("/api/avatars/selections/all").status_code == 404
