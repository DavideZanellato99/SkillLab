"""La registrazione dello schermo durante un test tecnico.

Tre cose da inchiodare. Chi decide: la spunta la mette chi amministra, alla
creazione o dopo, e vale per chiunque svolga il test tranne il super admin,
che non è registrato mai. Cosa resta: il tentativo congela se la
registrazione era prevista, e un video arriva solo a un tentativo che la
prevedeva, dal solo che lo ha svolto. Chi guarda: gli amministratori del
tenant di chi ha risposto, e nessun altro, nemmeno chi ha risposto.
"""

import uuid

import pytest

from auth_dependency import ensure_roles
from models import (
    ROLE_ORGANIZATION_ADMIN,
    ROLE_USER,
    SIMULATION_STATUS_PUBLISHED,
    Organization,
    SimulationAttempt,
    SimulationQuestion,
    SimulationScreenRecording,
    TechnicalSimulation,
    User,
)
from routers.simulations import MAX_SCREEN_RECORDING_BYTES

WEBM = "video/webm;codecs=vp9"


@pytest.fixture
def make_simulation(db_session, organization):
    """Una simulazione pubblicata, con o senza registrazione dello schermo."""

    def _factory(*, records_screen=True, organization_id=None) -> TechnicalSimulation:
        simulation = TechnicalSimulation(
            title="Sblocco carta di credito",
            status=SIMULATION_STATUS_PUBLISHED,
            organization_id=organization_id or organization.id,
            document_name="procedura.txt",
            document_text="La carta si sblocca dopo aver identificato il cliente.",
            records_screen=records_screen,
        )
        db_session.add(simulation)
        db_session.flush()
        for position in range(1, 4):
            db_session.add(
                SimulationQuestion(
                    simulation_id=simulation.id,
                    position=position,
                    text=f"Domanda {position}?",
                    options=["Prima", "Seconda", "Terza", "Quarta"],
                    correct_option=position % 4,
                    explanation="Perché sì.",
                    source_chunks=None,
                )
            )
        db_session.flush()
        db_session.refresh(simulation)
        return simulation

    return _factory


def _answers(simulation):
    return [
        {"question_id": str(q.id), "selected_option": q.correct_option, "elapsed_ms": 1_000}
        for q in simulation.questions
    ]


def _submit(client, simulation) -> dict:
    response = client.post(
        f"/api/simulations/{simulation.id}/attempts", json={"answers": _answers(simulation)}
    )
    assert response.status_code == 200, response.text
    return response.json()


def _upload(client, attempt_id, video=b"video-finto", tipo=WEBM, **parametri):
    return client.post(
        f"/api/simulations/attempts/{attempt_id}/screen-recording",
        content=video,
        headers={"content-type": tipo},
        params=parametri,
    )


def _make_user(db_session, role_name, organization_id):
    roles = ensure_roles(db_session)
    user = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@test.invalid",
        nome="Altro",
        cognome="Utente",
        role_id=roles[role_name].id,
        organization_id=organization_id,
    )
    db_session.add(user)
    db_session.flush()
    return user


# ── La spunta la mette chi amministra ─────────────────────────────────


def test_la_spunta_si_mette_alla_creazione(org_admin_client):
    response = org_admin_client.post(
        "/api/admin/simulations",
        data={"title": "Procedure", "source": "manual", "records_screen": "true"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["records_screen"] is True


def test_senza_spunta_non_si_registra(org_admin_client):
    response = org_admin_client.post(
        "/api/admin/simulations", data={"title": "Procedure", "source": "manual"}
    )
    assert response.status_code == 201, response.text
    assert response.json()["records_screen"] is False


def test_la_spunta_si_cambia_dopo_in_tutti_e_due_i_versi(org_admin_client, make_simulation):
    simulation = make_simulation(records_screen=False)

    acceso = org_admin_client.put(
        f"/api/admin/simulations/{simulation.id}",
        json={"title": simulation.title, "description": "", "records_screen": True},
    )
    assert acceso.status_code == 200, acceso.text
    assert acceso.json()["records_screen"] is True

    spento = org_admin_client.put(
        f"/api/admin/simulations/{simulation.id}",
        json={"title": simulation.title, "description": ""},
    )
    assert spento.status_code == 200, spento.text
    assert spento.json()["records_screen"] is False


def test_chi_svolge_il_test_sa_prima_se_viene_registrato(user_client, make_simulation):
    simulation = make_simulation()
    response = user_client.get(f"/api/simulations/{simulation.id}")
    assert response.status_code == 200
    assert response.json()["records_screen"] is True


# ── Il tentativo congela se la registrazione era prevista ─────────────


def test_il_tentativo_di_un_utente_aspetta_la_registrazione(user_client, make_simulation):
    esito = _submit(user_client, make_simulation())
    assert esito["screen_recording_expected"] is True
    assert esito["screen_recording"] is None


def test_il_super_admin_non_e_mai_registrato(admin_client, make_simulation):
    esito = _submit(admin_client, make_simulation())
    assert esito["screen_recording_expected"] is False


def test_un_test_senza_spunta_non_aspetta_niente(user_client, make_simulation):
    esito = _submit(user_client, make_simulation(records_screen=False))
    assert esito["screen_recording_expected"] is False


def test_togliere_la_spunta_dopo_non_cambia_il_tentativo_di_ieri(
    user_client, make_simulation, db_session
):
    simulation = make_simulation()
    esito = _submit(user_client, simulation)

    simulation.records_screen = False
    db_session.flush()

    riletto = user_client.get(f"/api/simulations/attempts/{esito['id']}").json()
    assert riletto["screen_recording_expected"] is True


# ── Il caricamento ────────────────────────────────────────────────────


def test_il_video_si_conserva_con_durata_e_interruzione(user_client, make_simulation, db_session):
    esito = _submit(user_client, make_simulation())

    response = _upload(user_client, esito["id"], duration_ms=90_000, interrupted="true")

    assert response.status_code == 200, response.text
    corpo = response.json()
    assert corpo["attempt_id"] == esito["id"]
    assert corpo["mime_type"] == "video/webm"
    assert corpo["duration_ms"] == 90_000
    assert corpo["size_bytes"] == len(b"video-finto")
    assert corpo["interrupted"] is True

    riga = (
        db_session.query(SimulationScreenRecording)
        .filter(SimulationScreenRecording.attempt_id == uuid.UUID(esito["id"]))
        .one()
    )
    assert riga.video == b"video-finto"


def test_il_secondo_caricamento_sostituisce_il_primo(user_client, make_simulation, db_session):
    esito = _submit(user_client, make_simulation())
    assert _upload(user_client, esito["id"], video=b"meta", interrupted="true").status_code == 200

    response = _upload(user_client, esito["id"], video=b"intero")

    assert response.status_code == 200
    assert response.json()["interrupted"] is False
    righe = (
        db_session.query(SimulationScreenRecording)
        .filter(SimulationScreenRecording.attempt_id == uuid.UUID(esito["id"]))
        .all()
    )
    assert len(righe) == 1
    assert righe[0].video == b"intero"


def test_i_metadati_viaggiano_con_il_tentativo(user_client, make_simulation):
    simulation = make_simulation()
    esito = _submit(user_client, simulation)
    _upload(user_client, esito["id"], duration_ms=5_000)

    dettaglio = user_client.get(f"/api/simulations/attempts/{esito['id']}").json()
    assert dettaglio["screen_recording"]["duration_ms"] == 5_000
    assert dettaglio["screen_recording"]["interrupted"] is False

    elenco = user_client.get(f"/api/simulations/{simulation.id}/attempts").json()
    assert elenco[0]["screen_recording"]["size_bytes"] == len(b"video-finto")


def test_un_tentativo_che_non_la_prevedeva_rifiuta_il_video(user_client, make_simulation):
    esito = _submit(user_client, make_simulation(records_screen=False))
    response = _upload(user_client, esito["id"])
    assert response.status_code == 409


def test_il_super_admin_non_puo_caricare_il_proprio_schermo(admin_client, make_simulation):
    esito = _submit(admin_client, make_simulation())
    assert _upload(admin_client, esito["id"]).status_code == 409


def test_il_tentativo_di_un_altro_non_si_carica(
    user_client, make_simulation, db_session, organization, act_as
):
    esito = _submit(user_client, make_simulation())
    altro = _make_user(db_session, ROLE_USER, organization.id)
    act_as(altro)

    assert _upload(user_client, esito["id"]).status_code == 404


def test_un_formato_che_non_e_video_viene_rifiutato(user_client, make_simulation):
    esito = _submit(user_client, make_simulation())
    assert _upload(user_client, esito["id"], tipo="audio/webm").status_code == 415
    assert _upload(user_client, esito["id"], tipo="text/plain").status_code == 415


def test_un_video_vuoto_viene_rifiutato(user_client, make_simulation):
    esito = _submit(user_client, make_simulation())
    assert _upload(user_client, esito["id"], video=b"").status_code == 400


def test_un_video_troppo_grande_viene_rifiutato_sulla_lunghezza_dichiarata(
    user_client, make_simulation
):
    esito = _submit(user_client, make_simulation())
    response = user_client.post(
        f"/api/simulations/attempts/{esito['id']}/screen-recording",
        content=b"x",
        headers={"content-type": WEBM, "content-length": str(MAX_SCREEN_RECORDING_BYTES + 1)},
    )
    assert response.status_code == 413


def test_un_tentativo_inesistente_risponde_404(user_client):
    assert _upload(user_client, uuid.uuid4()).status_code == 404


# ── Chi guarda ────────────────────────────────────────────────────────


def _recorded_attempt(user_client, make_simulation) -> str:
    esito = _submit(user_client, make_simulation())
    assert _upload(user_client, esito["id"], video=b"schermo").status_code == 200
    return esito["id"]


def test_l_organization_admin_del_tenant_guarda_il_video(
    user_client, make_simulation, org_admin_user, act_as
):
    attempt_id = _recorded_attempt(user_client, make_simulation)
    act_as(org_admin_user)

    response = user_client.get(f"/api/simulations/attempts/{attempt_id}/screen-recording")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("video/webm")
    assert response.content == b"schermo"
    assert "private" in response.headers["cache-control"]


def test_il_super_admin_guarda_il_video(user_client, make_simulation, super_admin_user, act_as):
    attempt_id = _recorded_attempt(user_client, make_simulation)
    act_as(super_admin_user)
    response = user_client.get(f"/api/simulations/attempts/{attempt_id}/screen-recording")
    assert response.status_code == 200


def test_chi_ha_svolto_il_test_non_rivede_il_proprio_video(user_client, make_simulation):
    attempt_id = _recorded_attempt(user_client, make_simulation)
    response = user_client.get(f"/api/simulations/attempts/{attempt_id}/screen-recording")
    assert response.status_code == 404


def test_l_admin_di_un_altro_tenant_non_lo_vede(user_client, make_simulation, db_session, act_as):
    attempt_id = _recorded_attempt(user_client, make_simulation)
    altra = Organization(name="Altro tenant", slug="altro-tenant")
    db_session.add(altra)
    db_session.flush()
    act_as(_make_user(db_session, ROLE_ORGANIZATION_ADMIN, altra.id))

    response = user_client.get(f"/api/simulations/attempts/{attempt_id}/screen-recording")

    assert response.status_code == 404


def test_un_tentativo_previsto_ma_senza_video_lo_dice_a_chi_corregge(
    user_client, make_simulation, org_admin_user, act_as
):
    simulation = make_simulation()
    esito = _submit(user_client, simulation)
    act_as(org_admin_user)

    risultati = user_client.get(f"/api/simulations/{simulation.id}/results").json()
    assert risultati[0]["screen_recording_expected"] is True
    assert risultati[0]["screen_recording"] is None

    video = user_client.get(f"/api/simulations/attempts/{esito['id']}/screen-recording")
    assert video.status_code == 404


def test_eliminare_il_tentativo_porta_via_il_video(
    user_client, make_simulation, org_admin_user, act_as, db_session
):
    attempt_id = _recorded_attempt(user_client, make_simulation)
    act_as(org_admin_user)

    response = user_client.delete(f"/api/admin/simulation-attempts/{attempt_id}")

    assert response.status_code == 200, response.text
    assert (
        db_session.query(SimulationScreenRecording)
        .filter(SimulationScreenRecording.attempt_id == uuid.UUID(attempt_id))
        .count()
        == 0
    )
    assert (
        db_session.query(SimulationAttempt)
        .filter(SimulationAttempt.id == uuid.UUID(attempt_id))
        .count()
        == 0
    )
