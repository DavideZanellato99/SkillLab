"""Il lock che impedisce a due repliche di preparare lo schema insieme.

Serve dal momento in cui i container del backend sono più di uno: partono
tutti nello stesso istante e, senza lock, emettono lo stesso DDL sulle
stesse tabelle contemporaneamente. Il danno peggiore non è il container che
va in crash loop, è la migrazione applicata a metà, con la ALTER passata e
il backfill no.

Questi test non passano dal database di test come gli altri: fanno DDL vero
sull'engine, esattamente come l'avvio dell'applicazione, e non stanno nella
transazione che la suite annulla. Va bene perché ogni passo è idempotente,
che è la proprietà su cui l'intera strategia si regge: la seconda replica
rifà tutto e non succede niente.
"""

import threading

from sqlalchemy import text

from database import engine
from startup_migrations import _SCHEMA_LOCK_KEY, prepare_schema


def _prova_a_prendere_il_lock() -> bool:
    """True se il lock è libero (e in tal caso lo rilascia subito)."""
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        preso = conn.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": _SCHEMA_LOCK_KEY}
        ).scalar()
        if preso:
            conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _SCHEMA_LOCK_KEY})
        return bool(preso)


def test_preparare_lo_schema_due_volte_non_cambia_niente():
    """L'idempotenza è il presupposto di tutto: le repliche in coda rifanno
    il lavoro dopo che è già stato fatto."""
    prepare_schema()
    prepare_schema()


def test_il_lock_viene_restituito_alla_fine():
    """Se restasse preso, la prima replica bloccherebbe per sempre tutte le
    altre e nessuna riuscirebbe più ad avviarsi."""
    prepare_schema()

    assert _prova_a_prendere_il_lock()


def test_una_replica_alla_volta_e_non_di_piu():
    """Il test che descrive il fix: mentre qualcuno tiene il lock, chi
    prepara lo schema aspetta invece di lavorarci sopra."""
    finito = threading.Event()
    errore: list[Exception] = []

    def _seconda_replica() -> None:
        try:
            prepare_schema()
        except Exception as e:
            # Riportato al test invece che gestito: un fallimento della
            # replica in coda deve far fallire il test, non sparire nel thread.
            errore.append(e)
        finito.set()

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as prima_replica:
        prima_replica.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _SCHEMA_LOCK_KEY})
        thread = threading.Thread(target=_seconda_replica, name="seconda-replica")
        thread.start()
        try:
            assert not finito.wait(timeout=1.0), f"non ha aspettato il lock (errori: {errore})"
        finally:
            prima_replica.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _SCHEMA_LOCK_KEY})

    assert finito.wait(timeout=30), "non è ripartita dopo il rilascio del lock"
    thread.join(timeout=30)
    assert not errore, f"la replica in coda è fallita: {errore}"
