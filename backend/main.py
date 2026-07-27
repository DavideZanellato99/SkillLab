"""FastAPI application entry point."""

# TLS verification against the OS certificate store (see tls_setup).
# Kept first so the injection happens before any HTTP client is imported,
# even though the modules that need it import tls_setup themselves.
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import tls_setup  # noqa: F401
from audit import AuditMiddleware
from database import Base, engine
from routers.admin import router as admin_router
from routers.admin_avatars import router as admin_avatars_router
from routers.audit_logs import router as audit_logs_router
from routers.auth import router as auth_router
from routers.avatars import router as avatars_router
from routers.chat import router as chat_router
from routers.organizations import router as organizations_router
from routers.training import router as training_router
from routers.voice import router as voice_router
from startup_migrations import run_startup_migrations

# Create all database tables, then bring an existing database up to date.
# create_all only creates missing tables; everything else (added columns,
# backfills, tightened constraints, seed roles) lives in run_startup_migrations
# and is idempotent. Both run at import so the schema is ready before the app
# serves a request or a test fixture touches a table.
Base.metadata.create_all(bind=engine)
run_startup_migrations()

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

# Audit trail: records every request that changes something, whoever makes
# it. Added after CORS so it sits *inside* it (middlewares run in reverse
# order of registration): preflight OPTIONS never reach it, and a rejected
# cross-origin call is not logged as an action.
app.add_middleware(AuditMiddleware)

# Serve static avatar images
os.makedirs("static/avatars", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(admin_avatars_router)
app.include_router(audit_logs_router)
app.include_router(organizations_router)
app.include_router(avatars_router)
app.include_router(chat_router)
app.include_router(training_router)
app.include_router(voice_router)


@app.get("/")
def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "SkillLab Avatar API is running 🚀"}
