"""Come il testo del modello viene consegnato alla sintesi.

I token arrivano da OpenAI qualche lettera alla volta, e per un po' sono
partiti verso ElevenLabs così com'erano, appena si chiudeva una parola. Con
``auto_mode`` acceso il fornitore sintetizza ogni messaggio appena lo riceve
e un messaggio di poche lettere lo tratta come una frase intera, respiro
prima e respiro dopo: l'avatar parlava scandendo una parola alla volta, e la
stessa battuta durava quasi il doppio.

Qui si prova la regola che lo evita, cioè che un pezzo parte solo quando c'è
abbastanza testo da suonare come una frase, e che quando parte non taglia mai
in mezzo a una parola.
"""

import pytest

from voice_pipeline import _TTS_MIN_CHUNK_CHARS, _tts_chunk

# ── Quando un pezzo parte, e quando aspetta ───────────────────────────


def test_il_testo_corto_resta_in_cassa():
    """Poche lettere non partono: sarebbero una frase a sé per il fornitore."""
    assert _tts_chunk("Buongiorno, ") == ("", "Buongiorno, ")


def test_la_parola_in_corso_non_parte_mai_a_meta():
    """Il taglio cade sull'ultimo confine di parola, non sull'ultima lettera."""
    pronto, resto = _tts_chunk("Buongiorno, la chiamo perché ieri mi hanno bloccato la ca")
    assert pronto == "Buongiorno, la chiamo perché ieri mi hanno bloccato la "
    assert resto == "ca"


def test_una_parola_lunghissima_aspetta_lo_spazio():
    """Nessuno spazio in vista: meglio aspettarlo che spezzare la parola."""
    lunga = "a" * (_TTS_MIN_CHUNK_CHARS + 10)
    assert _tts_chunk(lunga) == ("", lunga)


def test_il_ritorno_a_capo_vale_come_confine():
    pronto, resto = _tts_chunk("Buongiorno, la chiamo perché mi hanno bloccato la carta\nieri")
    assert pronto == "Buongiorno, la chiamo perché mi hanno bloccato la carta\n"
    assert resto == "ieri"


# ── Il turno intero, un token alla volta ──────────────────────────────


@pytest.mark.parametrize("passo", [1, 3, 7])
def test_il_turno_arriva_tutto_e_in_pezzi_interi(passo):
    """Qualunque sia la grana dei token, non si perde e non si duplica niente.

    Il resto in cassa lo manda la chiusura del contesto, che è anche il
    flush: qui conta che i pezzi partiti più quel resto ridiano la battuta.
    """
    battuta = (
        "Buongiorno, la chiamo perché ieri mi hanno bloccato la carta "
        "e ne ho bisogno prima del fine settimana."
    )

    buffer, mandati = "", []
    for i in range(0, len(battuta), passo):
        buffer += battuta[i : i + passo]
        pronto, buffer = _tts_chunk(buffer)
        if pronto:
            mandati.append(pronto)

    assert "".join(mandati) + buffer == battuta
    # Nessun pezzo scandito: sono tutti almeno una manciata di parole
    assert all(len(pezzo) >= _TTS_MIN_CHUNK_CHARS for pezzo in mandati)
    # E nessuno di questi tagli cade dentro una parola
    assert all(pezzo.endswith((" ", "\n")) for pezzo in mandati)
