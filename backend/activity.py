"""Quando un account è stato visto vivo l'ultima volta.

L'ultimo accesso (``users.last_login_at``) racconta solo metà della storia:
una sessione si rinnova da sola finché il browser resta aperto, quindi la
data dell'accesso può essere di settimane fa mentre la persona sta usando la
piattaforma adesso. Qui si scrive l'altra metà, ``users.last_activity_at``:
il momento dell'ultima richiesta autenticata, qualunque essa sia.

Attività è quello che fa una persona, non quello che fa il browser da solo:
le rotte che l'applicazione interroga a intervalli per conto proprio sono
elencate in ``POLLED_ROUTES`` e non timbrano niente. Senza quella lista una
scheda dimenticata aperta risulterebbe qualcuno che sta lavorando.

Tre scelte che tengono in piedi il resto del modulo:

- **Si scrive a intervalli, non a ogni richiesta.** Una UPDATE per ogni
  chiamata API significherebbe una scrittura per ogni click, per ogni utente
  collegato, per un dato che si legge in una scheda di amministrazione.
  Il valore viene riscritto solo quando ha superato ``STAMP_INTERVAL``, che
  è anche la risoluzione con cui va letto: "attivo cinque minuti fa" e
  "attivo adesso" sono la stessa risposta.
- **Con una UPDATE scritta a mano, non passando dall'ORM.** Le colonne di
  paternità di ``users`` (vedi ``authorship``) direbbero altrimenti che ogni
  utente collegato riscrive se stesso ogni cinque minuti, seppellendo la
  modifica vera fatta da un amministratore. Scrivere l'attributo la farebbe
  timbrare dal listener sul flush; costruire la UPDATE con ``update(User)``
  eviterebbe il listener ma non l'``onupdate`` di ``updated_at``, che
  SQLAlchemy applica a ogni UPDATE emessa su quella tabella, e la data di
  modifica si sposterebbe lo stesso. Il SQL diretto non passa da nessuno
  dei due.
- **Su una sessione propria**, come il registro di audit: l'attività è un
  fatto avvenuto, e resta scritta anche se la richiesta che l'ha prodotta
  finisce in errore e si porta dietro la propria transazione. Tenerla fuori
  significa anche non committare mai la sessione dell'endpoint prima che
  l'endpoint abbia cominciato.

Come per l'audit, una scrittura fallita non può far cadere la richiesta che
descrive: viene registrata nei log e dimenticata.
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.orm.attributes import set_committed_value

from database import SessionLocal
from models import User

logger = logging.getLogger(__name__)

_STAMP = text("UPDATE users SET last_activity_at = :adesso WHERE id = :utente")

# Quanto il valore può invecchiare prima di essere riscritto. Cinque minuti
# sono sotto la soglia di ciò che una scheda di amministrazione mostra
# ("oggi", "3 giorni fa") e sopra la frequenza dei click di una persona.
STAMP_INTERVAL = timedelta(minutes=5)

# Le richieste che l'applicazione fa da sola, che quindi non dicono niente su
# chi le riceve: la campanella si ricontrolla ogni due minuti finché la pagina
# resta aperta, e rilegge anche solo tornando sulla scheda (vedi
# `useNotifications` nel frontend). Segnarle come lette invece resta attività:
# quello è un click. La chiave è (metodo, rotta templata) come nel registro di
# audit, così una rotta si elenca una volta e vale per ogni id.
POLLED_ROUTES = {("GET", "/api/notifications")}

# Fabbrica di sessioni del modulo, sostituibile dai test perché le loro
# scritture restino dentro la transazione che il test annulla.
session_factory = SessionLocal


def _now() -> datetime:
    """Adesso in UTC, senza fuso: la colonna è ``TIMESTAMP`` senza fuso, e un
    valore consapevole non si potrebbe confrontare con quello riletto."""
    return datetime.now(UTC).replace(tzinfo=None)


def _is_polled(request: Request) -> bool:
    """Se la richiesta è una di quelle che il browser fa da solo.

    La rotta si legge dallo scope, dove il router l'ha già messa prima di
    risolvere le dependency. Se non c'è (una richiesta che non ha trovato
    nessuna rotta) la risposta è no, e il caso non si presenta comunque: qui
    ci si arriva solo da un endpoint.
    """
    route_path = getattr(request.scope.get("route"), "path", None)
    return (request.method, route_path) in POLLED_ROUTES


def touch(request: Request, user: User) -> None:
    """Segna l'utente come attivo adesso, se è ora di riscrivere il valore.

    Chiamata da ``get_current_user`` per ogni richiesta autenticata, incluse
    quelle che l'endpoint respinge poi con un 403 di ruolo: chi bussa alla
    porta sbagliata sta comunque usando la piattaforma. Restano fuori le
    richieste di un account sospeso, rifiutate prima ancora di arrivare qui
    (non sono attività, sono una sessione che non muore da sola), e quelle
    che il browser fa per conto suo (``POLLED_ROUTES``).
    """
    if _is_polled(request):
        return

    now = _now()
    previous = user.last_activity_at
    if previous is not None and now - previous < STAMP_INTERVAL:
        return

    db = session_factory()
    try:
        db.execute(_STAMP, {"adesso": now, "utente": user.id})
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Ultima attività non registrata (utente %s)", user.id)
        return
    finally:
        db.close()

    # L'oggetto della richiesta non è passato dalla UPDATE e mostrerebbe
    # ancora il valore vecchio a chi lo serializza (``/api/auth/me``).
    # `set_committed_value` lo allinea senza sporcarlo: assegnarlo e basta
    # lo renderebbe modificato, ed è proprio quello che si sta evitando.
    set_committed_value(user, "last_activity_at", now)
