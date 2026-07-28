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
"""

from sqlalchemy import or_, text

import audit
from auth_dependency import ensure_roles, get_or_create_mock_admin
from conversation_titles import next_conversation_title
from database import SessionLocal, engine
from models import (
    ROLE_SUPER_ADMIN,
    Avatar,
    ChatConversation,
    Organization,
    Role,
    User,
)


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
        # Voice sessions live in memory, so no call survives a restart: every
        # call still open at boot is over and is closed retroactively. Text
        # chats hold no server-side state, so they stay open across restarts.
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

    Idempotent, and it runs before the retention purge so it can still see
    the oldest rows: only users still NULL are touched, so a real login
    always wins over the backfill.
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


def _prepare_audit_logs() -> None:
    """Index the audit trail the way it is read, then drop what expired.

    The registry is always read newest-first, filtered by user or by
    action, so both indexes are composite and descending on created_at.
    The purge is the ONLY thing that removes a log row: no endpoint
    deletes one, not even for the super admin (see routers/audit_logs).
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
        conn.execute(
            text("DELETE FROM audit_logs WHERE created_at < :cutoff"),
            {"cutoff": audit.purge_cutoff()},
        )


def run_startup_migrations() -> None:
    """Run every idempotent startup migration, in dependency order."""
    _add_columns()
    _backfill_conversation_titles()
    _seed_roles_and_admin()
    _backfill_user_organizations()
    _backfill_avatar_organizations()
    _backfill_last_login()
    _prepare_audit_logs()
