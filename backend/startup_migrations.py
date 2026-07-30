"""Idempotent schema/data migrations run once at application startup.

The project manages its schema with ``Base.metadata.create_all`` rather than
a migration tool: that creates missing tables but never ALTERs existing ones,
so every column, backfill or constraint added after the first deploy lives
here. Everything in this module is idempotent (``ADD COLUMN IF NOT EXISTS``,
``UPDATE ... WHERE ... IS NULL``, guarded ``SET NOT NULL``), so it can run on
every boot without harm, on a fresh database or on one already up to date.

It is called at import time from ``main`` (before the app starts serving), so
the DDL is in place before any request or test fixture touches the tables.
Keep the three phases in order: add columns, backfill the old rows, then lock
the constraints down once no offending rows remain.

Entry point: ``prepare_schema``, which holds an advisory lock for the whole
job (see there for why).
"""

import logging
from contextlib import contextmanager

from sqlalchemy import or_, text

from auth_dependency import ensure_roles, get_or_create_mock_admin
from conversation_titles import next_conversation_title
from database import Base, SessionLocal, engine
from models import (
    ROLE_SUPER_ADMIN,
    Avatar,
    ChatConversation,
    Organization,
    Role,
    User,
)

logger = logging.getLogger(__name__)

# Advisory lock key. Advisory means Postgres attaches no meaning to it: it is
# just a number the processes agree on, unrelated to any table. Arbitrary but
# fixed forever — changing it would let an old and a new container run the
# schema job at the same time, which is the one thing it exists to prevent.
_SCHEMA_LOCK_KEY = 774_155_001


def _add_columns() -> None:
    """Create columns added to models after the first deploy (idempotent)."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "status VARCHAR(20) NOT NULL DEFAULT 'active'"
            )
        )
        conn.execute(
            text("ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS title VARCHAR(120)")
        )
        conn.execute(
            text("ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP")
        )
        conn.execute(
            text(
                "ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS "
                "mode VARCHAR(10) NOT NULL DEFAULT 'voice'"
            )
        )
        # A call lives inside its WebSocket, which dies with the process, so
        # no call survives a restart even though its session row now does:
        # every call still open at boot is over and is closed retroactively.
        # Text chats hold no server-side state, so they stay open across
        # restarts.
        conn.execute(
            text(
                "UPDATE chat_conversations SET ended_at = updated_at "
                "WHERE ended_at IS NULL AND mode = 'voice'"
            )
        )
        # Call recordings are already-compressed Opus (or AAC on Safari), so
        # TOAST's compression pass only burns CPU on incompressible bytes.
        # EXTERNAL stores them out of line, uncompressed.
        conn.execute(
            text("ALTER TABLE conversation_recordings ALTER COLUMN audio SET STORAGE EXTERNAL")
        )
        # Multi-tenant columns (the organizations table itself is created by
        # create_all). Added nullable here; avatars.organization_id is locked
        # down to NOT NULL later, after any legacy rows are adopted. On users
        # NULL still means "super admin".
        conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "organization_id UUID REFERENCES organizations(id)"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE avatars ADD COLUMN IF NOT EXISTS "
                "organization_id UUID REFERENCES organizations(id)"
            )
        )
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP"))
        # Avatars are deleted logically: pre-existing rows are all active, so
        # NULL (the column default) is already the right value for them and no
        # backfill is needed. The partial index serves the only query shape
        # there is, "the active avatars of a tenant".
        conn.execute(text("ALTER TABLE avatars ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_avatars_active_org "
                "ON avatars (organization_id) WHERE deleted_at IS NULL"
            )
        )
        # Why a tenant is suspended, written by the admin who suspended it.
        # Nullable by nature: an active organization has no reason to carry.
        conn.execute(
            text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspension_reason TEXT")
        )


def _backfill_conversation_titles() -> None:
    """Give pre-existing untitled conversations the default title, then lock it.

    The title is mandatory: conversations created before it became so are
    backfilled with the same "<Category> <n>" default used for new ones, then
    the column is set NOT NULL (both steps idempotent).
    """
    with SessionLocal() as db:
        untitled = (
            db.query(ChatConversation, Avatar.category)
            .join(Avatar, Avatar.id == ChatConversation.avatar_id)
            .filter(or_(ChatConversation.title.is_(None), ChatConversation.title == ""))
            .order_by(ChatConversation.created_at.asc())
            .all()
        )
        for conv, category in untitled:
            conv.title = next_conversation_title(db, conv.user_id, category)
            db.flush()
        db.commit()

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE chat_conversations ALTER COLUMN title SET NOT NULL"))


def _seed_roles_and_admin() -> None:
    """Ensure the system roles and the mock super admin exist."""
    with SessionLocal() as db:
        ensure_roles(db)
        get_or_create_mock_admin(db)


def _backfill_user_organizations() -> None:
    """Adopt every pre-existing non-super-admin user into a default tenant.

    Idempotent: it only touches users still without an organization. A default
    organization is created once, on demand, when such orphans exist.
    """
    with SessionLocal() as db:
        default_org = db.query(Organization).filter(Organization.slug == "default").first()
        orphans = (
            db.query(User)
            .join(Role, Role.id == User.role_id)
            .filter(User.organization_id.is_(None), Role.name != ROLE_SUPER_ADMIN)
            .count()
        )
        if orphans and not default_org:
            default_org = Organization(name="Organizzazione predefinita", slug="default")
            db.add(default_org)
            db.commit()
            db.refresh(default_org)
        if default_org:
            super_admin_role = db.query(Role).filter(Role.name == ROLE_SUPER_ADMIN).first()
            (
                db.query(User)
                .filter(User.organization_id.is_(None), User.role_id != super_admin_role.id)
                .update({User.organization_id: default_org.id}, synchronize_session=False)
            )
            db.commit()


def _backfill_avatar_organizations() -> None:
    """Adopt legacy global avatars into the sole tenant, then lock the column.

    Global avatars are no longer supported: every avatar must belong to exactly
    one organization. Defensive: it only assigns when exactly one organization
    exists, and only sets NOT NULL once no orphan avatar rows remain.
    """
    with SessionLocal() as db:
        orphan_avatars = db.query(Avatar).filter(Avatar.organization_id.is_(None)).count()
        if orphan_avatars:
            orgs = db.query(Organization).all()
            if len(orgs) == 1:
                (
                    db.query(Avatar)
                    .filter(Avatar.organization_id.is_(None))
                    .update({Avatar.organization_id: orgs[0].id}, synchronize_session=False)
                )
                db.commit()
        remaining = db.query(Avatar).filter(Avatar.organization_id.is_(None)).count()

    if remaining == 0:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE avatars ALTER COLUMN organization_id SET NOT NULL"))


def _backfill_last_login() -> None:
    """Seed the last-access column from the audit trail.

    The column is new, so on the first boot every pre-existing account would
    read as "never accessed" while plenty of them sign in daily. The registry
    already records every successful authentication, so the most recent one
    per user is the honest starting value. Accounts whose last login fell
    outside the audit retention window stay NULL, which is the truthful
    answer there: we genuinely do not know.

    Idempotent, and it runs at import, before the first sweep of
    ``housekeeping``, so it can still see the oldest rows: only users still
    NULL are touched, so a real login always wins over the backfill.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE users SET last_login_at = latest.last_login FROM ("
                "  SELECT user_id, MAX(created_at) AS last_login FROM audit_logs"
                "  WHERE action IN ('auth.login', 'auth.password_set') AND user_id IS NOT NULL"
                "  GROUP BY user_id"
                ") AS latest "
                "WHERE users.id = latest.user_id AND users.last_login_at IS NULL"
            )
        )


def _index_audit_logs() -> None:
    """Index the audit trail the way it is read.

    The registry is always read newest-first, filtered by user or by
    action, so both indexes are composite and descending on created_at.

    Expiring the rows is not done here: retention runs on its own clock in
    ``housekeeping``, so it also fires on a process that has been up for
    months, not only on the ones that happen to restart.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_audit_logs_user_created "
                "ON audit_logs (user_id, created_at DESC)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_audit_logs_action_created "
                "ON audit_logs (action, created_at DESC)"
            )
        )


def run_startup_migrations() -> None:
    """Run every idempotent startup migration, in dependency order."""
    _add_columns()
    _backfill_conversation_titles()
    _seed_roles_and_admin()
    _backfill_user_organizations()
    _backfill_avatar_organizations()
    _backfill_last_login()
    _index_audit_logs()


@contextmanager
def _schema_lock():
    """Hold the schema job's advisory lock for as long as the job runs.

    On its own connection, and in AUTOCOMMIT: a session-level advisory lock
    belongs to the connection that took it, and the job itself opens and
    closes several connections of its own along the way. AUTOCOMMIT so this
    one never sits on an open transaction while other connections are trying
    to ALTER the very tables it would be holding.

    Nothing here has to survive a crash: Postgres drops the lock when the
    connection goes, so a container killed mid-migration frees the next one
    instead of wedging the whole deployment.
    """
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        taken = conn.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": _SCHEMA_LOCK_KEY}
        ).scalar()
        if not taken:
            # Worth a line in the log: without it a replica waiting its turn
            # looks exactly like a replica that has hung on startup.
            logger.info("Schema: un'altra replica lo sta preparando, aspetto il suo turno.")
            conn.execute(text("SELECT pg_advisory_lock(:key)"), {"key": _SCHEMA_LOCK_KEY})
        try:
            yield
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _SCHEMA_LOCK_KEY})


def prepare_schema() -> None:
    """Bring the database to the schema this version of the app expects.

    The single entry point, and the reason it exists instead of two calls in
    ``main``: both halves have to happen under the same lock. Start four
    containers at once and, without it, four processes issue the same DDL on
    the same tables in the same instant — concurrent ALTERs on one table
    block each other or fail outright, and the container that fails restarts
    and tries again forever. The worst case is not even the crash loop: it is
    a migration applied halfway, its ALTER through and its backfill not,
    leaving a schema in a state nobody designed.

    So one process does the work and the others queue up behind it. When they
    get in, everything is already done, and since every step is idempotent
    they simply pass through.
    """
    with _schema_lock():
        Base.metadata.create_all(bind=engine)
        run_startup_migrations()
