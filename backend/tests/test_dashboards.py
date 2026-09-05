"""Le quattro dashboard: percorsi, contenuti, utilizzo e i propri progressi.

Nessuna di loro salva niente: sono aggregati calcolati in lettura sulle
righe che esistono già, quindi qui si fissa la derivazione, che è la parte
che può sbagliare in silenzio. Una tappa contata su chi non l'ha ancora
sbloccata, una organizzazione ferma che sparisce dall'elenco invece di
comparire a zero, una domanda in bianco contata come sbagliata: sono tutti
numeri che si leggono come veri.

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
    TrainingPathAssignment,
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


def test_una_tappa_si_misura_su_chi_ci_e_arrivato(
    admin_client, db_session, standard_user, organization, make_avatar, make_assigned_path
):
    """La seconda tappa la sblocca solo chi ha superato la prima.

    Contarla su tutti gli assegnatari direbbe che non funziona quando invece
    nessuno ci è ancora arrivato, ed è esattamente il numero su cui si
    deciderebbe di riscriverla.
    """
    primo = make_avatar(name="Mario Rossi")
    secondo = make_avatar(name="Luisa Bianchi")
    altro = _make_user_in(db_session, organization)
    steps = [{"avatar": primo, "target": 7.0}, {"avatar": secondo, "target": 7.0}]
    assegnazione = make_assigned_path(standard_user, steps)
    db_session.add(TrainingPathAssignment(path_id=assegnazione.path_id, user_id=altro.id))
    db_session.flush()
    # Solo il primo supera la tappa di apertura
    _seed_conversation(db_session, standard_user, primo, 8.0)

    paths = admin_client.get("/api/dashboards/paths").json()["paths"]

    assert len(paths) == 1
    apertura, seguito = paths[0]["steps"]
    assert apertura["reached"] == 2
    assert apertura["passed"] == 1
    assert seguito["reached"] == 1
    assert seguito["passed"] == 0
    # Nessuno ha ancora fatto niente sulla seconda: il meglio non è zero,
    # è che non c'è
    assert seguito["avg_best_score"] is None


def test_le_scadenze_sono_quelle_della_tappa_aperta(
    admin_client, db_session, standard_user, organization, make_avatar, make_assigned_path
):
    """Una data si legge quando è il turno della sua tappa.

    Quella della tappa ancora chiusa non compare: la data vale, ma su una
    tappa che il percorso non ha aperto non c'è niente da fare. Quella
    passata compare per prima ed è marcata scaduta.
    """
    primo = make_avatar(name="Mario Rossi")
    secondo = make_avatar(name="Luisa Bianchi")
    ieri = _now() - timedelta(days=1)
    fra_una_settimana = _now() + timedelta(days=7)
    make_assigned_path(
        standard_user,
        [
            {"avatar": primo, "target": 7.0, "due_at": ieri},
            {"avatar": secondo, "target": 7.0, "due_at": fra_una_settimana},
        ],
    )

    deadlines = admin_client.get("/api/dashboards/paths").json()["deadlines"]

    assert len(deadlines) == 1
    assert deadlines[0]["step_position"] == 1
    assert deadlines[0]["step_label"] == "Mario Rossi"
    assert deadlines[0]["status"] == "overdue"


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


# ── I contenuti ─────────────────────────────────────────


def test_contenuti_ordinano_dal_piu_duro_e_dicono_il_criterio_debole(
    admin_client, db_session, standard_user, make_avatar
):
    """Il voto medio dice che si va male, il criterio dice su cosa.

    In cima sta l'avatar con la media più bassa, che è quello che si sta
    cercando aprendo questa pagina.
    """
    difficile = make_avatar(name="Cliente Ostile")
    facile = make_avatar(name="Cliente Cortese")
    _seed_conversation(
        db_session, standard_user, difficile, 4.0, criteria={"empatia": 3.0, "chiarezza": 7.0}
    )
    _seed_conversation(
        db_session, standard_user, facile, 9.0, criteria={"empatia": 9.0, "chiarezza": 9.0}
    )

    avatars = admin_client.get("/api/dashboards/content").json()["avatars"]

    assert [a["avatar_name"] for a in avatars] == ["Cliente Ostile", "Cliente Cortese"]
    assert avatars[0]["avg_score"] == 4.0
    assert avatars[0]["below_pass"] == 1
    assert avatars[0]["weakest_criterion_key"] == "empatia"
    assert avatars[0]["weakest_criterion_avg"] == 3.0


def test_un_test_porta_la_quota_di_risposte_esatte(
    admin_client, db_session, standard_user, organization
):
    """Il voto tiene conto anche del tempo, la quota di esatte no.

    Sono due numeri diversi e stanno accanto: un test con voti bassi e
    risposte quasi tutte esatte è cronometrato male, non difficile.
    """
    simulazione = _make_simulation(db_session, organization, title="Cassa")
    _seed_attempt(db_session, standard_user, simulazione, 5.0)
    _seed_attempt(db_session, standard_user, simulazione, 7.0)

    simulazioni = admin_client.get("/api/dashboards/content").json()["simulations"]

    assert len(simulazioni) == 1
    riga = simulazioni[0]
    assert riga["attempts"] == 2
    assert riga["people"] == 1
    assert riga["correct_rate"] == 60.0
    assert riga["below_pass"] == 1


def test_le_domande_si_leggono_una_per_una_dalla_piu_sbagliata(
    admin_client, db_session, standard_user, organization
):
    """Una domanda che sbagliano tutti, in una media di dieci, non si vede.

    Una lasciata in bianco è dentro le volte in cui è stata posta e fuori da
    quelle in cui è stata data giusta: è una domanda a cui non si è saputo
    rispondere, non una domanda mai vista.
    """
    simulazione = _make_simulation(db_session, organization, title="Cassa")
    risposte = [
        {
            "question_id": "q1",
            "position": 1,
            "text": "Quando si apre il fondo cassa?",
            "selected_option": 0,
            "is_correct": True,
            "elapsed_ms": 4000,
        },
        {
            "question_id": "q2",
            "position": 2,
            "text": "Qual è il limite di contante?",
            "selected_option": None,
            "is_correct": False,
            "elapsed_ms": None,
        },
    ]
    _seed_attempt(db_session, standard_user, simulazione, 5.0, answers=risposte)
    _seed_attempt(db_session, standard_user, simulazione, 5.0, answers=risposte)

    report = admin_client.get(f"/api/dashboards/content/simulations/{simulazione.id}").json()

    assert report["attempts"] == 2
    prima, seconda = report["items"]
    assert prima["question_id"] == "q2"
    assert prima["correct_rate"] == 0.0
    assert prima["unanswered"] == 2
    assert seconda["correct_rate"] == 100.0
    assert seconda["avg_seconds"] == 4.0


def test_le_domande_di_un_test_di_un_altro_tenant_non_esistono(org_admin_client, db_session):
    """Fuori dal proprio tenant un test è lo stesso niente dell'elenco."""
    altra = Organization(name="Tenant vicino", slug=f"vicino-{uuid.uuid4()}")
    db_session.add(altra)
    db_session.flush()
    simulazione = _make_simulation(db_session, altra, title="Riservato")

    risposta = org_admin_client.get(f"/api/dashboards/content/simulations/{simulazione.id}")

    assert risposta.status_code == 404


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
