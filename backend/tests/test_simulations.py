"""Il simulatore tecnico: chi vede cosa, e come viene corretto un test.

Due cose vanno verificate qui più di tutte le altre.

La prima è l'isolamento fra tenant, che nel simulatore ha una forma sua: le
simulazioni sono di un'organizzazione, e una in bozza non deve esistere
nemmeno per gli utenti di quella.

La seconda è che la risposta esatta non esca mai dal server prima della
consegna. È l'unica cosa che rende il test un test: se le chiavi viaggiano
con le domande, chiunque apra gli strumenti del browser prende dieci.
"""

import uuid

import pytest

from auth_dependency import ensure_roles
from models import (
    ROLE_USER,
    SIMULATION_STATUS_DRAFT,
    SIMULATION_STATUS_PUBLISHED,
    Organization,
    SimulationAttempt,
    SimulationChunk,
    SimulationQuestion,
    TechnicalSimulation,
    User,
)


@pytest.fixture
def make_simulation(db_session, organization):
    """Una simulazione pubblicata con le sue domande e i suoi passaggi."""

    def _factory(
        *,
        title="Sblocco carta di credito",
        organization_id=None,
        status=SIMULATION_STATUS_PUBLISHED,
        questions=3,
    ) -> TechnicalSimulation:
        simulation = TechnicalSimulation(
            title=title,
            description="Test di prova",
            status=status,
            organization_id=organization_id or organization.id,
            document_name="procedura.txt",
            document_text="La carta si sblocca dopo aver identificato il cliente.",
        )
        db_session.add(simulation)
        db_session.flush()
        db_session.add(
            SimulationChunk(
                simulation_id=simulation.id,
                ordinal=1,
                content="La carta si sblocca dopo aver identificato il cliente.",
                embedding=[0.1, 0.2, 0.3],
            )
        )
        for position in range(1, questions + 1):
            db_session.add(
                SimulationQuestion(
                    simulation_id=simulation.id,
                    position=position,
                    text=f"Domanda {position}?",
                    options=["Prima", "Seconda", "Terza", "Quarta"],
                    # La risposta esatta cambia da una domanda all'altra, così
                    # un test che passasse rispondendo sempre "A" si vede
                    correct_option=position % 4,
                    explanation=f"Spiegazione della domanda {position}.",
                    source_chunks=[1],
                )
            )
        db_session.flush()
        db_session.refresh(simulation)
        return simulation

    return _factory


@pytest.fixture
def other_organization(db_session) -> Organization:
    org = Organization(name="Altro tenant", slug="altro-tenant")
    db_session.add(org)
    db_session.flush()
    return org


# ── Visibilità ────────────────────────────────────────────────────────


def test_utente_vede_solo_le_simulazioni_della_propria_organizzazione(
    user_client, make_simulation, other_organization
):
    mia = make_simulation(title="La mia")
    make_simulation(title="Di un altro tenant", organization_id=other_organization.id)

    response = user_client.get("/api/simulations")
    assert response.status_code == 200
    titoli = [s["title"] for s in response.json()]
    assert titoli == ["La mia"]
    assert str(mia.id) == response.json()[0]["id"]


def test_le_bozze_non_arrivano_agli_utenti(user_client, make_simulation):
    make_simulation(title="Ancora da rileggere", status=SIMULATION_STATUS_DRAFT)
    assert user_client.get("/api/simulations").json() == []


def test_il_super_admin_vede_le_simulazioni_di_tutti(
    admin_client, make_simulation, other_organization
):
    make_simulation(title="Prima")
    make_simulation(title="Seconda", organization_id=other_organization.id)
    titoli = {s["title"] for s in admin_client.get("/api/simulations").json()}
    assert titoli == {"Prima", "Seconda"}


def test_la_simulazione_di_un_altro_tenant_risponde_404(
    user_client, make_simulation, other_organization
):
    altrui = make_simulation(organization_id=other_organization.id)
    assert user_client.get(f"/api/simulations/{altrui.id}").status_code == 404


def test_chi_svolge_il_test_non_riceve_l_email_di_chi_lo_ha_scritto(
    user_client, admin_client, make_simulation
):
    """La paternità è roba dell'amministrazione: la scheda del super admin la
    mostra, l'elenco di chi deve svolgere il test non deve nemmeno portarla."""
    make_simulation(title="Con un autore")

    riga_utente = user_client.get("/api/simulations").json()[0]
    assert "created_by_email" not in riga_utente
    assert "updated_by_email" not in riga_utente

    riga_admin = admin_client.get("/api/admin/simulations").json()[0]
    assert riga_admin["created_by_email"]
    assert riga_admin["updated_by_email"]


# ── Le chiavi restano sul server ──────────────────────────────────────


def test_le_domande_non_portano_la_risposta_esatta(user_client, make_simulation):
    simulation = make_simulation()
    payload = user_client.get(f"/api/simulations/{simulation.id}").json()
    assert len(payload["questions"]) == 3
    for question in payload["questions"]:
        assert set(question) == {"id", "position", "text", "options"}
        assert "correct_option" not in question
        assert "explanation" not in question


# ── Consegna e correzione ─────────────────────────────────────────────


def _answers(simulation, *, correct: bool):
    """Le risposte a tutte le domande, tutte giuste o tutte sbagliate."""
    return [
        {
            "question_id": str(q.id),
            "selected_option": q.correct_option if correct else (q.correct_option + 1) % 4,
        }
        for q in simulation.questions
    ]


def test_un_test_tutto_giusto_prende_dieci(user_client, make_simulation):
    simulation = make_simulation()
    response = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True)},
    )
    assert response.status_code == 200
    esito = response.json()
    assert esito["correct_count"] == 3
    assert esito["question_count"] == 3
    assert esito["score"] == 10.0
    assert all(a["is_correct"] for a in esito["answers"])


def test_l_esito_porta_spiegazioni_e_passaggi_del_documento(user_client, make_simulation):
    simulation = make_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=False)},
    ).json()
    assert esito["correct_count"] == 0
    assert esito["score"] == 0.0
    prima = esito["answers"][0]
    assert prima["explanation"] == "Spiegazione della domanda 1."
    assert prima["sources"] == ["La carta si sblocca dopo aver identificato il cliente."]
    assert prima["correct_option"] == simulation.questions[0].correct_option


def test_le_domande_in_bianco_valgono_sbagliate_ma_restano_riconoscibili(
    user_client, make_simulation
):
    simulation = make_simulation()
    risposte = _answers(simulation, correct=True)
    risposte[0]["selected_option"] = None
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": risposte}
    ).json()
    assert esito["correct_count"] == 2
    assert esito["answers"][0]["selected_option"] is None
    assert esito["answers"][0]["is_correct"] is False


def test_una_domanda_non_risposta_del_tutto_conta_come_sbagliata(user_client, make_simulation):
    """Chi consegna un payload incompleto non guadagna nulla dal silenzio."""
    simulation = make_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": []}
    ).json()
    assert esito["correct_count"] == 0
    assert esito["question_count"] == 3


def test_un_indice_di_opzione_inesistente_viene_rifiutato(user_client, make_simulation):
    simulation = make_simulation()
    response = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": [{"question_id": str(simulation.questions[0].id), "selected_option": 9}]},
    )
    assert response.status_code == 400


def test_il_tentativo_resta_leggibile_dopo_che_la_domanda_e_cambiata(
    db_session, user_client, make_simulation
):
    """La fotografia è il punto: correggere una domanda non riscrive i voti."""
    simulation = make_simulation(questions=1)
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True)},
    ).json()
    assert esito["score"] == 10.0

    domanda = simulation.questions[0]
    domanda.text = "Testo completamente diverso"
    domanda.correct_option = (domanda.correct_option + 1) % 4
    db_session.flush()

    riletto = user_client.get(f"/api/simulations/attempts/{esito['id']}").json()
    assert riletto["score"] == 10.0
    assert riletto["answers"][0]["text"] == "Domanda 1?"
    assert riletto["answers"][0]["is_correct"] is True


def test_i_tentativi_si_accumulano_e_l_elenco_mostra_l_ultimo(user_client, make_simulation):
    simulation = make_simulation()
    user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=False)},
    )
    user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True)},
    )
    riga = user_client.get("/api/simulations").json()[0]
    assert riga["attempt_count"] == 2
    # L'ultimo, non il migliore né la media
    assert riga["last_attempt_score"] == 10.0
    assert len(user_client.get(f"/api/simulations/{simulation.id}/attempts").json()) == 2


def test_il_tentativo_di_un_altro_non_si_legge(
    db_session, client, act_as, make_simulation, standard_user, super_admin_user
):
    simulation = make_simulation()
    attempt = SimulationAttempt(
        simulation_id=simulation.id,
        user_id=super_admin_user.id,
        correct_count=1,
        question_count=3,
        answers=[],
    )
    db_session.add(attempt)
    db_session.flush()

    act_as(standard_user)
    assert client.get(f"/api/simulations/attempts/{attempt.id}").status_code == 404


def test_un_admin_legge_i_tentativi_del_proprio_tenant(
    db_session, client, act_as, make_simulation, standard_user, org_admin_user
):
    simulation = make_simulation()
    act_as(standard_user)
    esito = client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True)},
    ).json()

    act_as(org_admin_user)
    risultati = client.get(f"/api/simulations/{simulation.id}/results").json()
    assert [r["id"] for r in risultati] == [esito["id"]]
    assert client.get(f"/api/simulations/attempts/{esito['id']}").status_code == 200


def test_un_admin_non_legge_i_risultati_di_un_altro_tenant(
    org_admin_client, make_simulation, other_organization
):
    altrui = make_simulation(organization_id=other_organization.id)
    assert org_admin_client.get(f"/api/simulations/{altrui.id}/results").status_code == 404


# ── Il report della dashboard ─────────────────────────────────────────


def test_il_report_porta_i_tentativi_con_chi_li_ha_svolti(
    client, act_as, make_simulation, standard_user, org_admin_user
):
    simulation = make_simulation(title="Sblocco carta")
    act_as(standard_user)
    esito = client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True)},
    ).json()

    act_as(org_admin_user)
    righe = client.get("/api/admin/simulations-report").json()
    assert len(righe) == 1
    riga = righe[0]
    assert riga["attempt_id"] == esito["id"]
    assert riga["simulation_title"] == "Sblocco carta"
    assert riga["user_email"] == standard_user.email
    assert riga["score"] == 10.0
    assert riga["correct_count"] == 3
    assert riga["question_count"] == 3


def test_il_report_di_un_admin_si_ferma_al_proprio_tenant(
    db_session, client, act_as, make_simulation, other_organization, standard_user, org_admin_user
):
    """Lo scope è l'organizzazione di chi ha svolto il test, non quella della
    simulazione: la dashboard di un tenant parla della propria gente."""
    altrui = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email="estraneo@test.invalid",
        nome="Estraneo",
        cognome="Altrove",
        role_id=ensure_roles(db_session)[ROLE_USER].id,
        organization_id=other_organization.id,
    )
    db_session.add(altrui)
    db_session.flush()

    simulation = make_simulation()
    db_session.add(
        SimulationAttempt(
            simulation_id=simulation.id,
            user_id=altrui.id,
            correct_count=1,
            question_count=3,
            answers=[],
        )
    )
    act_as(standard_user)
    client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True)},
    )

    act_as(org_admin_user)
    email = [r["user_email"] for r in client.get("/api/admin/simulations-report").json()]
    assert email == [standard_user.email]


def test_una_simulazione_senza_domande_non_si_consegna(db_session, user_client, organization):
    simulation = TechnicalSimulation(
        title="Vuota",
        status=SIMULATION_STATUS_PUBLISHED,
        organization_id=organization.id,
        document_name="x.txt",
        document_text="testo",
    )
    db_session.add(simulation)
    db_session.flush()
    response = user_client.post(f"/api/simulations/{simulation.id}/attempts", json={"answers": []})
    assert response.status_code == 409


def test_una_simulazione_inesistente_risponde_404(user_client):
    assert user_client.get(f"/api/simulations/{uuid.uuid4()}").status_code == 404
