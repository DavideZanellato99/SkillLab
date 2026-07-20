"""FastAPI application entry point."""

# Use the Windows/OS certificate store for TLS verification (fixes
# CERTIFICATE_VERIFY_FAILED behind TLS-inspecting proxies/antivirus).
# Must run before any HTTP client is imported.
import truststore

truststore.inject_into_ssl()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from database import engine, Base, SessionLocal
from routers.avatars import router as avatars_router
from routers.chat import router as chat_router
from routers.auth import router as auth_router
from routers.admin import router as admin_router
from routers.admin_avatars import router as admin_avatars_router
from routers.voice import router as voice_router
from auth_dependency import get_or_create_mock_admin, ensure_roles

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

# Ensure system roles and the mock super admin exist on startup
with SessionLocal() as _db:
    ensure_roles(_db)
    get_or_create_mock_admin(_db)

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
app.include_router(avatars_router)
app.include_router(chat_router)
app.include_router(voice_router)


@app.get("/")
def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "SkillLab Avatar API is running 🚀"}
