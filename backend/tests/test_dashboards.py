"""Le tre dashboard: percorsi, utilizzo e i propri progressi.

Nessuna di loro salva niente: sono aggregati calcolati in lettura sulle
righe che esistono già, quindi qui si fissa la derivazione, che è la parte
che può sbagliare in silenzio. Un tempo di chiusura che conta anche i
percorsi ancora aperti, una organizzazione ferma che sparisce dall'elenco
invece di comparire a zero: sono tutti numeri che si leggono come veri.

Il confine del tenant è quello di sempre e vale anche qui, quindi ogni
sezione ne ha la sua prova.
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


def _naive(moment: datetime) -> datetime:
    return moment.replace(tzinfo=None)


def _now() -> datetime:
    return _naive(datetime.now(UTC))


def _make_user_in(db_session, organization, nome="Utente", cognome="Vicino") -> User:
    """Un account che si allena, dentro `organization`."""
    roles = ensure_roles(db_session)
    user = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@test.invalid",
        nome=nome,
        cognome=cognome,
        role_id=roles[ROLE_USER].id,
        organization_id=organization.id,
    )
    db_session.add(user)
    db_session.flush()
    return user


def _make_simulation(db_session, organization, *, title="Procedure", kind="multiple"):
    simulation = TechnicalSimulation(
        organization_id=organization.id,
        title=title,
        status=SIMULATION_STATUS_PUBLISHED,
        kind=kind,
    )
    db_session.add(simulation)
    db_session.flush()
    return simulation


def _seed_conversation(
    db_session,
    user,
    avatar,
    score,
    *,
    opened_at=None,
    criteria=None,
    mode="text",
    override=None,
    messages=0,
):
    """Una conversazione giudicata, con i voti per criterio se servono."""
    conversation = ChatConversation(
        user_id=user.id,
        avatar_id=avatar.id,
        title="Clienti 1",
        mode=mode,
        created_at=opened_at or _now(),
    )
    db_session.add(conversation)
    db_session.flush()
    db_session.add(
        ConversationEvaluation(
            conversation_id=conversation.id,
            overall_score=score,
            result={
                "summary": "",
                "criteria": [
                    {"key": key, "label": key.title(), "score": voto}
                    for key, voto in (criteria or {}).items()
                ],
            },
        )
    )
    if override is not None:
        db_session.add(
            ConversationReview(
                conversation_id=conversation.id,
                reviewer_id=user.id,
                override_score=override,
            )
        )
    start = conversation.created_at
    for index in range(messages):
        db_session.add(
            ChatMessage(
                conversation_id=conversation.id,
                role="user" if index % 2 == 0 else "assistant",
                content="ciao",
                created_at=start + timedelta(seconds=30 * index),
            )
        )
    db_session.flush()
    return conversation


def _seed_attempt(db_session, user, simulation, score, *, submitted_at=None, answers=None):
    """Un test consegnato che vale `score` in decimi."""
    attempt = SimulationAttempt(
        simulation_id=simulation.id,
        user_id=user.id,
        correct_count=int(score),
        question_count=10,
        earned_points=score,
        answers=answers if answers is not None else [],
        created_at=submitted_at or _now(),
    )
    db_session.add(attempt)
    db_session.flush()
    return attempt


# ── I percorsi ──────────────────────────────────────────


def test_percorsi_contano_gli_stati_e_la_quota_di_chiusura(
    admin_client, db_session, standard_user, organization, make_avatar, make_assigned_path
):
    """Due assegnazioni dello stesso percorso, una chiusa e una no.

    La quota di chiusura è quello che la pagina risponde per primo, e si
    misura sulle assegnazioni: due percorsi affidati e uno chiuso fanno
    cinquanta.
    """
    avatar = make_avatar(name="Mario Rossi")
    altro = _make_user_in(db_session, organization)
    make_assigned_path(standard_user, [{"avatar": avatar, "target": 7.0}])
    make_assigned_path(altro, [{"avatar": avatar, "target": 7.0}], title="Percorso di test")
    _seed_conversation(db_session, standard_user, avatar, 8.0)

    dashboard = admin_client.get("/api/dashboards/paths").json()

    assert dashboard["assignments"] == 2
    assert dashboard["people"] == 2
    assert dashboard["completed"] == 1
    assert dashboard["active"] == 1
    assert dashboard["completion_rate"] == 50.0


def test_il_tempo_di_chiusura_si_misura_sui_soli_percorsi_chiusi(
    admin_client, db_session, standard_user, organization, make_avatar, make_assigned_path
):
    """Un percorso chiuso in tre giorni e uno ancora aperto da dieci.

    La media è tre e non sei e mezzo: su un percorso in corso il conto
    sarebbe "quanti giorni sono passati", che è un'altra cosa e la dice già
    lo stato. E finché nessuno ha chiuso niente resta vuota, non zero.
    """
    avatar = make_avatar(name="Mario Rossi")
    altro = _make_user_in(db_session, organization)
    tre_giorni_fa = _now() - timedelta(days=3)
    make_assigned_path(standard_user, [{"avatar": avatar, "target": 7.0}], created_at=tre_giorni_fa)
    make_assigned_path(
        altro, [{"avatar": avatar, "target": 7.0}], created_at=_now() - timedelta(days=10)
    )

    assert admin_client.get("/api/dashboards/paths").json()["avg_days_to_complete"] is None

    _seed_conversation(db_session, standard_user, avatar, 8.0)

    dashboard = admin_client.get("/api/dashboards/paths").json()

    assert dashboard["completed"] == 1
    assert round(dashboard["avg_days_to_complete"]) == 3


def test_i_percorsi_scaduti_sono_quelli_con_una_tappa_oltre_il_termine(
    admin_client, db_session, standard_user, organization, make_avatar, make_assigned_path
):
    """Il termine passato conta anche su una tappa che il percorso non ha
    ancora aperto: la data sta sul calendario, e il percorso è scaduto con
    lei. Quello senza date resta in corso."""
    primo = make_avatar(name="Mario Rossi")
    secondo = make_avatar(name="Luisa Bianchi")
    altro = _make_user_in(db_session, organization)
    ieri = _now() - timedelta(days=1)
    make_assigned_path(
        standard_user,
        [{"avatar": primo, "target": 7.0}, {"avatar": secondo, "target": 7.0, "due_at": ieri}],
    )
    make_assigned_path(altro, [{"avatar": primo, "target": 7.0}])

    dashboard = admin_client.get("/api/dashboards/paths").json()

    assert dashboard["overdue"] == 1
    assert dashboard["active"] == 1
    assert dashboard["completion_rate"] == 0.0


def test_percorsi_di_un_altro_tenant_non_si_leggono(
    org_admin_client, db_session, standard_user, organization, make_avatar, make_assigned_path
):
    """Il confine di sempre: un org admin conta solo la propria gente."""
    altra = Organization(name="Tenant vicino", slug=f"vicino-{uuid.uuid4()}")
    db_session.add(altra)
    db_session.flush()
    estraneo = _make_user_in(db_session, altra)
    avatar = make_avatar(name="Mario Rossi")
    make_assigned_path(estraneo, [{"avatar": avatar, "target": 7.0}])
    make_assigned_path(standard_user, [{"avatar": avatar, "target": 7.0}])

    dashboard = org_admin_client.get("/api/dashboards/paths").json()

    assert dashboard["assignments"] == 1


# ── L'utilizzo ──────────────────────────────────────────


def test_utilizzo_conta_le_due_forme_separate_e_chi_si_e_allenato(
    admin_client, db_session, standard_user, organization, make_avatar
):
    """Chi ha fatto tutte e due le cose conta una volta sola.

    Le persone attive sono un insieme e non la somma dei due conteggi: la
    stessa persona può aver parlato e consegnato, e sommando comparirebbe
    due volte su un tenant di uno.
    """
    avatar = make_avatar(name="Mario Rossi")
    simulazione = _make_simulation(db_session, organization)
    _seed_conversation(db_session, standard_user, avatar, 7.0, mode="voice", messages=2)
    _seed_conversation(db_session, standard_user, avatar, 7.0, mode="text")
    _seed_attempt(db_session, standard_user, simulazione, 8.0)

    dashboard = admin_client.get("/api/dashboards/usage").json()
    riga = next(
        o for o in dashboard["organizations"] if o["organization_id"] == str(organization.id)
    )

    assert riga["conversations"] == 2
    assert riga["voice_conversations"] == 1
    assert riga["text_conversations"] == 1
    assert riga["attempts"] == 1
    assert riga["active_people"] == 1
    # Gli account che si allenano, cioè quelli con il ruolo `user`: il ruolo
    # non è una colonna di User, e nominarlo direttamente non restringeva
    # niente, quindi qui il conteggio restava a zero mentre le prove c'erano
    assert riga["people"] == 1
    assert riga["total_duration_seconds"] == 30
    assert dashboard["daily"][-1]["conversations"] == 2


def test_una_organizzazione_ferma_compare_a_zero(admin_client, db_session):
    """Una riga a zero è la risposta, non una riga da nascondere.

    Un elenco delle sole organizzazioni attive nasconderebbe esattamente
    quelle che si stanno cercando.
    """
    ferma = Organization(name="Tenant fermo", slug=f"fermo-{uuid.uuid4()}")
    db_session.add(ferma)
    db_session.flush()

    dashboard = admin_client.get("/api/dashboards/usage").json()
    riga = next(o for o in dashboard["organizations"] if o["organization_id"] == str(ferma.id))

    assert riga["conversations"] == 0
    assert riga["attempts"] == 0
    assert riga["active_people"] == 0
    assert riga["last_activity_at"] is None


def test_utilizzo_e_del_solo_super_admin(org_admin_client):
    """La domanda è quali organizzazioni sono ferme, e ne guarda più di una."""
    assert org_admin_client.get("/api/dashboards/usage").status_code == 403


# ── I propri progressi ──────────────────────────────────


def test_i_progressi_sono_i_propri_e_col_voto_corretto(
    user_client, db_session, standard_user, organization, make_avatar
):
    """Il voto è quello che la persona si è vista dare.

    Una curva disegnata sul numero della macchina contraddirebbe la pagella
    che ha in mano.
    """
    avatar = make_avatar(name="Mario Rossi")
    simulazione = _make_simulation(db_session, organization)
    _seed_conversation(
        db_session, standard_user, avatar, 5.0, criteria={"empatia": 6.0}, override=8.0
    )
    _seed_attempt(db_session, standard_user, simulazione, 7.0)
    estraneo = _make_user_in(db_session, organization)
    _seed_conversation(db_session, estraneo, avatar, 9.0)

    progressi = user_client.get("/api/dashboards/me").json()

    assert len(progressi["conversations"]) == 1
    assert progressi["conversations"][0]["score"] == 8.0
    assert progressi["conversations"][0]["has_override"] is True
    assert progressi["conversations"][0]["criteria"] == {"empatia": 6.0}
    assert progressi["criteria_labels"] == {"empatia": "Empatia"}
    assert len(progressi["simulations"]) == 1


def test_i_progressi_non_si_aprono_a_chi_amministra(org_admin_client):
    """Chi amministra non si allena: la sua curva sarebbe vuota per sempre.

    È un 403 e non un elenco vuoto, la stessa risposta della pagina che non
    gli si apre.
    """
    assert org_admin_client.get("/api/dashboards/me").status_code == 403
