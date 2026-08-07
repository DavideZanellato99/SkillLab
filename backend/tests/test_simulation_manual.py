"""Le simulazioni con le domande scritte a mano.

L'altra strada per preparare un test: nessun documento, nessuna generazione,
le domande le scrive il docente una per una. Quello che va verificato qui non
è che si possano scrivere, ma che le due strade restino separate dove devono
esserlo e identiche dove devono esserlo.

Separate all'ingresso: una simulazione scritta a mano non ha un documento, e
tutto quello che presuppone un documento (generare, sostituirlo) deve
rispondere di no invece di lavorare su un serbatoio vuoto.

Identiche all'uscita: chi svolge il test riceve dieci domande estratte a caso
dal serbatoio, e non ha modo di sapere da dove vengano. Cambia solo quante
domande servono per pubblicare, dieci invece di cinquanta, perché a mano ogni
domanda è tempo di una persona.
"""

import io

import pytest

from models import (
    SIMULATION_POOL_COUNT,
    SIMULATION_QUESTION_COUNT,
    SIMULATION_SOURCE_MANUAL,
    SIMULATION_STATUS_DRAFT,
    SIMULATION_STATUS_PUBLISHED,
    SimulationQuestion,
    TechnicalSimulation,
)


def _question(index: int, options: int = 4) -> dict:
    """Una domanda come la manda il pannello di revisione."""
    return {
        "text": f"Domanda {index}?",
        "options": [f"Alternativa {n}" for n in range(options)],
        "correct_option": index % options,
        "expected_answer": "",
        "explanation": f"Spiegazione della domanda {index}.",
    }


@pytest.fixture
def manual_simulation(db_session, organization):
    """Una simulazione a mano in bozza, con il serbatoio ancora vuoto."""

    def _factory(*, questions: int = 0, status: str = SIMULATION_STATUS_DRAFT):
        simulation = TechnicalSimulation(
            title="Procedure scritte a mano",
            organization_id=organization.id,
            status=status,
            source=SIMULATION_SOURCE_MANUAL,
        )
        db_session.add(simulation)
        db_session.flush()
        for position in range(1, questions + 1):
            db_session.add(
                SimulationQuestion(
                    simulation_id=simulation.id,
                    position=position,
                    text=f"Domanda {position}?",
                    options=["Prima", "Seconda", "Terza"],
                    correct_option=position % 3,
                    explanation=f"Spiegazione della domanda {position}.",
                )
            )
        db_session.flush()
        db_session.refresh(simulation)
        return simulation

    return _factory


# ── La creazione ──────────────────────────────────────────────────────


def test_una_simulazione_a_mano_nasce_senza_documento(admin_client, organization):
    risposta = admin_client.post(
        "/api/admin/simulations",
        data={
            "organization_id": str(organization.id),
            "title": "Procedure scritte a mano",
            "source": "manual",
        },
    )
    assert risposta.status_code == 201
    corpo = risposta.json()
    assert corpo["source"] == "manual"
    assert corpo["document_name"] == ""
    assert corpo["chunk_count"] == 0
    assert corpo["questions"] == []


def test_una_simulazione_a_mano_con_un_documento_viene_rifiutata(admin_client, organization):
    risposta = admin_client.post(
        "/api/admin/simulations",
        data={
            "organization_id": str(organization.id),
            "title": "Procedure scritte a mano",
            "source": "manual",
        },
        files={"file": ("procedura.txt", io.BytesIO(b"La carta si sblocca."), "text/plain")},
    )
    assert risposta.status_code == 400


def test_una_simulazione_generata_senza_documento_viene_rifiutata(admin_client, organization):
    risposta = admin_client.post(
        "/api/admin/simulations",
        data={
            "organization_id": str(organization.id),
            "title": "Procedure dal manuale",
            "source": "ai",
        },
    )
    assert risposta.status_code == 400


def test_un_origine_inventata_viene_rifiutata(admin_client, organization):
    risposta = admin_client.post(
        "/api/admin/simulations",
        data={
            "organization_id": str(organization.id),
            "title": "Procedure",
            "source": "chatgpt",
        },
    )
    assert risposta.status_code == 400


# ── Quello che presuppone un documento ────────────────────────────────


def test_generare_su_una_simulazione_a_mano_non_si_puo(admin_client, manual_simulation):
    simulation = manual_simulation()
    risposta = admin_client.post(f"/api/admin/simulations/{simulation.id}/generate")
    assert risposta.status_code == 409


def test_caricare_un_documento_su_una_simulazione_a_mano_non_si_puo(
    admin_client, manual_simulation
):
    simulation = manual_simulation()
    risposta = admin_client.post(
        f"/api/admin/simulations/{simulation.id}/document",
        files={"file": ("procedura.txt", io.BytesIO(b"La carta si sblocca."), "text/plain")},
    )
    assert risposta.status_code == 409


# ── Le alternative, quante ne vuole chi scrive ────────────────────────


@pytest.mark.parametrize("quante", [2, 3, 6])
def test_una_domanda_puo_avere_da_due_a_sei_alternative(admin_client, manual_simulation, quante):
    simulation = manual_simulation()
    risposta = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/questions",
        json={"questions": [_question(1, options=quante)]},
    )
    assert risposta.status_code == 200
    assert len(risposta.json()["questions"][0]["options"]) == quante


@pytest.mark.parametrize("quante", [1, 7])
def test_troppe_o_troppo_poche_alternative_vengono_rifiutate(
    admin_client, manual_simulation, quante
):
    simulation = manual_simulation()
    risposta = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/questions",
        json={"questions": [_question(1, options=quante)]},
    )
    assert risposta.status_code == 422


def test_una_risposta_corretta_fuori_dalle_alternative_viene_rifiutata(
    admin_client, manual_simulation
):
    simulation = manual_simulation()
    domanda = {**_question(1, options=3), "correct_option": 5}
    risposta = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/questions",
        json={"questions": [domanda]},
    )
    assert risposta.status_code == 422


# ── Le domande a metà ─────────────────────────────────────────────────


def test_una_domanda_a_meta_si_salva(admin_client, manual_simulation):
    """Chi ne sta scrivendo trenta deve potersi fermare alla decima."""
    simulation = manual_simulation()
    domanda = {**_question(1, options=3), "options": ["Prima", "", ""], "correct_option": None}
    risposta = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/questions",
        json={"questions": [domanda]},
    )
    assert risposta.status_code == 200
    assert risposta.json()["questions"][0]["correct_option"] is None


def test_una_domanda_a_meta_non_si_pubblica(admin_client, manual_simulation):
    simulation = manual_simulation()
    domande = [_question(i) for i in range(1, SIMULATION_QUESTION_COUNT)]
    domande.append({**_question(SIMULATION_QUESTION_COUNT), "correct_option": None})
    admin_client.put(
        f"/api/admin/simulations/{simulation.id}/questions", json={"questions": domande}
    )

    risposta = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/status", json={"status": "published"}
    )
    assert risposta.status_code == 409
    assert "corretta" in risposta.json()["detail"]


def test_un_alternativa_vuota_non_si_pubblica(admin_client, manual_simulation):
    simulation = manual_simulation()
    domande = [_question(i) for i in range(1, SIMULATION_QUESTION_COUNT + 1)]
    domande[3]["options"] = ["Prima", "Seconda", "", "Quarta"]
    admin_client.put(
        f"/api/admin/simulations/{simulation.id}/questions", json={"questions": domande}
    )

    risposta = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/status", json={"status": "published"}
    )
    assert risposta.status_code == 409
    assert "vuota" in risposta.json()["detail"]


# ── La pubblicazione ──────────────────────────────────────────────────


def test_dieci_domande_scritte_a_mano_bastano_a_pubblicare(admin_client, manual_simulation):
    simulation = manual_simulation(questions=SIMULATION_QUESTION_COUNT)
    risposta = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/status", json={"status": "published"}
    )
    assert risposta.status_code == 200
    assert risposta.json()["status"] == "published"


def test_meno_di_dieci_domande_non_bastano(admin_client, manual_simulation):
    simulation = manual_simulation(questions=SIMULATION_QUESTION_COUNT - 1)
    risposta = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/status", json={"status": "published"}
    )
    assert risposta.status_code == 409
    assert str(SIMULATION_QUESTION_COUNT) in risposta.json()["detail"]


def test_una_simulazione_generata_continua_a_volerne_cinquanta(
    admin_client, db_session, organization
):
    simulation = TechnicalSimulation(
        title="Procedure dal manuale",
        organization_id=organization.id,
        status=SIMULATION_STATUS_DRAFT,
        document_name="procedura.txt",
        document_text="La carta si sblocca dopo aver identificato il cliente.",
    )
    db_session.add(simulation)
    db_session.flush()
    for position in range(1, SIMULATION_QUESTION_COUNT + 1):
        db_session.add(
            SimulationQuestion(
                simulation_id=simulation.id,
                position=position,
                text=f"Domanda {position}?",
                options=["Prima", "Seconda", "Terza", "Quarta"],
                correct_option=position % 4,
                explanation=f"Spiegazione della domanda {position}.",
            )
        )
    db_session.flush()
    risposta = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/status", json={"status": "published"}
    )
    assert risposta.status_code == 409
    assert str(SIMULATION_POOL_COUNT) in risposta.json()["detail"]


# ── Chi svolge il test ────────────────────────────────────────────────


def test_un_test_a_mano_si_svolge_come_gli_altri(user_client, manual_simulation):
    """Dieci domande a caso su un serbatoio più grande, senza le chiavi.

    È la sola cosa che conta davvero della strada a mano: da qui in poi non
    esiste una strada a mano, esiste un test.
    """
    simulation = manual_simulation(
        questions=SIMULATION_QUESTION_COUNT + 5, status=SIMULATION_STATUS_PUBLISHED
    )
    domande = user_client.post(f"/api/simulations/{simulation.id}/start").json()
    assert len(domande) == SIMULATION_QUESTION_COUNT
    for domanda in domande:
        # I campi che servono a mostrare una domanda, uno per tipo di test:
        # nessuna chiave, come su una simulazione generata
        assert set(domanda) == {"id", "position", "text", "options", "steps", "left", "right"}


def test_chi_svolge_il_test_sa_chi_ha_scritto_le_domande(user_client, manual_simulation):
    """L'origine arriva fin qui, come il tipo del test.

    Non serve a rispondere, serve a sapere cosa si ha davanti: la targhetta
    compare ovunque compaia una simulazione, e questo è il capo della catena.
    """
    simulation = manual_simulation(
        questions=SIMULATION_QUESTION_COUNT, status=SIMULATION_STATUS_PUBLISHED
    )
    assert user_client.get(f"/api/simulations/{simulation.id}").json()["source"] == "manual"
    elenco = user_client.get("/api/simulations").json()
    assert [s["source"] for s in elenco if s["id"] == str(simulation.id)] == ["manual"]


def test_l_origine_resta_leggibile_su_un_tentativo_consegnato(user_client, manual_simulation):
    simulation = manual_simulation(
        questions=SIMULATION_QUESTION_COUNT, status=SIMULATION_STATUS_PUBLISHED
    )
    domande = user_client.post(f"/api/simulations/{simulation.id}/start").json()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={
            "answers": [
                {"question_id": d["id"], "selected_option": 0, "elapsed_ms": 1000} for d in domande
            ]
        },
    ).json()
    assert esito["simulation_source"] == "manual"

    riepiloghi = user_client.get(f"/api/simulations/{simulation.id}/attempts").json()
    assert riepiloghi[0]["simulation_source"] == "manual"
