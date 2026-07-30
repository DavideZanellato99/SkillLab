"""Il pool di connessioni, che è configurazione ma si comporta come codice.

Tre proprietà che non si notano finché non è troppo tardi: un pool troppo
piccolo si vede solo sotto carico, una connessione stantia solo dopo un
riavvio del database, e la somma dei pool di tutte le repliche solo quando
supera il tetto di Postgres. Nessuna delle tre fallisce in sviluppo, e per
questo stanno scritte qui.
"""

from database import _MAX_OVERFLOW, _POOL_SIZE, engine

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
