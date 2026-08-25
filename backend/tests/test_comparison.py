"""Confronto fra i tentativi di una persona.

Il confine che questi test tengono fermo è duplice: si confronta sempre una
persona sola con se stessa, mai due persone fra loro, e un admin arriva solo
a chi è dentro il proprio tenant. Lo studente, qualunque cosa chieda,
ottiene i propri.
"""

from datetime import UTC, datetime, timedelta

from models import (
    ChatConversation,
    ConversationEvaluation,
    ConversationReview,
    Organization,
    SimulationAttempt,
    TechnicalSimulation,
)
from tests.test_training import _make_user_in


def _attempt(db_session, user, avatar, *, score, title="Clienti 1", days_ago=0):
    conversation = ChatConversation(
        user_id=user.id,
        avatar_id=avatar.id,
        title=title,
        mode="text",
        created_at=(datetime.now(UTC) - timedelta(days=days_ago)).replace(tzinfo=None),
    )
    db_session.add(conversation)
    db_session.flush()
    db_session.add(
        ConversationEvaluation(
            conversation_id=conversation.id,
            overall_score=score,
            result={
                "summary": f"sintesi {title}",
                "criteria": [{"key": "empatia", "label": "Empatia", "weight": 15, "score": score}],
            },
        )
    )
    db_session.flush()
    return conversation


# ── Lo studente ───────────────────────────────────────


def test_a_student_reads_their_own_attempts(user_client, db_session, standard_user, make_avatar):
    avatar = make_avatar(name="Mario Rossi")
    _attempt(db_session, standard_user, avatar, score=5.0, title="Primo", days_ago=10)
    _attempt(db_session, standard_user, avatar, score=8.0, title="Secondo", days_ago=1)

    attempts = user_client.get("/api/comparison/attempts").json()

    # Dal più vecchio: è l'ordine in cui si legge un miglioramento
    assert [a["title"] for a in attempts] == ["Primo", "Secondo"]
    assert [a["final_score"] for a in attempts] == [5.0, 8.0]
    assert attempts[0]["avatar_name"] == "Mario Rossi"
    assert attempts[0]["criteria"][0]["label"] == "Empatia"


def test_a_student_asking_for_someone_else_gets_their_own(
    user_client, db_session, standard_user, org_admin_user, make_avatar
):
    """Non un 403: la risposta a cui ha diritto è la stessa comunque, e un
    rifiuto confermerebbe che quell'id esiste."""
    avatar = make_avatar()
    _attempt(db_session, standard_user, avatar, score=6.0, title="Mio")
    _attempt(db_session, org_admin_user, avatar, score=9.0, title="Di un altro")

    attempts = user_client.get(
        "/api/comparison/attempts", params={"user_id": str(org_admin_user.id)}
    ).json()

    assert [a["title"] for a in attempts] == ["Mio"]


def test_a_student_has_no_user_picker(user_client, db_session, standard_user, make_avatar):
    _attempt(db_session, standard_user, make_avatar(), score=6.0)

    assert user_client.get("/api/comparison/users").json() == []


# ── L'admin ───────────────────────────────────────────


def test_an_admin_opens_a_student_of_its_own_tenant(
    org_admin_client, db_session, standard_user, make_avatar
):
    avatar = make_avatar()
    _attempt(db_session, standard_user, avatar, score=4.0, title="Primo", days_ago=5)
    _attempt(db_session, standard_user, avatar, score=7.0, title="Secondo")

    attempts = org_admin_client.get(
        "/api/comparison/attempts", params={"user_id": str(standard_user.id)}
    ).json()

    assert [a["title"] for a in attempts] == ["Primo", "Secondo"]


def test_the_picker_lists_only_who_has_something_to_compare(
    org_admin_client, db_session, standard_user, organization, make_avatar
):
    _attempt(db_session, standard_user, make_avatar(), score=6.0)
    _make_user_in(db_session, organization)  # nessun tentativo valutato

    users = org_admin_client.get("/api/comparison/users").json()

    assert [u["id"] for u in users] == [str(standard_user.id)]
    assert users[0]["attempts"] == 1


def test_an_admin_cannot_open_another_tenant(org_admin_client, db_session, make_avatar):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_user = _make_user_in(db_session, other)
    _attempt(db_session, foreign_user, make_avatar(organization_id=other.id), score=9.0)

    response = org_admin_client.get(
        "/api/comparison/attempts", params={"user_id": str(foreign_user.id)}
    )

    assert response.status_code == 404


def test_another_tenants_users_are_not_in_the_picker(org_admin_client, db_session, make_avatar):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_user = _make_user_in(db_session, other)
    _attempt(db_session, foreign_user, make_avatar(organization_id=other.id), score=9.0)

    users = org_admin_client.get("/api/comparison/users").json()

    assert str(foreign_user.id) not in [u["id"] for u in users]


def test_the_super_admin_reaches_every_tenant(admin_client, db_session, make_avatar):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_user = _make_user_in(db_session, other)
    _attempt(db_session, foreign_user, make_avatar(organization_id=other.id), score=9.0)

    attempts = admin_client.get(
        "/api/comparison/attempts", params={"user_id": str(foreign_user.id)}
    ).json()

    assert len(attempts) == 1


# ── Il punteggio confrontato è quello che conta ───────


def test_a_corrected_attempt_is_compared_at_the_corrected_score(
    user_client, db_session, standard_user, make_avatar
):
    """Altrimenti il confronto contraddirebbe la pagella che lo studente ha
    in mano."""
    conversation = _attempt(db_session, standard_user, make_avatar(), score=6.0)
    db_session.add(
        ConversationReview(
            conversation_id=conversation.id,
            reviewer_name="Prof Bianchi",
            override_score=9.0,
            override_reason="Contesto non colto dalla macchina.",
            summary_note="Ottimo recupero.",
        )
    )
    db_session.flush()

    attempt = user_client.get("/api/comparison/attempts").json()[0]

    assert attempt["final_score"] == 9.0
    assert attempt["ai_score"] == 6.0
    assert attempt["has_override"] is True
    assert attempt["reviewer_name"] == "Prof Bianchi"
    assert attempt["review_reason"] == "Contesto non colto dalla macchina."
    assert attempt["review_note"] == "Ottimo recupero."


def test_conversations_without_an_evaluation_are_not_attempts(
    user_client, db_session, standard_user, make_avatar
):
    """Non c'è niente da confrontare in una conversazione mai giudicata."""
    conversation = ChatConversation(
        user_id=standard_user.id, avatar_id=make_avatar().id, title="Mai valutata", mode="text"
    )
    db_session.add(conversation)
    db_session.flush()

    assert user_client.get("/api/comparison/attempts").json() == []


def test_comparison_requires_authentication(client):
    assert client.get("/api/comparison/attempts").status_code == 401


# ── I test tecnici, l'altra prova ─────────────────────


def _test_attempt(db_session, user, organization, *, correct, title="Procedure", days_ago=0):
    """Un test consegnato, con la sua fotografia delle risposte."""
    simulation = TechnicalSimulation(
        title=title,
        organization_id=organization.id,
        document_name="procedura.txt",
        document_text="Il testo della procedura.",
    )
    db_session.add(simulation)
    db_session.flush()
    attempt = SimulationAttempt(
        simulation_id=simulation.id,
        user_id=user.id,
        correct_count=correct,
        question_count=2,
        # Risposte istantanee, quindi punto pieno a ognuna: qui si guarda il
        # confronto fra due prove, non la scala del tempo (vedi
        # test_simulation_scoring)
        earned_points=float(correct),
        answers=[
            {
                "question_id": str(simulation.id),
                "position": position,
                "text": f"Domanda {position}?",
                "options": ["A", "B"],
                "selected_option": 0 if position <= correct else 1,
                "correct_option": 0,
                "is_correct": position <= correct,
            }
            for position in (1, 2)
        ],
        created_at=(datetime.now(UTC) - timedelta(days=days_ago)).replace(tzinfo=None),
    )
    db_session.add(attempt)
    db_session.flush()
    return attempt


def test_a_student_reads_their_own_delivered_tests(
    user_client, db_session, standard_user, organization
):
    _test_attempt(db_session, standard_user, organization, correct=1, title="Primo", days_ago=10)
    _test_attempt(db_session, standard_user, organization, correct=2, title="Secondo", days_ago=1)

    attempts = user_client.get("/api/comparison/simulation-attempts").json()

    assert [a["simulation_title"] for a in attempts] == ["Primo", "Secondo"]
    assert [a["score"] for a in attempts] == [5.0, 10.0]
    # Le risposte viaggiano con il tentativo: sono l'unica cosa che rende
    # confrontabili domanda per domanda due prove sullo stesso test
    assert [a["is_correct"] for a in attempts[0]["answers"]] == [True, False]
    assert attempts[0]["answers"][0]["text"] == "Domanda 1?"
    # Tre campi e nessun altro: il confronto disegna un segno verde o rosso
    # per domanda, e cosa fosse stato scelto si legge aprendo il tentativo.
    # La scelta, la risposta giusta e la posizione viaggiavano non lette per
    # ognuno dei tentativi dell elenco
    assert set(attempts[0]["answers"][0]) == {"question_id", "text", "is_correct"}


def test_a_student_asking_for_someone_elses_tests_gets_their_own(
    user_client, db_session, standard_user, org_admin_user, organization
):
    _test_attempt(db_session, standard_user, organization, correct=2, title="Mio")
    _test_attempt(db_session, org_admin_user, organization, correct=1, title="Di un altro")

    attempts = user_client.get(
        "/api/comparison/simulation-attempts", params={"user_id": str(org_admin_user.id)}
    ).json()

    assert [a["simulation_title"] for a in attempts] == ["Mio"]


def test_an_admin_cannot_open_another_tenants_tests(org_admin_client, db_session):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_user = _make_user_in(db_session, other)
    _test_attempt(db_session, foreign_user, other, correct=2)

    response = org_admin_client.get(
        "/api/comparison/simulation-attempts", params={"user_id": str(foreign_user.id)}
    )

    assert response.status_code == 404


def test_the_picker_lists_who_has_only_taken_tests(
    org_admin_client, db_session, standard_user, organization
):
    """Il selettore sta sopra entrambe le linguette: chi ha solo svolto test
    deve poterci finire, o la metà scritta non si aprirebbe su nessuno."""
    _test_attempt(db_session, standard_user, organization, correct=2)

    users = org_admin_client.get("/api/comparison/users").json()

    assert [u["id"] for u in users] == [str(standard_user.id)]
    assert users[0]["attempts"] == 1


def test_the_picker_counts_both_proofs_together(
    org_admin_client, db_session, standard_user, organization, make_avatar
):
    _attempt(db_session, standard_user, make_avatar(), score=6.0)
    _test_attempt(db_session, standard_user, organization, correct=2)

    users = org_admin_client.get("/api/comparison/users").json()

    assert len(users) == 1
    assert users[0]["attempts"] == 2
