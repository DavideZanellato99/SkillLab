"""Come si traducono le risposte di Cognito, comprese quelle brutte.

Il modulo è quasi tutto traduzione: una `ClientError` di boto3 diventa una
frase in italiano che qualcuno leggerà su una schermata di accesso. È il
genere di codice che non fallisce mai in prova e sbaglia in produzione, dove
gli errori arrivano davvero, ed è per questo che qui si provano soprattutto
i rami storti.

Due regole percorrono tutto il modulo e sono quelle che vale la pena
fissare. La prima: un utente che su Cognito non c'è **non è un errore**
quando lo si cancella o lo si sospende, perché la pulizia locale deve
proseguire lo stesso e un account solo locale è un caso previsto. La
seconda: il messaggio di un accesso fallito non dice mai quale delle due
cose era sbagliata, altrimenti diventa un modo per scoprire quali email
esistono.

Il client di boto3 è finto. Provarlo per davvero vorrebbe dire un user pool
di prova e delle credenziali AWS in CI, cioè una suite che non si può
eseguire offline.
"""

import time

import pytest
from botocore.exceptions import ClientError

import cognito_service
from cognito_service import (
    admin_create_user,
    admin_delete_user,
    admin_resend_credentials,
    admin_set_user_enabled,
    authenticate,
    change_own_password,
    get_cognito_sub_from_token,
    refresh_tokens,
    respond_to_new_password_challenge,
    revoke_refresh_token,
    verify_access_token,
)


def _errore(codice: str, messaggio: str = "Qualcosa è andato storto") -> ClientError:
    return ClientError({"Error": {"Code": codice, "Message": messaggio}}, "Operazione")


class _CognitoFinto:
    """Un client di boto3 che risponde per nome di operazione.

    ``esiti`` è un dizionario da nome dell'operazione a quello che deve
    succedere: un dizionario è la risposta, un'eccezione è quello che
    solleva. Le chiamate restano registrate, perché su metà di queste
    funzioni la cosa da verificare è **quale** operazione è stata chiesta.
    """

    def __init__(self, **esiti):
        self.esiti = esiti
        self.chiamate: list[tuple[str, dict]] = []

    def __getattr__(self, operazione):
        def _chiama(**kwargs):
            self.chiamate.append((operazione, kwargs))
            esito = self.esiti.get(operazione, {})
            if isinstance(esito, Exception):
                raise esito
            return esito

        return _chiama

    def operazioni(self) -> list[str]:
        return [nome for nome, _ in self.chiamate]


@pytest.fixture
def cognito(monkeypatch):
    def _installa(**esiti) -> _CognitoFinto:
        finto = _CognitoFinto(**esiti)
        monkeypatch.setattr(cognito_service, "_cognito_client", finto)
        return finto

    return _installa


def _tokens(prefisso="") -> dict:
    return {
        "AuthenticationResult": {
            "AccessToken": f"{prefisso}access",
            "RefreshToken": f"{prefisso}refresh",
            "IdToken": f"{prefisso}id",
        }
    }


# ── L'accesso ─────────────────────────────────────────────────────────


def test_l_accesso_riuscito_restituisce_i_tre_token(cognito):
    cognito(initiate_auth=_tokens())

    assert authenticate("mario@example.com", "password") == {
        "access_token": "access",
        "refresh_token": "refresh",
        "id_token": "id",
    }


def test_l_admin_locale_entra_senza_passare_da_cognito(cognito):
    """È l'account di sviluppo: esiste solo qui, e infatti Cognito non viene
    nemmeno interpellato."""
    finto = cognito()

    esito = authenticate("admin", "admin")

    assert esito["access_token"] == "mock-admin-access-token"
    assert finto.chiamate == []


def test_la_password_dell_admin_locale_deve_comunque_essere_quella(cognito):
    cognito(initiate_auth=_errore("UserNotFoundException"))

    with pytest.raises(RuntimeError):
        authenticate("admin", "un'altra password")


def test_il_primo_accesso_torna_indietro_con_la_sfida_invece_dei_token(cognito):
    """L'invito è ancora aperto: la password temporanea va sostituita prima
    che esista una sessione."""
    cognito(initiate_auth={"ChallengeName": "NEW_PASSWORD_REQUIRED", "Session": "sessione-1"})

    assert authenticate("mario@example.com", "temporanea") == {
        "challenge": "NEW_PASSWORD_REQUIRED",
        "session": "sessione-1",
    }


def test_una_password_temporanea_scaduta_dice_di_chiedere_un_nuovo_invito(cognito):
    """Qui il messaggio specifico si può dare: chi lo legge ha già ricevuto
    un invito, quindi non sta scoprendo se l'indirizzo esiste."""
    cognito(initiate_auth=_errore("NotAuthorizedException", "Temporary password has expired"))

    with pytest.raises(RuntimeError, match="password temporanea è scaduta"):
        authenticate("mario@example.com", "temporanea")


def test_un_account_disabilitato_lo_dice(cognito):
    cognito(initiate_auth=_errore("NotAuthorizedException", "User is disabled"))

    with pytest.raises(RuntimeError, match="sospeso o disabilitato"):
        authenticate("mario@example.com", "password")


@pytest.mark.parametrize("codice", ["NotAuthorizedException", "UserNotFoundException"])
def test_email_inesistente_e_password_sbagliata_danno_la_stessa_frase(cognito, codice):
    """Due messaggi diversi sarebbero un modo per scoprire quali indirizzi
    sono registrati."""
    cognito(initiate_auth=_errore(codice, "Incorrect username or password"))

    with pytest.raises(RuntimeError, match="Email o password non corretti"):
        authenticate("mario@example.com", "password")


def test_un_account_mai_confermato_lo_dice(cognito):
    cognito(initiate_auth=_errore("UserNotConfirmedException"))

    with pytest.raises(RuntimeError, match="non è stato confermato"):
        authenticate("mario@example.com", "password")


def test_un_guasto_di_cognito_arriva_con_il_suo_messaggio(cognito):
    """Non è un problema di credenziali: qui nascondere il motivo lascerebbe
    solo un accesso che non funziona e nessuna traccia del perché."""
    cognito(initiate_auth=_errore("InternalErrorException", "Servizio non disponibile"))

    with pytest.raises(RuntimeError, match="Servizio non disponibile"):
        authenticate("mario@example.com", "password")


# ── La sfida della prima password ─────────────────────────────────────


def test_la_prima_password_accettata_apre_subito_la_sessione(cognito):
    cognito(respond_to_auth_challenge=_tokens())

    assert (
        respond_to_new_password_challenge("mario@example.com", "Nuova1!", "s")["access_token"]
        == "access"
    )


def test_una_password_troppo_debole_lo_dice_a_chi_la_sta_scegliendo(cognito):
    cognito(respond_to_auth_challenge=_errore("InvalidPasswordException"))

    with pytest.raises(RuntimeError, match="requisiti di sicurezza"):
        respond_to_new_password_challenge("mario@example.com", "corta", "s")


@pytest.mark.parametrize("codice", ["CodeMismatchException", "NotAuthorizedException"])
def test_una_sfida_scaduta_rimanda_al_login(cognito, codice):
    """La sessione della sfida dura pochi minuti: chi ci mette troppo a
    scegliere la password ricomincia, non resta bloccato."""
    cognito(respond_to_auth_challenge=_errore(codice))

    with pytest.raises(RuntimeError, match="Effettua nuovamente il login"):
        respond_to_new_password_challenge("mario@example.com", "Nuova1!", "s")


def test_un_guasto_nella_sfida_arriva_con_il_suo_messaggio(cognito):
    cognito(respond_to_auth_challenge=_errore("InternalErrorException", "Servizio giù"))

    with pytest.raises(RuntimeError, match="Servizio giù"):
        respond_to_new_password_challenge("mario@example.com", "Nuova1!", "s")


# ── Il cambio password fatto da sé ────────────────────────────────────


def test_il_cambio_password_passa_il_token_di_chi_lo_chiede(cognito):
    """È Cognito a verificare la password attuale: il cookie rubato da solo
    non basta a prendersi l'account."""
    finto = cognito()

    change_own_password("access-token", "Vecchia1!", "Nuova1!")

    (operazione, argomenti) = finto.chiamate[0]
    assert operazione == "change_password"
    assert argomenti["AccessToken"] == "access-token"
    assert argomenti["PreviousPassword"] == "Vecchia1!"


@pytest.mark.parametrize(
    ("codice", "atteso"),
    [
        ("NotAuthorizedException", "password attuale non è corretta"),
        ("InvalidPasswordException", "requisiti di sicurezza"),
        ("LimitExceededException", "Troppi tentativi"),
        ("InternalErrorException", "Errore nel cambio password"),
    ],
)
def test_ogni_rifiuto_del_cambio_password_ha_la_sua_frase(cognito, codice, atteso):
    cognito(change_password=_errore(codice))

    with pytest.raises(RuntimeError, match=atteso):
        change_own_password("access-token", "Vecchia1!", "Nuova1!")


def test_una_rete_che_non_risponde_non_diventa_un_errore_di_password(cognito):
    """Chi legge deve capire che riprovare ha senso, invece di andare a
    cercare una password che non era sbagliata."""
    cognito(change_password=OSError("connessione rifiutata"))

    with pytest.raises(RuntimeError, match="comunicazione con AWS Cognito"):
        change_own_password("access-token", "Vecchia1!", "Nuova1!")


# ── Il rinnovo e la revoca ────────────────────────────────────────────


def test_il_rinnovo_restituisce_il_nuovo_token_di_accesso(cognito):
    cognito(initiate_auth=_tokens("nuovo-"))

    assert refresh_tokens("refresh") == {"access_token": "nuovo-access"}


def test_l_admin_locale_si_rinnova_da_solo(cognito):
    finto = cognito()

    assert refresh_tokens("mock-admin-refresh-token")["access_token"] == "mock-admin-access-token"
    assert finto.chiamate == []


def test_un_refresh_token_non_piu_valido_lo_dice(cognito):
    cognito(initiate_auth=_errore("NotAuthorizedException", "Refresh Token has been revoked"))

    with pytest.raises(RuntimeError, match="Impossibile rinnovare il token"):
        refresh_tokens("refresh")


def test_la_revoca_chiude_il_refresh_token_su_cognito(cognito):
    """Da qui in poi nessun rinnovo con quel token riesce: un refresh token
    rubato muore col logout invece di restare spendibile per trenta giorni."""
    finto = cognito()

    revoke_refresh_token("refresh")

    assert finto.operazioni() == ["revoke_token"]


def test_l_admin_locale_non_ha_niente_da_revocare(cognito):
    finto = cognito()

    revoke_refresh_token("mock-admin-refresh-token")

    assert finto.chiamate == []


def test_una_revoca_fallita_lo_dice_a_chi_la_deve_registrare(cognito):
    """Il chiamante la assorbe (vedi ``routers.auth``), ma deve poterla
    scrivere nei log: il prezzo è un token che resta valido fino a
    scadenza."""
    cognito(revoke_token=_errore("InvalidParameterException", "Token non valido"))

    with pytest.raises(RuntimeError, match="revoca del refresh token"):
        revoke_refresh_token("refresh")

    cognito(revoke_token=OSError("connessione rifiutata"))
    with pytest.raises(RuntimeError, match="comunicazione con AWS Cognito"):
        revoke_refresh_token("refresh")


# ── La verifica del token ─────────────────────────────────────────────


@pytest.fixture
def jwks(monkeypatch):
    """Le chiavi di firma, senza la chiamata di rete che le scarica."""
    monkeypatch.setattr(cognito_service, "_get_jwks", lambda: {"keys": [{"kid": "chiave-1"}]})


@pytest.fixture
def jwt_finto(monkeypatch):
    """La libreria dei token, che qui non deve verificare firme vere."""

    def _installa(claims, kid="chiave-1"):
        monkeypatch.setattr(
            cognito_service.jwt, "get_unverified_header", lambda token: {"kid": kid}
        )
        if isinstance(claims, Exception):

            def _decode(*args, **kwargs):
                raise claims
        else:

            def _decode(*args, **kwargs):
                return claims

        monkeypatch.setattr(cognito_service.jwt, "decode", _decode)

    return _installa


def test_il_token_dell_admin_locale_si_riconosce_da_solo():
    """Non è firmato da nessuno: è l'account che esiste solo qui."""
    claims = verify_access_token("mock-admin-access-token")

    assert claims["sub"] == "mock-admin-sub-0000-0000-0000"
    assert claims["token_use"] == "access"


def test_un_token_firmato_bene_restituisce_le_sue_dichiarazioni(jwks, jwt_finto):
    jwt_finto({"sub": "sub-1", "token_use": "access", "jti": "jti-1"})

    assert verify_access_token("token")["sub"] == "sub-1"


def test_un_token_di_identita_non_vale_come_token_di_accesso(jwks, jwt_finto):
    """Cognito ne emette tre, e l'id token porta i dati anagrafici ma non i
    permessi: accettarlo qui vorrebbe dire autenticare con la cosa
    sbagliata."""
    jwt_finto({"sub": "sub-1", "token_use": "id"})

    with pytest.raises(RuntimeError, match="non è un access token"):
        verify_access_token("token")


def test_un_token_firmato_con_una_chiave_sconosciuta_si_rifiuta(jwks, jwt_finto):
    jwt_finto({"sub": "sub-1", "token_use": "access"}, kid="chiave-di-un-altro")

    with pytest.raises(RuntimeError, match="Chiave di firma non trovata"):
        verify_access_token("token")


def test_un_token_scaduto_o_manomesso_lo_dice(jwks, jwt_finto):
    from jose import JWTError

    jwt_finto(JWTError("Signature has expired"))

    with pytest.raises(RuntimeError, match="Token non valido o scaduto"):
        verify_access_token("token")


def test_il_sub_si_ricava_dal_token_verificato(jwks, jwt_finto):
    jwt_finto({"sub": "sub-42", "token_use": "access"})

    assert get_cognito_sub_from_token("token") == "sub-42"


# ── Le chiavi di firma e la loro cache ────────────────────────────────


@pytest.fixture
def _svuota_cache_jwks():
    """La cache è globale al processo: senza questo, il primo test che la
    riempie deciderebbe l'esito dei successivi."""
    cognito_service._jwks_cache = None
    cognito_service._jwks_cache_time = 0
    yield
    cognito_service._jwks_cache = None
    cognito_service._jwks_cache_time = 0


def test_le_chiavi_si_scaricano_una_volta_sola(monkeypatch, _svuota_cache_jwks):
    """Sono le chiavi con cui si verifica **ogni** richiesta autenticata:
    scaricarle ogni volta metterebbe una chiamata di rete a Cognito davanti
    a ognuna."""
    chiamate = []

    class _Risposta:
        def raise_for_status(self):
            pass

        def json(self):
            return {"keys": [{"kid": "chiave-1"}]}

    def _get(url, timeout):
        chiamate.append(url)
        return _Risposta()

    monkeypatch.setattr(cognito_service.http_requests, "get", _get)

    assert cognito_service._get_jwks() == {"keys": [{"kid": "chiave-1"}]}
    assert cognito_service._get_jwks() == {"keys": [{"kid": "chiave-1"}]}
    assert len(chiamate) == 1


def test_le_chiavi_si_riscaricano_quando_la_cache_e_vecchia(monkeypatch, _svuota_cache_jwks):
    """Cognito ruota le sue chiavi: una cache che non scade prima o poi
    rifiuta i token buoni."""
    cognito_service._jwks_cache = {"keys": []}
    cognito_service._jwks_cache_time = time.time() - cognito_service._JWKS_CACHE_TTL - 1
    chiamate = []

    class _Risposta:
        def raise_for_status(self):
            pass

        def json(self):
            return {"keys": [{"kid": "chiave-nuova"}]}

    monkeypatch.setattr(
        cognito_service.http_requests,
        "get",
        lambda url, timeout: chiamate.append(url) or _Risposta(),
    )

    assert cognito_service._get_jwks() == {"keys": [{"kid": "chiave-nuova"}]}
    assert len(chiamate) == 1


# ── Le operazioni da amministratore ───────────────────────────────────


def _utente_cognito(sub="sub-1", stato="CONFIRMED") -> dict:
    return {
        "User": {
            "Attributes": [{"Name": "email", "Value": "a@b.c"}, {"Name": "sub", "Value": sub}]
        },
        "UserStatus": stato,
        "UserAttributes": [{"Name": "sub", "Value": sub}],
    }


def test_creare_un_utente_restituisce_il_suo_identificativo(cognito):
    """È la chiave con cui l'account locale e quello su Cognito restano
    legati: senza, la riga nel database non saprebbe più a chi appartiene."""
    cognito(admin_create_user=_utente_cognito(sub="sub-nuovo"))

    assert admin_create_user("mario@example.com") == "sub-nuovo"


def test_un_email_gia_registrata_lo_dice(cognito):
    cognito(admin_create_user=_errore("UsernameExistsException"))

    with pytest.raises(RuntimeError, match="esiste già"):
        admin_create_user("mario@example.com")


@pytest.mark.parametrize(
    ("codice", "atteso"),
    [
        ("InvalidParameterException", "Parametro non valido"),
        ("InternalErrorException", "Errore nella creazione utente"),
    ],
)
def test_gli_altri_rifiuti_della_creazione_hanno_la_loro_frase(cognito, codice, atteso):
    cognito(admin_create_user=_errore(codice))

    with pytest.raises(RuntimeError, match=atteso):
        admin_create_user("mario@example.com")


def test_una_creazione_senza_identificativo_non_passa_per_riuscita(cognito):
    """Non capita, e se capitasse lascerebbe una riga locale legata a
    niente: meglio fermarsi qui che scoprirlo al primo accesso."""
    cognito(admin_create_user={"User": {"Attributes": [{"Name": "email", "Value": "a@b.c"}]}})

    with pytest.raises(RuntimeError, match="Impossibile ottenere il cognito_sub"):
        admin_create_user("mario@example.com")


def test_sospendere_e_riattivare_chiamano_le_due_operazioni_opposte(cognito):
    finto = cognito()

    admin_set_user_enabled("mario@example.com", enabled=False)
    admin_set_user_enabled("mario@example.com", enabled=True)

    assert finto.operazioni() == ["admin_disable_user", "admin_enable_user"]


def test_sospendere_un_account_che_su_cognito_non_c_e_non_e_un_errore(cognito):
    """Esistono account solo locali: il blocco lo fa comunque lo stato
    scritto qui, che ogni richiesta rilegge."""
    cognito(admin_disable_user=_errore("UserNotFoundException"))

    admin_set_user_enabled("mario@example.com", enabled=False)


def test_una_sospensione_fallita_per_altro_motivo_risale(cognito):
    cognito(admin_disable_user=_errore("InternalErrorException"))

    with pytest.raises(RuntimeError, match="sospensione"):
        admin_set_user_enabled("mario@example.com", enabled=False)

    cognito(admin_enable_user=_errore("InternalErrorException"))
    with pytest.raises(RuntimeError, match="riattivazione"):
        admin_set_user_enabled("mario@example.com", enabled=True)

    cognito(admin_enable_user=OSError("connessione rifiutata"))
    with pytest.raises(RuntimeError, match="comunicazione con AWS Cognito"):
        admin_set_user_enabled("mario@example.com", enabled=True)


def test_cancellare_un_utente_che_non_c_e_lascia_proseguire_la_pulizia(cognito):
    """Il caso vero: una cancellazione già avvenuta a metà. Se fallisse qui,
    la riga locale resterebbe per sempre."""
    cognito(admin_delete_user=_errore("UserNotFoundException"))

    admin_delete_user("mario@example.com")


def test_una_cancellazione_fallita_per_altro_motivo_risale(cognito):
    cognito(admin_delete_user=_errore("InternalErrorException"))

    with pytest.raises(RuntimeError, match="eliminazione da Cognito"):
        admin_delete_user("mario@example.com")

    cognito(admin_delete_user=OSError("connessione rifiutata"))
    with pytest.raises(RuntimeError, match="comunicazione con AWS Cognito"):
        admin_delete_user("mario@example.com")


# ── Il rinvio delle credenziali ───────────────────────────────────────


def test_a_invito_ancora_aperto_si_rimanda_l_invito(cognito):
    """L'account non è mai stato usato: Cognito rigenera la password
    temporanea e la manda, e l'identificativo resta quello di prima."""
    finto = cognito(
        admin_get_user=_utente_cognito(sub="sub-1", stato="FORCE_CHANGE_PASSWORD"),
        admin_create_user=_utente_cognito(sub="sub-1"),
    )

    assert admin_resend_credentials("mario@example.com") == "sub-1"
    assert finto.chiamate[1][1]["MessageAction"] == "RESEND"


def test_a_password_gia_scelta_l_account_si_rifa(cognito):
    """Cognito non sa rimandare un invito a un account confermato, quindi
    l'unico modo di far arrivare una password nuova è ricrearlo: cambia
    l'identificativo, ed è il motivo per cui questa funzione lo
    restituisce."""
    finto = cognito(
        admin_get_user=_utente_cognito(sub="sub-vecchio", stato="CONFIRMED"),
        admin_create_user=_utente_cognito(sub="sub-nuovo"),
    )

    assert admin_resend_credentials("mario@example.com") == "sub-nuovo"
    assert finto.operazioni() == ["admin_get_user", "admin_delete_user", "admin_create_user"]


def test_un_account_orfano_si_ricrea_invece_di_fallire(cognito):
    """Su Cognito non c'è più ma qui sì: è una ricreazione andata a metà, e
    l'invito deve partire lo stesso."""
    finto = cognito(
        admin_get_user=_errore("UserNotFoundException"),
        admin_create_user=_utente_cognito(sub="sub-nuovo"),
    )

    assert admin_resend_credentials("mario@example.com") == "sub-nuovo"
    assert finto.operazioni() == ["admin_get_user", "admin_create_user"]


def test_un_invito_aperto_senza_identificativo_si_ferma(cognito):
    risposta = _utente_cognito(stato="FORCE_CHANGE_PASSWORD")
    risposta["UserAttributes"] = [{"Name": "email", "Value": "a@b.c"}]
    cognito(admin_get_user=risposta, admin_create_user={})

    with pytest.raises(RuntimeError, match="Impossibile ottenere il cognito_sub"):
        admin_resend_credentials("mario@example.com")


def test_i_guasti_del_rinvio_arrivano_con_il_loro_messaggio(cognito):
    cognito(admin_get_user=_errore("InternalErrorException", "Servizio giù"))
    with pytest.raises(RuntimeError, match="lettura dell'utente da Cognito"):
        admin_resend_credentials("mario@example.com")

    cognito(admin_get_user=OSError("connessione rifiutata"))
    with pytest.raises(RuntimeError, match="comunicazione con AWS Cognito"):
        admin_resend_credentials("mario@example.com")

    cognito(
        admin_get_user=_utente_cognito(stato="FORCE_CHANGE_PASSWORD"),
        admin_create_user=_errore("InternalErrorException"),
    )
    with pytest.raises(RuntimeError, match="rinvio dell'invito"):
        admin_resend_credentials("mario@example.com")

    cognito(
        admin_get_user=_utente_cognito(stato="FORCE_CHANGE_PASSWORD"),
        admin_create_user=OSError("connessione rifiutata"),
    )
    with pytest.raises(RuntimeError, match="comunicazione con AWS Cognito"):
        admin_resend_credentials("mario@example.com")
