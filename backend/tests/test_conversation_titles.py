"""Automatic conversation titles.

Il titolo nasce prima del contenuto, quindi quello che si prova qui è che dica
le due cose che si sanno già, con chi si è parlato e quando, e che due prove
non finiscano mai a chiamarsi allo stesso modo.
"""

from datetime import UTC, datetime

from conversation_titles import MAX_TITLE_LENGTH, date_label, next_conversation_title
from models import CONVERSATION_MODE_TEXT, ChatConversation

# Un giorno qualunque, per i casi in cui il titolo si legge per esteso.
UN_GIORNO = datetime(2026, 3, 6, 9, 30, tzinfo=UTC)


def _conversazione(db_session, user, avatar, title):
    db_session.add(
        ChatConversation(
            user_id=user.id,
            avatar_id=avatar.id,
            title=title,
            mode=CONVERSATION_MODE_TEXT,
        )
    )
    db_session.flush()


def test_date_label_has_no_leading_zero():
    assert date_label(UN_GIORNO) == "6 mar 2026"


def test_title_says_with_whom_and_when(db_session, standard_user, make_avatar):
    avatar = make_avatar(name="Mario Rossi")

    title = next_conversation_title(db_session, standard_user.id, avatar.name, UN_GIORNO)

    assert title == "Mario Rossi, 6 mar 2026"


def test_title_is_dated_today_when_nobody_says_otherwise(db_session, standard_user, make_avatar):
    avatar = make_avatar(name="Mario Rossi")

    title = next_conversation_title(db_session, standard_user.id, avatar.name)

    assert title == f"Mario Rossi, {date_label(datetime.now(UTC))}"


def test_second_conversation_of_the_day_is_numbered(db_session, standard_user, make_avatar):
    """Due prove con lo stesso avatar nello stesso giorno si distinguono."""
    avatar = make_avatar(name="Mario Rossi")
    _conversazione(db_session, standard_user, avatar, "Mario Rossi, 6 mar 2026")

    title = next_conversation_title(db_session, standard_user.id, avatar.name, UN_GIORNO)

    assert title == "Mario Rossi, 6 mar 2026 (2)"


def test_the_counter_skips_the_numbers_already_taken(db_session, standard_user, make_avatar):
    avatar = make_avatar(name="Mario Rossi")
    _conversazione(db_session, standard_user, avatar, "Mario Rossi, 6 mar 2026")
    _conversazione(db_session, standard_user, avatar, "Mario Rossi, 6 mar 2026 (2)")

    title = next_conversation_title(db_session, standard_user.id, avatar.name, UN_GIORNO)

    assert title == "Mario Rossi, 6 mar 2026 (3)"


def test_another_day_starts_again_without_a_counter(db_session, standard_user, make_avatar):
    """Il progressivo è del giorno: domani il titolo torna pulito."""
    avatar = make_avatar(name="Mario Rossi")
    _conversazione(db_session, standard_user, avatar, "Mario Rossi, 6 mar 2026")

    title = next_conversation_title(
        db_session, standard_user.id, avatar.name, UN_GIORNO.replace(day=7)
    )

    assert title == "Mario Rossi, 7 mar 2026"


def test_somebody_else_conversations_do_not_number_mine(
    db_session, standard_user, org_admin_user, make_avatar
):
    """I titoli sono di chi ha svolto la prova, non dell'avatar."""
    avatar = make_avatar(name="Mario Rossi")
    _conversazione(db_session, org_admin_user, avatar, "Mario Rossi, 6 mar 2026")

    title = next_conversation_title(db_session, standard_user.id, avatar.name, UN_GIORNO)

    assert title == "Mario Rossi, 6 mar 2026"


def test_a_very_long_name_gives_way_to_the_date(db_session, standard_user, make_avatar):
    """Mezzo nome si riconosce ancora, mezza data non è più una data."""
    avatar = make_avatar(name="M" * 100)

    title = next_conversation_title(db_session, standard_user.id, avatar.name, UN_GIORNO)

    assert title.endswith(", 6 mar 2026")
    assert len(title) <= MAX_TITLE_LENGTH


def test_a_nameless_avatar_falls_back_to_a_readable_title(db_session, standard_user):
    title = next_conversation_title(db_session, standard_user.id, "   ", UN_GIORNO)

    assert title == "Conversazione, 6 mar 2026"
