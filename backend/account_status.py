"""Se un account può usare la piattaforma, e perché no.

Sta in un modulo suo e non dentro ``auth_dependency`` perché la stessa
domanda se la fanno strade molto diverse: la dipendenza di ogni richiesta
HTTP, l'accesso prima di consegnare i cookie, e il registro delle sessioni
vocali, che l'unica rotta senza dipendenza di autenticazione (il WebSocket
della chiamata) interroga per conto proprio.

Qui dentro non entra niente che parli con la rete: chi importa questo
modulo non deve trascinarsi dietro il client di Cognito, che ``auth_dependency``
carica all'import. La regola è una sola e vale per tutti, e nessuno la
riscrive per conto suo.
"""

from models import ORG_STATUS_ACTIVE, USER_STATUS_ACTIVE, User

# Perché un account è bloccato, nelle parole che legge l'utente. L'accesso
# e ogni richiesta autenticata rispondono con queste stesse due frasi.
ACCOUNT_BLOCKED_MESSAGE = "L'account è stato sospeso o disabilitato. Contatta l'amministratore."
ORGANIZATION_BLOCKED_MESSAGE = "L'organizzazione è stata sospesa. Contatta l'amministratore."


def access_denied_reason(user: User) -> str | None:
    """Why `user` cannot use the platform, None when the account is free to.

    Suspended or disabled accounts die immediately: the check runs on every
    request, so tokens already issued stop working the moment the admin
    flips the status (Cognito alone would let them live until exp).
    Suspending the whole organization locks out every one of its users the
    same way. The super admin has no organization, so it is never caught by
    the second rule.

    The login calls this too, before handing out any cookie: a check on the
    request path alone would let a locked-out user sign in successfully and
    be thrown out by the very next call, with an access recorded in the
    audit trail and last_login_at stamped for a session that never was.

    Il socket vocale la chiama dal registro delle sessioni, che è l'unico
    posto dove quella verifica può stare per una rotta che non passa dalla
    dipendenza di autenticazione (vedi ``voice_sessions``).
    """
    if user.status != USER_STATUS_ACTIVE:
        return ACCOUNT_BLOCKED_MESSAGE
    if user.organization is not None and user.organization.status != ORG_STATUS_ACTIVE:
        # The admin's own wording when there is one: someone locked out of
        # their training deserves the actual reason, not a generic wall.
        reason = (user.organization.suspension_reason or "").strip()
        if reason:
            return f"L'organizzazione è stata sospesa: {reason}"
        return ORGANIZATION_BLOCKED_MESSAGE
    return None
