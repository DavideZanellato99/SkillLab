"""Right to erasure: after deleting an account, nothing points at it.

The interesting test here is not that the endpoint returns 200. It is the
one that walks the schema: every column that can hold a user id, found by
foreign key AND by name, and none of them still holds the deleted one.
Written that way on purpose, because the way erasure fails is never a
visible bug, it is one table nobody remembered — `token_session`, whose
user_id carries no foreign key at all, survived every deletion until this
suite went looking for it.

The seed is deliberately exhaustive, and a guard test fails the day a new
table starts pointing at a user without being added to it.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from database import Base
from models import (
    AuditLog,
    Avatar,
    ChatConversation,
    ChatMessage,
    ConversationRecording,
    ConversationReview,
    MessageAnnotation,
    NotificationRead,
    Organization,
    SimulationAttempt,
    TechnicalSimulation,
    TokenSession,
    TrainingAssignment,
    User,
    UserSelection,
    VoiceSessionRecord,
)
from routers import admin as admin_router

# Every table the seed below writes a row into for the account under test.
# The guard test compares this with what the schema actually exposes.
_SEEDED_TABLES = {
    "users",
    "organizations",
    "avatars",
    "user_selections",
    "token_session",
    "notification_reads",
    "training_assignments",
    "chat_conversations",
    "audit_logs",
    "conversation_reviews",
    "message_annotations",
    "voice_sessions",
    "simulation_attempts",
    "technical_simulations",
}


@pytest.fixture
def cognito(monkeypatch):
    """Records the accounts the router asks Cognito to delete."""
    deleted: list[str] = []
    monkeypatch.setattr(admin_router, "admin_delete_user", deleted.append)
    return deleted


def _columns_about_a_user():
    """Every column that can point at a user, by foreign key or by name.

    Both, and not just the foreign keys, because ``token_session.user_id``
    has none: it is a bare Uuid column the model documents as
    "informational", which is exactly why no cascade ever reached it.
    """
    found = []
    for table in Base.metadata.sorted_tables:
        for column in table.c:
            by_name = column.name in ("user_id", "reviewer_id", "assigned_by_id")
            by_fk = any(fk.column.table.name == "users" for fk in column.foreign_keys)
            if by_name or by_fk:
                found.append((table, column))
    return found


def _seed_everything(db_session, victim: User, other: User, avatar) -> None:
    """Give `victim` a row in every table that can be about them.

    Including one as somebody else's trainer: the review and the note they
    wrote on `other`'s conversation are the two things that must survive
    the deletion, signed, because they are part of another person's grade.
    """
    # Their own conversation, with everything hanging off it
    conversation = ChatConversation(
        user_id=victim.id, avatar_id=avatar.id, title="Clienti 1", mode="voice"
    )
    db_session.add(conversation)
    db_session.flush()
    db_session.add_all(
        [
            ChatMessage(conversation_id=conversation.id, role="user", content="Buongiorno."),
            ConversationRecording(
                conversation_id=conversation.id,
                mime_type="audio/webm",
                duration_ms=1000,
                size_bytes=3,
                audio=b"abc",
            ),
        ]
    )

    # A call in progress: the row carries a copy of the transcript so far
    db_session.add(
        VoiceSessionRecord(
            id=f"vs-{uuid.uuid4()}",
            user_id=victim.id,
            avatar_id=avatar.id,
            conversation_id=conversation.id,
            avatar_profile={"nome": "Cliente"},
            prior_history=[{"role": "user", "content": "Buongiorno."}],
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1),
        )
    )

    # An open session: client IP and User-Agent, the rows this test exists for
    db_session.add(
        TokenSession(
            jti=f"jti-{uuid.uuid4()}",
            user_id=victim.id,
            client_ip="203.0.113.7",
            user_agent="Mozilla/5.0",
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1),
        )
    )
    db_session.add(UserSelection(user_id=victim.id, avatar_id=avatar.id))
    db_session.add(NotificationRead(user_id=victim.id, key="assignment.overdue:x"))
    db_session.add(
        TrainingAssignment(
            user_id=victim.id,
            avatar_id=avatar.id,
            assigned_by_id=victim.id,
            target_score=8.0,
        )
    )

    # Un test tecnico consegnato: la fotografia porta le risposte che la
    # persona ha dato, quindi è materiale suo quanto una trascrizione
    simulation = TechnicalSimulation(
        title="Sblocco carta",
        status="published",
        organization_id=avatar.organization_id,
        document_name="procedura.txt",
        document_text="Testo della procedura.",
    )
    db_session.add(simulation)
    db_session.flush()
    db_session.add(
        SimulationAttempt(
            simulation_id=simulation.id,
            user_id=victim.id,
            correct_count=7,
            question_count=10,
            answers=[{"question_id": str(uuid.uuid4()), "selected_option": 1}],
        )
    )
    db_session.add(
        AuditLog(
            user_id=victim.id,
            user_email=victim.email,
            user_role=victim.ruolo,
            action="auth.login",
            method="POST",
            path="/auth/login",
            status_code=200,
            client_ip="203.0.113.7",
            user_agent="Mozilla/5.0",
        )
    )

    # As somebody else's trainer
    reviewed = ChatConversation(
        user_id=other.id, avatar_id=avatar.id, title="Clienti 2", mode="text"
    )
    db_session.add(reviewed)
    db_session.flush()
    reviewed_message = ChatMessage(conversation_id=reviewed.id, role="user", content="Mi scusi.")
    db_session.add(reviewed_message)
    db_session.flush()
    db_session.add_all(
        [
            ConversationReview(
                conversation_id=reviewed.id,
                reviewer_id=victim.id,
                reviewer_name="Mario Trainer",
                summary_note="Bene.",
            ),
            MessageAnnotation(
                conversation_id=reviewed.id,
                message_id=reviewed_message.id,
                reviewer_id=victim.id,
                reviewer_name="Mario Trainer",
                note="Qui chiedi il codice cliente.",
            ),
        ]
    )
    db_session.flush()

    # As the author of things that outlive them: the organization, the avatar,
    # the technical simulation and another account all carry their id in the
    # paternity columns.
    # Written with bulk UPDATEs because the flush listener owns those columns
    # and would put the current actor (nobody, here) back in (see authorship).
    for model, row_id in (
        (Organization, avatar.organization_id),
        (Avatar, avatar.id),
        (TechnicalSimulation, simulation.id),
        (User, other.id),
    ):
        db_session.query(model).filter(model.id == row_id).update(
            {
                model.created_by: victim.id,
                model.created_by_email: victim.email,
                model.updated_by: victim.id,
                model.updated_by_email: victim.email,
            },
            synchronize_session=False,
        )
    db_session.flush()


def _rows_pointing_at(db_session, user_id) -> dict[str, int]:
    """How many rows still hold this user id, per column."""
    left = {}
    for table, column in _columns_about_a_user():
        count = db_session.execute(
            select(func.count()).select_from(table).where(column == user_id)
        ).scalar()
        if count:
            left[f"{table.name}.{column.name}"] = count
    return left


def _delete_account(admin_client, db_session, user_id) -> None:
    """Delete through the endpoint, then detach what the session still holds.

    The erasure runs bulk deletes and lets the schema null the reviewer
    references, so neither reaches the identity map: objects loaded by the
    seed would keep answering with values the database no longer has.
    """
    response = admin_client.delete(f"/api/admin/users/{user_id}")
    assert response.status_code == 200, response.text
    db_session.expunge_all()


# ── Niente resta indietro ──────────────────────────────────────────────


def test_deleting_an_account_leaves_no_column_pointing_at_it(
    admin_client, cognito, db_session, org_admin_user, standard_user, make_avatar
):
    _seed_everything(db_session, org_admin_user, standard_user, make_avatar())
    victim_id, victim_email = org_admin_user.id, org_admin_user.email
    assert _rows_pointing_at(db_session, victim_id), "il seed non ha scritto niente"

    _delete_account(admin_client, db_session, victim_id)

    assert cognito == [victim_email]
    assert _rows_pointing_at(db_session, victim_id) == {}


def test_the_session_rows_go_with_the_account(
    admin_client, cognito, db_session, org_admin_user, standard_user, make_avatar
):
    """The regression this module was written for.

    token_session holds the client IP and User-Agent of every open session
    and has no foreign key to hang a cascade on, so it used to outlive the
    person it described.
    """
    _seed_everything(db_session, org_admin_user, standard_user, make_avatar())
    victim_id = org_admin_user.id
    assert db_session.query(TokenSession).filter(TokenSession.user_id == victim_id).count() == 1

    _delete_account(admin_client, db_session, victim_id)

    assert db_session.query(TokenSession).filter(TokenSession.user_id == victim_id).count() == 0


def test_the_recording_and_the_transcript_go_too(
    admin_client, cognito, db_session, org_admin_user, standard_user, make_avatar
):
    _seed_everything(db_session, org_admin_user, standard_user, make_avatar())
    victim_id = org_admin_user.id
    conversation_id = (
        db_session.query(ChatConversation.id).filter(ChatConversation.user_id == victim_id).scalar()
    )

    _delete_account(admin_client, db_session, victim_id)

    assert (
        db_session.query(ConversationRecording)
        .filter(ConversationRecording.conversation_id == conversation_id)
        .count()
        == 0
    )
    assert (
        db_session.query(ChatMessage).filter(ChatMessage.conversation_id == conversation_id).count()
        == 0
    )


# ── Quello che sopravvive, e perché ────────────────────────────────────


def test_the_audit_trail_keeps_naming_the_deleted_account(
    admin_client, cognito, db_session, org_admin_user, standard_user, make_avatar
):
    """The FK is nulled, the email snapshot stays: a registry that forgot
    who acted would stop being a registry. It expires on its own clock."""
    _seed_everything(db_session, org_admin_user, standard_user, make_avatar())
    victim_id, victim_email = org_admin_user.id, org_admin_user.email

    _delete_account(admin_client, db_session, victim_id)

    row = db_session.query(AuditLog).filter(AuditLog.user_email == victim_email).first()
    assert row is not None
    assert row.user_id is None


def test_the_trainers_verdict_on_someone_else_survives_signed(
    admin_client, cognito, db_session, org_admin_user, standard_user, make_avatar
):
    """A student contesting a grade has the right to know who signed it,
    so the name snapshot outlives the trainer's account."""
    _seed_everything(db_session, org_admin_user, standard_user, make_avatar())
    victim_id = org_admin_user.id
    reviewed_id = (
        db_session.query(ChatConversation.id)
        .filter(ChatConversation.user_id == standard_user.id)
        .scalar()
    )

    _delete_account(admin_client, db_session, victim_id)

    review = (
        db_session.query(ConversationReview)
        .filter(ConversationReview.conversation_id == reviewed_id)
        .first()
    )
    assert review is not None
    assert review.reviewer_id is None
    assert review.reviewer_name == "Mario Trainer"

    annotation = (
        db_session.query(MessageAnnotation)
        .filter(MessageAnnotation.conversation_id == reviewed_id)
        .first()
    )
    assert annotation is not None
    assert annotation.reviewer_id is None
    assert annotation.reviewer_name == "Mario Trainer"


def test_the_other_user_keeps_their_own_data(
    admin_client, cognito, db_session, org_admin_user, standard_user, make_avatar
):
    _seed_everything(db_session, org_admin_user, standard_user, make_avatar())
    victim_id, survivor_id = org_admin_user.id, standard_user.id

    _delete_account(admin_client, db_session, victim_id)

    assert db_session.query(User).filter(User.id == survivor_id).first() is not None
    assert (
        db_session.query(ChatConversation).filter(ChatConversation.user_id == survivor_id).count()
        == 1
    )


# ── La guardia contro la prossima tabella dimenticata ──────────────────


def test_every_table_that_points_at_a_user_is_covered_by_the_seed():
    """Fails the day a new table starts referencing a user.

    Add it to the seed (and, if it holds data about the person rather than
    about somebody else's, to erasure._USER_OWNED) before this passes
    again. That is the whole point: the next forgotten table should break a
    test, not survive an erasure request.
    """
    discovered = {table.name for table, _ in _columns_about_a_user()}

    assert discovered <= _SEEDED_TABLES, (
        f"tabelle non coperte dal seed: {sorted(discovered - _SEEDED_TABLES)}"
    )
