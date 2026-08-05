"""La scala del punteggio: quanto vale una risposta e quanto pesa il tempo.

Sono quattro righe di aritmetica, e si provano da sole perché è l'aritmetica
che decide i voti: ogni altra cosa nel simulatore si può correggere dopo, un
voto sbagliato è già stato letto da chi lo ha preso.

Le scale sono due, una per tipo di test: quella a tempo delle risposte
multiple e quella del giudizio delle risposte aperte. Finiscono nello stesso
intervallo, da 0 a 1 per domanda, ed è quello che permette a un voto in
decimi di significare la stessa cosa in entrambi.
"""

import pytest

from simulation_scoring import (
    QUESTION_SECONDS,
    attempt_points,
    attempt_score,
    is_open_answer_correct,
    open_answer_points,
    question_points,
)


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [
        (0, 1.0),
        (1, 1.0),
        # Tre secondi esatti sono ancora il primo scalino, il primo istante
        # dopo è già il secondo
        (3, 1.0),
        (3.001, 0.9),
        (6, 0.9),
        (15, 0.6),
        (27, 0.2),
        (QUESTION_SECONDS, 0.1),
    ],
)
def test_una_risposta_giusta_vale_meno_man_mano_che_passa_il_tempo(seconds, expected):
    assert question_points(True, int(seconds * 1000)) == expected


def test_una_risposta_sbagliata_vale_zero_per_quanto_veloce_sia():
    assert question_points(False, 0) == 0.0
    assert question_points(False, 30_000) == 0.0


def test_il_tempo_non_misurato_vale_il_minimo_e_non_il_massimo():
    """Chi non manda il tempo non ci guadagna.

    È la scelta che rende visibile un client che non lo misura: col massimo,
    una versione vecchia dell'app prenderebbe dieci in silenzio.
    """
    assert question_points(True, None) == 0.1
    # Sbagliata resta zero: il tempo scala quello che si è guadagnato
    assert question_points(False, None) == 0.0


def test_un_tempo_fuori_scala_rientra_invece_di_far_saltare_la_consegna():
    # Oltre il limite: l'ultimo scalino, non un punteggio negativo
    assert question_points(True, 999_000) == 0.1
    # Sotto zero, che è un orologio andato all'indietro: il primo scalino
    assert question_points(True, -5_000) == 1.0


# ── Le risposte aperte ────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("quality", "expected"),
    [
        (1.0, 1.0),
        (0.75, 0.8),
        (0.5, 0.5),
        (0.0, 0.0),
        # Fuori scala: un modello che scrive 1,3 ha comunque detto che la
        # risposta era completa, e uno che scrive -0,2 che era sbagliata
        (1.3, 1.0),
        (-0.2, 0.0),
    ],
)
def test_una_risposta_aperta_vale_quanto_e_completa(quality, expected):
    assert open_answer_points(quality) == expected


def test_una_risposta_non_giudicata_non_vale_niente():
    """Diverso dal tempo mancante: lì è prudenza, qui non c'è un giudizio."""
    assert open_answer_points(None) == 0.0


def test_una_risposta_aperta_conta_fra_le_esatte_dalla_sufficienza():
    assert is_open_answer_correct(0.6) is True
    assert is_open_answer_correct(1.0) is True
    assert is_open_answer_correct(0.5) is False
    assert is_open_answer_correct(0.0) is False


def test_i_punti_che_si_vedono_sono_quelli_che_decidono_l_esito():
    """Nessuna risposta mostra 0,6 accanto a una crocetta rossa.

    La soglia si applica ai punti già arrotondati: un giudizio di 0,57
    diventa 0,6 e conta come esatto, perché 0,6 è quello che si legge.
    """
    punti = open_answer_points(0.57)
    assert punti == 0.6
    assert is_open_answer_correct(punti) is True


def test_i_punti_di_un_tentativo_si_sommano_senza_code_di_virgola():
    """Dieci decimi sommati fanno 6,4 e non 6,3999999999."""
    assert attempt_points([0.9, 0.8, 0.7, 1.0, 0.7, 0.8, 0.5, 0.4, 0.6, 0.0]) == 6.4


def test_il_voto_e_i_punti_riportati_in_decimi():
    assert attempt_score(6.4, 10) == 6.4
    assert attempt_score(3.0, 3) == 10.0
    assert attempt_score(1.5, 3) == 5.0
    # Nessuna domanda: niente da dividere, e nessuna divisione per zero
    assert attempt_score(0.0, 0) == 0.0
