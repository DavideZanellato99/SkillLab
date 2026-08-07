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
    SIMULATION_KIND_MATCHING,
    SIMULATION_KIND_OPEN,
    SIMULATION_KIND_ORDERING,
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
    domande = user_client.post(f"/api/simulations/{simulation.id}/start").json()
    assert len(domande) == 3
    for question in domande:
        # I campi sono quelli che servono a mostrare la domanda, uno per
        # tipo di test: nessuna chiave e nessuna spiegazione
        assert set(question) == {"id", "position", "text", "options", "steps", "left", "right"}
        assert "correct_option" not in question
        assert "expected_answer" not in question
        assert "ordered_steps" not in question
        assert "pairs" not in question
        assert "explanation" not in question


def test_aprire_la_pagina_non_mostra_nessuna_domanda(user_client, make_simulation):
    """Le domande si estraggono quando il test comincia, non quando si guarda
    la pagina: quello che arriva prima sono le regole e quante saranno."""
    simulation = make_simulation()
    payload = user_client.get(f"/api/simulations/{simulation.id}").json()
    assert "questions" not in payload
    assert payload["question_count"] == 3


# ── L'estrazione ──────────────────────────────────────────────────────


def test_un_tentativo_pesca_dieci_domande_dal_serbatoio(user_client, make_simulation):
    """Il serbatoio è grande, il test no: dieci domande, e tutte di lì."""
    simulation = make_simulation(questions=50)
    domande = user_client.post(f"/api/simulations/{simulation.id}/start").json()

    assert len(domande) == 10
    del_serbatoio = {str(q.id) for q in simulation.questions}
    assert {q["id"] for q in domande} <= del_serbatoio
    # Nessuna ripetizione: dieci domande diverse, non dieci pescate a caso
    # una per volta
    assert len({q["id"] for q in domande}) == 10
    # Numerate come si leggono nel test, non come stanno nel serbatoio
    assert [q["position"] for q in domande] == list(range(1, 11))


def test_due_tentativi_non_ricevono_le_stesse_domande(user_client, make_simulation):
    """Il punto di tutto il serbatoio: ritentare è rispondere di nuovo, non
    ricordarsi le lettere della volta prima."""
    simulation = make_simulation(questions=50)

    estrazioni = [
        tuple(q["id"] for q in user_client.post(f"/api/simulations/{simulation.id}/start").json())
        for _ in range(5)
    ]
    # Su cinquanta domande, cinque estrazioni tutte uguali sono impossibili
    # in pratica: se succede, l'estrazione non sta estraendo
    assert len(set(estrazioni)) > 1


def test_una_simulazione_con_poche_domande_le_usa_tutte(user_client, make_simulation):
    """Una bozza a metà, o un serbatoio più piccolo del dovuto, resta
    svolgibile: dieci è un tetto, non una pretesa."""
    simulation = make_simulation(questions=4)
    domande = user_client.post(f"/api/simulations/{simulation.id}/start").json()
    assert len(domande) == 4


def test_iniziare_una_simulazione_senza_domande_non_si_puo(db_session, user_client, organization):
    simulation = TechnicalSimulation(
        title="Vuota",
        status=SIMULATION_STATUS_PUBLISHED,
        organization_id=organization.id,
        document_name="x.txt",
        document_text="testo",
    )
    db_session.add(simulation)
    db_session.flush()
    assert user_client.post(f"/api/simulations/{simulation.id}/start").status_code == 409


def test_una_simulazione_di_un_altro_tenant_non_si_inizia(
    user_client, make_simulation, other_organization
):
    simulation = make_simulation(organization_id=other_organization.id)
    assert user_client.post(f"/api/simulations/{simulation.id}/start").status_code == 404


# ── Consegna e correzione ─────────────────────────────────────────────


def _answers(simulation, *, correct: bool, elapsed_ms: int | None = 1_000):
    """Le risposte a tutte le domande, tutte giuste o tutte sbagliate.

    Di serie arrivano in un secondo, cioè al valore pieno: i test che guardano
    la correzione e non il cronometro restano leggibili, e un dieci nel test
    resta il dieci che si legge nell'app. Passando `elapsed_ms=None` il tempo
    non viene mandato affatto, che è tutt'altro caso (vale il minimo).
    """
    return [
        {
            "question_id": str(q.id),
            "selected_option": q.correct_option if correct else (q.correct_option + 1) % 4,
            "elapsed_ms": elapsed_ms,
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


def test_rispondere_giusto_ma_lentamente_non_prende_dieci(user_client, make_simulation):
    """Il cuore della regola: sapere la procedura, ma dopo, vale meno."""
    simulation = make_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        # Venti secondi su trenta: settimo scalino, quattro decimi a domanda
        json={"answers": _answers(simulation, correct=True, elapsed_ms=20_000)},
    ).json()

    assert esito["correct_count"] == 3
    assert esito["earned_points"] == 1.2
    assert esito["score"] == 4.0
    assert all(a["points"] == 0.4 for a in esito["answers"])
    assert all(a["elapsed_ms"] == 20_000 for a in esito["answers"])


def test_i_punti_di_ogni_domanda_dipendono_dal_suo_tempo(user_client, make_simulation):
    """Il tempo si conta per domanda e non sul test intero."""
    simulation = make_simulation(questions=3)
    risposte = _answers(simulation, correct=True)
    risposte[0]["elapsed_ms"] = 2_000  # primo scalino, punto pieno
    risposte[1]["elapsed_ms"] = 10_000  # quarto scalino
    risposte[2]["elapsed_ms"] = 29_000  # ultimo scalino
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": risposte}
    ).json()

    assert [a["points"] for a in esito["answers"]] == [1.0, 0.7, 0.1]
    assert esito["earned_points"] == 1.8
    assert esito["score"] == 6.0


def test_una_risposta_sbagliata_non_vale_niente_per_quanto_veloce(user_client, make_simulation):
    simulation = make_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=False, elapsed_ms=200)},
    ).json()
    assert esito["earned_points"] == 0.0
    assert esito["score"] == 0.0
    assert all(a["points"] == 0.0 for a in esito["answers"])


def test_il_tempo_e_i_punti_restano_nella_fotografia_del_tentativo(user_client, make_simulation):
    """Rileggendo un tentativo il voto non si ricalcola: si rilegge."""
    simulation = make_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True, elapsed_ms=8_000)},
    ).json()

    riletto = user_client.get(f"/api/simulations/attempts/{esito['id']}").json()
    assert riletto["score"] == esito["score"] == 8.0
    assert riletto["earned_points"] == 2.4
    assert [a["points"] for a in riletto["answers"]] == [0.8, 0.8, 0.8]
    assert [a["elapsed_ms"] for a in riletto["answers"]] == [8_000] * 3


def test_una_consegna_senza_tempi_non_prende_dieci(user_client, make_simulation):
    """Il caso del client vecchio, che è come questo difetto si era nascosto.

    Un'app che non misura il tempo consegna risposte senza `elapsed_ms`: se
    valessero punto pieno prenderebbe dieci in silenzio, e nessuno saprebbe
    che il cronometro non sta arrivando. Prendendo il minimo, il voto lo dice.
    """
    simulation = make_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True, elapsed_ms=None)},
    ).json()

    assert esito["correct_count"] == 3
    assert esito["earned_points"] == 0.3
    assert esito["score"] == 1.0
    assert all(a["elapsed_ms"] is None for a in esito["answers"])


def test_un_tempo_assurdo_non_fa_saltare_la_consegna(user_client, make_simulation):
    """Un client che manda un numero storto consegna comunque un test."""
    simulation = make_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True, elapsed_ms=99_999_999)},
    ).json()
    assert esito["score"] == 1.0
    assert all(a["points"] == 0.1 for a in esito["answers"])


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


def test_consegnare_meno_risposte_delle_domande_viene_rifiutato(user_client, make_simulation):
    """Da quando le domande si estraggono, il server non può più riempire i
    buchi da solo: le domande che ha dato non se le è segnate.

    Ed è anche l'unica porta che questo disegno lascerebbe aperta: senza
    questo controllo, consegnare una sola risposta giusta prenderebbe dieci.
    Chi non sa rispondere manda la sua voce in bianco, che è quello che il
    browser fa per le domande saltate.
    """
    simulation = make_simulation()
    risposte = _answers(simulation, correct=True)[:2]
    response = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": risposte}
    )
    assert response.status_code == 400

    assert (
        user_client.post(
            f"/api/simulations/{simulation.id}/attempts", json={"answers": []}
        ).status_code
        == 400
    )


def test_una_domanda_di_un_altro_test_non_si_consegna(
    user_client, make_simulation, other_organization
):
    """Le domande arrivano dal client, quindi da qui esce la sola difesa:
    ogni domanda consegnata deve essere di questa simulazione."""
    simulation = make_simulation()
    altra = make_simulation(title="Un altro test")
    risposte = _answers(simulation, correct=True)
    risposte[0]["question_id"] = str(altra.questions[0].id)

    response = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": risposte}
    )
    assert response.status_code == 400


def test_la_stessa_domanda_consegnata_due_volte_viene_rifiutata(user_client, make_simulation):
    """Altrimenti si consegnerebbe tre volte la domanda che si sa."""
    simulation = make_simulation()
    risposte = _answers(simulation, correct=True)
    risposte[1]["question_id"] = risposte[0]["question_id"]

    response = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": risposte}
    )
    assert response.status_code == 400


def test_le_posizioni_nell_esito_sono_quelle_del_test_non_del_serbatoio(
    user_client, make_simulation
):
    """La terza domanda del test si rilegge al terzo posto, anche se nel
    serbatoio era la trentanovesima."""
    simulation = make_simulation(questions=50)
    domande = user_client.post(f"/api/simulations/{simulation.id}/start").json()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={
            "answers": [
                {"question_id": q["id"], "selected_option": 0, "elapsed_ms": 1_000} for q in domande
            ]
        },
    ).json()

    assert esito["question_count"] == 10
    assert [a["position"] for a in esito["answers"]] == list(range(1, 11))
    assert [a["question_id"] for a in esito["answers"]] == [q["id"] for q in domande]


def test_un_indice_di_opzione_inesistente_viene_rifiutato(user_client, make_simulation):
    simulation = make_simulation(questions=1)
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
    assert client.get(f"/api/simulations/attempts/{esito['id']}").status_code == 200


def test_i_risultati_di_un_test_li_legge_solo_il_super_admin(
    client, act_as, make_simulation, standard_user, org_admin_user, super_admin_user
):
    """L'elenco per test sta dietro la pagina che lo apre, che è del super admin.

    Guarda una prova dal lato del test e non della persona, e serve a chi le
    domande le ha scritte. Un organization admin non ha quella pagina, quindi
    non deve avere nemmeno la rotta: un permesso più largo del corridoio che
    ci porta è un permesso che conta lo stesso, perché l'indirizzo si digita.
    """
    simulation = make_simulation()
    act_as(standard_user)
    esito = client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True)},
    ).json()

    act_as(org_admin_user)
    assert client.get(f"/api/simulations/{simulation.id}/results").status_code == 403

    act_as(super_admin_user)
    risultati = client.get(f"/api/simulations/{simulation.id}/results").json()
    assert [r["id"] for r in risultati] == [esito["id"]]


def test_chi_ha_traslocato_di_tenant_se_lo_porta_dietro_il_tentativo(
    db_session, client, act_as, make_simulation, standard_user, org_admin_user, other_organization
):
    """Il tentativo segue la persona, non la simulazione su cui è stato svolto.

    Le due organizzazioni coincidono sempre, tranne dopo che il super admin
    ha spostato qualcuno: lì l'admin dell'organizzazione lasciata non deve
    più leggere nome ed email di chi se n'è andato. La lettura e la
    cancellazione rispondono la stessa cosa, che è il punto: prima una
    diceva 200 e l'altra 404 sulla stessa riga.
    """
    simulation = make_simulation()
    act_as(standard_user)
    esito = client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True)},
    ).json()

    standard_user.organization_id = other_organization.id
    db_session.flush()

    act_as(org_admin_user)
    assert client.get(f"/api/simulations/attempts/{esito['id']}").status_code == 404
    assert client.get(f"/api/simulations/attempts/{esito['id']}/pdf").status_code == 404
    assert client.delete(f"/api/admin/simulation-attempts/{esito['id']}").status_code == 404


# ── Il PDF di un tentativo ────────────────────────────────────────────


def test_il_pdf_di_un_tentativo_lo_scarica_chi_lo_ha_svolto(user_client, make_simulation):
    simulation = make_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=True)},
    ).json()

    response = user_client.get(f"/api/simulations/attempts/{esito['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "test-sblocco-carta-di-credito.pdf" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_il_pdf_di_un_tentativo_lo_scarica_anche_chi_corregge(
    client, act_as, make_simulation, standard_user, org_admin_user
):
    """Stesso endpoint dello studente: la lettura del tentativo e' gia' una sola."""
    simulation = make_simulation()
    act_as(standard_user)
    esito = client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _answers(simulation, correct=False)},
    ).json()

    act_as(org_admin_user)
    response = client.get(f"/api/simulations/attempts/{esito['id']}/pdf")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")


def test_il_pdf_del_tentativo_di_un_altro_non_si_scarica(
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
    assert client.get(f"/api/simulations/attempts/{attempt.id}/pdf").status_code == 404


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


# ── I test a risposta aperta ──────────────────────────────────────────
#
# Qui la correzione non è più aritmetica: passa da un modello, e il modello
# nei test non esiste. Quello che si verifica è tutto il resto, che è la
# parte che può sbagliare in silenzio: chi viene mandato a giudicare e chi
# no, come il giudizio diventa punti, e cosa succede quando non arriva.


@pytest.fixture
def make_open_simulation(db_session, organization):
    """Una simulazione a risposta aperta, pubblicata, con le sue domande."""

    def _factory(*, questions=3, status=SIMULATION_STATUS_PUBLISHED) -> TechnicalSimulation:
        simulation = TechnicalSimulation(
            title="Procedura di rimborso",
            description="Test di prova",
            status=status,
            kind=SIMULATION_KIND_OPEN,
            organization_id=organization.id,
            document_name="procedura.txt",
            document_text="Il rimborso si autorizza dopo aver verificato lo scontrino.",
        )
        db_session.add(simulation)
        db_session.flush()
        db_session.add(
            SimulationChunk(
                simulation_id=simulation.id,
                ordinal=1,
                content="Il rimborso si autorizza dopo aver verificato lo scontrino.",
                embedding=[0.1, 0.2, 0.3],
            )
        )
        for position in range(1, questions + 1):
            db_session.add(
                SimulationQuestion(
                    simulation_id=simulation.id,
                    position=position,
                    text=f"Domanda aperta {position}?",
                    options=None,
                    correct_option=None,
                    expected_answer=f"Deve dire la cosa {position}.",
                    explanation=f"Spiegazione della domanda {position}.",
                    source_chunks=[1],
                )
            )
        db_session.flush()
        db_session.refresh(simulation)
        return simulation

    return _factory


@pytest.fixture
def giudice(monkeypatch):
    """Sostituisce il modello che corregge, e registra cosa gli è arrivato.

    Il finto giudice dà a tutti la stessa qualità, così i test parlano di
    come il giudizio diventa un voto e non di quanto sia bravo il modello.
    Le domande che riceve invece contano, ed è per questo che le conserva:
    una risposta in bianco che arrivasse fin qui sarebbe una chiamata pagata
    per sapere che chi non scrive niente non prende niente.
    """
    ricevute: list[dict] = []

    def _install(quality=1.0, *, salta=(), errore=False):
        async def _judge(items):
            ricevute.clear()
            ricevute.extend(items)
            if errore:
                raise RuntimeError("modello non disponibile")
            return {
                item["position"]: {"quality": quality, "feedback": "Manca una condizione."}
                for item in items
                if item["position"] not in salta
            }

        monkeypatch.setattr("routers.simulations.judge_open_answers", _judge)
        return ricevute

    return _install


def _written(simulation, text="Si verifica lo scontrino e poi si autorizza."):
    return [{"question_id": str(q.id), "answer_text": text} for q in simulation.questions]


def test_le_domande_aperte_arrivano_senza_alternative_e_senza_traccia(
    user_client, make_open_simulation
):
    """La traccia è la chiave: se viaggiasse con la domanda, il test sarebbe
    già risolto prima di cominciare."""
    simulation = make_open_simulation()
    assert user_client.get(f"/api/simulations/{simulation.id}").json()["kind"] == "open"

    for question in user_client.post(f"/api/simulations/{simulation.id}/start").json():
        assert question["options"] == []
        assert "expected_answer" not in question


def test_una_risposta_completa_prende_il_punto_pieno(user_client, make_open_simulation, giudice):
    giudice(quality=1.0)
    simulation = make_open_simulation()

    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": _written(simulation)}
    ).json()

    assert esito["simulation_kind"] == "open"
    assert esito["correct_count"] == 3
    assert esito["earned_points"] == 3.0
    assert esito["score"] == 10.0
    assert all(a["points"] == 1.0 for a in esito["answers"])
    # Il tempo non c'è e non deve inventarsi: qui non c'era cronometro
    assert all(a["elapsed_ms"] is None for a in esito["answers"])


def test_una_risposta_a_meta_prende_meta_punto(user_client, make_open_simulation, giudice):
    """La differenza dal test a scelta multipla: non è tutto o niente."""
    giudice(quality=0.5)
    simulation = make_open_simulation()

    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": _written(simulation)}
    ).json()

    assert esito["earned_points"] == 1.5
    assert esito["score"] == 5.0
    # Sotto la sufficienza: dei punti sì, fra le esatte no
    assert esito["correct_count"] == 0


def test_una_risposta_in_bianco_non_arriva_al_modello(user_client, make_open_simulation, giudice):
    ricevute = giudice(quality=1.0)
    simulation = make_open_simulation()

    risposte = _written(simulation)
    risposte[0]["answer_text"] = "   "

    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": risposte}
    ).json()

    assert [item["position"] for item in ricevute] == [2, 3]
    assert esito["answers"][0]["points"] == 0.0
    assert esito["answers"][0]["answer_text"] is None
    assert esito["answers"][0]["is_correct"] is False
    assert esito["earned_points"] == 2.0


def test_il_giudizio_arriva_nell_esito_con_la_traccia_e_il_commento(
    user_client, make_open_simulation, giudice
):
    """Il voto di un modello si deve poter verificare: accanto alla risposta
    ci sono il metro con cui è stata misurata e il perché."""
    giudice(quality=0.7)
    simulation = make_open_simulation()

    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": _written(simulation)}
    ).json()

    prima = esito["answers"][0]
    assert prima["answer_text"] == "Si verifica lo scontrino e poi si autorizza."
    assert prima["expected_answer"] == "Deve dire la cosa 1."
    assert prima["feedback"] == "Manca una condizione."
    assert prima["explanation"] == "Spiegazione della domanda 1."
    assert prima["sources"] == ["Il rimborso si autorizza dopo aver verificato lo scontrino."]
    # Le alternative non esistono, e non ne compaiono di finte
    assert prima["options"] == []
    assert prima["correct_option"] is None


def test_quello_che_il_modello_ha_visto_e_la_traccia_non_il_documento(
    user_client, make_open_simulation, giudice
):
    ricevute = giudice(quality=1.0)
    simulation = make_open_simulation(questions=1)

    user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": _written(simulation)}
    )

    assert len(ricevute) == 1
    assert ricevute[0]["expected_answer"] == "Deve dire la cosa 1."
    assert ricevute[0]["text"] == "Domanda aperta 1?"
    assert "document_text" not in ricevute[0]


def test_se_il_modello_non_risponde_il_tentativo_non_si_scrive(
    db_session, user_client, make_open_simulation, giudice
):
    """Meglio far riprovare che scrivere un voto che nessuno ha dato."""
    giudice(errore=True)
    simulation = make_open_simulation()

    response = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": _written(simulation)}
    )

    assert response.status_code == 502
    assert db_session.query(SimulationAttempt).count() == 0


def test_una_correzione_incompleta_fa_fallire_la_consegna(
    db_session, user_client, make_open_simulation, giudice
):
    """Una domanda saltata dal modello darebbe zero a chi aveva risposto, per
    un motivo che chi legge il voto non può vedere."""
    giudice(quality=1.0, salta=(2,))
    simulation = make_open_simulation()

    response = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": _written(simulation)}
    )

    assert response.status_code == 502
    assert db_session.query(SimulationAttempt).count() == 0


def test_un_test_aperto_tutto_in_bianco_non_chiama_nessuno(
    user_client, make_open_simulation, giudice
):
    ricevute = giudice(quality=1.0)
    simulation = make_open_simulation()

    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _written(simulation, text=None)},
    ).json()

    assert ricevute == []
    assert esito["score"] == 0.0
    assert esito["correct_count"] == 0


def test_il_tipo_del_test_arriva_a_chi_legge_i_tentativi(
    client, act_as, make_simulation, make_open_simulation, giudice, standard_user, org_admin_user
):
    """Nelle dashboard due tentativi stanno nella stessa tabella, e il voto da
    solo non dice quale prova era: il tipo viaggia con ognuno, come `mode` su
    una conversazione."""
    giudice(quality=1.0)
    multipla = make_simulation(questions=1)
    aperta = make_open_simulation(questions=1)

    act_as(standard_user)
    client.post(
        f"/api/simulations/{multipla.id}/attempts",
        json={"answers": _answers(multipla, correct=True)},
    )
    client.post(f"/api/simulations/{aperta.id}/attempts", json={"answers": _written(aperta)})

    confronto = client.get("/api/comparison/simulation-attempts").json()
    assert [a["simulation_kind"] for a in confronto] == ["multiple", "open"]

    act_as(org_admin_user)
    report = client.get("/api/admin/simulations-report").json()
    assert {r["simulation_title"]: r["simulation_kind"] for r in report} == {
        multipla.title: "multiple",
        aperta.title: "open",
    }


def test_il_giudizio_resta_nella_fotografia_del_tentativo(
    db_session, user_client, make_open_simulation, giudice
):
    """Rivalutare la stessa risposta domani darebbe un numero simile ma non
    lo stesso, e un voto che oscilla non è un voto."""
    giudice(quality=0.8)
    simulation = make_open_simulation(questions=1)
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": _written(simulation)}
    ).json()
    assert esito["score"] == 8.0

    simulation.questions[0].expected_answer = "Una traccia completamente diversa."
    db_session.flush()

    riletto = user_client.get(f"/api/simulations/attempts/{esito['id']}").json()
    assert riletto["score"] == 8.0
    assert riletto["answers"][0]["expected_answer"] == "Deve dire la cosa 1."
    assert riletto["answers"][0]["feedback"] == "Manca una condizione."


def test_il_pdf_di_un_test_a_risposta_aperta_porta_le_risposte_scritte(
    user_client, make_open_simulation, giudice
):
    """Il ramo scritto del referto: quello che ha risposto e la traccia."""
    giudice(quality=0.5)
    simulation = make_open_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": _written(simulation)},
    ).json()

    response = user_client.get(f"/api/simulations/attempts/{esito['id']}/pdf")

    assert response.status_code == 200
    assert "test-procedura-di-rimborso.pdf" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


# ── I test di ordinamento e di abbinamento ────────────────────────────
#
# I due tipi in cui una risposta può essere giusta a metà, e in cui la
# domanda che esce dal server non è quella scritta nella riga: i passi
# vengono mescolati e la colonna di destra pure. Le due cose vanno verificate
# insieme, perché è la mescolata a rendere la chiave una chiave, e il
# punteggio parziale a rendere il voto qualcosa che si può spiegare.


@pytest.fixture
def make_ordering_simulation(db_session, organization):
    """Una simulazione di ordinamento, pubblicata, con una domanda sola."""

    def _factory(*, status=SIMULATION_STATUS_PUBLISHED) -> TechnicalSimulation:
        simulation = TechnicalSimulation(
            title="Registrazione di un reclamo",
            status=status,
            kind=SIMULATION_KIND_ORDERING,
            organization_id=organization.id,
            document_name="procedura.txt",
            document_text="Prima si identifica il cliente.",
        )
        db_session.add(simulation)
        db_session.flush()
        db_session.add(
            SimulationQuestion(
                simulation_id=simulation.id,
                position=1,
                text="Rimetti in ordine i passi.",
                ordered_steps=["Uno", "Due", "Tre", "Quattro", "Cinque"],
                explanation="L'ordine è quello.",
            )
        )
        db_session.flush()
        db_session.refresh(simulation)
        return simulation

    return _factory


@pytest.fixture
def make_matching_simulation(db_session, organization):
    """Una simulazione di abbinamento, pubblicata, con una domanda sola."""

    def _factory(*, status=SIMULATION_STATUS_PUBLISHED) -> TechnicalSimulation:
        simulation = TechnicalSimulation(
            title="Reclami e uffici",
            status=status,
            kind=SIMULATION_KIND_MATCHING,
            organization_id=organization.id,
            document_name="procedura.txt",
            document_text="Ogni reclamo ha il suo ufficio.",
        )
        db_session.add(simulation)
        db_session.flush()
        db_session.add(
            SimulationQuestion(
                simulation_id=simulation.id,
                position=1,
                text="Abbina ogni reclamo al suo ufficio.",
                pairs=[
                    {"left": "Carta", "right": "Sportello"},
                    {"left": "Bonifico", "right": "Estero"},
                    {"left": "Mutuo", "right": "Crediti"},
                ],
                explanation="Ognuno al suo.",
            )
        )
        db_session.flush()
        db_session.refresh(simulation)
        return simulation

    return _factory


def test_i_passi_arrivano_mescolati_e_senza_l_ordine_giusto(user_client, make_ordering_simulation):
    """La mescolata è la domanda: mandarli in ordine sarebbe consegnare la
    risposta insieme a quello che si chiede.

    Si estrae più volte perché una mescolata può ricadere sull'ordine giusto:
    su cinque passi succede una volta su centoventi, e un test che fallisse
    per quello sarebbe un test da rieseguire a caso.
    """
    simulation = make_ordering_simulation()
    ordini = set()
    for _ in range(12):
        domande = user_client.post(f"/api/simulations/{simulation.id}/start").json()
        assert domande[0]["options"] == []
        assert sorted(domande[0]["steps"]) == ["Cinque", "Due", "Quattro", "Tre", "Uno"]
        ordini.add(tuple(domande[0]["steps"]))
    assert len(ordini) > 1


def test_l_ordinamento_vale_quanti_passi_sono_al_posto_giusto(
    user_client, make_ordering_simulation
):
    """Tre passi su cinque valgono sei decimi, e l'esito lo dice in chiaro."""
    simulation = make_ordering_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={
            "answers": [
                {
                    "question_id": str(simulation.questions[0].id),
                    # I primi tre al loro posto, gli ultimi due invertiti
                    "ordered_steps": ["Uno", "Due", "Tre", "Cinque", "Quattro"],
                }
            ]
        },
    ).json()

    risposta = esito["answers"][0]
    assert risposta["matched_count"] == 3
    assert risposta["item_count"] == 5
    assert risposta["points"] == 0.6
    # Sei decimi è la sufficienza, quindi conta fra le esatte
    assert risposta["is_correct"] is True
    assert risposta["correct_steps"] == ["Uno", "Due", "Tre", "Quattro", "Cinque"]
    assert esito["score"] == 6.0


def test_un_ordinamento_lasciato_in_bianco_non_vale_niente(user_client, make_ordering_simulation):
    simulation = make_ordering_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={"answers": [{"question_id": str(simulation.questions[0].id)}]},
    ).json()

    risposta = esito["answers"][0]
    assert risposta["points"] == 0.0
    assert risposta["is_correct"] is False
    assert risposta["given_steps"] == []
    # La chiave si legge lo stesso: chi non ha risposto è chi ha più bisogno
    # di vedere qual era la sequenza
    assert risposta["correct_steps"] == ["Uno", "Due", "Tre", "Quattro", "Cinque"]


def test_un_ordinamento_con_un_numero_di_passi_diverso_e_rifiutato(
    user_client, make_ordering_simulation
):
    """Non è una risposta sbagliata, è una domanda diversa da quella data."""
    simulation = make_ordering_simulation()
    response = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={
            "answers": [
                {
                    "question_id": str(simulation.questions[0].id),
                    "ordered_steps": ["Uno", "Due"],
                }
            ]
        },
    )
    assert response.status_code == 400


def test_l_abbinamento_manda_la_colonna_di_destra_mescolata(user_client, make_matching_simulation):
    """La sinistra resta com'è scritta, la destra no: le coppie sono la
    chiave, e affiancarle sarebbe darla."""
    simulation = make_matching_simulation()
    ordini = set()
    for _ in range(12):
        domanda = user_client.post(f"/api/simulations/{simulation.id}/start").json()[0]
        assert domanda["left"] == ["Carta", "Bonifico", "Mutuo"]
        assert sorted(domanda["right"]) == ["Crediti", "Estero", "Sportello"]
        ordini.add(tuple(domanda["right"]))
    assert len(ordini) > 1


def test_l_abbinamento_vale_quante_coppie_sono_indovinate(user_client, make_matching_simulation):
    """Due coppie su tre, con la terza lasciata scoperta: sette decimi."""
    simulation = make_matching_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={
            "answers": [
                {
                    "question_id": str(simulation.questions[0].id),
                    "pairs": [
                        {"left": "Carta", "right": "Sportello"},
                        {"left": "Bonifico", "right": "Estero"},
                    ],
                }
            ]
        },
    ).json()

    risposta = esito["answers"][0]
    assert risposta["matched_count"] == 2
    assert risposta["item_count"] == 3
    assert risposta["points"] == 0.7
    assert risposta["is_correct"] is True
    # La chiave torna intera, compresa la coppia che non è stata nemmeno
    # tentata: è quella che chi rilegge deve imparare
    assert {p["left"] for p in risposta["correct_pairs"]} == {"Carta", "Bonifico", "Mutuo"}


def test_un_abbinamento_scambiato_non_prende_niente(user_client, make_matching_simulation):
    simulation = make_matching_simulation()
    esito = user_client.post(
        f"/api/simulations/{simulation.id}/attempts",
        json={
            "answers": [
                {
                    "question_id": str(simulation.questions[0].id),
                    "pairs": [
                        {"left": "Carta", "right": "Estero"},
                        {"left": "Bonifico", "right": "Sportello"},
                        {"left": "Mutuo", "right": "Crediti"},
                    ],
                }
            ]
        },
    ).json()

    risposta = esito["answers"][0]
    assert risposta["matched_count"] == 1
    assert risposta["points"] == 0.3
    assert risposta["is_correct"] is False


def test_il_pdf_dei_due_tipi_nuovi_si_genera(
    user_client, make_ordering_simulation, make_matching_simulation
):
    """Il referto ha un ramo per tipo, e su questi due stampa degli elenchi."""
    ordinamento = make_ordering_simulation()
    esito = user_client.post(
        f"/api/simulations/{ordinamento.id}/attempts",
        json={
            "answers": [
                {
                    "question_id": str(ordinamento.questions[0].id),
                    "ordered_steps": ["Due", "Uno", "Tre", "Quattro", "Cinque"],
                }
            ]
        },
    ).json()
    pdf = user_client.get(f"/api/simulations/attempts/{esito['id']}/pdf")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")

    abbinamento = make_matching_simulation()
    esito = user_client.post(
        f"/api/simulations/{abbinamento.id}/attempts",
        json={
            "answers": [
                {
                    "question_id": str(abbinamento.questions[0].id),
                    "pairs": [{"left": "Carta", "right": "Crediti"}],
                }
            ]
        },
    ).json()
    pdf = user_client.get(f"/api/simulations/attempts/{esito['id']}/pdf")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
