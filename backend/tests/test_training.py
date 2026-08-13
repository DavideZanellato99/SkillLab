"""Percorsi di training: come si compongono e come si percorrono.

Niente di quello che questi test controllano è salvato: lo stato di una
tappa e quello del percorso si ricavano a ogni lettura. Quindi qui si
fissa la derivazione, che è la parte che può sbagliare in silenzio: la fila
si apre una tappa per volta, contano solo le prove svolte dopo lo sblocco,
la scadenza invece sta sul calendario e passa anche a tappa chiusa, e una
tappa si supera parlando con un avatar o consegnando un test a seconda di
come è fatta.
"""

import uuid
from datetime import UTC, datetime, timedelta, timezone

from auth_dependency import ensure_roles
from models import (
    ROLE_USER,
    SIMULATION_STATUS_DRAFT,
    SIMULATION_STATUS_PUBLISHED,
    ChatConversation,
    ConversationEvaluation,
    Organization,
    SimulationAttempt,
    TechnicalSimulation,
    TrainingPath,
    TrainingPathAssignment,
    TrainingPathStep,
    User,
)


def _make_user_in(db_session, organization) -> User:
    """Un utente semplice di `organization`.

    La factory del conftest costruisce solo utenti del tenant del test, e
    quello che i test sul confine vogliono è esattamente qualcuno dall'altra
    parte.
    """
    roles = ensure_roles(db_session)
    user = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@test.invalid",
        nome="Utente",
        cognome="Vicino",
        role_id=roles[ROLE_USER].id,
        organization_id=organization.id,
    )
    db_session.add(user)
    db_session.flush()
    return user


def _make_simulation(
    db_session, organization, *, status=SIMULATION_STATUS_PUBLISHED, title="Procedure"
):
    simulation = TechnicalSimulation(
        organization_id=organization.id,
        title=title,
        status=status,
        kind="multiple",
    )
    db_session.add(simulation)
    db_session.flush()
    return simulation


def _seed_evaluated_conversation(db_session, user, avatar, score, opened_at=None):
    conversation = ChatConversation(
        user_id=user.id,
        avatar_id=avatar.id,
        title="Clienti 1",
        mode="text",
        created_at=opened_at or datetime.now(UTC),
    )
    db_session.add(conversation)
    db_session.flush()
    db_session.add(
        ConversationEvaluation(
            conversation_id=conversation.id,
            overall_score=score,
            result={"summary": "", "criteria": []},
        )
    )
    db_session.flush()
    return conversation


def _seed_simulation_attempt(db_session, user, simulation, score, submitted_at=None):
    """Un test consegnato che vale `score` in decimi.

    Il voto si ricava dai punti sulle domande (vedi ``simulation_scoring``):
    dieci domande e un punto pieno ciascuna fanno dieci, quindi i punti
    sono il voto stesso.
    """
    attempt = SimulationAttempt(
        simulation_id=simulation.id,
        user_id=user.id,
        correct_count=int(score),
        question_count=10,
        earned_points=score,
        answers=[],
        created_at=submitted_at or datetime.now(UTC),
    )
    db_session.add(attempt)
    db_session.flush()
    return attempt


def _in(days: float) -> str:
    """Una scadenza a distanza di giorni da adesso, come la manda il browser.

    Con il fuso attaccato, che è la forma in cui arriva davvero: il server
    lo toglie riportando il momento a UTC (vedi ``TrainingPathStepInput``).
    """
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def _avatar_step(avatar, target=7.0, due_at=None) -> dict:
    step = {"avatar_id": str(avatar.id), "target_score": target}
    if due_at is not None:
        step["due_at"] = due_at
    return step


def _simulation_step(simulation, target=6.0, due_at=None) -> dict:
    step = {"simulation_id": str(simulation.id), "target_score": target}
    if due_at is not None:
        step["due_at"] = due_at
    return step


def _create_path(admin_client, organization, steps, title="Onboarding") -> dict:
    response = admin_client.post(
        "/api/training/paths",
        json={
            "title": title,
            "organization_id": str(organization.id),
            "steps": steps,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _assign(admin_client, path, user) -> dict:
    response = admin_client.post(
        "/api/training/assignments",
        json={"path_id": path["id"], "user_ids": [str(user.id)]},
    )
    assert response.status_code == 201, response.text
    return response.json()[0]


def _reload(admin_client, assignment_id) -> dict:
    listed = admin_client.get("/api/training/assignments").json()
    return next(a for a in listed if a["id"] == assignment_id)


# ── Comporre un percorso ──────────────────────────────


def test_a_path_keeps_its_steps_in_order(admin_client, db_session, organization, make_avatar):
    avatar = make_avatar(category="clienti")
    simulation = _make_simulation(db_session, organization)

    path = _create_path(
        admin_client,
        organization,
        [_avatar_step(avatar, 7.0), _simulation_step(simulation, 6.0)],
    )

    assert [s["position"] for s in path["steps"]] == [1, 2]
    assert path["steps"][0]["kind"] == "avatar"
    assert path["steps"][0]["avatar_name"] == avatar.name
    assert path["steps"][1]["kind"] == "simulation"
    assert path["steps"][1]["simulation_title"] == simulation.title


def test_a_step_targets_one_thing_and_only_one(admin_client, db_session, organization, make_avatar):
    """Un avatar oppure un test: le due colonne sono alternative."""
    avatar = make_avatar(category="clienti")
    simulation = _make_simulation(db_session, organization)

    both = admin_client.post(
        "/api/training/paths",
        json={
            "title": "Confuso",
            "organization_id": str(organization.id),
            "steps": [
                {
                    "avatar_id": str(avatar.id),
                    "simulation_id": str(simulation.id),
                    "target_score": 7,
                }
            ],
        },
    )
    neither = admin_client.post(
        "/api/training/paths",
        json={
            "title": "Vuoto",
            "organization_id": str(organization.id),
            "steps": [{"target_score": 7}],
        },
    )

    assert both.status_code == 422
    assert neither.status_code == 422


def test_a_draft_simulation_cannot_become_a_step(admin_client, db_session, organization):
    """Nessuno potrebbe superarla, e bloccherebbe tutte le tappe dopo.

    Conflitto e non "non trovata": la bozza esiste, chi compone il percorso
    la sta guardando nel proprio pannello, semplicemente non è ancora
    qualcosa che si possa svolgere.
    """
    draft = _make_simulation(db_session, organization, status=SIMULATION_STATUS_DRAFT)

    response = admin_client.post(
        "/api/training/paths",
        json={
            "title": "Con una bozza",
            "organization_id": str(organization.id),
            "steps": [_simulation_step(draft)],
        },
    )

    assert response.status_code == 409


def test_an_archived_avatar_cannot_become_a_step(
    admin_client, db_session, organization, make_avatar
):
    avatar = make_avatar(category="clienti")
    avatar.deleted_at = datetime.now(UTC)
    db_session.flush()

    response = admin_client.post(
        "/api/training/paths",
        json={
            "title": "Con un archiviato",
            "organization_id": str(organization.id),
            "steps": [_avatar_step(avatar)],
        },
    )

    assert response.status_code == 409


def test_rewriting_a_path_replaces_its_steps(admin_client, db_session, organization, make_avatar):
    """Le tappe si mandano intere: è anche così che si riordinano."""
    first = make_avatar(name="Mario Rossi", category="clienti")
    second = make_avatar(name="Luisa Bianchi", category="clienti")
    path = _create_path(admin_client, organization, [_avatar_step(first), _avatar_step(second)])

    response = admin_client.put(
        f"/api/training/paths/{path['id']}",
        json={
            "title": "Onboarding rivisto",
            "steps": [_avatar_step(second, 8.0), _avatar_step(first, 6.0)],
        },
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "Onboarding rivisto"
    assert [s["avatar_name"] for s in updated["steps"]] == [second.name, first.name]
    assert db_session.query(TrainingPathStep).count() == 2


def test_a_path_needs_at_least_one_step(admin_client, organization):
    response = admin_client.post(
        "/api/training/paths",
        json={"title": "Vuoto", "organization_id": str(organization.id), "steps": []},
    )

    assert response.status_code == 422


def test_deleting_a_path_takes_its_assignments(
    admin_client, db_session, organization, standard_user, make_avatar
):
    avatar = make_avatar(category="clienti")
    path = _create_path(admin_client, organization, [_avatar_step(avatar)])
    _assign(admin_client, path, standard_user)

    response = admin_client.delete(f"/api/training/paths/{path['id']}")

    assert response.status_code == 200
    assert db_session.query(TrainingPath).count() == 0
    assert db_session.query(TrainingPathAssignment).count() == 0


# ── La fila che si apre una tappa per volta ───────────


def test_only_the_first_step_starts_unlocked(
    admin_client, db_session, organization, standard_user, make_avatar
):
    first = make_avatar(name="Mario Rossi", category="clienti")
    second = make_avatar(name="Luisa Bianchi", category="clienti")
    path = _create_path(admin_client, organization, [_avatar_step(first), _avatar_step(second)])

    created = _assign(admin_client, path, standard_user)

    assert [s["status"] for s in created["steps"]] == ["active", "locked"]
    assert created["status"] == "active"
    assert created["current_position"] == 1
    assert created["completed_steps"] == 0


def test_passing_a_step_unlocks_the_next(
    admin_client, db_session, organization, standard_user, make_avatar
):
    first = make_avatar(name="Mario Rossi", category="clienti")
    second = make_avatar(name="Luisa Bianchi", category="clienti")
    path = _create_path(admin_client, organization, [_avatar_step(first), _avatar_step(second)])
    created = _assign(admin_client, path, standard_user)

    _seed_evaluated_conversation(db_session, standard_user, first, 7.5)
    listed = _reload(admin_client, created["id"])

    assert [s["status"] for s in listed["steps"]] == ["completed", "active"]
    assert listed["current_position"] == 2
    assert listed["completed_steps"] == 1
    assert listed["steps"][1]["unlocked_at"] is not None


def test_work_done_while_a_step_was_locked_does_not_pass_it(
    admin_client, db_session, organization, standard_user, make_avatar
):
    """La tappa due conta dal proprio sblocco, non dall'assegnazione.

    È la stessa regola che teneva fuori l'allenamento precedente a un
    obiettivo, applicata al momento in cui la tappa si apre davvero.
    """
    first = make_avatar(name="Mario Rossi", category="clienti")
    second = make_avatar(name="Luisa Bianchi", category="clienti")
    path = _create_path(admin_client, organization, [_avatar_step(first), _avatar_step(second)])
    created = _assign(admin_client, path, standard_user)

    # Ottima conversazione con l'avatar della seconda tappa, mentre era
    # ancora chiusa
    _seed_evaluated_conversation(db_session, standard_user, second, 9.0)
    # E solo dopo si supera la prima
    _seed_evaluated_conversation(db_session, standard_user, first, 7.5)

    listed = _reload(admin_client, created["id"])

    assert listed["steps"][1]["status"] == "active"
    assert listed["steps"][1]["attempts"] == 0
    assert listed["steps"][1]["best_score"] is None
    assert listed["current_position"] == 2


def test_a_simulation_step_is_passed_by_an_attempt(
    admin_client, db_session, organization, standard_user, make_avatar
):
    avatar = make_avatar(category="clienti")
    simulation = _make_simulation(db_session, organization)
    path = _create_path(
        admin_client,
        organization,
        [_avatar_step(avatar, 7.0), _simulation_step(simulation, 6.0)],
    )
    created = _assign(admin_client, path, standard_user)
    _seed_evaluated_conversation(db_session, standard_user, avatar, 7.5)

    _seed_simulation_attempt(db_session, standard_user, simulation, 8.0)
    listed = _reload(admin_client, created["id"])

    assert [s["status"] for s in listed["steps"]] == ["completed", "completed"]
    assert listed["status"] == "completed"
    assert listed["current_position"] is None
    assert listed["steps"][1]["best_score"] == 8.0


def test_a_below_target_proof_counts_without_passing(
    admin_client, db_session, organization, standard_user, make_avatar
):
    avatar = make_avatar(category="clienti")
    path = _create_path(admin_client, organization, [_avatar_step(avatar, 7.0)])
    created = _assign(admin_client, path, standard_user)

    _seed_evaluated_conversation(db_session, standard_user, avatar, 6.0)
    listed = _reload(admin_client, created["id"])

    assert listed["steps"][0]["status"] == "active"
    assert listed["steps"][0]["attempts"] == 1
    assert listed["steps"][0]["best_score"] == 6.0


# ── La scadenza, che sta sul calendario ───────────────


def test_the_date_is_read_back_in_utc(admin_client, organization, make_avatar):
    """Il browser manda l'ora del proprio fuso, la colonna la tiene in UTC.

    Senza il passaggio, chi compone il percorso da Roma alle 18 scriverebbe
    18 anche nella colonna, e la tappa scadrebbe due ore dopo il momento che
    ha scelto.
    """
    wanted = datetime.now(UTC) + timedelta(days=3)
    rome = wanted.astimezone(timezone(timedelta(hours=2)))

    path = _create_path(
        admin_client,
        organization,
        [_avatar_step(make_avatar(category="clienti"), 7.0, rome.isoformat())],
    )

    stored = datetime.fromisoformat(path["steps"][0]["due_at"]).replace(tzinfo=UTC)
    assert abs((stored - wanted).total_seconds()) < 1


def test_a_step_keeps_its_date_while_it_is_still_locked(
    admin_client, db_session, organization, standard_user, make_avatar
):
    """La data è scritta sulla tappa, non ricavata dal suo sblocco.

    Quindi si legge da subito, uguale per chiunque percorra il percorso, e
    non aspetta che la tappa prima sia stata superata.
    """
    first = make_avatar(name="Mario Rossi", category="clienti")
    second = make_avatar(name="Luisa Bianchi", category="clienti")
    path = _create_path(
        admin_client,
        organization,
        [_avatar_step(first, 7.0), _avatar_step(second, 7.0, _in(5))],
    )
    created = _assign(admin_client, path, standard_user)

    assert created["steps"][1]["status"] == "locked"
    assert created["steps"][1]["unlocked_at"] is None
    assert created["steps"][1]["due_at"] == path["steps"][1]["due_at"]


def test_a_locked_step_past_its_date_is_overdue_without_opening(
    admin_client, db_session, organization, standard_user, make_avatar
):
    """Scaduta è una cosa, aperta è un'altra.

    Lo stato dice se la tappa è in tempo, e una data passata è un ritardo
    vero anche su una tappa a cui non si è arrivati. Che non si possa
    ancora cominciare lo dice lo sblocco, che resta vuoto, e il percorso
    indica come tappa corrente sempre la prima non superata.
    """
    first = make_avatar(name="Mario Rossi", category="clienti")
    second = make_avatar(name="Luisa Bianchi", category="clienti")
    path = _create_path(
        admin_client,
        organization,
        [_avatar_step(first, 7.0), _avatar_step(second, 7.0, _in(-1))],
    )

    created = _assign(admin_client, path, standard_user)

    assert [s["status"] for s in created["steps"]] == ["active", "overdue"]
    assert created["steps"][1]["unlocked_at"] is None
    assert created["steps"][1]["attempts"] == 0
    assert created["status"] == "overdue"
    assert created["current_position"] == 1


def test_an_expired_step_is_overdue_and_so_is_its_path(
    admin_client, db_session, organization, standard_user, make_avatar
):
    avatar = make_avatar(category="clienti")
    path = _create_path(admin_client, organization, [_avatar_step(avatar, 9.5, _in(-1))])

    created = _assign(admin_client, path, standard_user)
    assert created["steps"][0]["status"] == "overdue"
    assert created["status"] == "overdue"

    # Raggiunto dopo la scadenza: chiuso, ma in ritardo, e il percorso lo dice
    _seed_evaluated_conversation(db_session, standard_user, avatar, 9.6)
    listed = _reload(admin_client, created["id"])
    assert listed["steps"][0]["status"] == "completed_late"
    assert listed["status"] == "completed_late"


# ── Chi vede cosa ─────────────────────────────────────


def test_user_sees_own_paths_only(
    user_client, db_session, organization, standard_user, make_avatar
):
    # Seminato a mano: user_client e admin_client non possono convivere in un
    # test, si contendono lo stesso override di get_current_user
    avatar = make_avatar(category="clienti")
    path = TrainingPath(organization_id=organization.id, title="Onboarding")
    path.steps = [TrainingPathStep(position=1, avatar_id=avatar.id, target_score=7.0)]
    db_session.add(path)
    db_session.flush()
    db_session.add(TrainingPathAssignment(path_id=path.id, user_id=standard_user.id))
    db_session.flush()

    mine = user_client.get("/api/training/assignments/me").json()

    assert len(mine) == 1
    assert mine[0]["path_title"] == "Onboarding"
    assert mine[0]["steps"][0]["avatar_id"] == str(avatar.id)
    assert mine[0]["steps"][0]["status"] == "active"


def test_user_sees_who_assigned_the_path(
    user_client, db_session, standard_user, org_admin_user, make_avatar, make_assigned_path
):
    """Il percorso porta la firma di chi l'ha affidato, e sopravvive alla sua cancellazione.

    Un percorso che compare da solo nella pagina di chi si allena non dice a
    chi chiedere: il nome è quello che lo rende un incarico invece di un
    compito comparso dal nulla. Senza più quell'account resta comunque il
    percorso, quindi il campo torna vuoto invece di far fallire la risposta.
    """
    org_admin_user.nome, org_admin_user.cognome = "Anna", "Bianchi"
    make_assigned_path(
        standard_user,
        [{"avatar": make_avatar(category="clienti"), "target": 7.0}],
        assigned_by=org_admin_user,
    )

    mine = user_client.get("/api/training/assignments/me").json()
    assert mine[0]["assigned_by_name"] == "Anna Bianchi"

    db_session.query(TrainingPathAssignment).one().assigned_by_id = None
    db_session.flush()

    mine = user_client.get("/api/training/assignments/me").json()
    assert mine[0]["assigned_by_name"] is None


def test_the_paths_of_a_user_are_closed_to_an_admin(org_admin_client):
    """Il rovescio del test qui sotto: la sezione di chi si allena non è di
    chi amministra. Un 403 e non una lista vuota, così la risposta del
    server dice la stessa cosa della pagina che non gli si apre."""
    assert org_admin_client.get("/api/training/assignments/me").status_code == 403


def test_the_paths_of_a_user_are_closed_to_the_super_admin(admin_client):
    assert admin_client.get("/api/training/assignments/me").status_code == 403


def test_composing_and_assigning_are_admin_only(user_client, organization, standard_user):
    composed = user_client.post(
        "/api/training/paths",
        json={"title": "Mio", "organization_id": str(organization.id), "steps": []},
    )
    assigned = user_client.post(
        "/api/training/assignments",
        json={"path_id": str(uuid.uuid4()), "user_ids": [str(standard_user.id)]},
    )

    assert composed.status_code == 403
    assert assigned.status_code == 403


def test_a_path_lands_only_on_users_of_its_organization(
    admin_client, db_session, organization, super_admin_user, make_avatar
):
    """Il super admin non appartiene a nessun tenant, quindi non lo riceve."""
    avatar = make_avatar(category="clienti")
    path = _create_path(admin_client, organization, [_avatar_step(avatar)])

    response = admin_client.post(
        "/api/training/assignments",
        json={"path_id": path["id"], "user_ids": [str(super_admin_user.id)]},
    )

    assert response.status_code == 400


def test_assigning_twice_leaves_the_existing_one_alone(
    admin_client, db_session, organization, standard_user, make_avatar
):
    """Selezionare tutta l'organizzazione è il gesto normale: chi ce l'ha già
    non deve far fallire la richiesta per tutti gli altri."""
    avatar = make_avatar(category="clienti")
    path = _create_path(admin_client, organization, [_avatar_step(avatar)])
    _assign(admin_client, path, standard_user)
    newcomer = _make_user_in(db_session, organization)

    response = admin_client.post(
        "/api/training/assignments",
        json={"path_id": path["id"], "user_ids": [str(standard_user.id), str(newcomer.id)]},
    )

    assert response.status_code == 201
    assert [a["user_id"] for a in response.json()] == [str(newcomer.id)]
    assert db_session.query(TrainingPathAssignment).count() == 2


def test_withdrawing_a_path_leaves_the_proofs_alone(
    admin_client, db_session, organization, standard_user, make_avatar
):
    avatar = make_avatar(category="clienti")
    path = _create_path(admin_client, organization, [_avatar_step(avatar)])
    created = _assign(admin_client, path, standard_user)
    _seed_evaluated_conversation(db_session, standard_user, avatar, 8.0)

    response = admin_client.delete(f"/api/training/assignments/{created['id']}")

    assert response.status_code == 200
    assert db_session.query(TrainingPathAssignment).count() == 0
    assert db_session.query(ChatConversation).count() == 1


# ── Di cosa può essere fatta una tappa ────────────────


def test_assignable_content_is_the_tenant_active_material(
    admin_client, db_session, organization, make_avatar
):
    avatar = make_avatar(category="clienti")
    published = _make_simulation(db_session, organization, title="Procedure")
    _make_simulation(db_session, organization, status=SIMULATION_STATUS_DRAFT, title="Bozza")
    archived = make_avatar(name="Archiviato", category="clienti")
    archived.deleted_at = datetime.now(UTC)
    db_session.flush()

    response = admin_client.get(
        "/api/training/assignable-content", params={"organization_id": str(organization.id)}
    )

    assert response.status_code == 200
    body = response.json()
    assert [a["id"] for a in body["avatars"]] == [str(avatar.id)]
    assert [s["id"] for s in body["simulations"]] == [str(published.id)]


def test_assignable_content_of_another_tenant_is_empty(admin_client, db_session, organization):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()

    response = admin_client.get(
        "/api/training/assignable-content", params={"organization_id": str(other.id)}
    )

    assert response.json() == {"avatars": [], "simulations": []}


# ── Chi può ricevere un percorso ──────────────────────
#
# L'endpoint che alimenta il selettore vive accanto alla validazione che
# rifiuta l'assegnazione: questi test tengono le due definizioni allineate.


def test_assignable_users_are_the_active_ones_of_the_tenant(
    admin_client, db_session, standard_user, organization
):
    response = admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(organization.id)}
    )

    assert response.status_code == 200
    assert [u["id"] for u in response.json()] == [str(standard_user.id)]


def test_a_suspended_account_cannot_receive_a_path(
    admin_client, db_session, standard_user, organization
):
    """Non potrebbe nemmeno accedere per percorrerlo."""
    standard_user.status = "suspended"
    db_session.flush()

    response = admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(organization.id)}
    )

    assert response.status_code == 200
    assert response.json() == []


def test_the_super_admin_is_never_assignable(
    admin_client, super_admin_user, standard_user, organization
):
    """Sta sopra i tenant, quindi non appartiene a quello del percorso: è la
    stessa ragione per cui assign_path lo rifiuta."""
    response = admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(organization.id)}
    )

    assert str(super_admin_user.id) not in [u["id"] for u in response.json()]


def test_an_organization_admin_is_never_assignable(
    admin_client, org_admin_user, standard_user, organization
):
    """Chi amministra compone i percorsi e non li riceve: la sezione dove si
    percorrono il suo ruolo non la apre, quindi affidargliene uno sarebbe un
    incarico che nessuno può svolgere. Il selettore lo dice e ``assign_path``
    lo rifiuta."""
    listed = admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(organization.id)}
    ).json()

    assert [u["id"] for u in listed] == [str(standard_user.id)]
    assert str(org_admin_user.id) not in [u["id"] for u in listed]


def test_a_path_cannot_be_assigned_to_an_admin(
    admin_client, organization, org_admin_user, make_avatar
):
    path = _create_path(admin_client, organization, [_avatar_step(make_avatar(category="clienti"))])

    response = admin_client.post(
        "/api/training/assignments",
        json={"path_id": path["id"], "user_ids": [str(org_admin_user.id)]},
    )

    assert response.status_code == 400
    assert admin_client.get("/api/training/assignments").json() == []


def test_assignable_users_of_another_tenant_are_not_listed(
    admin_client, db_session, standard_user, organization
):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()

    response = admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(other.id)}
    )

    assert response.status_code == 200
    assert response.json() == []


def test_assignable_users_is_admin_only(user_client, organization):
    response = user_client.get(
        "/api/training/assignable-users", params={"organization_id": str(organization.id)}
    )

    assert response.status_code == 403


def test_the_super_admin_must_name_an_organization(admin_client):
    """Sta sopra i tenant: senza organizzazione la domanda non ha risposta."""
    assert admin_client.get("/api/training/assignable-users").status_code == 400
    assert admin_client.get("/api/training/assignable-content").status_code == 400
    assert (
        admin_client.post("/api/training/paths", json={"title": "Senza", "steps": []}).status_code
        == 422
    )


# ── L'organization admin resta nel proprio tenant ─────
#
# È il professore dei suoi studenti: compone e affida i percorsi senza
# passare dal super admin. Il confine è il tenant, e passa dalle tappe: può
# puntare solo alla roba propria, e un percorso atterra sempre su utenti
# della sua organizzazione.


def test_org_admin_composes_in_its_own_organization(
    org_admin_client, db_session, organization, standard_user, make_avatar
):
    """Il tenant non lo nomina: glielo impone il server."""
    avatar = make_avatar(category="clienti")

    response = org_admin_client.post(
        "/api/training/paths",
        json={"title": "Onboarding", "steps": [_avatar_step(avatar)]},
    )

    assert response.status_code == 201
    assert response.json()["organization_id"] == str(organization.id)


def test_org_admin_cannot_use_an_avatar_of_another_tenant(
    org_admin_client, db_session, make_avatar
):
    """L'avatar di un altro tenant non esiste, per questo admin."""
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_avatar = make_avatar(category="clienti", organization_id=other.id)

    response = org_admin_client.post(
        "/api/training/paths",
        json={"title": "Fuori casa", "steps": [_avatar_step(foreign_avatar)]},
    )

    assert response.status_code == 404


def test_org_admin_assignable_users_ignore_the_requested_tenant(
    org_admin_client, db_session, standard_user, organization
):
    """Il tenant lo impone il server: chiederne un altro non lo cambia."""
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_user = _make_user_in(db_session, other)

    forced = org_admin_client.get(
        "/api/training/assignable-users", params={"organization_id": str(other.id)}
    )
    implicit = org_admin_client.get("/api/training/assignable-users")

    assert forced.status_code == 200
    returned = [u["id"] for u in forced.json()]
    assert str(standard_user.id) in returned
    assert str(foreign_user.id) not in returned
    assert implicit.json() == forced.json()


def test_org_admin_cannot_touch_a_path_of_another_tenant(org_admin_client, db_session, make_avatar):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_avatar = make_avatar(category="clienti", organization_id=other.id)
    path = TrainingPath(organization_id=other.id, title="Loro")
    path.steps = [TrainingPathStep(position=1, avatar_id=foreign_avatar.id, target_score=7.0)]
    db_session.add(path)
    db_session.flush()

    listed = org_admin_client.get("/api/training/paths").json()
    deleted = org_admin_client.delete(f"/api/training/paths/{path.id}")

    assert listed == []
    assert deleted.status_code == 404
    assert db_session.query(TrainingPath).count() == 1


def test_org_admin_cannot_withdraw_a_path_of_another_tenant(
    org_admin_client, db_session, make_avatar
):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_avatar = make_avatar(category="clienti", organization_id=other.id)
    foreign_user = _make_user_in(db_session, other)
    path = TrainingPath(organization_id=other.id, title="Loro")
    path.steps = [TrainingPathStep(position=1, avatar_id=foreign_avatar.id, target_score=7.0)]
    db_session.add(path)
    db_session.flush()
    assignment = TrainingPathAssignment(path_id=path.id, user_id=foreign_user.id)
    db_session.add(assignment)
    db_session.flush()

    response = org_admin_client.delete(f"/api/training/assignments/{assignment.id}")

    assert response.status_code == 404
    assert db_session.query(TrainingPathAssignment).count() == 1


def test_org_admin_assigns_and_withdraws_for_its_own_users(
    org_admin_client, db_session, organization, standard_user, make_avatar
):
    avatar = make_avatar(category="clienti")
    path = org_admin_client.post(
        "/api/training/paths",
        json={"title": "Onboarding", "steps": [_avatar_step(avatar)]},
    ).json()

    created = _assign(org_admin_client, path, standard_user)
    assert db_session.query(TrainingPathAssignment).one().assigned_by_id is not None

    response = org_admin_client.delete(f"/api/training/assignments/{created['id']}")
    assert response.status_code == 200
    assert db_session.query(TrainingPathAssignment).count() == 0
