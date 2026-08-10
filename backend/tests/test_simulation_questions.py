"""Come le cinquanta domande si spartiscono fra argomenti e chiamate.

Il modello qui non c'è: quello che si verifica è la parte che decide quante
domande chiedere e a chi, cioè l'unica di questo modulo che può sbagliare in
silenzio. Un piano che distribuisce quarantanove domande invece di cinquanta
non fallisce da nessuna parte, si vede settimane dopo come una simulazione
che non si riesce a pubblicare.
"""

from models import SIMULATION_POOL_COUNT
from simulation_questions import (
    MAX_TOPICS,
    QUESTIONS_PER_CALL,
    _plan_batches,
    _without_duplicates,
)


def _totale(batches) -> int:
    return sum(count for batch in batches for _, count in batch)


def test_le_domande_chieste_sono_sempre_cinquanta():
    """Con qualsiasi numero di argomenti il conto torna: è il numero che poi
    il server pretende per pubblicare."""
    for topics in range(1, MAX_TOPICS + 1):
        assert _totale(_plan_batches(topics, SIMULATION_POOL_COUNT)) == SIMULATION_POOL_COUNT


def test_nessuna_chiamata_supera_il_suo_tetto():
    """Sopra il tetto la risposta del modello torna troncata a metà di una
    domanda, e quella chiamata si perde tutta."""
    for topics in range(1, MAX_TOPICS + 1):
        for batch in _plan_batches(topics, SIMULATION_POOL_COUNT):
            assert sum(count for _, count in batch) <= QUESTIONS_PER_CALL


def test_le_domande_si_spartiscono_in_parti_uguali():
    """Venticinque argomenti fanno due domande ciascuno, e nessuno resta a
    mani vuote: un argomento senza domande è una parte di documento su cui
    non verrà mai chiesto niente."""
    chieste: dict[int, int] = {}
    for batch in _plan_batches(25, 50):
        for index, count in batch:
            chieste[index] = chieste.get(index, 0) + count
    assert chieste == dict.fromkeys(range(25), 2)


def test_un_argomento_resta_in_una_chiamata_sola_finche_ci_sta():
    """È fra le domande di uno stesso argomento che la ripetizione nasce, e
    scriverle insieme è l'unico modo che il modello ha di accorgersene."""
    spezzati = [
        index
        for batch in _plan_batches(6, 50)
        for index, _ in batch
        # Un argomento che compare in più chiamate è stato spezzato
    ]
    assert len(spezzati) == len(set(spezzati))


def test_un_argomento_troppo_grosso_si_spezza():
    """Quando il documento ha dato un argomento solo non c'è scelta: sta in
    più chiamate perché cinquanta domande in una non ci starebbero."""
    batches = _plan_batches(1, 50)
    assert len(batches) == 5
    assert _totale(batches) == 50


def test_senza_argomenti_o_senza_domande_non_si_chiama_nessuno():
    """Non capita su un documento vero, ed è il motivo per cui va provato: se
    il piano vuoto non fosse previsto qui, sarebbe una chiamata al modello
    con zero argomenti da leggere."""
    assert _plan_batches(0, 50) == []
    assert _plan_batches(10, 0) == []


def test_le_domande_scritte_identiche_due_volte_cadono():
    """Due chiamate non si vedono fra loro, quindi la stessa domanda può
    uscire due volte: nel serbatoio sarebbe una domanda che l'estrazione
    potrebbe pescare due volte nello stesso test."""
    domande = [
        {"text": "Quando si sblocca la carta?"},
        {"text": "  quando SI sblocca   la carta?  "},
        {"text": "Chi autorizza il rimborso?"},
    ]
    assert [q["text"] for q in _without_duplicates(domande)] == [
        "Quando si sblocca la carta?",
        "Chi autorizza il rimborso?",
    ]
