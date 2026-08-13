"""Il prompt del roleplay, dal lato di quanto lungo parla l'avatar.

La lunghezza del turno non è un dettaglio di stile: al telefono una risposta
di dieci frasi è mezzo minuto in cui l'operatore in formazione sta zitto ad
ascoltare, e la simulazione smette di somigliare a una telefonata. La scheda
persona ha sempre avuto il campo, ma diceva solo "Breve", "Media" o "Lunga",
e quanto valga una risposta media lo decideva il modello. Qui si verifica che
l'etichetta arrivi al prompt come una misura.
"""

import pytest

from persona_prompt import CHANNEL_TEXT, CHANNEL_VOICE, build_persona_prompt

SCHEDA = {"NOME": "Mario", "COGNOME": "Rossi"}


def _prompt(lunghezza: str | None = None, channel: str = CHANNEL_VOICE) -> str:
    profilo = dict(SCHEDA)
    if lunghezza is not None:
        profilo["LUNGHEZZA_MEDIA_RISPOSTE"] = lunghezza
    return build_persona_prompt(profilo, channel)


@pytest.mark.parametrize("channel", [CHANNEL_VOICE, CHANNEL_TEXT])
def test_l_etichetta_della_scheda_diventa_un_limite_contabile(channel):
    """ "Breve" e "Lunga" non possono uscire dal prompt come la stessa cosa."""
    assert "una frase, al massimo due" in _prompt("Breve", channel)
    assert "venti parole" in _prompt("Breve", channel)
    assert "quattro o cinque frasi" in _prompt("Lunga", channel)
    assert "settanta parole" in _prompt("Lunga", channel)


@pytest.mark.parametrize("valore", [None, "", "/", "Qualcosa che non è una scelta"])
def test_senza_indicazione_si_parla_come_la_maggioranza_delle_persone(valore):
    """Un campo vuoto o illeggibile non è un permesso di parlare a ruota libera."""
    assert "due o tre frasi" in _prompt(valore)


@pytest.mark.parametrize("valore", ["breve", "Breve", "BREVE", "  Breve  "])
def test_la_scelta_non_dipende_da_come_e_scritta(valore):
    """Le schede si compilano a mano, e "breve" vale quanto "Breve"."""
    assert "una frase, al massimo due" in _prompt(valore)


@pytest.mark.parametrize("channel", [CHANNEL_VOICE, CHANNEL_TEXT])
def test_il_limite_torna_anche_fra_le_regole_ferree(channel):
    """Lo stile scritto in cima si diluisce a conversazione lunga: il vincolo
    va ripetuto dove il modello guarda di più, cioè in fondo."""
    regole_ferree = _prompt("Media", channel).split("## REGOLE FERREE")[1]

    assert "Non superare MAI le quaranta parole" in regole_ferree


def test_la_prima_battuta_ha_un_tetto_piu_alto():
    """Presentarsi e dire perché si chiama non sta in una frase sola."""
    prompt = _prompt("Breve")

    assert "quaranta parole" in prompt  # il tetto dell'apertura, doppio del normale
    assert "quella in cui saluti, ti presenti e dici perché chiami" in prompt


def test_ogni_canale_parla_del_proprio_mezzo():
    """Un limite espresso in "risposte" dentro una chat è una regola che il
    modello deve interpretare, e interpretare vuol dire poterla aggirare."""
    voce = _prompt("Media", CHANNEL_VOICE)
    chat = _prompt("Media", CHANNEL_TEXT)

    assert "ogni tua risposta sta in" in voce
    assert "al telefono nessuno parla da solo" in voce
    assert "ogni tuo messaggio sta in" in chat
    assert "nessuno manda muri di testo" in chat


def test_le_regole_del_mezzo_escono_anche_a_scheda_muta():
    """La sezione dello stile viveva appesa ai campi compilati, quindi un
    avatar senza tratti di conversazione restava anche senza le regole del
    mezzo e senza limite di lunghezza, cioè proprio il caso che parla di più."""
    prompt = build_persona_prompt({"NOME": "Mario", "COGNOME": "Rossi"}, CHANNEL_VOICE)

    assert "## STILE DI CONVERSAZIONE" in prompt
    assert "Parla come si parla davvero al telefono" in prompt
    assert "La lunghezza è un vincolo" in prompt
