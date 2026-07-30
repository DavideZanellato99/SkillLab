"""Database configuration and session management.

Il pool è configurato a mano invece di lasciare i default di SQLAlchemy,
perché quei default (5 connessioni più 10 di sfogo) sono pensati per un
processo solo, e da qui in avanti i processi sono diversi.

**Il conto da fare è per installazione, non per processo:** ogni replica
tiene il proprio pool, quindi il totale che il database si vede arrivare è
``repliche * (pool_size + max_overflow)``, e Postgres ne accetta 100 se non
gli si dice altro (vedi ``max_connections`` in docker-compose.yml, alzato di
conseguenza). Con i valori qui sotto, quattro repliche chiedono al massimo
80 connessioni, e restano fuori dal conto il backup e qualunque client ci si
attacchi per guardare i dati.

C'è un secondo effetto, meno ovvio del primo. Le scritture del percorso
vocale passano da ``asyncio.to_thread`` (vedi ``voice_pipeline``), e ogni
thread si prende una connessione: quando molte chiamate chiudono un turno
nello stesso momento, i thread sono più delle connessioni disponibili e le
scritture si mettono in fila. Sono fire and forget, quindi non bloccano
l'audio, ma a pool esaurito la coda cresce finché le scritture cominciano a
fallire, cioè finché si perdono pezzi di trascrizione senza che nessuno se
ne accorga. Da qui uno sfogo (``max_overflow``) largo rispetto al numero di
connessioni stabili: il carico di questa app è a picchi, non piatto.
"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL non configurata. Aggiungila al file .env del backend.")


def _positive_int(name: str, default: int) -> int:
    """Un intero dall'ambiente, o il default. Zero e negativi non passano."""
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise RuntimeError(
            f"{name} non valido (intero > 0). Correggilo nel file .env del backend."
        ) from None
    if value <= 0:
        raise RuntimeError(f"{name} deve essere maggiore di zero.")
    return value


# Connessioni tenute aperte da questo processo anche quando non servono.
_POOL_SIZE = _positive_int("DB_POOL_SIZE", 5)
# Quante se ne aprono in più durante un picco, chiuse appena il picco passa.
_MAX_OVERFLOW = _positive_int("DB_MAX_OVERFLOW", 15)

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_size=_POOL_SIZE,
    max_overflow=_MAX_OVERFLOW,
    # Quanto una richiesta aspetta un posto libero prima di arrendersi. Il
    # default di SQLAlchemy è 30 secondi, che su una richiesta web è
    # un'eternità passata a tenere occupato un thread: se il pool è pieno da
    # dieci secondi il problema non lo risolve l'undicesimo.
    pool_timeout=10,
    # Una connessione che dorme nel pool può essere già morta dall'altra
    # parte (Postgres riavviato, un NAT che ha chiuso la sessione): senza
    # questo, la prima query dopo la notte fallisce con "server closed the
    # connection unexpectedly". Costa un SELECT 1 per prelievo, che è nulla
    # rispetto a un errore che si presenta solo in produzione e solo a volte.
    pool_pre_ping=True,
    # Nessuna connessione più vecchia di mezz'ora: le sessioni longeve sono
    # quelle che i firewall tagliano per primi, e su un'installazione che
    # nessuno tocca più le connessioni durerebbero mesi.
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that provides a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
