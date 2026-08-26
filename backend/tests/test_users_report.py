"""Il report attività: una riga per persona, e le sue prove quando si apre.

La riga risponde a "cosa ha fatto questa persona", quindi tiene insieme i
conteggi delle due prove che stanno in due tabelle diverse: le conversazioni
con gli avatar e le simulazioni. Le prove una per una arrivano dalla lettura
di dettaglio, che la schermata chiede solo quando quella riga si apre.

Questi test fissano quello che le due letture promettono: i conteggi tornano
con le prove che si aprono sotto, il voto è quello finale, il periodo taglia
allo stesso modo di qua e di là, il confine del tenant vale su entrambe, e da
qui una prova si può togliere.
"""

import uuid
from datetime import UTC, datetime, timedelta

from auth_dependency import ensure_roles
from models import (
    ROLE_USER,
    SIMULATION_STATUS_PUBLISHED,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationReview,
    Organization,
    SimulationAttempt,
    TechnicalSimulation,
    User,
)


def _simulation(db_session, organization, *, title="Procedura rimborsi", kind="multiple"):
    simulation = TechnicalSimulation(
        title=title,
        description="Test di prova",
        kind=kind,
        status=SIMULATION_STATUS_PUBLISHED,
        organization_id=organization.id,
        document_name="procedura.txt",
        document_text="Il rimborso si apre entro trenta giorni.",
    )
    db_session.add(simulation)
    db_session.flush()
    return simulation


def _attempt(db_session, simulation, user, *, earned=8.0, questions=10, at=None):
    attempt = SimulationAttempt(
        simulation_id=simulation.id,
        user_id=user.id,
        correct_count=8,
        question_count=questions,
        earned_points=earned,
        answers=[],
        created_at=at or datetime.now(UTC),
    )
    db_session.add(attempt)
    db_session.flush()
    return attempt


def _conversation(db_session, user, avatar, *, score=None, at=None, messages=0):
    conversation = ChatConversation(
        user_id=user.id,
        avatar_id=avatar.id,
        title="Clienti 1",
        mode="text",
        created_at=at or datetime.now(UTC),
    )
    db_session.add(conversation)
    db_session.flush()
    for index in range(messages):
        db_session.add(
            ChatMessage(
                conversation_id=conversation.id,
                role="user" if index % 2 == 0 else "assistant",
                content=f"Messaggio {index}",
                created_at=(at or datetime.now(UTC)) + timedelta(seconds=index * 30),
            )
        )
    if score is not None:
        db_session.add(
            ConversationEvaluation(
                conversation_id=conversation.id,
                overall_score=score,
                result={"summary": "", "criteria": []},
            )
        )
    db_session.flush()
    return conversation


def _row_of(response, user) -> dict:
    assert response.status_code == 200
    rows = [r for r in response.json() if r["id"] == str(user.id)]
    assert len(rows) == 1
    return rows[0]


def _detail_of(client, user, query="") -> dict:
    """Le prove di una persona, cioè quello che si legge aprendo la sua riga."""
    response = client.get(f"/api/admin/users-report/{user.id}{query}")
    assert response.status_code == 200
    return response.json()


def test_la_riga_tiene_insieme_le_due_prove(
    admin_client, db_session, standard_user, organization, make_avatar
):
    avatar = make_avatar()
    _conversation(db_session, standard_user, avatar, score=6.0, messages=2)
    _conversation(db_session, standard_user, avatar, score=8.0)
    simulation = _simulation(db_session, organization)
    _attempt(db_session, simulation, standard_user, earned=7.0)

    row = _row_of(admin_client.get("/api/admin/users-report"), standard_user)

    assert row["conversation_count"] == 2
    assert row["simulation_count"] == 1

    # I conteggi della riga e le prove che si aprono sotto sono la stessa
    # cosa contata due volte: se non tornassero, la riga prometterebbe prove
    # che aprendola non ci sono
    dettaglio = _detail_of(admin_client, standard_user)
    assert len(dettaglio["conversations"]) == 2
    assert len(dettaglio["simulation_attempts"]) == 1
    assert dettaglio["simulation_attempts"][0]["simulation_title"] == "Procedura rimborsi"


def test_l_elenco_non_porta_le_prove(admin_client, db_session, standard_user, make_avatar):
    """L'elenco conta e basta.

    Le prove di ogni persona ci stavano dentro, e chi apriva la pagina le
    scaricava tutte per aprirne una riga alla volta: su un tenant avviato
    sono decine di migliaia di righe a ogni apertura.
    """
    _conversation(db_session, standard_user, make_avatar(), score=6.0, messages=2)

    row = _row_of(admin_client.get("/api/admin/users-report"), standard_user)

    assert row["conversation_count"] == 1
    assert "conversations" not in row
    assert "simulation_attempts" not in row


def test_una_conversazione_non_valutata_non_e_uno_zero(
    admin_client, db_session, standard_user, make_avatar
):
    """Senza giudizio il voto è assente: uno zero al suo posto sarebbe una
    bocciatura mai data."""
    avatar = make_avatar()
    _conversation(db_session, standard_user, avatar, score=8.0)
    _conversation(db_session, standard_user, avatar)

    row = _row_of(admin_client.get("/api/admin/users-report"), standard_user)
    dettaglio = _detail_of(admin_client, standard_user)

    assert row["conversation_count"] == 2
    assert sorted(c["score"] is None for c in dettaglio["conversations"]) == [False, True]


def test_il_voto_e_quello_corretto_dal_docente(
    admin_client, db_session, standard_user, super_admin_user, make_avatar
):
    avatar = make_avatar()
    conversation = _conversation(db_session, standard_user, avatar, score=5.0)
    db_session.add(
        ConversationReview(
            conversation_id=conversation.id,
            reviewer_id=super_admin_user.id,
            reviewer_name="Docente",
            override_score=7.5,
            override_reason="Aveva capito il problema",
            ai_score_at_review=5.0,
        )
    )
    db_session.flush()

    dettaglio = _detail_of(admin_client, standard_user)

    assert dettaglio["conversations"][0]["score"] == 7.5


def test_il_periodo_taglia_le_prove(
    admin_client, db_session, standard_user, organization, make_avatar
):
    avatar = make_avatar()
    vecchia = datetime.now(UTC) - timedelta(days=60)
    _conversation(db_session, standard_user, avatar, score=4.0, at=vecchia)
    _conversation(db_session, standard_user, avatar, score=8.0)
    simulation = _simulation(db_session, organization)
    _attempt(db_session, simulation, standard_user, earned=3.0, at=vecchia)

    row = _row_of(admin_client.get("/api/admin/users-report?days=30"), standard_user)

    # Solo la prova recente
    assert row["conversation_count"] == 1
    assert row["simulation_count"] == 0

    # E il periodo taglia allo stesso modo di là: la riga dice una
    # conversazione, e aprendola se ne deve trovare una
    dettaglio = _detail_of(admin_client, standard_user, "?days=30")
    assert len(dettaglio["conversations"]) == 1
    assert dettaglio["simulation_attempts"] == []
    assert len(_detail_of(admin_client, standard_user)["conversations"]) == 2


def test_la_durata_esce_dai_messaggi(admin_client, db_session, standard_user, make_avatar):
    avatar = make_avatar()
    at = datetime.now(UTC) - timedelta(hours=1)
    _conversation(db_session, standard_user, avatar, at=at, messages=3)

    row = _row_of(admin_client.get("/api/admin/users-report"), standard_user)
    conversazione = _detail_of(admin_client, standard_user)["conversations"][0]

    # Tre messaggi a trenta secondi l'uno dall'altro: un minuto dal primo
    # all'ultimo, e il conteggio dei messaggi accanto. La somma in testa alla
    # riga la fa il database, il minuto della prova lo fa la stessa
    # espressione: se si scollassero, la riga direbbe una durata e le prove
    # sotto un'altra
    assert conversazione["message_count"] == 3
    assert conversazione["duration_seconds"] == 60
    assert row["total_duration_seconds"] == 60


def test_una_conversazione_con_un_messaggio_solo_non_e_durata(
    admin_client, db_session, standard_user, make_avatar
):
    """Aperta e mai iniziata: la durata è zero e non un istante."""
    _conversation(db_session, standard_user, make_avatar(), messages=1)

    row = _row_of(admin_client.get("/api/admin/users-report"), standard_user)
    conversazione = _detail_of(admin_client, standard_user)["conversations"][0]

    assert conversazione["message_count"] == 1
    assert conversazione["duration_seconds"] == 0
    assert row["total_duration_seconds"] == 0


def test_una_conversazione_senza_messaggi_sta_comunque_nell_elenco(
    admin_client, db_session, standard_user, make_avatar
):
    """I messaggi arrivano in outer join: senza, la conversazione sparirebbe
    dal conto invece di valere zero."""
    _conversation(db_session, standard_user, make_avatar())

    row = _row_of(admin_client.get("/api/admin/users-report"), standard_user)
    conversazione = _detail_of(admin_client, standard_user)["conversations"][0]

    assert row["conversation_count"] == 1
    assert conversazione["message_count"] == 0
    assert conversazione["duration_seconds"] == 0


def test_il_dettaglio_di_un_altro_tenant_non_esiste(org_admin_client, db_session, make_avatar):
    """Il confine del tenant vale sulla lettura di dettaglio come sull'elenco:
    fuori dalla propria organizzazione la persona è un id inventato."""
    altrove = Organization(name="Altrove", slug=f"altrove-{uuid.uuid4().hex[:8]}")
    db_session.add(altrove)
    db_session.flush()
    estraneo = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email="estraneo-dettaglio@test.invalid",
        nome="Estraneo",
        cognome="Altrove",
        role_id=ensure_roles(db_session)[ROLE_USER].id,
        organization_id=altrove.id,
    )
    db_session.add(estraneo)
    db_session.flush()
    _conversation(db_session, estraneo, make_avatar(), score=6.0, messages=2)

    response = org_admin_client.get(f"/api/admin/users-report/{estraneo.id}")

    assert response.status_code == 404


def test_il_dettaglio_di_un_id_inventato_e_un_404(admin_client):
    response = admin_client.get(f"/api/admin/users-report/{uuid.uuid4()}")

    assert response.status_code == 404


def test_un_utente_normale_non_legge_il_dettaglio_di_nessuno(user_client, standard_user):
    """Nemmeno il proprio: le prove di una persona si leggono dall'area di
    amministrazione, e chi si allena ha le proprie schermate."""
    response = user_client.get(f"/api/admin/users-report/{standard_user.id}")

    assert response.status_code == 403


def test_un_org_admin_non_vede_i_tentativi_di_un_altro_tenant(
    org_admin_client, db_session, organization
):
    """Il confine del tenant vale sui test come su tutto il resto."""
    altrove = Organization(name="Altrove", slug=f"altrove-{uuid.uuid4().hex[:8]}")
    db_session.add(altrove)
    db_session.flush()
    estraneo = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email="estraneo@test.invalid",
        nome="Estraneo",
        cognome="Altrove",
        role_id=ensure_roles(db_session)[ROLE_USER].id,
        organization_id=altrove.id,
    )
    db_session.add(estraneo)
    db_session.flush()
    simulation = _simulation(db_session, organization)
    _attempt(db_session, simulation, estraneo)

    response = org_admin_client.get("/api/admin/users-report")

    assert response.status_code == 200
    assert all(row["id"] != str(estraneo.id) for row in response.json())
    assert all(row["simulation_count"] == 0 for row in response.json())


def test_una_conversazione_si_elimina_con_tutto_quello_che_le_sta_attaccato(
    admin_client, db_session, standard_user, organization, make_avatar
):
    """Se ne va la conversazione e con lei trascrizione, valutazione e
    revisione: quello che resta sarebbe il commento di un docente su qualcosa
    che non si può più rileggere."""
    conversation = _conversation(db_session, standard_user, make_avatar(), score=6.0, messages=4)
    db_session.add(
        ConversationReview(
            conversation_id=conversation.id,
            reviewer_id=standard_user.id,
            summary_note="Da rivedere in aula.",
        )
    )
    db_session.flush()

    response = admin_client.delete(f"/api/admin/conversations/{conversation.id}")

    assert response.status_code == 200
    assert db_session.get(ChatConversation, conversation.id) is None
    assert (
        db_session.query(ChatMessage).filter(ChatMessage.conversation_id == conversation.id).count()
        == 0
    )
    assert (
        db_session.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation.id)
        .count()
        == 0
    )
    riga = _row_of(admin_client.get("/api/admin/users-report"), standard_user)
    assert riga["conversation_count"] == 0


def test_un_org_admin_non_elimina_la_conversazione_di_un_altro_tenant(
    org_admin_client, db_session, make_avatar
):
    """Fuori dal proprio tenant la conversazione non esiste, come il
    tentativo: stessa risposta che riceverebbe per un id inventato."""
    altrove = Organization(name="Altrove", slug=f"altrove-{uuid.uuid4().hex[:8]}")
    db_session.add(altrove)
    db_session.flush()
    estraneo = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email="estraneo3@test.invalid",
        nome="Estraneo",
        cognome="Altrove",
        role_id=ensure_roles(db_session)[ROLE_USER].id,
        organization_id=altrove.id,
    )
    db_session.add(estraneo)
    db_session.flush()
    conversation = _conversation(db_session, estraneo, make_avatar(), score=6.0)

    response = org_admin_client.delete(f"/api/admin/conversations/{conversation.id}")

    assert response.status_code == 404
    assert db_session.get(ChatConversation, conversation.id) is not None


def test_un_utente_normale_non_elimina_conversazioni(
    user_client, db_session, standard_user, make_avatar
):
    """Nemmeno le proprie: cancellarsi lo storico non è un gesto che l'app
    concede a chi si allena."""
    conversation = _conversation(db_session, standard_user, make_avatar(), score=6.0)

    response = user_client.delete(f"/api/admin/conversations/{conversation.id}")

    assert response.status_code == 403
    assert db_session.get(ChatConversation, conversation.id) is not None


def test_un_tentativo_si_elimina_e_la_simulazione_resta(
    admin_client, db_session, standard_user, organization
):
    """Sparisce la fotografia di quelle risposte, non il test: chi lo ha
    aperto per sbaglio deve poterlo togliere e rifarlo."""
    simulation = _simulation(db_session, organization)
    attempt = _attempt(db_session, simulation, standard_user)

    response = admin_client.delete(f"/api/admin/simulation-attempts/{attempt.id}")

    assert response.status_code == 200
    assert db_session.get(SimulationAttempt, attempt.id) is None
    assert db_session.get(TechnicalSimulation, simulation.id) is not None
    assert (
        _row_of(admin_client.get("/api/admin/users-report"), standard_user)["simulation_count"] == 0
    )


def test_un_org_admin_non_elimina_il_tentativo_di_un_altro_tenant(
    org_admin_client, db_session, organization
):
    """Fuori dal proprio tenant il tentativo non esiste, e la risposta è la
    stessa che riceverebbe per un id inventato."""
    altrove = Organization(name="Altrove", slug=f"altrove-{uuid.uuid4().hex[:8]}")
    db_session.add(altrove)
    db_session.flush()
    estraneo = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email="estraneo2@test.invalid",
        nome="Estraneo",
        cognome="Altrove",
        role_id=ensure_roles(db_session)[ROLE_USER].id,
        organization_id=altrove.id,
    )
    db_session.add(estraneo)
    db_session.flush()
    attempt = _attempt(db_session, _simulation(db_session, organization), estraneo)

    response = org_admin_client.delete(f"/api/admin/simulation-attempts/{attempt.id}")

    assert response.status_code == 404
    assert db_session.get(SimulationAttempt, attempt.id) is not None


def test_un_utente_normale_non_elimina_tentativi(
    user_client, db_session, standard_user, organization
):
    attempt = _attempt(db_session, _simulation(db_session, organization), standard_user)

    response = user_client.delete(f"/api/admin/simulation-attempts/{attempt.id}")

    assert response.status_code == 403
    assert db_session.get(SimulationAttempt, attempt.id) is not None
