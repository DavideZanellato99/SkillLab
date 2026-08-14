"""Chi amministra quali simulazioni, e cosa succede a chiederne un'altra.

I test tecnici li scrivono entrambi i ruoli di amministrazione, come i
percorsi: quello che cambia non è cosa si può fare, è su quali righe. Un
organization admin lavora dentro la propria organizzazione, e la strada per
uscirne non esiste, perché la decisione è presa in un punto solo (la
``visible_query`` di chi i test li svolge, chiesta con le bozze incluse).

Il ciclo di vita di una simulazione sta in ``test_simulation_admin``; qui
c'è soltanto il confine.
"""

import io
import uuid

import pytest

from models import (
    SIMULATION_KIND_MULTIPLE,
    SIMULATION_STATUS_DRAFT,
    Organization,
    TechnicalSimulation,
)

SIMULAZIONI = "/api/admin/simulations"


@pytest.fixture
def altra_organizzazione(db_session) -> Organization:
    org = Organization(name="Altra org", slug="altra-org")
    db_session.add(org)
    db_session.flush()
    return org


@pytest.fixture
def make_simulazione(db_session):
    """Una simulazione in bozza di un tenant qualsiasi, scritta a mano."""

    def _factory(organization, titolo="Procedure di sportello"):
        simulazione = TechnicalSimulation(
            title=titolo,
            organization_id=organization.id,
            kind=SIMULATION_KIND_MULTIPLE,
            source="manual",
            status=SIMULATION_STATUS_DRAFT,
        )
        db_session.add(simulazione)
        db_session.flush()
        db_session.refresh(simulazione)
        return simulazione

    return _factory


def _crea(client, organization=None, **campi):
    dati = {"title": "Antiriciclaggio", "kind": SIMULATION_KIND_MULTIPLE, "source": "manual"}
    if organization is not None:
        dati["organization_id"] = str(organization.id)
    return client.post(SIMULAZIONI, data={**dati, **campi})


# ── Cosa si vede ──────────────────────────────────────────────────────


def test_l_org_admin_vede_solo_le_simulazioni_della_sua_organizzazione(
    org_admin_client, organization, altra_organizzazione, make_simulazione
):
    """Le bozze comprese, che è la differenza fra amministrare un test e
    svolgerlo: in bozza una simulazione esiste solo qui."""
    make_simulazione(organization, "La mia")
    make_simulazione(altra_organizzazione, "Di un altro tenant")

    risposta = org_admin_client.get(SIMULAZIONI)

    assert risposta.status_code == 200
    assert [s["title"] for s in risposta.json()] == ["La mia"]


def test_il_super_admin_le_vede_tutte(
    admin_client, organization, altra_organizzazione, make_simulazione
):
    make_simulazione(organization, "La prima")
    make_simulazione(altra_organizzazione, "La seconda")

    titoli = {s["title"] for s in admin_client.get(SIMULAZIONI).json()}

    assert titoli == {"La prima", "La seconda"}


def test_a_chi_si_allena_la_sezione_resta_chiusa(user_client):
    """403 e non 404: chi ha una sessione aperta sa benissimo che la
    gestione esiste, e sentirselo dire non gli rivela niente."""
    assert user_client.get(SIMULAZIONI).status_code == 403
    assert _crea(user_client).status_code == 403


# ── Dove nasce quello che l'org admin crea ────────────────────────────


def test_l_org_admin_crea_nella_propria_organizzazione_senza_nominarla(
    org_admin_client, organization
):
    risposta = _crea(org_admin_client)

    assert risposta.status_code == 201
    assert risposta.json()["organization_id"] == str(organization.id)


def test_l_organizzazione_chiesta_da_un_org_admin_viene_ignorata(
    org_admin_client, organization, altra_organizzazione
):
    """Ignorata e non rifiutata: non c'è un punto in cui la decisione venga
    presa una seconda volta, quindi non c'è niente da rifiutare."""
    risposta = _crea(org_admin_client, altra_organizzazione)

    assert risposta.status_code == 201
    assert risposta.json()["organization_id"] == str(organization.id)


def test_il_super_admin_deve_dire_di_chi_e(admin_client):
    """Una simulazione di "tutte le organizzazioni" non esiste: la svolge la
    gente di un tenant solo."""
    risposta = _crea(admin_client)

    assert risposta.status_code == 400
    assert "Specificare l'organizzazione" in risposta.json()["detail"]


# ── La simulazione di un altro tenant ─────────────────────────────────


def test_la_simulazione_di_un_altro_tenant_non_esiste_su_nessuna_rotta(
    org_admin_client, altra_organizzazione, make_simulazione
):
    """404 e non 403 in tutti i punti: 403 confermerebbe che quella riga
    c'è, e chi non ha diritto di leggerla non ha diritto di saperlo."""
    altrui = make_simulazione(altra_organizzazione)

    assert org_admin_client.get(f"{SIMULAZIONI}/{altrui.id}").status_code == 404
    assert (
        org_admin_client.put(f"{SIMULAZIONI}/{altrui.id}", json={"title": "Mia"}).status_code == 404
    )
    assert (
        org_admin_client.put(
            f"{SIMULAZIONI}/{altrui.id}/questions",
            json={
                "questions": [
                    {
                        "text": "Domanda?",
                        "options": ["Prima", "Seconda"],
                        "correct_option": 0,
                        "explanation": "Spiegazione.",
                    }
                ]
            },
        ).status_code
        == 404
    )
    assert (
        org_admin_client.put(
            f"{SIMULAZIONI}/{altrui.id}/status", json={"status": SIMULATION_STATUS_DRAFT}
        ).status_code
        == 404
    )
    assert org_admin_client.delete(f"{SIMULAZIONI}/{altrui.id}").status_code == 404
    # Le due rotte che toccano il documento si fermano prima di leggere il
    # file e prima di chiamare il modello: la riga non è sua, e il resto
    # non deve nemmeno cominciare
    assert (
        org_admin_client.post(
            f"{SIMULAZIONI}/{altrui.id}/document",
            files={"file": ("procedura.txt", io.BytesIO(b"Testo."), "text/plain")},
        ).status_code
        == 404
    )
    assert org_admin_client.post(f"{SIMULAZIONI}/{altrui.id}/generate").status_code == 404


def test_una_simulazione_inesistente_risponde_404_anche_all_org_admin(org_admin_client):
    assert org_admin_client.get(f"{SIMULAZIONI}/{uuid.uuid4()}").status_code == 404
