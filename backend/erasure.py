"""Right to erasure (GDPR art. 17): removing a person, in one place.

Two endpoints delete people: an account at a time (``routers/admin``) and
a whole tenant at once (``routers/organizations``). Before this module they
each carried their own idea of what a user is made of, and both were
missing the same table — which is how erasure always goes wrong: not with
a bug you can see, but with a row nobody remembered.

So the knowledge lives here, once. A new table that references a user gets
added to ``_USER_OWNED`` and both paths inherit it, and the test suite
checks the whole list against a user with data everywhere.

Nothing here trusts the FK cascades. The schema is built by create_all
with no migration tool, so an ondelete declared in the model is not proof
the live database has it; ``token_session.user_id`` does not even have a
foreign key. Every table is emptied by an explicit statement.

**What deliberately survives**, because "erase everything" is not the same
as "erase everything about them":

- the **audit rows** (``audit_logs``): the FK is nulled, the email, role and
  organization snapshots stay. The registry has to remain readable after
  the account is gone or it stops being a registry, and it expires on its
  own clock (see ``audit.RETENTION_DAYS``).
- the **trainer's name** on reviews and annotations they wrote for other
  people (``reviewer_name``): that is part of somebody else's grade, and a
  student contesting a score has the right to know who signed it. The FK is
  nulled by the schema, the snapshot stays.

Neither of these keeps a deleted user's IP, voice or transcripts, which is
what erasure is actually about.

Nothing here commits: the caller owns the transaction, so the removal of
the local data and whatever else the endpoint is doing succeed or fail
together.
"""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.orm import Session

from models import (
    CONVERSATION_CHILDREN,
    ChatConversation,
    NotificationRead,
    TokenSession,
    TrainingAssignment,
    User,
    UserSelection,
)

# Every table that holds rows *about* a user, keyed by user_id. TokenSession
# is the one this module was written for: its user_id carries no foreign
# key at all (see the model), so no cascade has ever reached it and the
# client IP and User-Agent of deleted accounts were surviving them.
_USER_OWNED = (
    UserSelection,
    TokenSession,
    NotificationRead,
    TrainingAssignment,
)


def erase_conversations(db: Session, conversation_ids: Sequence[UUID]) -> int:
    """Delete conversations with every message, evaluation, review, note and
    recording hanging off them. Returns how many conversations went."""
    if not conversation_ids:
        return 0

    for model in CONVERSATION_CHILDREN:
        db.query(model).filter(model.conversation_id.in_(conversation_ids)).delete(
            synchronize_session=False
        )
    return (
        db.query(ChatConversation)
        .filter(ChatConversation.id.in_(conversation_ids))
        .delete(synchronize_session=False)
    )


def erase_users(db: Session, user_ids: Sequence[UUID]) -> int:
    """Delete users and every row that is about them. Returns how many went.

    Their conversations go first (a conversation belongs to the person who
    held it), then everything keyed by user_id, then the accounts.
    """
    if not user_ids:
        return 0

    conversation_ids = [
        row[0]
        for row in db.query(ChatConversation.id)
        .filter(ChatConversation.user_id.in_(user_ids))
        .all()
    ]
    erase_conversations(db, conversation_ids)

    for model in _USER_OWNED:
        db.query(model).filter(model.user_id.in_(user_ids)).delete(synchronize_session=False)

    return db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
