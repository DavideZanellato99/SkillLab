"""Come si rimettono insieme i pezzi di una frase detta dall'operatore.

ElevenLabs chiude una trascrizione quando arriva al proprio limite, e quel
limite non guarda dove finiscono le parole: una frase lunga torna spezzata in
due commit, a volte in mezzo a una parola. La pipeline li riunisce prima di
passarli al modello, ed è qui che si prova che li riunisce come li ha detti
l'operatore.

Gli esempi non sono inventati: vengono da una chiamata vera, che è il motivo
per cui questa funzione esiste.
"""

import pytest

from voice_pipeline import _join_transcript, _looks_complete

# ── La frase tagliata a metà parola ───────────────────────────────────


@pytest.mark.parametrize(
    ("prima", "poi", "atteso"),
    [
        # I due casi visti nei log
        (
            "adesso provvediamo a bloccar",
            "li, ne riceverà nuovi",
            "adesso provvediamo a bloccarli, ne riceverà nuovi",
        ),
        (
            "così ci accertiamo che non ci siano stati tent",
            "ativi fraudolenti",
            "così ci accertiamo che non ci siano stati tentativi fraudolenti",
        ),
    ],
)
def test_una_parola_spezzata_si_richiude(prima, poi, atteso):
    """Con uno spazio in mezzo il modello riceverebbe "bloccar li", che non
    è una parola italiana e non è quello che l'operatore ha detto."""
    assert _join_transcript(prima, poi) == atteso


# ── La frase tagliata fra due parole ──────────────────────────────────


@pytest.mark.parametrize(
    ("prima", "poi", "atteso"),
    [
        # Una tronca vera: "per" finisce in consonante ed è parola intera
        (
            "qualche domanda ai fini anagrafici per",
            "assicurarci della sicurezza",
            "qualche domanda ai fini anagrafici per assicurarci della sicurezza",
        ),
        # Finisce in vocale, quindi è finita
        (
            "e che gliene",
            "forniscono ovviamente una nuova",
            "e che gliene forniscono ovviamente una nuova",
        ),
        # Il taglio cade dopo la punteggiatura
        (
            "mi rendo conto della situazione.",
            "adesso verifichiamo",
            "mi rendo conto della situazione. adesso verifichiamo",
        ),
        # La ripresa comincia da una frase nuova
        (
            "non si preoccupi",
            "Signora Rodriguez, è tutto a posto",
            "non si preoccupi Signora Rodriguez, è tutto a posto",
        ),
    ],
)
def test_due_parole_intere_restano_due_parole(prima, poi, atteso):
    assert _join_transcript(prima, poi) == atteso


def test_un_nome_proprio_non_viene_saldato_a_quello_che_segue():
    """Le parole italiane finiscono in vocale, i cognomi no: senza guardare
    la maiuscola, "Rodriguez" verrebbe letto come una parola tagliata e
    uscirebbe "Rodriguezmi rendo conto"."""
    unito = _join_transcript("non si preoccupi signora Rodriguez", "mi rendo conto")

    assert unito == "non si preoccupi signora Rodriguez mi rendo conto"


def test_le_tronche_italiane_restano_staccate():
    """Sono le uniche parole intere che finiscono in consonante, ed è per
    quelle che la lista esiste."""
    for tronca in ("il", "un", "del", "nel", "con", "non", "per", "gran"):
        unito = _join_transcript(f"questo è {tronca}", "problema")
        assert unito == f"questo è {tronca} problema"


# ── I casi vuoti ──────────────────────────────────────────────────────


def test_il_primo_pezzo_di_un_turno_non_ha_niente_a_cui_attaccarsi():
    assert _join_transcript("", "Buongiorno, sono Geremia") == "Buongiorno, sono Geremia"


def test_un_pezzo_vuoto_non_lascia_uno_spazio_in_coda():
    assert _join_transcript("Buongiorno", "") == "Buongiorno"


# ── Quando un commit chiude il turno ──────────────────────────────────


def test_una_frase_finita_fa_partire_subito_la_risposta():
    """Non c'è niente da aspettare: la finestra di grazia esiste per i tagli
    a metà, e farla pagare a un turno finito sarebbe ritardo puro."""
    assert _looks_complete("come posso esserle utile?")
    assert _looks_complete("mi rendo conto della situazione.")


def test_una_frase_lasciata_a_metà_aspetta_il_seguito():
    assert not _looks_complete("adesso provvediamo a bloccar")
    assert not _looks_complete("certamente, non si preoccupi,")
