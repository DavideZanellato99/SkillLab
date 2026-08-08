"""The trainer's review on top of the AI evaluation.

Two things are worth pinning down here. The first is the boundary: a review
is written by the admins of the conversation's own tenant and read by the
student it is about, and nobody else. The second is that a corrected score
IS the grade — these tests follow it out to the student's report, to the
progress of an assigned goal and to the dashboard, because a correction
that stopped at the modal would be decoration.
"""

from io import BytesIO

from pypdf import PdfReader

from models import (
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    MessageAnnotation,
    Organization,
)
from tests.test_training import _make_user_in


def _seed_conversation(db_session, user, avatar, *, score=6.0, evaluated=True):
    conversation = ChatConversation(
        user_id=user.id, avatar_id=avatar.id, title="Clienti 1", mode="text"
    )
    db_session.add(conversation)
    db_session.flush()
    db_session.add_all(
        [
            ChatMessage(conversation_id=conversation.id, role="user", content="Buongiorno."),
            ChatMessage(conversation_id=conversation.id, role="assistant", content="Salve."),
        ]
    )
    if evaluated:
        db_session.add(
            ConversationEvaluation(
                conversation_id=conversation.id,
                overall_score=score,
                result={"summary": "sintesi", "criteria": []},
            )
        )
    db_session.flush()
    return conversation


def _pdf_text(content: bytes) -> str:
    """Il testo di un PDF appena scaricato.

    Un referto che dice "%PDF" e poi è vuoto passerebbe qualunque controllo
    sul tipo del file: quello che va verificato è cosa c'è scritto dentro.
    """
    reader = PdfReader(BytesIO(content))
    return "\n".join(page.extract_text() for page in reader.pages)


def _messages(db_session, conversation):
    return (
        db_session.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )


# ── Nota di sintesi e correzione del voto ─────────────


def test_trainer_writes_a_summary_note(admin_client, db_session, standard_user, make_avatar):
    conversation = _seed_conversation(db_session, standard_user, make_avatar())

    response = admin_client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"summary_note": "Buona apertura, chiusura affrettata."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary_note"] == "Buona apertura, chiusura affrettata."
    assert body["override_score"] is None
    assert body["reviewer_name"] == "Test User"


def test_a_correction_needs_its_reason(admin_client, db_session, standard_user, make_avatar):
    """Correggere la macchina senza dire perché è la scatola nera che questa
    funzione esiste per aprire."""
    conversation = _seed_conversation(db_session, standard_user, make_avatar())

    response = admin_client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"override_score": 8},
    )

    assert response.status_code == 422


def test_a_reason_needs_its_correction(admin_client, db_session, standard_user, make_avatar):
    conversation = _seed_conversation(db_session, standard_user, make_avatar())

    response = admin_client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"override_reason": "Troppo severo."},
    )

    assert response.status_code == 422


def test_an_empty_review_is_refused(admin_client, db_session, standard_user, make_avatar):
    conversation = _seed_conversation(db_session, standard_user, make_avatar())

    response = admin_client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"summary_note": "   "},
    )

    assert response.status_code == 422


def test_the_ai_score_is_snapshotted_and_goes_stale(
    admin_client, db_session, standard_user, make_avatar
):
    """Rigiudicare la conversazione non deve far passare per attuale una
    correzione che parlava di un altro numero."""
    conversation = _seed_conversation(db_session, standard_user, make_avatar(), score=6.0)
    saved = admin_client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"override_score": 8, "override_reason": "Il cliente era ostile."},
    ).json()
    assert saved["ai_score_at_review"] == 6.0
    assert saved["is_stale"] is False

    evaluation = (
        db_session.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id == conversation.id)
        .one()
    )
    evaluation.overall_score = 8.5
    db_session.flush()

    detail = admin_client.get(f"/api/admin/conversations/{conversation.id}").json()
    assert detail["review"]["is_stale"] is True


def test_deleting_the_review_gives_the_ai_verdict_back(
    admin_client, db_session, standard_user, make_avatar
):
    conversation = _seed_conversation(db_session, standard_user, make_avatar(), score=6.0)
    admin_client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"override_score": 9, "override_reason": "Rivalutato in aula."},
    )

    response = admin_client.delete(f"/api/admin/conversations/{conversation.id}/review")

    assert response.status_code == 200
    detail = admin_client.get(f"/api/admin/conversations/{conversation.id}").json()
    assert detail["review"] is None
    assert detail["evaluation"]["final_score"] == 6.0


# ── Annotazioni sui singoli messaggi ──────────────────


def test_annotating_a_message_twice_rewrites_the_note(
    admin_client, db_session, standard_user, make_avatar
):
    """Al massimo una nota per messaggio: annotare di nuovo è modificare."""
    conversation = _seed_conversation(db_session, standard_user, make_avatar())
    message = _messages(db_session, conversation)[0]

    admin_client.put(
        f"/api/admin/conversations/{conversation.id}/annotations",
        json={"message_id": str(message.id), "note": "Manca il nome per intero."},
    )
    second = admin_client.put(
        f"/api/admin/conversations/{conversation.id}/annotations",
        json={"message_id": str(message.id), "note": "Manca anche il cognome."},
    )

    assert second.status_code == 200
    assert second.json()["note"] == "Manca anche il cognome."
    assert db_session.query(MessageAnnotation).count() == 1


def test_only_the_operators_messages_can_be_annotated(
    admin_client, db_session, standard_user, make_avatar
):
    """L'avatar non è sotto esame: un errore innescato da una sua battuta sta
    comunque nella risposta che non l'ha colto."""
    conversation = _seed_conversation(db_session, standard_user, make_avatar())
    avatar_message = next(m for m in _messages(db_session, conversation) if m.role == "assistant")

    response = admin_client.put(
        f"/api/admin/conversations/{conversation.id}/annotations",
        json={"message_id": str(avatar_message.id), "note": "Il cliente qui era di fretta."},
    )

    assert response.status_code == 400
    assert db_session.query(MessageAnnotation).count() == 0


def test_a_message_of_another_conversation_cannot_be_annotated(
    admin_client, db_session, standard_user, make_avatar
):
    avatar = make_avatar()
    conversation = _seed_conversation(db_session, standard_user, avatar)
    other = _seed_conversation(db_session, standard_user, avatar)
    foreign_message = _messages(db_session, other)[0]

    response = admin_client.put(
        f"/api/admin/conversations/{conversation.id}/annotations",
        json={"message_id": str(foreign_message.id), "note": "Nota fuori posto."},
    )

    assert response.status_code == 404


def test_annotations_survive_without_a_review(admin_client, db_session, standard_user, make_avatar):
    """Un docente può passare la trascrizione appuntando note senza scrivere
    una sintesi: quelle note devono comunque arrivare a destinazione."""
    conversation = _seed_conversation(db_session, standard_user, make_avatar())
    message = _messages(db_session, conversation)[0]
    admin_client.put(
        f"/api/admin/conversations/{conversation.id}/annotations",
        json={"message_id": str(message.id), "note": "Qui serviva il codice cliente."},
    )

    detail = admin_client.get(f"/api/admin/conversations/{conversation.id}").json()

    assert detail["review"]["summary_note"] is None
    assert [a["note"] for a in detail["review"]["annotations"]] == [
        "Qui serviva il codice cliente."
    ]


def test_deleting_an_annotation(admin_client, db_session, standard_user, make_avatar):
    conversation = _seed_conversation(db_session, standard_user, make_avatar())
    message = _messages(db_session, conversation)[0]
    created = admin_client.put(
        f"/api/admin/conversations/{conversation.id}/annotations",
        json={"message_id": str(message.id), "note": "Da rivedere."},
    ).json()

    response = admin_client.delete(f"/api/admin/annotations/{created['id']}")

    assert response.status_code == 200
    assert db_session.query(MessageAnnotation).count() == 0


# ── Chi può scrivere e chi può leggere ────────────────


def test_a_student_cannot_review(user_client, db_session, standard_user, make_avatar):
    conversation = _seed_conversation(db_session, standard_user, make_avatar())

    response = user_client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"summary_note": "Mi do 10."},
    )

    assert response.status_code == 403


def test_the_student_reads_the_review_of_their_own_conversation(
    client, act_as, db_session, standard_user, org_admin_user, make_avatar
):
    """Una correzione che lo studente non può leggere non protegge nessuno."""
    conversation = _seed_conversation(db_session, standard_user, make_avatar(), score=6.0)
    message = _messages(db_session, conversation)[0]

    act_as(org_admin_user)
    client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={
            "summary_note": "Ottimo recupero.",
            "override_score": 8,
            "override_reason": "La macchina non ha colto l'ironia del cliente.",
        },
    )
    client.put(
        f"/api/admin/conversations/{conversation.id}/annotations",
        json={"message_id": str(message.id), "note": "Presentazione da rifare."},
    )

    act_as(standard_user)
    evaluation = client.get(f"/api/chat/conversation/{conversation.id}/evaluation").json()
    transcript = client.get(f"/api/chat/conversation/{conversation.id}").json()

    assert evaluation["overall_score"] == 6.0
    assert evaluation["final_score"] == 8.0
    assert evaluation["review"]["override_reason"] == (
        "La macchina non ha colto l'ironia del cliente."
    )
    assert transcript["review"]["annotations"][0]["note"] == "Presentazione da rifare."


def test_an_org_admin_cannot_review_another_tenants_conversation(
    org_admin_client, db_session, make_avatar
):
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_user = _make_user_in(db_session, other)
    foreign_avatar = make_avatar(organization_id=other.id)
    conversation = _seed_conversation(db_session, foreign_user, foreign_avatar)

    response = org_admin_client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"summary_note": "Non sono affari miei."},
    )

    assert response.status_code == 404


def test_an_annotation_of_another_tenant_cannot_be_deleted(
    client, act_as, db_session, org_admin_user, super_admin_user, make_avatar
):
    """L'annotazione si raggiunge per id, quindi il confine passa dalla
    conversazione a cui è appesa."""
    other = Organization(name="Tenant vicino", slug="tenant-vicino")
    db_session.add(other)
    db_session.flush()
    foreign_user = _make_user_in(db_session, other)
    foreign_avatar = make_avatar(organization_id=other.id)
    conversation = _seed_conversation(db_session, foreign_user, foreign_avatar)
    message = _messages(db_session, conversation)[0]

    act_as(super_admin_user)
    created = client.put(
        f"/api/admin/conversations/{conversation.id}/annotations",
        json={"message_id": str(message.id), "note": "Nota di un altro tenant."},
    ).json()

    act_as(org_admin_user)
    response = client.delete(f"/api/admin/annotations/{created['id']}")

    assert response.status_code == 404
    assert db_session.query(MessageAnnotation).count() == 1


# ── Il voto corretto è il voto ────────────────────────


def test_a_corrected_score_passes_a_training_step(
    client, act_as, db_session, standard_user, super_admin_user, make_avatar, make_assigned_path
):
    """Uno studente a cui è stato detto 8 non deve trovare la tappa ancora
    aperta perché la macchina aveva detto 6."""
    avatar = make_avatar()
    make_assigned_path(standard_user, [{"avatar": avatar, "target": 7.0}])
    # Solo le conversazioni aperte dopo l'assegnazione contano
    conversation = _seed_conversation(db_session, standard_user, avatar, score=6.0)
    act_as(super_admin_user)
    assert client.get("/api/training/assignments").json()[0]["status"] == "active"

    client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"override_score": 8, "override_reason": "Valutazione automatica troppo severa."},
    )

    listed = client.get("/api/training/assignments").json()[0]
    assert listed["status"] == "completed"
    assert listed["steps"][0]["best_score"] == 8.0


def test_the_dashboard_reports_the_corrected_score(
    admin_client, db_session, standard_user, make_avatar
):
    conversation = _seed_conversation(db_session, standard_user, make_avatar(), score=6.0)
    admin_client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"override_score": 8.5, "override_reason": "Rivalutato con il tutor."},
    )

    row = admin_client.get("/api/admin/evaluations-report").json()[0]

    assert row["overall_score"] == 8.5
    assert row["ai_overall_score"] == 6.0
    assert row["has_override"] is True


def test_the_previous_attempt_is_compared_at_its_final_score(
    client, act_as, db_session, standard_user, super_admin_user, make_avatar
):
    """Confrontare il voto di oggi con il voto grezzo di ieri inventerebbe un
    progresso che nessuno ha fatto."""
    avatar = make_avatar()
    first = _seed_conversation(db_session, standard_user, avatar, score=5.0)
    second = _seed_conversation(db_session, standard_user, avatar, score=7.0)

    act_as(super_admin_user)
    client.put(
        f"/api/admin/conversations/{first.id}/review",
        json={"override_score": 8, "override_reason": "Il primo tentativo valeva di più."},
    )

    act_as(standard_user)
    evaluation = client.get(f"/api/chat/conversation/{second.id}/evaluation").json()

    assert evaluation["previous"]["conversation_id"] == str(first.id)
    assert evaluation["previous"]["overall_score"] == 8.0


def test_the_pdf_carries_the_correction(
    client, act_as, db_session, standard_user, super_admin_user, make_avatar
):
    conversation = _seed_conversation(db_session, standard_user, make_avatar(), score=6.0)
    message = _messages(db_session, conversation)[0]

    act_as(super_admin_user)
    client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"override_score": 8, "override_reason": "Contesto non colto dalla macchina."},
    )
    client.put(
        f"/api/admin/conversations/{conversation.id}/annotations",
        json={"message_id": str(message.id), "note": "Presentazione incompleta."},
    )

    act_as(standard_user)
    response = client.get(f"/api/chat/conversation/{conversation.id}/evaluation/pdf")
    text = _pdf_text(response.content)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    # Il voto grande e' quello corretto, con quello della macchina accanto:
    # e' il foglio che uno studente porta a una contestazione.
    assert "8,0 / 10" in text
    assert "Contesto non colto dalla macchina." in text
    assert "Presentazione incompleta." in text


def test_the_pdf_carries_the_transcript(user_client, db_session, standard_user, make_avatar):
    """Il giudizio si legge accanto a quello che giudica.

    Le battute di una chiamata arrivano con il tono fra graffe in fondo:
    quello resta fuori, perché sono termini inglesi grezzi in mezzo a una
    trascrizione italiana.
    """
    conversation = _seed_conversation(db_session, standard_user, make_avatar())
    db_session.add(
        ChatMessage(
            conversation_id=conversation.id,
            role="user",
            content="Le controllo subito la pratica. {calmness, slight amusement}",
        )
    )
    db_session.flush()

    response = user_client.get(f"/api/chat/conversation/{conversation.id}/evaluation/pdf")
    text = _pdf_text(response.content)

    assert "TRASCRIZIONE DELLA CONVERSAZIONE" in text
    assert "Buongiorno." in text
    assert "Salve." in text
    assert "Le controllo subito la pratica." in text
    assert "slight amusement" not in text


def test_an_admin_downloads_the_pdf_of_someone_elses_conversation(
    admin_client, db_session, standard_user, make_avatar
):
    """Il referto scaricato dal dettaglio in dashboard è quello dello studente.

    L'admin non è il proprietario della conversazione, quindi l'endpoint
    dello studente gli resterebbe chiuso: passa dal proprio, e il documento
    che ne esce è lo stesso.
    """
    conversation = _seed_conversation(db_session, standard_user, make_avatar())

    response = admin_client.get(f"/api/admin/conversations/{conversation.id}/evaluation/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "valutazione-clienti-1.pdf" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_a_conversation_without_evaluation_has_no_pdf_for_the_admin(
    admin_client, db_session, standard_user, make_avatar
):
    conversation = _seed_conversation(db_session, standard_user, make_avatar(), evaluated=False)

    response = admin_client.get(f"/api/admin/conversations/{conversation.id}/evaluation/pdf")

    assert response.status_code == 404


def test_an_org_admin_cannot_download_another_tenants_pdf(
    org_admin_client, db_session, make_avatar
):
    other = Organization(name="Tenant vicino", slug="tenant-pdf")
    db_session.add(other)
    db_session.flush()
    foreign_user = _make_user_in(db_session, other)
    foreign_avatar = make_avatar(organization_id=other.id)
    conversation = _seed_conversation(db_session, foreign_user, foreign_avatar)

    response = org_admin_client.get(f"/api/admin/conversations/{conversation.id}/evaluation/pdf")

    assert response.status_code == 404


def test_a_student_cannot_use_the_admin_pdf_endpoint(
    user_client, db_session, standard_user, make_avatar
):
    conversation = _seed_conversation(db_session, standard_user, make_avatar())

    response = user_client.get(f"/api/admin/conversations/{conversation.id}/evaluation/pdf")

    assert response.status_code == 403
