"""Audit trail: every action a user performs, recorded for the super admin.

One middleware writes the whole registry. It runs after the response is
produced and logs the request only if the route it matched is listed in
ACTIONS below, so the trail is driven by a single table instead of by
``log_action`` calls scattered across the routers: an endpoint that changes
something is covered the day it is added to that table, and read-only GETs
never get in (navigation noise would bury the real actions).

The actor comes from ``request.state.audit_user``, set by
``get_current_user`` — the dependency every protected route already goes
through, whatever the caller's role. Actions that happen before there is an
authenticated user (login, failed login, logout) are recorded explicitly by
``routers/auth`` through ``log_action``.

Two guarantees the rest of the code relies on:

- writing an audit row can never break the request it describes. The write
  runs in its own session, inside try/except: a failure is printed and the
  response goes out untouched.
- nothing here reads the request body. Only whitelisted extras attached by
  an endpoint via ``describe()`` reach ``details``, so passwords, tokens and
  conversation content stay out of the log by construction.
"""

import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from database import SessionLocal
from models import AuditLog
from token_sessions import client_ip

logger = logging.getLogger(__name__)

# How long a log row lives. Rows carry IP and User-Agent, so they are
# personal data: they expire instead of piling up for ever (the purge runs
# at startup, see startup_migrations). Required, with no fallback in code:
# how long personal data is kept is a decision that belongs in the
# configuration, where it is visible, not in a default nobody ever reads.
_RETENTION_DAYS_RAW = (os.getenv("AUDIT_LOG_RETENTION_DAYS") or "").strip()
if not _RETENTION_DAYS_RAW.isdigit() or int(_RETENTION_DAYS_RAW) < 1:
    raise RuntimeError(
        "AUDIT_LOG_RETENTION_DAYS non configurato o non valido (giorni di "
        "conservazione dei log, intero positivo). Aggiungilo al file .env del backend."
    )
RETENTION_DAYS = int(_RETENTION_DAYS_RAW)

# Session factory used by the writer. A module attribute rather than a
# direct SessionLocal call so the test suite can point it at its own
# rolled-back connection.
session_factory = SessionLocal


class AuditAction(NamedTuple):
    """An action worth recording, and how to describe it.

    ``resource_param`` is the name of the path parameter holding the id of
    the thing being acted on ("user_id", "conversation_id"...), so the
    middleware can fill ``resource_id`` without the endpoint's help.
    """

    key: str
    label: str
    resource_type: str | None = None
    resource_param: str | None = None


# ── Authentication (logged explicitly by routers/auth) ────
LOGIN = AuditAction("auth.login", "Accesso effettuato")
LOGIN_FAILED = AuditAction("auth.login_failed", "Accesso fallito")
LOGOUT = AuditAction("auth.logout", "Uscita")
PASSWORD_SET = AuditAction("auth.password_set", "Prima password impostata")

AUTH_ACTIONS = [LOGIN, LOGIN_FAILED, LOGOUT, PASSWORD_SET]

# ── Everything else, keyed by (method, route template) ────
# The key is the templated path FastAPI matched ("/api/admin/users/{user_id}"),
# not the concrete one, so a route is listed once and matches every id.
ACTIONS: dict[tuple[str, str], AuditAction] = {
    # Profilo personale (ogni ruolo). Il cambio password passa da
    # get_current_user, quindi lo copre il middleware come ogni altra
    # azione: solo login, logout e primo accesso restano espliciti.
    ("PUT", "/api/auth/me"): AuditAction("profile.update", "Profilo aggiornato", "user"),
    ("POST", "/api/auth/change-password"): AuditAction(
        "auth.password_changed", "Password modificata", "user"
    ),
    # Utenti
    ("POST", "/api/admin/users"): AuditAction("user.create", "Utente creato", "user"),
    ("PUT", "/api/admin/users/{user_id}"): AuditAction(
        "user.update", "Utente modificato", "user", "user_id"
    ),
    ("PUT", "/api/admin/users/{user_id}/status"): AuditAction(
        "user.status", "Stato utente modificato", "user", "user_id"
    ),
    ("POST", "/api/admin/users/{user_id}/resend-credentials"): AuditAction(
        "user.resend_credentials", "Credenziali reinviate", "user", "user_id"
    ),
    ("DELETE", "/api/admin/users/{user_id}"): AuditAction(
        "user.delete", "Utente eliminato", "user", "user_id"
    ),
    # Organizzazioni
    ("POST", "/api/admin/organizations"): AuditAction(
        "organization.create", "Organizzazione creata", "organization"
    ),
    ("PUT", "/api/admin/organizations/{organization_id}"): AuditAction(
        "organization.update", "Organizzazione modificata", "organization", "organization_id"
    ),
    ("PUT", "/api/admin/organizations/{organization_id}/status"): AuditAction(
        "organization.status",
        "Stato organizzazione modificato",
        "organization",
        "organization_id",
    ),
    ("DELETE", "/api/admin/organizations/{organization_id}"): AuditAction(
        "organization.delete", "Organizzazione eliminata", "organization", "organization_id"
    ),
    # Avatar
    ("POST", "/api/admin/avatars"): AuditAction("avatar.create", "Avatar creato", "avatar"),
    ("PUT", "/api/admin/avatars/{avatar_id}"): AuditAction(
        "avatar.update", "Avatar modificato", "avatar", "avatar_id"
    ),
    ("DELETE", "/api/admin/avatars/{avatar_id}"): AuditAction(
        "avatar.delete", "Avatar archiviato", "avatar", "avatar_id"
    ),
    ("POST", "/api/admin/avatars/{avatar_id}/restore"): AuditAction(
        "avatar.restore", "Avatar ripristinato", "avatar", "avatar_id"
    ),
    ("POST", "/api/admin/avatars/image"): AuditAction(
        "avatar.image_upload", "Immagine avatar caricata", "avatar"
    ),
    ("POST", "/api/avatars/select"): AuditAction("avatar.select", "Avatar selezionato", "avatar"),
    # Conversazioni
    ("POST", "/api/chat/message"): AuditAction(
        "conversation.message", "Messaggio inviato in chat", "conversation"
    ),
    ("PATCH", "/api/chat/conversation/{conversation_id}"): AuditAction(
        "conversation.rename", "Conversazione rinominata", "conversation", "conversation_id"
    ),
    ("POST", "/api/chat/conversation/{conversation_id}/end"): AuditAction(
        "conversation.end", "Conversazione chiusa", "conversation", "conversation_id"
    ),
    ("POST", "/api/chat/conversation/{conversation_id}/evaluate"): AuditAction(
        "conversation.evaluate", "Valutazione generata", "conversation", "conversation_id"
    ),
    ("DELETE", "/api/admin/conversations/{conversation_id}"): AuditAction(
        "conversation.delete", "Conversazione eliminata", "conversation", "conversation_id"
    ),
    # Chiamate vocali
    ("POST", "/api/voice/session"): AuditAction(
        "voice.session", "Chiamata avviata", "conversation"
    ),
    ("POST", "/api/voice/recording/{conversation_id}"): AuditAction(
        "voice.recording", "Registrazione caricata", "conversation", "conversation_id"
    ),
    # Revisione del docente sulle conversazioni. Il contenuto (nota,
    # motivazione, annotazioni) resta fuori dal registro: è testo libero
    # scritto su una persona, qui basta sapere chi è intervenuto e quando.
    ("PUT", "/api/admin/conversations/{conversation_id}/review"): AuditAction(
        "review.save", "Revisione salvata", "conversation", "conversation_id"
    ),
    ("DELETE", "/api/admin/conversations/{conversation_id}/review"): AuditAction(
        "review.delete", "Revisione eliminata", "conversation", "conversation_id"
    ),
    ("PUT", "/api/admin/conversations/{conversation_id}/annotations"): AuditAction(
        "review.annotate", "Messaggio annotato", "conversation", "conversation_id"
    ),
    ("DELETE", "/api/admin/annotations/{annotation_id}"): AuditAction(
        "review.annotation_delete", "Annotazione eliminata", "annotation", "annotation_id"
    ),
    # Percorsi di training
    ("POST", "/api/training/assignments"): AuditAction(
        "training.assign", "Obiettivo assegnato", "assignment"
    ),
    ("DELETE", "/api/training/assignments/{assignment_id}"): AuditAction(
        "training.delete", "Obiettivo eliminato", "assignment", "assignment_id"
    ),
}

# key → label for every action the system can write, the catalogue the
# filter dropdown is built from. Labels are resolved at read time: an
# action recorded by an older version keeps its key and simply falls back
# to it if the label has since disappeared.
ACTION_LABELS: dict[str, str] = {a.key: a.label for a in [*AUTH_ACTIONS, *ACTIONS.values()]}


def action_label(key: str) -> str:
    """Italian label of an action key, the key itself if unknown."""
    return ACTION_LABELS.get(key, key)


def describe(request: Request, **details: Any) -> None:
    """Attach extra detail to the audit row of the current request.

    For endpoints whose path does not identify what they touched (a
    creation, mostly). Only pass fields that are safe to store for ever:
    ids, names, emails, roles — never secrets or free text written by a
    user.
    """
    current = getattr(request.state, "audit_details", None) or {}
    request.state.audit_details = {**current, **details}


def _user_agent(request: Request) -> str:
    return (request.headers.get("user-agent") or "")[:400]


def _write(**fields: Any) -> None:
    """Insert one row in its own session, swallowing every failure.

    The audit trail must never take a request down with it: a broken write
    is printed and forgotten.
    """
    db = session_factory()
    try:
        db.add(AuditLog(**fields))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Audit log non registrato (%s)", fields.get("action"))
    finally:
        db.close()


def log_action(
    action: AuditAction,
    request: Request,
    *,
    user=None,
    user_email: str = "",
    status_code: int = 200,
    resource_id: str | None = None,
    **details: Any,
) -> None:
    """Record an action explicitly, for what the middleware cannot see.

    Used by the authentication endpoints: at login there is no
    ``request.state.audit_user`` yet, and a failed login has no user at
    all — only the email that was attempted, which is what ``user_email``
    carries in that case.
    """
    _write(
        user_id=user.id if user else None,
        user_email=(user.email if user else user_email) or "",
        user_role=(user.ruolo if user else "") or "",
        organization_id=user.organization_id if user else None,
        organization_name=user.organization_name if user else None,
        action=action.key,
        resource_type=action.resource_type,
        resource_id=resource_id,
        method=request.method,
        path=request.url.path,
        status_code=status_code,
        client_ip=client_ip(request),
        user_agent=_user_agent(request),
        details=details or None,
    )


def purge_cutoff() -> datetime:
    """Timestamp before which log rows have expired (naive UTC, like the column)."""
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=RETENTION_DAYS)


class AuditMiddleware(BaseHTTPMiddleware):
    """Writes one audit row per completed request that changed something."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        try:
            self._record(request, response.status_code)
        except Exception:
            # The response must go out whatever happens to its audit row.
            logger.exception("Audit middleware")
        return response

    @staticmethod
    def _record(request: Request, status_code: int) -> None:
        route = request.scope.get("route")
        route_path = getattr(route, "path", None)
        if not route_path:
            # No route matched (404 on an unknown path): nothing was touched.
            return

        action = ACTIONS.get((request.method, route_path))
        if action is None:
            return

        user = getattr(request.state, "audit_user", None)
        if user is None:
            # Rejected before the auth dependency could identify anyone
            # (401/403): the request never reached the endpoint, and the
            # authentication attempts that matter are logged by routers/auth.
            return

        resource_id = None
        if action.resource_param:
            value = request.path_params.get(action.resource_param)
            resource_id = str(value) if value is not None else None

        _write(
            user_id=user.id,
            user_email=user.email,
            user_role=user.ruolo,
            organization_id=user.organization_id,
            organization_name=user.organization_name,
            action=action.key,
            resource_type=action.resource_type,
            resource_id=resource_id,
            method=request.method,
            path=request.url.path,
            status_code=status_code,
            client_ip=client_ip(request),
            user_agent=_user_agent(request),
            details=getattr(request.state, "audit_details", None) or None,
        )
