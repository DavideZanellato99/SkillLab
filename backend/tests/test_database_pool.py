"""Il pool di connessioni, che è configurazione ma si comporta come codice.

Tre proprietà che non si notano finché non è troppo tardi: un pool troppo
piccolo si vede solo sotto carico, una connessione stantia solo dopo un
riavvio del database, e la somma dei pool di tutte le repliche solo quando
supera il tetto di Postgres. Nessuna delle tre fallisce in sviluppo, e per
questo stanno scritte qui.
"""

import logging

from database import _MAX_OVERFLOW, _POOL_SIZE, engine, log_connection_budget

# Quante connessioni una replica deve potersi procurare nel picco. Le
# scritture del percorso vocale girano su thread (voice_pipeline) e ognuno
# si prende una connessione, quindi il numero utile è ben più alto delle 5
# stabili che SQLAlchemy dà di default.
_MINIMO_RAGIONEVOLE = 20


def test_una_replica_regge_un_picco_di_connessioni():
    """Difende dal ritorno ai default di SQLAlchemy: 5 più 10 sono pensati
    per un processo solo che serve richieste brevi, non per questo."""
    assert _POOL_SIZE + _MAX_OVERFLOW >= _MINIMO_RAGIONEVOLE


def test_le_connessioni_morte_non_arrivano_all_applicazione():
    """Senza il pre-ping, la prima query dopo un riavvio del database (o
    dopo una notte dietro un NAT) fallisce con un errore che in sviluppo non
    si vede mai."""
    assert engine.pool._pre_ping is True


def test_le_connessioni_non_invecchiano_all_infinito():
    """Su un'installazione che nessuno tocca più, una connessione senza
    riciclo resterebbe aperta per mesi."""
    assert 0 < engine.pool._recycle <= 3600


def test_il_picco_dichiarato_si_puo_davvero_ottenere():
    """La prova vera: il pool concede le connessioni che promette, e le
    restituisce tutte quando si chiudono."""
    connessioni = []
    try:
        for _ in range(_MINIMO_RAGIONEVOLE):
            connessioni.append(engine.connect())
        assert len(connessioni) == _MINIMO_RAGIONEVOLE
    finally:
        for conn in connessioni:
            conn.close()

    assert engine.pool.checkedout() == 0


def test_il_conto_delle_connessioni_finisce_nei_log(caplog):
    """Il tetto del database e il pool di un processo stanno in due file che
    nessuno cambia insieme. Il prodotto dei due è il numero che decide
    quante repliche si possono chiedere, e va letto nei log a ogni avvio
    invece di essere rifatto a mente il primo giorno e mai più."""
    with caplog.at_level(logging.INFO, logger="database"):
        log_connection_budget()

    righe = [r.getMessage() for r in caplog.records]
    assert righe, "l'avvio deve lasciare detto il conto delle connessioni"
    assert "repliche come questa" in righe[0]
    # Il numero dichiarato è quello vero del pool, non una costante scritta
    # nel messaggio.
    assert str(_POOL_SIZE + _MAX_OVERFLOW) in righe[0]


def test_il_conto_non_fa_cadere_l_avvio_se_il_database_non_risponde(monkeypatch, caplog):
    """È diagnostica: se il database non risponde il problema è un altro, e
    lo dirà la prima richiesta vera. Questa funzione non deve trasformare un
    database irraggiungibile in un container che non parte."""

    def esplode():
        raise OSError("database irraggiungibile")

    monkeypatch.setattr("database.engine.connect", esplode)
    with caplog.at_level(logging.WARNING, logger="database"):
        log_connection_budget()

    assert any("non sono riuscito" in r.getMessage().lower() for r in caplog.records)
