"""Il giudizio sulle risposte aperte di un test tecnico.

Quanto valga in punti un giudizio sta in ``simulation_scoring``; qui c'è il
passaggio prima: cosa arriva al modello e cosa si tiene di quello che
risponde. Le due cose che possono andare storte in silenzio sono una
risposta lunghissima che si porta via il tetto di token dell'intera chiamata
e un giudizio attribuito a una domanda che non era stata chiesta, che
darebbe punti a nessuno.

Una voce storta si scarta da sola invece di far cadere la consegna: chi ha
svolto il test perderebbe tutto per una riga malformata su dieci. La domanda
rimasta senza giudizio la gestisce il router, che è l'unico a sapere quanto
vale non essere stati giudicati.
"""

import asyncio

import pytest

import simulation_open_answers
from simulation_open_answers import (
    MAX_ANSWER_CHARS,
    _judge_input,
    _normalize_judgements,
    judge_open_answers,
)


def _voce(position=1, answer_text="Prima si identifica il cliente.") -> dict:
    return {
        "position": position,
        "text": "Cosa si fa prima di autorizzare un rimborso?",
        "expected_answer": "Identificare il cliente e verificare la soglia.",
        "answer_text": answer_text,
    }


# ── Cosa vede il modello ──────────────────────────────────────────────


def test_ogni_domanda_arriva_con_la_traccia_e_la_risposta():
    testo = _judge_input([_voce(position=3)])

    assert "### DOMANDA 3" in testo
    assert "Traccia della risposta attesa: Identificare il cliente" in testo
    assert "Risposta dell'operatore: Prima si identifica il cliente." in testo


def test_una_risposta_lunghissima_arriva_tagliata():
    """Oltre il tetto non c'è una risposta, c'è un incollaggio del manuale:
    giudicarlo per intero costerebbe token senza cambiare il giudizio, e in
    una consegna da dieci domande li toglierebbe alle altre nove."""
    testo = _judge_input([_voce(answer_text="x" * (MAX_ANSWER_CHARS + 500))])

    assert "x" * MAX_ANSWER_CHARS in testo
    assert "x" * (MAX_ANSWER_CHARS + 1) not in testo


def test_le_domande_arrivano_tutte_nella_stessa_richiesta():
    """Una chiamata sola per il tentativo: dieci chiamate indipendenti
    sarebbero dieci esaminatori diversi sullo stesso test."""
    testo = _judge_input([_voce(position=1), _voce(position=2)])

    assert testo.count("### DOMANDA") == 2


# ── Cosa si tiene della risposta ──────────────────────────────────────


def test_i_giudizi_tornano_indicizzati_per_posizione():
    giudizi = _normalize_judgements(
        {"answers": [{"position": 2, "quality": 0.8, "feedback": "  Manca la soglia.  "}]},
        positions={1, 2},
    )

    assert giudizi == {2: {"quality": 0.8, "feedback": "Manca la soglia."}}


def test_un_giudizio_senza_commento_resta_un_giudizio():
    giudizi = _normalize_judgements({"answers": [{"position": 1, "quality": 1.0}]}, {1})

    assert giudizi[1]["feedback"] == ""


@pytest.mark.parametrize(
    "storta",
    [
        {"position": "prima", "quality": 0.5},
        {"position": 1, "quality": "buona"},
        {"position": None, "quality": 0.5},
        {"position": 1},
        "una stringa",
    ],
)
def test_una_voce_malformata_non_si_porta_via_la_consegna(storta):
    giudizi = _normalize_judgements(
        {"answers": [storta, {"position": 2, "quality": 0.6}]}, positions={1, 2}
    )

    assert list(giudizi) == [2]


def test_un_giudizio_su_una_domanda_mai_chiesta_si_butta():
    """È il modello che si è inventato una domanda, e assegnarle dei punti li
    darebbe a nessuno."""
    giudizi = _normalize_judgements(
        {"answers": [{"position": 99, "quality": 1.0}, {"position": 1, "quality": 0.4}]},
        positions={1},
    )

    assert list(giudizi) == [1]


def test_una_risposta_senza_nemmeno_un_giudizio_valido_ferma_la_consegna():
    """Un test consegnato a metà corretto non è un tentativo: meglio non
    scriverlo e far ritentare."""
    with pytest.raises(ValueError, match="Nessun giudizio utilizzabile"):
        _normalize_judgements({"answers": [{"position": 99, "quality": 1.0}]}, {1})
    with pytest.raises(ValueError, match="Nessun giudizio utilizzabile"):
        _normalize_judgements({}, {1})


# ── La chiamata intera ────────────────────────────────────────────────


def test_senza_risposte_aperte_non_si_disturba_il_modello(monkeypatch):
    """Un test tutto a scelta multipla non deve pagare una chiamata: chi non
    scrive niente vale zero senza chiedere niente a nessuno."""

    async def _mai(*args, **kwargs):
        raise AssertionError("Il modello non doveva essere chiamato")

    monkeypatch.setattr(simulation_open_answers, "eval_json_completion", _mai)

    assert asyncio.run(judge_open_answers([])) == {}


def test_il_giudizio_arriva_normalizzato_per_posizione(monkeypatch):
    inviato = {}

    async def _eval(messages, max_completion_tokens, normalize, what):
        inviato["what"] = what
        inviato["utente"] = messages[1]["content"]
        return normalize({"answers": [{"position": 1, "quality": 0.75, "feedback": "Bene."}]})

    monkeypatch.setattr(simulation_open_answers, "eval_json_completion", _eval)

    giudizi = asyncio.run(judge_open_answers([_voce()]))

    assert giudizi == {1: {"quality": 0.75, "feedback": "Bene."}}
    assert inviato["what"] == "valutazione delle risposte aperte"
    assert "### DOMANDA 1" in inviato["utente"]
