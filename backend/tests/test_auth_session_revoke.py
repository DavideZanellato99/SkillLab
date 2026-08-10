"""La revoca del refresh token su Cognito, che chiude una sessione per sempre.

La chiedono i due punti in cui una sessione finisce, il logout e ogni
refresh rifiutato, e nessuno dei due può permettersi che fallisca in faccia
a chi l'ha chiesta: hanno già deciso che quella sessione è finita e stanno
togliendo i cookie, quindi un guasto di Cognito diventerebbe un errore
davanti a un utente che ha solo premuto "esci", lasciandolo dentro la
sessione da cui stava uscendo.

Il prezzo di quel guasto è un refresh token che resta valido su Cognito
fino a scadenza, che è il motivo per cui la riga nei log ci deve essere.
"""

import logging

import pytest

from routers import auth


def test_la_revoca_arriva_a_cognito(monkeypatch):
    chiamate: list[str] = []
    monkeypatch.setattr(auth, "revoke_refresh_token", chiamate.append)

    auth._revoke_refresh_upstream("token-di-prova", "Logout")

    assert chiamate == ["token-di-prova"]


def test_una_revoca_fallita_non_ferma_chi_la_chiede(monkeypatch, caplog):
    """Il test che descrive la scelta: il guasto resta nei log, non risale."""

    def _cognito_irraggiungibile(_token: str) -> None:
        raise RuntimeError("Cognito irraggiungibile")

    monkeypatch.setattr(auth, "revoke_refresh_token", _cognito_irraggiungibile)

    with caplog.at_level(logging.ERROR):
        auth._revoke_refresh_upstream("token-di-prova", "Logout")

    assert "Logout: revoca del refresh token fallita" in caplog.text
    assert "Cognito irraggiungibile" in caplog.text


def test_solo_i_guasti_previsti_vengono_assorbiti(monkeypatch):
    """Il servizio Cognito traduce ogni suo errore in RuntimeError (vedi
    cognito_service), quindi assorbire quello è assorbire i guasti veri.
    Qualunque altra cosa sarebbe un errore di programmazione qui dentro, e
    deve arrivare in superficie invece di essere scambiata per un'API giù."""

    def _errore_di_programmazione(_token: str) -> None:
        raise TypeError("firma sbagliata")

    monkeypatch.setattr(auth, "revoke_refresh_token", _errore_di_programmazione)

    with pytest.raises(TypeError):
        auth._revoke_refresh_upstream("token-di-prova", "Refresh")
