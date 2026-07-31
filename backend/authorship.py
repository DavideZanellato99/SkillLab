"""Chi ha creato e chi ha modificato una riga, scritto senza passare dagli endpoint.

Le sei colonne (``created_at``, ``created_by``, ``created_by_email`` e le tre
gemelle della modifica) stanno in un mixin, e a riempirle non è l'endpoint ma
un listener sul flush della sessione: qualunque strada porti alla scrittura,
l'API di amministrazione, un backfill, un lavoro periodico, la riga esce con
l'autore addosso. Un endpoint che dimentica di valorizzarle non può esistere,
perché non c'è niente da ricordarsi di scrivere.

L'autore è l'utente autenticato della richiesta in corso, lo stesso che il
registro di audit chiama attore: ``get_current_user`` lo pubblica su
``request.state.audit_user``, e il middleware qui sotto tiene lo scope della
richiesta in una ContextVar perché il listener possa raggiungerlo da dentro il
flush, dove di richieste non se ne vedono.

Fuori da una richiesta HTTP (avvio, migrazioni, housekeeping) un autore non
c'è: ``created_by`` resta NULL e l'email dice "sistema", che è la verità e si
legge senza doverla indovinare da un campo vuoto.

L'email è ridondante di proposito, esattamente come nel registro di audit: gli
utenti si cancellano davvero, la chiave esterna diventa NULL insieme a loro, e
senza quello scatto testuale una riga perderebbe il proprio autore il giorno in
cui l'autore lascia l'azienda.
"""

from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Column, DateTime, ForeignKey, String, Uuid, event, text
from sqlalchemy.orm import Session, declared_attr

# Autore delle scritture che non nascono da una richiesta di qualcuno.
SYSTEM_ACTOR_EMAIL = "sistema"

# Autore di cui non resta il nome, perché il suo account è stato cancellato.
# L'email di una persona cancellata non può sopravviverle su righe che non
# sono un registro (vedi erasure), ma la colonna deve dire qualcosa lo stesso:
# qualcuno l'ha creata, e non era il sistema.
DELETED_ACTOR_EMAIL = "utente eliminato"

# Il valore che il database mette da solo nelle colonne temporali quando
# l'INSERT non passa dall'ORM. UTC esplicito e non ``now()``: le colonne sono
# senza fuso e il resto dell'applicazione ci scrive datetime.now(UTC), quindi
# un server con TimeZone diverso da UTC scriverebbe ore che non si possono
# confrontare con le altre.
UTC_NOW_SQL = "(now() AT TIME ZONE 'utc')"

_current_scope: ContextVar[dict[str, Any] | None] = ContextVar("authorship_scope", default=None)


def _now() -> datetime:
    return datetime.now(UTC)


class AuthorshipMiddleware:
    """Pubblica lo scope della richiesta, così il listener ne trova l'attore.

    Middleware ASGI puro invece di BaseHTTPMiddleware: quest'ultimo esegue il
    resto dell'applicazione in un task suo, e la propagazione di una ContextVar
    impostata prima di ``call_next`` finirebbe per dipendere da un dettaglio
    interno di Starlette. Qui in mezzo non c'è nessun task: lo stack sotto gira
    nello stesso contesto, e gli endpoint sincroni che FastAPI manda nel
    threadpool si portano dietro una copia del contesto, che per leggere basta.

    Lo stato vive nello scope, non nell'oggetto Request, quindi il valore che
    ``get_current_user`` scrive su ``request.state`` è lo stesso che si legge
    da qui, pur essendo due istanze diverse di Request.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        scope.setdefault("state", {})
        token = _current_scope.set(scope)
        try:
            await self.app(scope, receive, send)
        finally:
            _current_scope.reset(token)


def current_actor():
    """L'utente autenticato della richiesta in corso, None quando non ce n'è una."""
    scope = _current_scope.get()
    if scope is None:
        return None
    return (scope.get("state") or {}).get("audit_user")


class Authored:
    """Le sei colonne di paternità, per le entità che qualcuno amministra.

    Timestamp e email non ammettono NULL, e hanno un default anche lato
    database: una riga senza data o senza autore non deve poter esistere
    nemmeno se a scriverla è una INSERT scritta a mano.

    ``created_by`` e ``updated_by`` restano invece nullable, e non per
    distrazione: la chiave esterna si azzera quando l'utente viene eliminato,
    ed è l'unico modo per cancellare davvero una persona senza perdere la
    storia delle righe che ha toccato. Il nome di chi è stato resta nella
    colonna email accanto.
    """

    created_at = Column(DateTime, nullable=False, default=_now, server_default=text(UTC_NOW_SQL))
    created_by_email = Column(
        String(255),
        nullable=False,
        default=SYSTEM_ACTOR_EMAIL,
        server_default=SYSTEM_ACTOR_EMAIL,
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=_now,
        onupdate=_now,
        server_default=text(UTC_NOW_SQL),
    )
    updated_by_email = Column(
        String(255),
        nullable=False,
        default=SYSTEM_ACTOR_EMAIL,
        server_default=SYSTEM_ACTOR_EMAIL,
    )

    # declared_attr perché una ForeignKey non si può condividere fra tabelle:
    # ogni classe che usa il mixin ha bisogno della propria.
    @declared_attr
    def created_by(cls):
        return Column(Uuid, _author_fk(cls.__tablename__, "created_by"), nullable=True)

    @declared_attr
    def updated_by(cls):
        return Column(Uuid, _author_fk(cls.__tablename__, "updated_by"), nullable=True)


def _author_fk(table: str, column: str) -> ForeignKey:
    """Il vincolo verso users, aggiunto a parte dopo le tabelle.

    ``use_alter`` perché fra users e organizations le chiavi esterne ora
    girano in tondo: l'utente appartiene all'organizzazione, l'organizzazione
    è stata creata da un utente. Senza, create_all non saprebbe quale delle
    due tabelle scrivere per prima e si fermerebbe lì. Il nome è esplicito
    perché ALTER lo richiede, ed è lo stesso che scrive la migrazione, così
    un database creato da zero e uno migrato hanno gli stessi vincoli.
    """
    return ForeignKey(
        "users.id",
        ondelete="SET NULL",
        use_alter=True,
        name=f"fk_{table}_{column}",
    )


@event.listens_for(Session, "before_flush")
def _stamp_authorship(session: Session, flush_context, instances) -> None:
    """Timbra ogni riga governata che sta per essere scritta.

    Vale per ogni sessione dell'applicazione, comprese quelle dei test: il
    listener è registrato sulla classe Session, non su una fabbrica.

    Le UPDATE massive scritte come ``query(...).update(...)`` non passano di
    qui, perché non passano dagli oggetti: restano fuori di proposito, sono
    backfill di sistema e non l'azione di qualcuno.
    """
    actor = current_actor()
    actor_id = getattr(actor, "id", None)
    actor_email = (getattr(actor, "email", None) or "").strip() or SYSTEM_ACTOR_EMAIL
    now = _now()

    for obj in session.new:
        if isinstance(obj, Authored):
            # Le due date nascono uguali, non a qualche microsecondo di
            # distanza come farebbero due default valutati di seguito: su una
            # riga mai più toccata, updated_at uguale a created_at è la
            # differenza fra "non è mai stata modificata" e "chissà".
            if obj.created_at is None:
                obj.created_at = now
            if obj.updated_at is None:
                obj.updated_at = obj.created_at
            obj.created_by = actor_id
            obj.created_by_email = actor_email
            obj.updated_by = actor_id
            obj.updated_by_email = actor_email

    for obj in session.dirty:
        if isinstance(obj, Authored) and session.is_modified(obj, include_collections=False):
            obj.updated_by = actor_id
            obj.updated_by_email = actor_email
