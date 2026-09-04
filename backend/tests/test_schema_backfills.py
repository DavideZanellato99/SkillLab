"""Il marcatore che evita di rifare i riempimenti a ogni avvio.

I riempimenti leggono righe: su un'installazione avviata sono scansioni di
tabelle intere che tornano sempre a mani vuote, perché le righe vecchie
l'applicazione non le scrive più. Il conto però si pagava a ogni avvio di
ogni replica, cioè a ogni rilascio.

Quello che si prova qui è il patto che rende sicuro saltarli: si saltano
**solo** se questo database ha già ricevuto esattamente questi riempimenti,
e a dirlo è l'impronta del file che li contiene. Aggiungerne uno cambia il
file, quindi l'impronta, quindi tornano a girare tutti.

Come test_schema_lock, questi non passano dal database di test dentro la
transazione che la suite annulla: fanno DDL vero sull'engine, esattamente
come l'avvio dell'applicazione.
"""

from sqlalchemy import text

import startup_migrations
from database import engine
from startup_migrations import prepare_schema

# Un'impronta che nessun file potrà mai avere: serve a far credere
# all'avvio di essere una versione delle migrazioni mai vista qui.
_IMPRONTA_FINTA = "impronta-di-prova"


def _impronte() -> set[str]:
    with engine.connect() as conn:
        return {riga[0] for riga in conn.execute(text("SELECT fingerprint FROM schema_backfills"))}


def _dimentica(impronta: str) -> None:
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM schema_backfills WHERE fingerprint = :f"), {"f": impronta})


def test_i_riempimenti_lasciano_la_propria_impronta():
    """Senza la riga scritta alla fine, il prossimo avvio rifarebbe tutto."""
    prepare_schema()

    assert startup_migrations._backfills_fingerprint() in _impronte()


def test_il_secondo_avvio_non_li_rifa(monkeypatch):
    """Il punto di tutto l'esercizio: la replica che riparte non riscandisce
    le tabelle per riempire colonne che sono piene da mesi."""
    prepare_schema()

    fatti: list[bool] = []
    monkeypatch.setattr(startup_migrations, "_run_backfills", lambda: fatti.append(True))
    prepare_schema()

    assert not fatti


def test_un_riempimento_nuovo_li_rifa_tutti(monkeypatch):
    """Cosa succede il giorno in cui se ne aggiunge uno.

    Aggiungerlo vuol dire scrivere in quel file, che cambia l'impronta: da
    lì il database non risulta più a posto e i riempimenti tornano a girare,
    senza che nessuno debba ricordarsi di alzare un numero di versione.
    """
    prepare_schema()

    fatti: list[bool] = []
    monkeypatch.setattr(startup_migrations, "_backfills_fingerprint", lambda: _IMPRONTA_FINTA)
    monkeypatch.setattr(startup_migrations, "_run_backfills", lambda: fatti.append(True))
    try:
        prepare_schema()

        assert fatti == [True]
        # E la volta dopo no: l'impronta nuova è stata registrata.
        assert _IMPRONTA_FINTA in _impronte()
    finally:
        _dimentica(_IMPRONTA_FINTA)


def test_senza_impronta_si_rifa_tutto(monkeypatch):
    """Il ripiego prudente: se il file non si riesce a leggere non si sa
    niente, e non sapere vuol dire rifare, come si è sempre fatto."""
    prepare_schema()

    fatti: list[bool] = []
    monkeypatch.setattr(startup_migrations, "_backfills_fingerprint", lambda: None)
    monkeypatch.setattr(startup_migrations, "_run_backfills", lambda: fatti.append(True))
    prepare_schema()

    assert fatti == [True]
