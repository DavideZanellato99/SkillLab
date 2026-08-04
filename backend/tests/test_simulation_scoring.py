"""La scala del punteggio: quanto vale una risposta e quanto pesa il tempo.

Sono quattro righe di aritmetica, e si provano da sole perché è l'aritmetica
che decide i voti: ogni altra cosa nel simulatore si può correggere dopo, un
voto sbagliato è già stato letto da chi lo ha preso.
"""

import pytest

from simulation_scoring import QUESTION_SECONDS, attempt_points, attempt_score, question_points


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


def test_i_punti_di_un_tentativo_si_sommano_senza_code_di_virgola():
    """Dieci decimi sommati fanno 6,4 e non 6,3999999999."""
    assert attempt_points([0.9, 0.8, 0.7, 1.0, 0.7, 0.8, 0.5, 0.4, 0.6, 0.0]) == 6.4


def test_il_voto_e_i_punti_riportati_in_decimi():
    assert attempt_score(6.4, 10) == 6.4
    assert attempt_score(3.0, 3) == 10.0
    assert attempt_score(1.5, 3) == 5.0
    # Nessuna domanda: niente da dividere, e nessuna divisione per zero
    assert attempt_score(0.0, 0) == 0.0
