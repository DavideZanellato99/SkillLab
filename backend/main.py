"""FastAPI application entry point."""

# TLS verification against the OS certificate store (see tls_setup).
# Kept first so the injection happens before any HTTP client is imported,
# even though the modules that need it import tls_setup themselves.
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import tls_setup  # noqa: F401
from auth_dependency import ensure_roles, get_or_create_mock_admin
from database import Base, SessionLocal, engine
from routers.admin import router as admin_router
from routers.admin_avatars import router as admin_avatars_router
from routers.auth import router as auth_router
from routers.avatars import router as avatars_router
from routers.chat import router as chat_router
from routers.organizations import router as organizations_router
from routers.voice import router as voice_router

# Create all database tables
Base.metadata.create_all(bind=engine)

# Lightweight migrations: create_all never ALTERs existing tables, so
# columns added to a model after the first deploy go here (idempotent).
from sqlalchemy import text

with engine.begin() as _conn:
    _conn.execute(
        text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
            "status VARCHAR(20) NOT NULL DEFAULT 'active'"
        )
    )
    _conn.execute(
        text("ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS title VARCHAR(120)")
    )
    _conn.execute(
        text("ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP")
    )
    _conn.execute(
        text(
            "ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS "
            "mode VARCHAR(10) NOT NULL DEFAULT 'voice'"
        )
    )
    # Voice sessions live in memory, so no call survives a restart: every
    # call still open at boot is over and is closed retroactively. Text
    # chats hold no server-side state, so they stay open across restarts.
    _conn.execute(
        text(
            "UPDATE chat_conversations SET ended_at = updated_at "
            "WHERE ended_at IS NULL AND mode = 'voice'"
        )
    )
    # Call recordings are already-compressed Opus (or AAC on Safari), so
    # TOAST's compression pass only burns CPU on incompressible bytes.
    # EXTERNAL stores them out of line, uncompressed.
    _conn.execute(
        text("ALTER TABLE conversation_recordings ALTER COLUMN audio SET STORAGE EXTERNAL")
    )
    # Multi-tenant columns (the organizations table itself is created by
    # create_all above). Added nullable here; avatars.organization_id is
    # locked down to NOT NULL further below after any legacy rows are adopted.
    # On users NULL still means "super admin".
    _conn.execute(
        text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id)"
        )
    )
    _conn.execute(
        text(
            "ALTER TABLE avatars ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id)"
        )
    )

# The title is mandatory: conversations created before it became so are
# backfilled with the same "<Category> <n>" default used for new ones, then
# the column is locked down (both steps are idempotent).
from sqlalchemy import or_

from conversation_titles import next_conversation_title
from models import Avatar, ChatConversation, User

with SessionLocal() as _db:
    _untitled = (
        _db.query(ChatConversation, Avatar.category)
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
        .filter(or_(ChatConversation.title.is_(None), ChatConversation.title == ""))
        .order_by(ChatConversation.created_at.asc())
        .all()
    )
    for _conv, _category in _untitled:
        _conv.title = next_conversation_title(_db, _conv.user_id, _category)
        _db.flush()
    _db.commit()

with engine.begin() as _conn:
    _conn.execute(text("ALTER TABLE chat_conversations ALTER COLUMN title SET NOT NULL"))

# Ensure system roles and the mock super admin exist on startup
with SessionLocal() as _db:
    ensure_roles(_db)
    get_or_create_mock_admin(_db)

# Multi-tenant backfill: every pre-existing non-super-admin user must belong
# to an organization. Create a default tenant once and adopt the orphans
# into it (idempotent: it only touches users still without an organization).
from models import ROLE_SUPER_ADMIN, Organization, Role

with SessionLocal() as _db:
    _default_org = _db.query(Organization).filter(Organization.slug == "default").first()
    _orphans = (
        _db.query(User)
        .join(Role, Role.id == User.role_id)
        .filter(User.organization_id.is_(None), Role.name != ROLE_SUPER_ADMIN)
        .count()
    )
    if _orphans and not _default_org:
        _default_org = Organization(name="Organizzazione predefinita", slug="default")
        _db.add(_default_org)
        _db.commit()
        _db.refresh(_default_org)
    if _default_org:
        _super_admin_role = _db.query(Role).filter(Role.name == ROLE_SUPER_ADMIN).first()
        (
            _db.query(User)
            .filter(User.organization_id.is_(None), User.role_id != _super_admin_role.id)
            .update({User.organization_id: _default_org.id}, synchronize_session=False)
        )
        _db.commit()

# Global avatars are no longer supported: every avatar must belong to exactly
# one organization. Adopt any legacy avatar with organization_id NULL into the
# sole existing organization, then lock the column down to NOT NULL. Idempotent
# and defensive: it only assigns when exactly one organization exists, and only
# sets NOT NULL once no orphan avatar rows remain.
with SessionLocal() as _db:
    _orphan_avatars = _db.query(Avatar).filter(Avatar.organization_id.is_(None)).count()
    if _orphan_avatars:
        _orgs = _db.query(Organization).all()
        if len(_orgs) == 1:
            (
                _db.query(Avatar)
                .filter(Avatar.organization_id.is_(None))
                .update({Avatar.organization_id: _orgs[0].id}, synchronize_session=False)
            )
            _db.commit()
    _remaining = _db.query(Avatar).filter(Avatar.organization_id.is_(None)).count()

if _remaining == 0:
    with engine.begin() as _conn:
        _conn.execute(text("ALTER TABLE avatars ALTER COLUMN organization_id SET NOT NULL"))

app = FastAPI(
    title="SkillLab — Avatar Selection API",
    description="API for browsing and selecting avatars.",
    version="1.0.0",
)

# CORS configuration — comma-separated list of allowed frontend origins
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if not ALLOWED_ORIGINS:
    raise RuntimeError("ALLOWED_ORIGINS non configurato. Aggiungilo al file .env del backend.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static avatar images
os.makedirs("static/avatars", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(admin_avatars_router)
app.include_router(organizations_router)
app.include_router(avatars_router)
app.include_router(chat_router)
app.include_router(voice_router)


@app.get("/")
def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "SkillLab Avatar API is running 🚀"}
