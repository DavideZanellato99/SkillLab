"""Rate limiter a finestra scorrevole, condiviso fra tutte le repliche.

Conta eventi dentro una finestra che scorre, e dice quanto manca prima che
se ne possa fare un altro. Due usi, che chiedono la stessa cosa per motivi
diversi:

- **il login**, dove si registrano solo i tentativi falliti, per rallentare
  chi prova password a raffica (vedi ``routers/auth``);
- **le chiamate al modello**, dove si registra ogni chiamata riuscita,
  perché lì il danno non è indovinare qualcosa, è la bolletta (vedi
  ``llm_limits``).

Il conteggio sta su Postgres e non nella memoria del processo, che è la
differenza fra un limite e l'apparenza di un limite: con quattro repliche
dietro un bilanciatore, quattro contatori in RAM concedono a un attaccante
quattro volte i tentativi, e nessuno dei quattro processi vede mai l'attacco
per intero. Un blocco che si aggira cambiando connessione non è un blocco.

Le due funzioni che scrivono aprono una sessione DB tutta loro, come fa
``audit``, e per lo stesso motivo: l'evento va registrato anche quando la
richiesta che lo ha prodotto finisce con un errore, e la sessione di quella
richiesta non arriverà mai a un commit.

Le righe contengono un indirizzo IP o l'id di un utente, quindi vengono
buttate presto: quelle fuori finestra spariscono mentre si conta, e
``purge_expired`` raccoglie il resto dallo sweep di ``housekeeping``.

La tabella si chiama ancora ``login_attempts`` perché è lì che il
meccanismo è nato, ed è l'unico posto in cui il nome si vede: rinominarla
costerebbe una migrazione e non cambierebbe niente per nessuno.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.engine import Connection

from database import SessionLocal
from models import LoginAttempt

# Sostituibile dalla suite, come ``audit.session_factory``.
session_factory = SessionLocal

# Le finestre effettivamente in uso, registrate dalle istanze man mano che
# nascono: ``purge_expired`` deve sapere cosa può buttare senza allentare
# di nascosto un limite, e nessuno deve ricordarsi di tenerlo aggiornato.
_windows_in_use: set[int] = set()


def _utcnow() -> datetime:
    """Naive UTC, come la colonna su cui si confronta."""
    return datetime.now(UTC).replace(tzinfo=None)


class SlidingWindowLimiter:
    """Conta gli eventi di una chiave su una finestra che scorre."""

    def __init__(self, scope: str, max_events: int, window_seconds: int):
        # Distingue i secchielli fra loro: senza, un indirizzo IP e
        # un'email potrebbero contarsi a vicenda.
        self.scope = scope
        self.max_events = max_events
        self.window_seconds = window_seconds
        _windows_in_use.add(window_seconds)

    def _cutoff(self, now: datetime) -> datetime:
        return now - timedelta(seconds=self.window_seconds)

    def retry_after(self, key: str) -> int:
        """Secondi da aspettare prima di un nuovo tentativo (0 = si può)."""
        with session_factory() as db:
            now = _utcnow()
            registrati = [
                riga[0]
                for riga in db.query(LoginAttempt.created_at)
                .filter(
                    LoginAttempt.scope == self.scope,
                    LoginAttempt.key == key,
                    LoginAttempt.created_at > self._cutoff(now),
                )
                .order_by(LoginAttempt.created_at.asc())
                .all()
            ]
            if len(registrati) < self.max_events:
                return 0
            # Un posto si libera quando l'evento più vecchio esce dalla
            # finestra.
            libero_fra = (registrati[0] + timedelta(seconds=self.window_seconds)) - now
            return max(1, int(libero_fra.total_seconds()) + 1)

    def record(self, key: str) -> None:
        with session_factory() as db:
            now = _utcnow()
            # Pulizia opportunistica della sola chiave toccata: tiene la
            # tabella corta senza dover passare su tutto il resto.
            db.query(LoginAttempt).filter(
                LoginAttempt.scope == self.scope,
                LoginAttempt.key == key,
                LoginAttempt.created_at <= self._cutoff(now),
            ).delete(synchronize_session=False)
            db.add(LoginAttempt(scope=self.scope, key=key, created_at=now))
            db.commit()

    def reset(self, key: str) -> None:
        with session_factory() as db:
            db.query(LoginAttempt).filter(
                LoginAttempt.scope == self.scope, LoginAttempt.key == key
            ).delete(synchronize_session=False)
            db.commit()


def purge_expired(conn: Connection) -> int:
    """Elimina gli eventi fuori da qualunque finestra ancora in uso.

    Prudente di proposito: cancella solo ciò che è più vecchio della finestra
    più lunga configurata, così nessun limite si accorcia di nascosto perché
    la pulizia è passata prima del conteggio.
    """
    if not _windows_in_use:
        return 0
    cutoff = _utcnow() - timedelta(seconds=max(_windows_in_use))
    return conn.execute(delete(LoginAttempt).where(LoginAttempt.created_at < cutoff)).rowcount
