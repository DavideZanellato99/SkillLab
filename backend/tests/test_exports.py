"""Export endpoints: the evaluations report as a formatted .xlsx.

The PDF of a single evaluation is covered in test_chat.py, next to the
rest of the conversation lifecycle it belongs to.
"""

from io import BytesIO

from openpyxl import load_workbook

from models import ChatConversation, ConversationEvaluation


def _seed_evaluated_conversation(db_session, user, avatar) -> ChatConversation:
    conversation = ChatConversation(
        user_id=user.id, avatar_id=avatar.id, title="Clienti 1", mode="voice"
    )
    db_session.add(conversation)
    db_session.flush()
    db_session.add(
        ConversationEvaluation(
            conversation_id=conversation.id,
            overall_score=7.5,
            result={
                "summary": "sintesi",
                "criteria": [
                    {
                        "key": "empatia",
                        "label": "Empatia",
                        "weight": 15,
                        "score": 7.5,
                        "comment": "",
                        "suggestions": None,
                    }
                ],
            },
        )
    )
    db_session.flush()
    return conversation


def test_evaluations_report_xlsx(admin_client, db_session, standard_user, make_avatar):
    avatar = make_avatar(category="clienti")
    _seed_evaluated_conversation(db_session, standard_user, avatar)

    response = admin_client.get("/api/admin/evaluations-report/export")
    assert response.status_code == 200
    assert "spreadsheetml" in response.headers["content-type"]
    assert ".xlsx" in response.headers["content-disposition"]

    sheet = load_workbook(BytesIO(response.content))["Valutazioni"]
    header = [cell.value for cell in sheet[1]]
    assert header[:7] == [
        "Data",
        "Conversazione",
        "Canale",
        "Operatore",
        "Email",
        "Organizzazione",
        "Avatar",
    ]
    assert header[-4:] == ["Voto", "Voto AI", "Revisione", "Valutata il"]

    row = [cell.value for cell in sheet[2]]
    assert row[1] == "Clienti 1"
    assert row[2] == "Chiamata"
    assert row[5] == "Org di test"
    assert row[header.index("Empatia")] == 7.5
    assert row[header.index("Voto")] == 7.5
    # Nessuna revisione: il voto che conta è quello della macchina, e la
    # colonna resta vuota (openpyxl rilegge la cella vuota come None)
    assert row[header.index("Voto AI")] == 7.5
    assert not row[header.index("Revisione")]


def test_a_corrected_score_is_what_the_export_reports(
    admin_client, db_session, standard_user, make_avatar
):
    """Il foglio deve dire il voto che lo studente ha ricevuto, non quello
    che la macchina aveva proposto."""
    avatar = make_avatar(category="clienti")
    conversation = _seed_evaluated_conversation(db_session, standard_user, avatar)
    admin_client.put(
        f"/api/admin/conversations/{conversation.id}/review",
        json={"override_score": 9, "override_reason": "Gestione del reclamo impeccabile."},
    )

    response = admin_client.get("/api/admin/evaluations-report/export")

    sheet = load_workbook(BytesIO(response.content))["Valutazioni"]
    header = [cell.value for cell in sheet[1]]
    row = [cell.value for cell in sheet[2]]
    assert row[header.index("Voto")] == 9
    assert row[header.index("Voto AI")] == 7.5
    assert row[header.index("Revisione")] == "Punteggio corretto"


def test_export_is_admin_only(user_client):
    assert user_client.get("/api/admin/evaluations-report/export").status_code == 403
