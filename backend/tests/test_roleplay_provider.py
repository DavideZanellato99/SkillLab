"""La scelta del fornitore del roleplay, e i parametri che ne dipendono.

Qui non si prova a parlare con nessuno: quello che conta è **cosa** viene
chiesto al modello prima ancora di chiederglielo, perché due dei parametri
decidono la prima parola della battuta e uno decide se la richiesta viene
accettata.

Il primo è il ragionamento. Dal vivo va spento: ogni token pensato è silenzio
prima che il TTS possa cominciare, e il livello minimo di una famiglia non è
lo stesso in tutte le versioni. Il secondo è la temperatura, che non è una
preferenza ma la differenza fra una risposta e un 400 sui modelli che la
rifiutano. Il terzo è il nome del tetto sui token, che i due fornitori
scrivono diversamente: sbagliarlo non dà errore, dà una risposta troncata
dove decide il fornitore.
"""

import importlib

import pytest

import roleplay_provider


@pytest.fixture
def fornitore(monkeypatch):
    """Ricarica il modulo con un .env finto, e lo rimette com'era alla fine.

    Il fornitore si sceglie all'avvio e non a ogni chiamata, quindi provarne
    un altro vuol dire rileggere il modulo: è la stessa cosa che fa il
    backend quando riparte con un .env cambiato.
    """

    def _con(**env):
        for chiave, valore in env.items():
            monkeypatch.setenv(chiave, valore)
        return importlib.reload(roleplay_provider)

    yield _con
    monkeypatch.undo()
    importlib.reload(roleplay_provider)


# ── Il ragionamento, che dal vivo è tempo tolto alla battuta ──────────


@pytest.mark.parametrize(
    ("modello", "atteso"),
    [
        # Dalla 5.1 in avanti il ragionamento si spegne del tutto, e a quel
        # punto la temperatura torna accettata.
        ("gpt-5.1", 1),
        ("gpt-5.1-mini", 1),
        ("gpt-5.4-nano", 4),
        ("gpt-5.6-terra", 6),
        # La 5.0 non ha una versione minore scritta: è la 5.0, e il suo minimo
        # è "minimal".
        ("gpt-5", 0),
        ("gpt-5-mini", 0),
        # Fuori dalla famiglia.
        ("gpt-4.1-mini", None),
        ("gpt-4o", None),
        ("gemini-2.5-flash-lite", None),
    ],
)
def test_la_versione_della_famiglia_si_legge_invece_di_indovinarla(modello, atteso):
    """Un prefisso letterale come "gpt-5.1" manderebbe ogni versione uscita
    dopo sul ramo della 5.0, cioè a ragionare quando non dovrebbe, e lo
    farebbe in silenzio."""
    assert roleplay_provider._gpt5_minor(modello) == atteso


def test_dalla_cinque_uno_in_avanti_si_spegne_il_ragionamento_e_torna_la_temperatura():
    """Le due cose vanno insieme: la temperatura è accettata proprio perché
    il ragionamento è spento."""
    atteso = {"reasoning_effort": "none", "temperature": roleplay_provider.ROLEPLAY_TEMPERATURE}
    assert roleplay_provider._openai_kwargs("gpt-5.1-mini") == atteso
    assert roleplay_provider._openai_kwargs("gpt-5.4-nano") == atteso


def test_sulla_cinque_zero_il_minimo_e_minimal_e_la_temperatura_resta_vietata():
    """Chiederle entrambe qui non è una richiesta ignorata, è un 400."""
    assert roleplay_provider._openai_kwargs("gpt-5-mini") == {"reasoning_effort": "minimal"}


def test_i_modelli_che_non_ragionano_prendono_solo_la_temperatura():
    assert roleplay_provider._openai_kwargs("gpt-4.1-mini") == {
        "temperature": roleplay_provider.ROLEPLAY_TEMPERATURE
    }


def test_su_gemini_il_ragionamento_si_spegne_solo_dove_si_puo():
    """Sui 3.x chiedere `none` è un 400, non una richiesta ignorata, quindi
    sarebbe una chiamata persa a ogni battuta. Verificato sul campo, non solo
    sulla documentazione."""
    assert roleplay_provider._gemini_kwargs("gemini-2.5-flash-lite") == {
        "reasoning_effort": "none",
        "temperature": roleplay_provider.ROLEPLAY_TEMPERATURE,
    }
    assert roleplay_provider._gemini_kwargs("gemini-3.5-flash-lite") == {
        "temperature": roleplay_provider.ROLEPLAY_TEMPERATURE
    }


# ── Il tetto sui token, che i due fornitori scrivono diversamente ─────


def test_su_openai_il_tetto_si_chiama_col_nome_nuovo(fornitore):
    modulo = fornitore(ROLEPLAY_PROVIDER="openai", OPENAI_MODEL="gpt-4.1-mini")

    assert modulo.roleplay_completion_kwargs("gpt-4.1-mini", 1024) == {
        "max_completion_tokens": 1024,
        "temperature": modulo.ROLEPLAY_TEMPERATURE,
    }


def test_su_gemini_il_tetto_si_chiama_col_nome_storico(fornitore):
    """L'endpoint compatibile non riconosce quello nuovo, e non lo dice: lo
    ignora, e la risposta si tronca dove decide lui."""
    modulo = fornitore(
        ROLEPLAY_PROVIDER="gemini",
        GEMINI_API_KEY="chiave-finta",
        GEMINI_MODEL="gemini-3.5-flash-lite",
        GEMINI_FALLBACK_MODELS="",
    )

    assert modulo.roleplay_completion_kwargs("gemini-3.5-flash-lite", 1024) == {
        "max_tokens": 1024,
        "temperature": modulo.ROLEPLAY_TEMPERATURE,
    }


# ── Quale fornitore, e cosa pretende dal .env ─────────────────────────


def test_si_configura_solo_il_fornitore_scelto(fornitore):
    """Chi resta su OpenAI non deve procurarsi una chiave Google per far
    partire il backend."""
    modulo = fornitore(
        ROLEPLAY_PROVIDER="openai",
        OPENAI_MODEL="gpt-4.1-mini",
        GEMINI_API_KEY="",
        GEMINI_MODEL="",
    )

    assert modulo.roleplay_models() == ["gpt-4.1-mini"]


def test_un_fornitore_che_non_esiste_si_ferma_all_avvio(fornitore):
    """Un refuso nel .env deve fermare l'avvio, non presentarsi come un
    avatar che ammutolisce alla prima battuta."""
    with pytest.raises(RuntimeError, match="ROLEPLAY_PROVIDER"):
        fornitore(ROLEPLAY_PROVIDER="gemninni")


def test_senza_il_modello_del_fornitore_scelto_non_si_parte(fornitore):
    with pytest.raises(RuntimeError, match="GEMINI_MODEL"):
        fornitore(ROLEPLAY_PROVIDER="gemini", GEMINI_API_KEY="chiave-finta", GEMINI_MODEL="")


def test_senza_la_chiave_il_cliente_resta_spento_invece_di_fermare_l_avvio(fornitore):
    """Come si comportava già senza OPENAI_API_KEY: si avvia, e a lamentarsi
    è la prima chiamata che ne ha bisogno davvero."""
    modulo = fornitore(
        ROLEPLAY_PROVIDER="gemini",
        GEMINI_API_KEY="",
        GEMINI_MODEL="gemini-3.5-flash-lite",
    )

    assert modulo.roleplay_client() is None
    assert "GEMINI_API_KEY" in str(modulo.missing_key_error())


def test_il_primario_si_prova_per_primo_e_una_volta_sola(fornitore):
    """Un .env che ripete il primario fra le riserve non lo fa provare due
    volte: aspettare due volte lo stesso sovraccarico è tempo tolto alla
    chiamata."""
    modulo = fornitore(
        ROLEPLAY_PROVIDER="openai",
        OPENAI_MODEL="primario",
        OPENAI_FALLBACK_MODELS="primario, riserva ,",
    )

    assert modulo.roleplay_models() == ["primario", "riserva"]
