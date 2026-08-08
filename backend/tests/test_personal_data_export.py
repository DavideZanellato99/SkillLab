"""The copy a person can download of their own data (art. 15 and 20).

Two things are worth pinning down. The first is that the archive is
actually complete: transcript, scores, the trainer's verdict, the audio,
the sessions, the activity. The second, and the one with teeth, is what
must never end up in it: the persona sheet, which holds the hidden
objectives and the secrets of the scenario, and anything belonging to
somebody else.
"""

import io
import json
import zipfile

from models import (
    AuditLog,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationRecording,
    ConversationReview,
)

_ANSWER_KEY = "IL-CLIENTE-STA-MENTENDO-SUL-GUASTO"


def _seed(db_session, user, avatar, make_assigned_path, *, with_audio=True) -> ChatConversation:
    conversation = ChatConversation(
        user_id=user.id, avatar_id=avatar.id, title="Reclamo bolletta", mode="voice"
    )
    db_session.add(conversation)
    db_session.flush()
    db_session.add_all(
        [
            ChatMessage(
                conversation_id=conversation.id, role="user", content="Buongiorno, come posso?"
            ),
            ChatMessage(
                conversation_id=conversation.id, role="assistant", content="Ho un problema."
            ),
            ConversationEvaluation(
                conversation_id=conversation.id,
                overall_score=6.5,
                result={"summary": "Buon ascolto.", "criteria": [{"key": "empatia", "score": 7}]},
            ),
            ConversationReview(
                conversation_id=conversation.id,
                reviewer_id=None,
                reviewer_name="Anna Formatrice",
                summary_note="Troppo severo il 6.5.",
                override_score=7.5,
                override_reason="Ha gestito bene l'escalation.",
            ),
        ]
    )
    # Un percorso affidato: nell'archivio è la parte che dice cosa alla
    # persona era stato chiesto di fare, non solo cosa ha fatto.
    make_assigned_path(user, [{"avatar": avatar, "target": 8.0}])
    if with_audio:
        db_session.add(
            ConversationRecording(
                conversation_id=conversation.id,
                # Con il codec attaccato, come lo scrive MediaRecorder
                mime_type="audio/webm;codecs=opus",
                duration_ms=4200,
                size_bytes=9,
                audio=b"AUDIOBYTE",
            )
        )
    db_session.flush()
    return conversation


def _download(user_client) -> zipfile.ZipFile:
    response = user_client.get("/api/auth/me/export")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers["content-disposition"]
    return zipfile.ZipFile(io.BytesIO(response.content))


def _data(archive: zipfile.ZipFile) -> dict:
    return json.loads(archive.read("dati.json"))


# ── L'archivio è completo ──────────────────────────────────────────────


def test_the_archive_holds_the_data_the_readme_and_the_audio(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    _seed(db_session, standard_user, make_avatar(), make_assigned_path)

    archive = _download(user_client)
    names = archive.namelist()

    assert "dati.json" in names
    assert "LEGGIMI.txt" in names
    recordings = [n for n in names if n.startswith("registrazioni/")]
    assert len(recordings) == 1
    # Estensione riconoscibile, non .bin: una copia che non si riesce ad
    # aprire non è una copia
    assert recordings[0].endswith(".webm")
    assert archive.read(recordings[0]) == b"AUDIOBYTE"
    # Il JSON punta al file che c'è davvero
    assert _data(archive)["conversazioni"][0]["registrazione_audio"] == recordings[0]


def test_the_export_carries_the_transcript_and_every_verdict(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    _seed(db_session, standard_user, make_avatar(), make_assigned_path)

    data = _data(_download(user_client))
    conversation = data["conversazioni"][0]

    assert conversation["titolo"] == "Reclamo bolletta"
    assert [m["chi"] for m in conversation["messaggi"]] == ["tu", "avatar"]
    assert conversation["messaggi"][0]["testo"] == "Buongiorno, come posso?"
    assert conversation["valutazione_automatica"]["punteggio_complessivo"] == 6.5
    assert conversation["revisione_del_formatore"]["voto_corretto"] == 7.5
    assert conversation["revisione_del_formatore"]["formatore"] == "Anna Formatrice"
    assert data["percorsi_assegnati"][0]["tappe"][0]["punteggio_obiettivo"] == 8.0


def test_the_export_carries_the_account_and_the_activity(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    _seed(db_session, standard_user, make_avatar(), make_assigned_path)

    # La prima esportazione è essa stessa un'attività registrata, e la
    # seconda la ritrova: il registro di una richiesta viene scritto dal
    # middleware dopo la risposta, quindi un archivio non può contenere la
    # riga che lo riguarda.
    _download(user_client)
    data = _data(_download(user_client))

    assert data["account"]["email"] == standard_user.email
    assert data["account"]["organizzazione"] == "Org di test"
    assert any(row["azione"] == "Dati personali esportati" for row in data["registro_attivita"])


def test_an_account_with_nothing_still_gets_a_valid_archive(user_client, standard_user):
    """No conversations, no goals: an empty copy is still a copy."""
    data = _data(_download(user_client))

    assert data["conversazioni"] == []
    assert data["percorsi_assegnati"] == []
    assert data["account"]["email"] == standard_user.email


# ── Quello che non deve uscire ─────────────────────────────────────────


def test_the_persona_sheet_never_leaves_the_server(
    user_client, db_session, standard_user, make_avatar, make_assigned_path
):
    """The sheet holds hidden objectives and the real cause of the problem.

    An export that leaked it would hand the trainee the answer key, so the
    check is on the raw bytes of the whole archive, not on one field.
    """
    avatar = make_avatar(name="Giulia Bianchi", SEGRETO=_ANSWER_KEY, OBIETTIVO_NASCOSTO=_ANSWER_KEY)
    _seed(db_session, standard_user, avatar, make_assigned_path)

    response = user_client.get("/api/auth/me/export")
    assert response.status_code == 200

    assert _ANSWER_KEY.encode() not in response.content
    # Il nome e la categoria invece ci sono: servono a capire la conversazione
    conversation = _data(zipfile.ZipFile(io.BytesIO(response.content)))["conversazioni"][0]
    assert conversation["avatar"] == "Giulia Bianchi"
    assert conversation["categoria_avatar"] == "clienti"


def test_the_export_holds_nobody_elses_conversations(
    user_client, db_session, standard_user, org_admin_user, make_avatar, make_assigned_path
):
    avatar = make_avatar()
    _seed(db_session, standard_user, avatar, make_assigned_path)
    stranger = ChatConversation(
        user_id=org_admin_user.id, avatar_id=avatar.id, title="Roba di un altro", mode="text"
    )
    db_session.add(stranger)
    db_session.flush()
    db_session.add(
        ChatMessage(conversation_id=stranger.id, role="user", content="Questa non deve comparire.")
    )
    db_session.flush()

    response = user_client.get("/api/auth/me/export")

    assert b"Roba di un altro" not in response.content
    assert b"Questa non deve comparire." not in response.content
    assert len(_data(zipfile.ZipFile(io.BytesIO(response.content)))["conversazioni"]) == 1


# ── La richiesta resta a registro ──────────────────────────────────────


def test_the_request_is_recorded_in_the_audit_trail(user_client, db_session, standard_user):
    """The one read-only GET in the registry: an access request is exactly
    what you want to be able to prove you answered."""
    assert user_client.get("/api/auth/me/export").status_code == 200

    row = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "profile.data_export")
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert row is not None
    assert row.user_email == standard_user.email
