"""Il tetto alle chiamate al modello, per persona e per ora.

Le altre difese dell'applicazione fermano chi non ha le credenziali. Questa
ferma un account normale che ripete una richiesta più volte di quanto abbia
senso ripeterla, e il danno da cui protegge non è un disservizio: la
valutazione di una conversazione si può rilanciare all'infinito sulla stessa
trascrizione, gira su un modello di ragionamento e sovrascrive ogni volta il
risultato precedente. In un ciclo non romperebbe niente, e nessuno se ne
accorgerebbe fino alla fattura.

Il conteggio è quello del login (``rate_limit``), con due differenze che
questi test fissano: si registra ogni chiamata e non solo quelle andate
male, e la chiave è l'utente, non l'indirizzo da cui arriva.

Tutti prendono ``db_session`` anche quando non la usano: è la fixture che
lega il limitatore alla transazione annullata a fine test.
"""

import asyncio
import uuid

import pytest
from fastapi import HTTPException

import llm_limits
from rate_limit import SlidingWindowLimiter


@pytest.fixture
def limitatore():
    """Un secchiello da due, con uno scope tutto suo per non incrociare
    quelli veri."""
    return SlidingWindowLimiter(scope="llm-test", max_events=2, window_seconds=60)


def _consuma(limitatore, user_id) -> None:
    asyncio.run(llm_limits.consume(limitatore, user_id))


def test_a_normal_run_of_calls_goes_through(db_session, limitatore):
    utente = uuid.uuid4()

    _consuma(limitatore, utente)
    _consuma(limitatore, utente)


def test_the_call_after_the_last_one_is_refused(db_session, limitatore):
    """La differenza con il login: qui si conta ogni chiamata, non solo
    quelle andate male, perché è ogni chiamata che si paga."""
    utente = uuid.uuid4()
    _consuma(limitatore, utente)
    _consuma(limitatore, utente)

    with pytest.raises(HTTPException) as errore:
        _consuma(limitatore, utente)

    assert errore.value.status_code == 429
    # Con il tempo di attesa, o chi lo riceve può solo ritentare a caso
    assert int(errore.value.headers["Retry-After"]) > 0


def test_one_persons_limit_is_not_everybody_elses(db_session, limitatore):
    """Il caso dell'aula: quaranta persone che si allenano insieme non
    devono consumarsi il tetto a vicenda."""
    esagerato = uuid.uuid4()
    _consuma(limitatore, esagerato)
    _consuma(limitatore, esagerato)

    _consuma(limitatore, uuid.uuid4())


def test_a_refused_call_does_not_consume_anything(db_session, limitatore):
    """Il rifiuto non allunga il blocco: un client che ritenta in ciclo
    resterebbe fuori per sempre, e l'attesa dichiarata sarebbe una bugia."""
    utente = uuid.uuid4()
    _consuma(limitatore, utente)
    _consuma(limitatore, utente)

    with pytest.raises(HTTPException) as primo:
        _consuma(limitatore, utente)
    with pytest.raises(HTTPException) as secondo:
        _consuma(limitatore, utente)

    assert int(secondo.value.headers["Retry-After"]) <= int(primo.value.headers["Retry-After"])


def test_every_paid_call_has_its_own_bucket(db_session):
    """Le cinque chiamate al modello hanno prezzi e ritmi diversi, e un
    secchiello solo le farebbe consumare a vicenda: chi finisce una chat
    non deve trovarsi senza valutazione."""
    scopes = {
        limiter.scope
        for limiter in (
            llm_limits.CHAT,
            llm_limits.VALUTAZIONE,
            llm_limits.CORREZIONE,
            llm_limits.BOZZA_SCHEDA,
            llm_limits.GENERAZIONE_DOMANDE,
        )
    }

    assert len(scopes) == 5
