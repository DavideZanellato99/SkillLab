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

What deliberately does **not** survive is their name in the paternity
columns of the rows they created (see ``authorship``): an organization or an
avatar is not a registry and not somebody else's grade, so the id goes and
the email is replaced by a label. The row still says it was made by a person
and no longer says which one.

Neither of these keeps a deleted user's IP, voice or transcripts, which is
what erasure is actually about.

Nothing here commits: the caller owns the transaction, so the removal of
the local data and whatever else the endpoint is doing succeed or fail
together.
"""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.orm import Session

from authorship import DELETED_ACTOR_EMAIL
from models import (
    CONVERSATION_CHILDREN,
    Avatar,
    ChatConversation,
    NotificationRead,
    Organization,
    SimulationAttempt,
    TechnicalSimulation,
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
    SimulationAttempt,
)

# Every table that names the person who created or last modified the row
# (the `Authored` mixin). These rows are not about the user and they stay:
# only the signature on them is anonymised.
_AUTHORED = (User, Organization, Avatar, TechnicalSimulation)


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


def forget_authorship(db: Session, user_ids: Sequence[UUID]) -> None:
    """Unsign the rows these users created or last modified.

    The id would be nulled by the schema anyway, the email would not: it is
    a snapshot, and a snapshot of someone who asked to be erased is exactly
    what must not outlive them here. Both go in one statement, and the
    label left behind keeps the column readable.

    A bulk UPDATE on purpose, so it does not pass through the flush listener:
    somebody else's account being deleted is not a modification of this row,
    and `updated_at` must keep pointing at the last real change.
    """
    if not user_ids:
        return

    for model in _AUTHORED:
        for author, author_email in (
            (model.created_by, model.created_by_email),
            (model.updated_by, model.updated_by_email),
        ):
            db.query(model).filter(author.in_(user_ids)).update(
                {author: None, author_email: DELETED_ACTOR_EMAIL},
                synchronize_session=False,
            )


def erase_users(db: Session, user_ids: Sequence[UUID]) -> int:
    """Delete users and every row that is about them. Returns how many went.

    Their conversations go first (a conversation belongs to the person who
    held it), then everything keyed by user_id, then their signature on what
    survives them, then the accounts.
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

    forget_authorship(db, user_ids)

    return db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
