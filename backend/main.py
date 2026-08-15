"""FastAPI application entry point."""

# TLS verification against the OS certificate store (see tls_setup).
# Kept first so the injection happens before any HTTP client is imported,
# even though the modules that need it import tls_setup themselves.
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import housekeeping
import tls_setup  # noqa: F401
from audit import AuditMiddleware
from authorship import AuthorshipMiddleware
from database import log_connection_budget, replica_health
from routers.admin import router as admin_router
from routers.admin_avatar_categories import router as admin_avatar_categories_router
from routers.admin_avatars import router as admin_avatars_router
from routers.admin_debriefings import router as admin_debriefings_router
from routers.admin_simulations import router as admin_simulations_router
from routers.admin_voices import router as admin_voices_router
from routers.audit_logs import router as audit_logs_router
from routers.auth import router as auth_router
from routers.avatars import router as avatars_router
from routers.chat import router as chat_router
from routers.comparison import router as comparison_router
from routers.conversation_reviews import router as conversation_reviews_router
from routers.notifications import router as notifications_router
from routers.organizations import router as organizations_router
from routers.simulations import router as simulations_router
from routers.training import router as training_router
from routers.voice import router as voice_router
from startup_migrations import prepare_schema

# Uvicorn configures its own loggers and leaves the root one alone, so
# without this every logger.info() in the app writes to nowhere: the
# retention sweep would apply its windows in complete silence, and a purge
# nobody can see in the logs is a purge nobody can prove ever ran. INFO by
# default (LOG_LEVEL overrides it) because on an install that is deployed
# once and never touched, the logs are the only witness there is.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

logger = logging.getLogger(__name__)

# Create all database tables, then bring an existing database up to date.
# create_all only creates missing tables; everything else (added columns,
# backfills, tightened constraints, seed roles) lives in startup_migrations
# and is idempotent. Runs at import so the schema is ready before the app
# serves a request or a test fixture touches a table, and behind an advisory
# lock so several replicas starting together do not run it at once.
prepare_schema()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Own the background sweep for exactly as long as the app is serving.

    The retention windows are enforced by a loop inside the process (see
    ``housekeeping``) rather than by an external scheduler: an install that
    is deployed once and never touched again still has to keep the promises
    its informativa makes.

    Prima parte, una riga nei log col conto delle connessioni: il tetto del
    database e il pool di questo processo stanno in due file diversi, e
    moltiplicati fra loro dicono quante repliche ci stanno davvero.
    """
    log_connection_budget()
    housekeeping.start()
    yield
    await housekeeping.stop()


app = FastAPI(
    title="SkillLab — Avatar Selection API",
    description="API for browsing and selecting avatars.",
    version="1.0.0",
    lifespan=lifespan,
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

# Paternità delle righe: tiene a portata del flush l'utente della richiesta,
# così created_by/updated_by si scrivono da soli (vedi authorship). Registrato
# per ultimo, quindi è il più interno: quando arriva al database c'è già.
app.add_middleware(AuthorshipMiddleware)

# Serve static avatar images
os.makedirs("static/avatars", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(admin_avatars_router)
app.include_router(admin_avatar_categories_router)
app.include_router(admin_debriefings_router)
app.include_router(admin_simulations_router)
app.include_router(admin_voices_router)
app.include_router(audit_logs_router)
app.include_router(organizations_router)
app.include_router(avatars_router)
app.include_router(chat_router)
app.include_router(comparison_router)
app.include_router(conversation_reviews_router)
app.include_router(notifications_router)
app.include_router(simulations_router)
app.include_router(training_router)
app.include_router(voice_router)


@app.get("/")
def root():
    """Il processo è vivo e risponde, e nient'altro.

    È la domanda che si fa a un container per sapere se va riavviato, quindi
    non tocca il database di proposito: un database irraggiungibile non è una
    cosa che si risolve riavviando le repliche, e un healthcheck che lo
    guardasse farebbe risultare malato tutto lo stack per un guasto che sta
    altrove. La usano l'healthcheck del compose e lo smoke test della CI.

    Se questa replica sia in grado di *servire* una richiesta lo dice invece
    ``/health``, ed è quello che guarda il proxy per decidere dove mandare le
    chiamate.
    """
    return {"status": "ok", "message": "SkillLab Avatar API is running 🚀"}


@app.get("/health")
def health(response: Response):
    """Questa replica può servire una richiesta che tocca il database.

    Il proxy la interroga ogni dieci secondi e smette di mandare traffico a
    chi risponde male (vedi ``caddy/Caddyfile``). Quello che rende diverse le
    due risposte, e il perché di ciascuna, sta in ``database.replica_health``.

    Non è raggiungibile da fuori: il proxy inoltra al backend solo ``/api`` e
    ``/static``, e questa rotta la chiama sulla porta interna. Quello che
    scrive nel corpo è comunque materiale da log, non da pagina.
    """
    healthy, detail = replica_health()
    if not healthy:
        # 503 e non 500: non è un errore di questa richiesta, è questa
        # replica che chiede di essere lasciata in pace per un momento.
        response.status_code = 503
        logger.warning("Controllo di salute negativo: %s", detail)
    return {"status": "ok" if healthy else "degraded", "detail": detail}
