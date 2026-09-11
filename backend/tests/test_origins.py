"""Quali origini l'applicazione riconosce come proprie.

Questa è la riga che decide se una pagina può aprire il socket della
chiamata, e la same origin policy sui WebSocket non esiste: quello che non
viene rifiutato qui non viene rifiutato da nessun'altra parte.

Il confronto è esatto, con una sola deroga per i tunnel di sviluppo, il cui
hostname cambia a ogni avvio. La deroga vale per i **sottodomini** dei domini
dichiarati, e le prove che contano sono quelle che verificano dove si ferma:
un dominio che finisce per le stesse lettere senza esserne un sottodominio
non è lo stesso dominio, e ammetterlo vorrebbe dire aprire il socket a un
sito registrato apposta.
"""

import importlib

import pytest

import origins


@pytest.fixture
def con_env(monkeypatch):
    """Ricarica il modulo con un .env finto, e lo rimette com'era alla fine.

    Le origini si leggono all'avvio e non a ogni richiesta, quindi provarne
    altre vuol dire rileggere il modulo: è la stessa cosa che fa il backend
    quando riparte con un .env cambiato.
    """

    def _con(**env):
        for chiave, valore in env.items():
            monkeypatch.setenv(chiave, valore)
        return importlib.reload(origins)

    yield _con
    monkeypatch.undo()
    importlib.reload(origins)


# ── L'elenco esatto ───────────────────────────────────────────────────


def test_un_origine_dell_elenco_passa(con_env):
    o = con_env(ALLOWED_ORIGINS="https://app.esempio.it,http://localhost:3000")
    assert o.is_allowed("https://app.esempio.it") is True
    assert o.is_allowed("http://localhost:3000") is True


def test_un_origine_fuori_elenco_no(con_env):
    o = con_env(ALLOWED_ORIGINS="https://app.esempio.it")
    assert o.is_allowed("https://altro.esempio.it") is False
    # La porta fa parte dell'origine: stesso host, origine diversa.
    assert o.is_allowed("https://app.esempio.it:8443") is False


def test_un_origine_assente_passa(con_env):
    """Chi non è un browser non la manda, e non è da lui che ci si difende."""
    o = con_env(ALLOWED_ORIGINS="https://app.esempio.it")
    assert o.is_allowed(None) is True


def test_senza_elenco_il_backend_non_parte(con_env):
    with pytest.raises(RuntimeError, match="ALLOWED_ORIGINS"):
        con_env(ALLOWED_ORIGINS="")


# ── La deroga dei tunnel di sviluppo ──────────────────────────────────


def test_senza_suffissi_niente_deroga(con_env):
    o = con_env(ALLOWED_ORIGINS="http://localhost:3000", ALLOWED_ORIGIN_SUFFIXES="")
    assert o.ALLOWED_ORIGIN_REGEX is None
    assert o.is_allowed("https://qualcosa.trycloudflare.com") is False


@pytest.mark.parametrize("suffisso", [".trycloudflare.com", "trycloudflare.com"])
def test_un_sottodominio_del_suffisso_passa(con_env, suffisso):
    """Col punto o senza, chi lo scrive intende la stessa cosa."""
    o = con_env(ALLOWED_ORIGINS="http://localhost:3000", ALLOWED_ORIGIN_SUFFIXES=suffisso)
    assert o.is_allowed("https://tre-parole-a-caso.trycloudflare.com") is True
    # Un tunnel provato in locale ha una porta, e la porta fa parte dell'origine.
    assert o.is_allowed("http://tre-parole-a-caso.trycloudflare.com:8080") is True


@pytest.mark.parametrize(
    "origine",
    [
        # Il dominio nudo non è un tunnel, è il sito di chi li fornisce.
        "https://trycloudflare.com",
        # Finisce per le stesse lettere senza esserne un sottodominio: è il
        # dominio di qualcun altro, e basta registrarlo per averlo.
        "https://nontrycloudflare.com",
        "https://sub.nontrycloudflare.com",
        # Il suffisso in mezzo, non in fondo.
        "https://x.trycloudflare.com.esempio.it",
        # Non è nemmeno un'origine.
        "trycloudflare.com",
    ],
)
def test_quello_che_somiglia_a_un_sottodominio_no(con_env, origine):
    o = con_env(
        ALLOWED_ORIGINS="http://localhost:3000", ALLOWED_ORIGIN_SUFFIXES=".trycloudflare.com"
    )
    assert o.is_allowed(origine) is False


def test_piu_suffissi_insieme(con_env):
    o = con_env(
        ALLOWED_ORIGINS="http://localhost:3000",
        ALLOWED_ORIGIN_SUFFIXES=".trycloudflare.com, .ngrok-free.app",
    )
    assert o.is_allowed("https://a.trycloudflare.com") is True
    assert o.is_allowed("https://b.ngrok-free.app") is True
    assert o.is_allowed("https://c.altrotunnel.dev") is False
