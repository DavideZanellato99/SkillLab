"""Avatar listing, own history and the not-found path."""

from datetime import UTC, datetime, timedelta

from models import ChatConversation
from tests.test_training import _make_user_in


def test_list_avatars_returns_visible_ones(user_client, make_avatar):
    make_avatar(name="Cliente Uno", category="clienti")
    make_avatar(name="Fornitore Due", category="fornitori")

    response = user_client.get("/api/avatars")
    assert response.status_code == 200
    names = {a["name"] for a in response.json()}
    assert {"Cliente Uno", "Fornitore Due"} <= names


def test_the_catalogue_comes_whole(user_client, make_avatar):
    """Nessun filtro per categoria: la galleria filtra su quello che ha già.

    Era una query string, quindi una richiesta e una voce di cache per ogni
    pastiglia premuta. Un parametro che il server non conosce più viene
    semplicemente ignorato, e la risposta resta il catalogo intero.
    """
    make_avatar(name="Solo Clienti", category="clienti")
    fornitori = make_avatar(name="Solo Fornitori", category="fornitori")

    response = user_client.get("/api/avatars", params={"category_id": str(fornitori.category_id)})
    assert response.status_code == 200
    assert {a["category"] for a in response.json()} == {"clienti", "fornitori"}


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


def test_le_selezioni_non_esistono_piu(user_client):
    """Nessuna rotta scrive o elenca selezioni di avatar.

    C'era una tabella con l'endpoint che la scriveva e un contatore in ogni
    risposta, ma nessuna schermata chiamava quell'endpoint: la galleria apre
    direttamente la chat. Era quindi un dato personale conservato senza
    scopo, con una query aggregata a ogni caricamento del catalogo e una
    sezione sempre vuota nell'export dell'articolo 15. Quello che serviva lo
    dicono le conversazioni, ed è `own_sessions` qui sopra.
    """
    from main import app

    rotte = {getattr(r, "path", "") for r in app.routes}
    assert not [p for p in rotte if "select" in p]
    # Resta soltanto la GET del singolo avatar, che legge "select" come un id
    # e non lo trova: nessun metodo di scrittura risponde più a quel percorso
    assert user_client.post("/api/avatars/select", json={}).status_code == 405
    assert user_client.get("/api/avatars/select").status_code == 422


def _conversation(db_session, user, avatar, *, days_ago=0, title="Clienti 1"):
    """Una sessione già fatta da `user` con `avatar`, datata all'indietro."""
    conversation = ChatConversation(
        user_id=user.id,
        avatar_id=avatar.id,
        title=title,
        mode="text",
        created_at=(datetime.now(UTC) - timedelta(days=days_ago)).replace(tzinfo=None),
    )
    db_session.add(conversation)
    db_session.commit()
    return conversation


def test_gallery_carries_own_history(user_client, make_avatar, standard_user, db_session):
    """La galleria dice a chi guarda cosa ha già fatto con ciascun avatar."""
    avatar = make_avatar(name="Cliente Uno", category="clienti")
    _conversation(db_session, standard_user, avatar, days_ago=3)
    _conversation(db_session, standard_user, avatar, days_ago=1, title="Clienti 2")

    riga = next(a for a in user_client.get("/api/avatars").json() if a["name"] == "Cliente Uno")

    assert riga["own_sessions"] == 2
    # L'ultima è la più recente delle due, non la prima incontrata
    ieri = (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%d")
    assert riga["last_session_at"].startswith(ieri)


def test_never_faced_avatar_has_no_history(user_client, make_avatar):
    make_avatar(name="Mai Affrontato", category="clienti")

    riga = next(a for a in user_client.get("/api/avatars").json() if a["name"] == "Mai Affrontato")

    assert riga["own_sessions"] == 0
    assert riga["last_session_at"] is None


def test_own_history_is_only_ones_own(
    user_client, make_avatar, standard_user, organization, db_session
):
    """Le sessioni di un'altra persona non entrano nel proprio conto.

    È la galleria di chi guarda: dice cosa ha fatto lui, non quanto un
    interlocutore è frequentato dai colleghi.
    """
    avatar = make_avatar(name="Condiviso", category="clienti")
    collega = _make_user_in(db_session, organization)
    _conversation(db_session, collega, avatar)
    _conversation(db_session, standard_user, avatar)

    riga = next(a for a in user_client.get("/api/avatars").json() if a["name"] == "Condiviso")

    assert riga["own_sessions"] == 1


def test_single_avatar_carries_own_history(user_client, make_avatar, standard_user, db_session):
    """Anche il dettaglio, che è quello che legge la schermata di chat."""
    avatar = make_avatar(name="Dettaglio", category="clienti")
    _conversation(db_session, standard_user, avatar)

    body = user_client.get(f"/api/avatars/{avatar.id}").json()

    assert body["own_sessions"] == 1
    assert body["last_session_at"] is not None
