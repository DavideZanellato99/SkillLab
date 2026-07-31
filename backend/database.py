"""Database configuration and session management.

Il pool è configurato a mano invece di lasciare i default di SQLAlchemy,
perché quei default (5 connessioni più 10 di sfogo) sono pensati per un
processo solo, e da qui in avanti i processi sono diversi.

**Il conto da fare è per installazione, non per processo:** ogni replica
tiene il proprio pool, quindi il totale che il database si vede arrivare è
``repliche * (pool_size + max_overflow)``, e Postgres ne accetta 100 se non
gli si dice altro (vedi ``max_connections`` in docker-compose.yml, alzato di
conseguenza). Con i valori che stanno nel .env del backend (i numeri non
sono scritti qui: questo modulo li legge e basta), quattro repliche chiedono
al massimo 80 connessioni, e restano fuori dal conto il backup e qualunque
client ci si attacchi per guardare i dati.

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

import logging
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL non configurata. Aggiungila al file .env del backend.")


def _positive_int(name: str) -> int:
    """Un intero dall'ambiente. Zero, negativi e assente non passano."""
    raw = (os.getenv(name) or "").strip()
    if not raw:
        raise RuntimeError(f"{name} non configurato (intero > 0). Aggiungilo al file .env.")
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
_POOL_SIZE = _positive_int("DB_POOL_SIZE")
# Quante se ne aprono in più durante un picco, chiuse appena il picco passa.
_MAX_OVERFLOW = _positive_int("DB_MAX_OVERFLOW")

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


def log_connection_budget() -> None:
    """Scrive nei log quante repliche come questa entrano nel tetto del database.

    Il conto sta scritto in due posti che nessuno cambia insieme: il tetto
    di Postgres nel .env accanto al compose, il pool di ogni processo nel
    .env del backend. Moltiplicati fra loro danno il numero che conta, e
    finché resta un conto da fare a mente lo si fa una volta sola, il primo
    giorno, e poi si scala a otto repliche senza rifarlo.

    Qui viene rifatto a ogni avvio, coi numeri veri chiesti al database, e
    scritto nei log. Non ferma niente e non decide niente: un tetto stretto
    non è un errore di configurazione, è una scelta che va vista.

    Un avviso esce solo per un fatto misurato, non per una soglia inventata:
    quando le connessioni libere adesso sono meno di quelle che questo
    processo può chiedere nel suo picco, cioè quando andare a pieno carico
    significherebbe lasciare qualcuno fuori.
    """
    picco_di_un_processo = _POOL_SIZE + _MAX_OVERFLOW
    try:
        with engine.connect() as conn:
            massimo = int(conn.execute(text("SHOW max_connections")).scalar())
            riservate = int(conn.execute(text("SHOW superuser_reserved_connections")).scalar())
            in_uso = int(
                conn.execute(
                    text("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()")
                ).scalar()
            )
    except Exception:
        # Diagnostica: se il database non risponde il problema è un altro, e
        # lo dirà molto più chiaramente la prima richiesta vera.
        logger.warning("Non sono riuscito a leggere il tetto delle connessioni del database.")
        return

    utilizzabili = massimo - riservate
    quante_repliche = utilizzabili // picco_di_un_processo
    logger.info(
        "Connessioni: il database ne accetta %d (%d riservate), questo processo ne può "
        "chiedere fino a %d nel picco, quindi ci stanno %d repliche come questa. "
        "In uso adesso: %d.",
        massimo,
        riservate,
        picco_di_un_processo,
        quante_repliche,
        in_uso,
    )
    libere = utilizzabili - in_uso
    if libere < picco_di_un_processo:
        logger.warning(
            "Restano %d connessioni libere, meno delle %d che questo processo può chiedere "
            "nel picco: sotto carico qualche richiesta non ne troverà una. Alza "
            "DB_MAX_CONNECTIONS nel .env accanto al compose, o riduci le repliche.",
            libere,
            picco_di_un_processo,
        )


def get_db():
    """Dependency that provides a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
