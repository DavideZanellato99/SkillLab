"""La bozza di percorso: cosa il modello vede, e cosa si tiene di quello che dice.

Il modello qui è finto, e non è una rinuncia: quello che va provato non è se
compone un buon corso, è cosa gli viene messo davanti e cosa succede alla
risposta. Sono le parti che decidono se chi ha premuto "proponi" si ritrova un
percorso da correggere o un percorso da rifare, e nessuna dipende da quale
modello ha risposto.

Il primo gruppo di test è di un'altra specie e vale per tutti gli altri:
verifica che dal catalogo non esca niente che uno studente non veda già, cioè
che la scheda persona resti dentro al server.
"""

import asyncio
import uuid

import pytest

from models import SIMULATION_STATUS_DRAFT, SIMULATION_STATUS_PUBLISHED, TechnicalSimulation
from path_draft import (
    MAX_STEPS,
    CatalogAvatar,
    CatalogSimulation,
    build_catalog,
    draft_path,
    normalize_draft,
)

DRAFT = "/api/training/paths/draft"

# Un obiettivo lungo abbastanza da passare il minimo della richiesta.
OBIETTIVO = (
    "Formare un nuovo addetto allo sportello: deve saper gestire i reclami sulle "
    "commissioni e conoscere la procedura di sblocco carta."
)


def _avatar_card(nome="Mario Rossi", **campi) -> CatalogAvatar:
    base = {
        "id": uuid.uuid4(),
        "name": nome,
        "category_name": "Clienti",
        "description": "Cliente arrabbiato per due addebiti uguali.",
    }
    base.update(campi)
    return CatalogAvatar(**base)


def _simulation_card(titolo="Procedura rimborsi", **campi) -> CatalogSimulation:
    base = {
        "id": uuid.uuid4(),
        "title": titolo,
        "kind": "multiple",
        "description": "Le condizioni per aprire un rimborso.",
    }
    base.update(campi)
    return CatalogSimulation(**base)


# ── Cosa il modello vede del catalogo ─────────────────


def test_il_catalogo_e_numerato_con_sigle_e_non_con_id():
    """Un id di trentasei caratteri ricopiato da un modello è un id sbagliato
    prima o poi, e sarebbe sbagliato in silenzio: la tappa punterebbe a un
    avatar che esiste, solo non quello."""
    avatar = _avatar_card()
    simulation = _simulation_card()

    testo, lookup = build_catalog([avatar], [simulation])

    assert str(avatar.id) not in testo
    assert str(simulation.id) not in testo
    assert lookup["A1"] == {"avatar_id": avatar.id}
    assert lookup["T1"] == {"simulation_id": simulation.id}


def test_del_catalogo_esce_solo_quello_che_si_vede_in_galleria():
    """La scheda persona non esce mai dal server: contiene la vera causa del
    problema e l'obiettivo nascosto, cioè la soluzione dell'esercizio."""
    avatar = _avatar_card()

    testo, _ = build_catalog([avatar], [])

    assert "Mario Rossi" in testo
    assert "Clienti" in testo
    assert "due addebiti uguali" in testo
    # Il resto della scheda non passa nemmeno da questa funzione: la
    # dataclass del catalogo ha quattro campi, ed è quella la difesa.
    assert set(CatalogAvatar.__dataclass_fields__) == {
        "id",
        "name",
        "category_name",
        "description",
    }


def test_un_catalogo_di_soli_test_resta_valido():
    """Un'organizzazione può avere test pubblicati e nessun avatar attivo."""
    testo, lookup = build_catalog([], [_simulation_card()])

    assert "T1" in lookup
    assert "CLIENTI SIMULATI" not in testo


# ── Cosa si tiene della risposta ──────────────────────


def _lookup(*refs) -> dict[str, dict]:
    return {ref: {"avatar_id": uuid.uuid4(), "simulation_id": None} for ref in refs}


def test_una_sigla_inventata_cade_da_sola():
    """È il modo in cui un modello inventa una prova che non esiste: cade la
    tappa, non tutto il percorso, come per una domanda storta del serbatoio."""
    lookup = _lookup("A1", "A2")

    risultato = normalize_draft(
        {
            "title": "Onboarding sportello",
            "steps": [
                {"ref": "A1", "target_score": 6},
                {"ref": "A99", "target_score": 7},
                {"ref": "A2", "target_score": 8},
            ],
        },
        lookup,
    )

    assert len(risultato["steps"]) == 2


def test_la_stessa_prova_due_volte_non_entra():
    """La stessa prova ripetuta è una tappa che si supera due volte con lo
    stesso lavoro."""
    risultato = normalize_draft(
        {
            "title": "Onboarding",
            "steps": [
                {"ref": "A1", "target_score": 6},
                {"ref": "A1", "target_score": 8},
            ],
        },
        _lookup("A1"),
    )

    assert len(risultato["steps"]) == 1


def test_le_tappe_oltre_il_tetto_non_entrano():
    lookup = _lookup(*[f"A{i}" for i in range(1, 15)])

    risultato = normalize_draft(
        {"title": "Percorso lungo", "steps": [{"ref": f"A{i}"} for i in range(1, 15)]},
        lookup,
    )

    assert len(risultato["steps"]) == MAX_STEPS


def test_una_soglia_fuori_scala_torna_dentro():
    """La scelta che conta è quale prova e in che posizione: una soglia
    sbagliata è l'unica cosa di una bozza che si corregge con un clic."""
    risultato = normalize_draft(
        {
            "title": "Onboarding",
            "steps": [
                {"ref": "A1", "target_score": 42},
                {"ref": "A2", "target_score": "non è un numero"},
            ],
        },
        _lookup("A1", "A2"),
    )

    assert risultato["steps"][0]["target_score"] == 10.0
    assert risultato["steps"][1]["target_score"] == 7.0


def test_le_tappe_non_portano_scadenze():
    """Una data sta sul calendario e dipende da quando il corso comincia, che
    è la cosa che il modello non può sapere."""
    risultato = normalize_draft(
        {"title": "Onboarding", "steps": [{"ref": "A1", "due_at": "2026-01-01"}]},
        _lookup("A1"),
    )

    assert "due_at" not in risultato["steps"][0]


def test_un_percorso_di_sole_sigle_inventate_e_fallito():
    """Vale come un JSON troncato e fa ritentare sul modello di riserva, che
    è esattamente il caso in cui ritentare serve."""
    with pytest.raises(ValueError):
        normalize_draft({"title": "Onboarding", "steps": [{"ref": "Z9"}]}, _lookup("A1"))


def test_senza_titolo_la_risposta_e_fallita():
    with pytest.raises(ValueError):
        normalize_draft({"title": "  ", "steps": [{"ref": "A1"}]}, _lookup("A1"))


def test_su_un_catalogo_vuoto_non_si_chiama_il_modello():
    """Non c'è niente di cui comporre un percorso, e mandare la richiesta
    vorrebbe dire pagare una risposta che può solo essere inventata."""
    with pytest.raises(ValueError):
        asyncio.run(draft_path(OBIETTIVO, [], []))


# ── L'endpoint ────────────────────────────────────────


def _finto_modello(monkeypatch, risposta=None, errore=None):
    """Sostituisce la chiamata a OpenAI dentro il router che la fa."""

    async def _draft(goal, avatars, simulations):
        if errore:
            raise errore
        if risposta is not None:
            return risposta
        # Il default compone la prima tappa su quello che c'è davvero nel
        # catalogo, così la risposta somiglia a una vera.
        primo = avatars[0] if avatars else simulations[0]
        return {
            "title": "Onboarding sportello",
            "description": "Per chi comincia allo sportello.",
            "steps": [
                {
                    "avatar_id": primo.id if avatars else None,
                    "simulation_id": None if avatars else primo.id,
                    "target_score": 6.0,
                    "reason": "Si comincia da un caso semplice.",
                }
            ],
        }

    monkeypatch.setattr("routers.training.draft_path", _draft)


def test_la_bozza_torna_al_form(admin_client, organization, make_avatar, monkeypatch):
    make_avatar()
    _finto_modello(monkeypatch)

    risposta = admin_client.post(
        DRAFT, json={"goal": OBIETTIVO, "organization_id": str(organization.id)}
    )

    assert risposta.status_code == 200, risposta.text
    corpo = risposta.json()
    assert corpo["title"] == "Onboarding sportello"
    assert len(corpo["steps"]) == 1
    assert corpo["steps"][0]["reason"]


def test_generare_non_crea_nessun_percorso(
    admin_client, db_session, organization, make_avatar, monkeypatch
):
    """La bozza è una proposta: diventa un percorso solo con la creazione,
    che è un'altra richiesta e passa dalla revisione di chi l'ha chiesta."""
    from models import TrainingPath

    make_avatar()
    _finto_modello(monkeypatch)
    prima = db_session.query(TrainingPath).count()

    admin_client.post(DRAFT, json={"goal": OBIETTIVO, "organization_id": str(organization.id)})

    assert db_session.query(TrainingPath).count() == prima


def test_un_obiettivo_troppo_corto_non_arriva_al_modello(
    admin_client, organization, make_avatar, monkeypatch
):
    """Da tre parole il modello inventa un corso suo e mette in fila mezzo
    catalogo, che è esattamente quello che chi chiede una bozza non vuole."""
    make_avatar()
    _finto_modello(monkeypatch)

    risposta = admin_client.post(
        DRAFT, json={"goal": "un corso", "organization_id": str(organization.id)}
    )

    assert risposta.status_code == 422


def test_su_un_catalogo_vuoto_la_rotta_risponde_409(
    admin_client, organization, db_session, monkeypatch
):
    _finto_modello(monkeypatch)

    risposta = admin_client.post(
        DRAFT, json={"goal": OBIETTIVO, "organization_id": str(organization.id)}
    )

    assert risposta.status_code == 409
    assert "non ha ancora avatar attivi" in risposta.json()["detail"]


def test_le_bozze_e_gli_archiviati_non_entrano_nel_catalogo(
    admin_client, db_session, organization, make_avatar, monkeypatch
):
    """Il catalogo è lo stesso di `assignable-content`, chiesto dalla stessa
    funzione: una bozza che proponesse prove che il form non offre sarebbe
    una proposta che chi la riceve non può nemmeno salvare."""
    make_avatar()
    db_session.add(
        TechnicalSimulation(
            title="Ancora in bozza",
            status=SIMULATION_STATUS_DRAFT,
            organization_id=organization.id,
            document_name="p.txt",
            document_text="Testo.",
        )
    )
    db_session.add(
        TechnicalSimulation(
            title="Pubblicata",
            status=SIMULATION_STATUS_PUBLISHED,
            organization_id=organization.id,
            document_name="p.txt",
            document_text="Testo.",
        )
    )
    db_session.flush()

    visti: dict = {}

    async def _draft(goal, avatars, simulations):
        visti["titoli"] = [s.title for s in simulations]
        return {
            "title": "X",
            "description": None,
            "steps": [{"avatar_id": avatars[0].id, "target_score": 6.0, "reason": ""}],
        }

    monkeypatch.setattr("routers.training.draft_path", _draft)

    admin_client.post(DRAFT, json={"goal": OBIETTIVO, "organization_id": str(organization.id)})

    assert visti["titoli"] == ["Pubblicata"]


def test_il_fornitore_che_non_risponde_e_un_502(
    admin_client, organization, make_avatar, monkeypatch
):
    make_avatar()
    _finto_modello(monkeypatch, errore=RuntimeError("modello non disponibile"))

    risposta = admin_client.post(
        DRAFT, json={"goal": OBIETTIVO, "organization_id": str(organization.id)}
    )

    assert risposta.status_code == 502


def test_un_org_admin_compone_solo_nel_proprio_tenant(
    org_admin_client, db_session, organization, make_avatar, monkeypatch
):
    """L'organization admin non nomina l'organizzazione: quella che chiede
    viene ignorata, e il server ci mette la sua."""
    from models import Organization

    make_avatar()
    altra = Organization(name="Altra", slug=f"altra-{uuid.uuid4().hex[:6]}")
    db_session.add(altra)
    db_session.flush()

    visti: dict = {}

    async def _draft(goal, avatars, simulations):
        visti["avatar"] = [a.name for a in avatars]
        return {
            "title": "X",
            "description": None,
            "steps": [{"avatar_id": avatars[0].id, "target_score": 6.0, "reason": ""}],
        }

    monkeypatch.setattr("routers.training.draft_path", _draft)

    risposta = org_admin_client.post(
        DRAFT, json={"goal": OBIETTIVO, "organization_id": str(altra.id)}
    )

    # Il catalogo è quello del proprio tenant, non di quello chiesto
    assert risposta.status_code == 200
    assert visti["avatar"]


def test_chi_si_allena_non_arriva_alla_rotta(user_client, organization):
    risposta = user_client.post(
        DRAFT, json={"goal": OBIETTIVO, "organization_id": str(organization.id)}
    )

    assert risposta.status_code == 403
