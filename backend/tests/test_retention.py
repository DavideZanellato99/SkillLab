"""Storage limitation: what expires, what survives it, and when.

The two windows of ``retention`` exist to be provable. A retention policy
written in an informativa and not enforced by the code is worse than none,
so these tests hold the two clocks apart: the audio goes first and its
conversation outlives it, the conversation goes later and takes everything
with it, and a transcript someone is still working on is not expired data
whatever its creation date says.
"""

from datetime import UTC, datetime, timedelta

import retention
from models import (
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationRecording,
    ConversationReview,
    MessageAnnotation,
    SimulationAttempt,
    TechnicalSimulation,
    UserDebriefing,
)


def _days_ago(days: int) -> datetime:
    """Naive UTC, like the timestamp columns."""
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)


def _seed_conversation(db_session, user, avatar, *, age_days, ended=True, with_audio=True):
    """A full conversation, aged: messages, evaluation, review, notes, audio."""
    when = _days_ago(age_days)
    conversation = ChatConversation(
        user_id=user.id,
        avatar_id=avatar.id,
        title="Clienti 1",
        mode="voice",
        created_at=when,
        updated_at=when,
        ended_at=when if ended else None,
    )
    db_session.add(conversation)
    db_session.flush()

    message = ChatMessage(conversation_id=conversation.id, role="user", content="Buongiorno.")
    db_session.add(message)
    db_session.flush()
    db_session.add_all(
        [
            ConversationEvaluation(
                conversation_id=conversation.id,
                overall_score=6.0,
                result={"summary": "sintesi", "criteria": []},
            ),
            ConversationReview(
                conversation_id=conversation.id,
                reviewer_id=user.id,
                reviewer_name="Trainer",
                summary_note="Bene.",
            ),
            MessageAnnotation(
                conversation_id=conversation.id,
                message_id=message.id,
                reviewer_id=user.id,
                reviewer_name="Trainer",
                note="Qui chiedi il codice cliente.",
            ),
        ]
    )
    if with_audio:
        db_session.add(
            ConversationRecording(
                conversation_id=conversation.id,
                mime_type="audio/webm",
                duration_ms=1000,
                size_bytes=3,
                audio=b"abc",
            )
        )
    db_session.flush()
    return conversation


def _purge(db_session):
    """Run the purge inside the test transaction, then refresh the session."""
    result = retention.purge_expired(db_session.connection())
    db_session.expire_all()
    return result


def _exists(db_session, model, conversation_id) -> bool:
    return db_session.query(model).filter(model.conversation_id == conversation_id).count() > 0


# ── La conversazione scaduta sparisce, con tutto quello che le appartiene ──


def test_expired_conversation_is_deleted_with_all_its_children(
    db_session, standard_user, make_avatar
):
    conversation = _seed_conversation(
        db_session, standard_user, make_avatar(), age_days=retention.CONVERSATION_RETENTION_DAYS + 1
    )
    # Letto prima del purge: dopo, l'istanza non ha più una riga da cui
    # ricaricarsi e leggerne l'id solleverebbe ObjectDeletedError.
    conversation_id = conversation.id

    result = _purge(db_session)

    assert result.conversations == 1
    assert (
        db_session.query(ChatConversation).filter(ChatConversation.id == conversation_id).count()
        == 0
    )
    for model in (
        ChatMessage,
        ConversationEvaluation,
        ConversationReview,
        MessageAnnotation,
        ConversationRecording,
    ):
        assert not _exists(db_session, model, conversation_id), model.__name__


def test_recent_conversation_is_left_alone(db_session, standard_user, make_avatar):
    conversation = _seed_conversation(db_session, standard_user, make_avatar(), age_days=1)

    result = _purge(db_session)

    assert result == (0, 0, 0, 0)
    assert (
        db_session.query(ChatConversation).filter(ChatConversation.id == conversation.id).count()
        == 1
    )
    assert _exists(db_session, ConversationRecording, conversation.id)


# ── L'audio scade prima, e la conversazione gli sopravvive ─────────────


def test_audio_expires_first_and_the_transcript_survives_it(db_session, standard_user, make_avatar):
    # Oltre la finestra dell'audio, ben dentro quella della conversazione.
    conversation = _seed_conversation(
        db_session, standard_user, make_avatar(), age_days=retention.AUDIO_RETENTION_DAYS + 1
    )

    result = _purge(db_session)

    assert result.conversations == 0
    assert result.recordings == 1
    assert not _exists(db_session, ConversationRecording, conversation.id)
    # Quello che serve al debrief resta leggibile: sparisce solo la voce.
    assert _exists(db_session, ChatMessage, conversation.id)
    assert _exists(db_session, ConversationEvaluation, conversation.id)
    assert _exists(db_session, ConversationReview, conversation.id)
    assert _exists(db_session, MessageAnnotation, conversation.id)


# ── L'orologio parte dall'ultimo utilizzo, non dalla creazione ─────────


def test_an_old_chat_still_in_use_is_not_expired(db_session, standard_user, make_avatar):
    """A written chat is never closed: its clock is the last activity.

    Created well beyond the window but touched yesterday, so it is not
    expired data, it is a transcript someone is still working on.
    """
    conversation = _seed_conversation(
        db_session,
        standard_user,
        make_avatar(),
        age_days=retention.CONVERSATION_RETENTION_DAYS + 10,
        ended=False,
        with_audio=False,
    )
    conversation.updated_at = _days_ago(1)
    db_session.flush()

    result = _purge(db_session)

    assert result.conversations == 0
    assert (
        db_session.query(ChatConversation).filter(ChatConversation.id == conversation.id).count()
        == 1
    )


# ── I tentativi delle simulazioni, sul proprio orologio ────────────────


def _seed_attempt(db_session, user, organization, *, age_days):
    """Un test tecnico consegnato, invecchiato."""
    simulation = TechnicalSimulation(
        title="Sblocco carta",
        status="published",
        organization_id=organization.id,
        document_name="procedura.txt",
        document_text="Testo della procedura.",
    )
    db_session.add(simulation)
    db_session.flush()
    attempt = SimulationAttempt(
        simulation_id=simulation.id,
        user_id=user.id,
        correct_count=7,
        question_count=10,
        answers=[],
        created_at=_days_ago(age_days),
    )
    db_session.add(attempt)
    db_session.flush()
    return simulation, attempt


def test_expired_attempt_goes_and_its_simulation_stays(db_session, standard_user, organization):
    """Il tentativo è personale e scade, la simulazione non lo è e resta."""
    simulation, attempt = _seed_attempt(
        db_session,
        standard_user,
        organization,
        age_days=retention.SIMULATION_ATTEMPT_RETENTION_DAYS + 1,
    )
    # Letti prima del purge: dopo, le istanze non hanno più una riga da cui
    # ricaricarsi e leggerne l'id solleverebbe ObjectDeletedError.
    attempt_id, simulation_id = attempt.id, simulation.id

    result = _purge(db_session)

    assert result.simulation_attempts == 1
    assert (
        db_session.query(SimulationAttempt).filter(SimulationAttempt.id == attempt_id).count() == 0
    )
    assert (
        db_session.query(TechnicalSimulation)
        .filter(TechnicalSimulation.id == simulation_id)
        .count()
        == 1
    )


def test_recent_attempt_is_left_alone(db_session, standard_user, organization):
    _, attempt = _seed_attempt(db_session, standard_user, organization, age_days=1)

    result = _purge(db_session)

    assert result.simulation_attempts == 0
    assert (
        db_session.query(SimulationAttempt).filter(SimulationAttempt.id == attempt.id).count() == 1
    )


# ── Il debriefing non sopravvive a quello che riassume ─────────────────


def _seed_debriefing(db_session, user, *, covered_days_ago: int):
    """Un quadro d'insieme, datato dalla prova più recente che aveva letto."""
    debriefing = UserDebriefing(
        user_id=user.id,
        content={"summary": "Chiude prima di aver capito.", "themes": []},
        covered_until=_days_ago(covered_days_ago),
        covered_conversations=3,
        covered_attempts=1,
    )
    db_session.add(debriefing)
    db_session.flush()
    return debriefing


def test_expired_debriefing_goes_with_the_conversations_it_summarised(db_session, standard_user):
    """Si misura sulla prova più recente che aveva letto, non su quando è
    stato scritto: passata quella data, il materiale che riassume è stato
    cancellato, e resterebbe un giudizio senza più niente dietro."""
    _seed_debriefing(
        db_session, standard_user, covered_days_ago=retention.CONVERSATION_RETENTION_DAYS + 1
    )

    result = _purge(db_session)

    assert result.debriefings == 1
    assert db_session.query(UserDebriefing).filter_by(user_id=standard_user.id).count() == 0


def test_recent_debriefing_is_left_alone(db_session, standard_user):
    _seed_debriefing(db_session, standard_user, covered_days_ago=1)

    result = _purge(db_session)

    assert result.debriefings == 0
    assert db_session.query(UserDebriefing).filter_by(user_id=standard_user.id).count() == 1


# ── Il purge è ripetibile ──────────────────────────────────────────────


def test_purge_is_idempotent(db_session, standard_user, make_avatar):
    _seed_conversation(
        db_session, standard_user, make_avatar(), age_days=retention.CONVERSATION_RETENTION_DAYS + 1
    )

    first = _purge(db_session)
    second = _purge(db_session)

    assert first.conversations == 1
    assert second == (0, 0, 0, 0)
