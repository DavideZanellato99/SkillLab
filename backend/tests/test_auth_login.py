"""L'accesso: cosa esce dai cookie e cosa non esce dai messaggi.

Gli account bloccati stanno in ``test_organizations``, che è dove vive la
sospensione; qui c'è il resto dell'accesso. Due cose sono la sostanza di
questo endpoint e sono provate una per una.

La prima è che un accesso fallito **dice sempre la stessa cosa**, qualunque
sia il motivo vero. Email inesistente, password sbagliata, utente presente
su Cognito ma senza riga qui: tre percorsi diversi che devono uscire con lo
stesso messaggio, altrimenti provare indirizzi a caso diventa un modo per
scoprire quali sono registrati. Il motivo vero finisce nei log, dove lo
legge chi amministra e non chi bussa.

La seconda è il contatore dei tentativi, che ferma chi prova password a
raffica. Conta solo i fallimenti, e un accesso riuscito azzera il secchiello
dell'indirizzo ma non quello dell'indirizzo di rete: se azzerasse anche
quello, chi attacca lo svuoterebbe entrando in un account suo fra un
tentativo e l'altro.
"""

import logging
from datetime import UTC, datetime, timedelta

import pytest

from auth_dependency import ACCESS_TOKEN_COOKIE, MOCK_ADMIN_SUB, REFRESH_TOKEN_COOKIE
from models import AuditLog, TokenSession
from routers import auth as auth_router
from routers.auth import _retry_message, validate_password_strength
from token_denylist import is_jti_revoked

LOGIN = "/api/auth/login"
NUOVA_PASSWORD = "/api/auth/new-password"
CAMBIO_PASSWORD = "/api/auth/change-password"


@pytest.fixture
def cognito_accetta(monkeypatch):
    """Cognito dice di sì e restituisce i token, senza parlare con AWS."""
    monkeypatch.setattr(
        auth_router,
        "authenticate",
        lambda email, password: {"access_token": "access", "refresh_token": "refresh"},
    )
    monkeypatch.setattr(auth_router, "_bind_fresh_token", lambda *args, **kwargs: None)


@pytest.fixture
def cambio_password_riuscito(monkeypatch):
    """Cognito accetta la password nuova, chiude le sessioni e riapre questa.

    Sono le tre chiamate che il cambio password fa adesso: senza questa
    fixture ognuna partirebbe verso AWS per davvero.
    """
    chiamate: dict[str, object] = {}
    monkeypatch.setattr(
        auth_router,
        "change_own_password",
        lambda token, previous, nuova: chiamate.update(cambiata=nuova),
    )
    monkeypatch.setattr(
        auth_router, "global_sign_out", lambda token: chiamate.update(sign_out=token)
    )
    monkeypatch.setattr(
        auth_router,
        "authenticate",
        lambda email, password: (
            chiamate.update(rientro=(email, password))
            or {"access_token": "access-nuovo", "refresh_token": "refresh-nuovo"}
        ),
    )
    monkeypatch.setattr(auth_router, "_bind_fresh_token", lambda *args, **kwargs: None)
    return chiamate


@pytest.fixture
def cognito_rifiuta(monkeypatch):
    def _rifiuta(email, password):
        raise RuntimeError("Email o password non corretti.")

    monkeypatch.setattr(auth_router, "authenticate", _rifiuta)


def _accedi(client, email, password="irrilevante"):
    return client.post(LOGIN, json={"email": email, "password": password})


# ── L'accesso riuscito ────────────────────────────────────────────────


def test_l_accesso_riuscito_consegna_i_token_nei_cookie_e_non_nel_corpo(
    client, standard_user, cognito_accetta
):
    """I token viaggiano solo in cookie HttpOnly: il JavaScript della pagina
    non li legge mai, ed è la difesa contro un XSS che se li porterebbe
    via."""
    risposta = _accedi(client, standard_user.email)

    assert risposta.status_code == 200
    assert "access_token" not in risposta.text
    cookie = "".join(risposta.headers.get_list("set-cookie"))
    assert f"{ACCESS_TOKEN_COOKIE}=access" in cookie
    assert f"{REFRESH_TOKEN_COOKIE}=refresh" in cookie
    assert "HttpOnly" in cookie
    assert "Secure" in cookie


def test_il_cookie_del_rinnovo_gira_solo_sulle_rotte_che_lo_usano(
    client, standard_user, cognito_accetta
):
    """Serve a /refresh e a /logout e a nient'altro: limitargli il percorso
    riduce la superficie su cui può essere intercettato.

    E lo stesso vale per la provenienza. ``SameSite=Strict`` se lo può
    permettere solo lui: quello di accesso deve restare ``Lax``, o chi arriva
    da un link scritto in una mail si troverebbe al login pur avendo una
    sessione valida, mentre il rinnovo parte sempre dalla pagina già aperta.
    """
    risposta = _accedi(client, standard_user.email)

    cookie = risposta.headers.get_list("set-cookie")
    rinnovo = next(c for c in cookie if c.startswith(REFRESH_TOKEN_COOKIE))
    accesso = next(c for c in cookie if c.startswith(ACCESS_TOKEN_COOKIE))
    assert "Path=/api/auth" in rinnovo
    assert "SameSite=strict" in rinnovo
    assert "SameSite=lax" in accesso


def test_l_accesso_riuscito_lascia_la_sua_riga_nel_registro(
    client, db_session, standard_user, cognito_accetta
):
    _accedi(client, standard_user.email)

    assert db_session.query(AuditLog).filter(AuditLog.action == "auth.login").count() == 1


def test_l_admin_locale_entra_e_la_sua_riga_nasce_al_primo_accesso(client, db_session, monkeypatch):
    """L'account di sviluppo non è su Cognito e non è nel database finché
    non entra la prima volta: è il solo caso in cui l'accesso crea l'utente
    invece di cercarlo."""
    monkeypatch.setattr(
        auth_router,
        "authenticate",
        lambda email, password: {
            "access_token": "mock-admin-access-token",
            "refresh_token": "mock-admin-refresh-token",
        },
    )
    monkeypatch.setattr(auth_router, "_bind_fresh_token", lambda *args, **kwargs: None)

    risposta = _accedi(client, "admin", "admin")

    assert risposta.status_code == 200
    assert risposta.json()["user"]["email"] == "admin"


def test_il_primo_accesso_torna_indietro_con_la_sfida_e_nessun_cookie(client, monkeypatch):
    """L'invito è ancora aperto: non c'è una sessione da consegnare finché
    la password temporanea non è stata sostituita."""
    monkeypatch.setattr(
        auth_router,
        "authenticate",
        lambda email, password: {"challenge": "NEW_PASSWORD_REQUIRED", "session": "sessione-1"},
    )

    risposta = _accedi(client, "mario@example.com", "temporanea")

    assert risposta.status_code == 200
    assert risposta.json()["session"] == "sessione-1"
    assert risposta.headers.get_list("set-cookie") == []


# ── L'accesso fallito ─────────────────────────────────────────────────


def test_le_credenziali_sbagliate_danno_un_messaggio_che_non_dice_niente(
    client, standard_user, cognito_rifiuta
):
    risposta = _accedi(client, standard_user.email)

    assert risposta.status_code == 401
    assert risposta.json()["detail"] == "Credenziali non valide"


def test_un_utente_di_cognito_senza_riga_qui_riceve_lo_stesso_messaggio(
    client, db_session, cognito_accetta
):
    """Le credenziali erano giuste: un messaggio dedicato lo confermerebbe a
    chi le sta provando."""
    risposta = _accedi(client, "mai-visto@example.com")

    assert risposta.status_code == 401
    assert risposta.json()["detail"] == "Credenziali non valide"


def test_del_tentativo_fallito_resta_scritta_solo_l_email_provata(
    client, db_session, standard_user, cognito_rifiuta
):
    """Il motivo no: nel registro sarebbe l'elenco di quali indirizzi
    esistono, a disposizione di chiunque possa leggerlo."""
    _accedi(client, standard_user.email.upper())

    riga = db_session.query(AuditLog).filter(AuditLog.action == "auth.login_failed").one()
    assert riga.user_email == standard_user.email.lower()
    assert riga.status_code == 401
    assert "motivo" not in (riga.details or {})


# ── Il contatore dei tentativi ────────────────────────────────────────


def test_dopo_troppi_tentativi_l_accesso_si_chiude_per_un_po(
    client, db_session, standard_user, cognito_rifiuta
):
    for _ in range(5):
        _accedi(client, standard_user.email)

    risposta = _accedi(client, standard_user.email)

    assert risposta.status_code == 429
    assert "Riprova tra" in risposta.json()["detail"]
    # L'intestazione è quella che il browser sa leggere da solo
    assert int(risposta.headers["Retry-After"]) > 0


def test_il_contatore_si_ferma_prima_di_chiedere_a_cognito(
    client, db_session, standard_user, monkeypatch
):
    """Il senso del limite: le richieste in eccesso non arrivano nemmeno ad
    AWS, altrimenti sarebbe AWS a doversene difendere."""
    tentativi = []

    def _rifiuta(email, password):
        tentativi.append(email)
        raise RuntimeError("Email o password non corretti.")

    monkeypatch.setattr(auth_router, "authenticate", _rifiuta)

    for _ in range(7):
        _accedi(client, standard_user.email)

    assert len(tentativi) == 5


def test_un_accesso_riuscito_azzera_il_secchiello_dell_indirizzo(
    client, db_session, standard_user, monkeypatch
):
    """Chi sbaglia la password quattro volte e poi la indovina non deve
    restare a un tentativo dal blocco per il resto del quarto d'ora."""
    esiti = {"fallisce": True}

    def _autentica(email, password):
        if esiti["fallisce"]:
            raise RuntimeError("Email o password non corretti.")
        return {"access_token": "access", "refresh_token": "refresh"}

    monkeypatch.setattr(auth_router, "authenticate", _autentica)
    monkeypatch.setattr(auth_router, "_bind_fresh_token", lambda *args, **kwargs: None)

    for _ in range(4):
        _accedi(client, standard_user.email)
    esiti["fallisce"] = False
    assert _accedi(client, standard_user.email).status_code == 200

    esiti["fallisce"] = True
    for _ in range(5):
        assert _accedi(client, standard_user.email).status_code == 401


def test_l_attesa_si_legge_in_minuti_quando_e_lunga():
    """La frase la legge chi è appena stato bloccato: "riprova tra 847
    secondi" è un numero che nessuno converte a mente."""
    assert _retry_message(45) == "Troppi tentativi di accesso. Riprova tra 45 secondi"
    assert _retry_message(60) == "Troppi tentativi di accesso. Riprova tra 1 minuto"
    assert _retry_message(61) == "Troppi tentativi di accesso. Riprova tra 2 minuti"


# ── Il legame della sessione, quando non si riesce a registrarlo ──────


def test_un_legame_non_registrato_non_impedisce_l_accesso(
    client, standard_user, monkeypatch, caplog
):
    """Se le chiavi di firma non si scaricano, l'accesso passa lo stesso: lo
    stesso guasto bloccherebbe comunque ogni richiesta successiva, e
    fermarsi qui aggiungerebbe solo un secondo errore allo stesso guasto."""

    def _non_verificabile(token, verify_exp=True):
        raise RuntimeError("JWKS irraggiungibile")

    monkeypatch.setattr(
        auth_router,
        "authenticate",
        lambda email, password: {"access_token": "access", "refresh_token": "refresh"},
    )
    monkeypatch.setattr(auth_router, "verify_access_token", _non_verificabile)

    risposta = _accedi(client, standard_user.email)

    assert risposta.status_code == 200
    assert "Session binding non registrato" in caplog.text


# ── La prima password ─────────────────────────────────────────────────


def test_la_prima_password_debole_viene_rifiutata_con_l_elenco_di_cosa_manca(client):
    """L'elenco è quello che permette di correggere al secondo tentativo
    invece di indovinare quale regola non andava bene."""
    risposta = client.post(
        NUOVA_PASSWORD,
        json={"email": "mario@example.com", "new_password": "corta", "session": "s"},
    )

    assert risposta.status_code == 400
    assert "almeno 12 caratteri" in risposta.json()["detail"]
    assert "un numero" in risposta.json()["detail"]


def test_una_sfida_scaduta_lo_dice_a_chi_stava_scegliendo_la_password(client, monkeypatch):
    def _scaduta(**kwargs):
        raise RuntimeError("Sessione scaduta. Effettua nuovamente il login.")

    monkeypatch.setattr(auth_router, "respond_to_new_password_challenge", _scaduta)

    risposta = client.post(
        NUOVA_PASSWORD,
        json={"email": "mario@example.com", "new_password": "PasswordNuova1!", "session": "s"},
    )

    assert risposta.status_code == 400
    assert "Effettua nuovamente il login" in risposta.json()["detail"]


def test_una_password_scelta_da_chi_non_e_nel_database_non_apre_niente(client, monkeypatch):
    """Caso di configurazione a metà: l'account esiste su Cognito e non qui.
    Qui il messaggio può essere esplicito, perché chi lo legge ha appena
    dimostrato di avere la password temporanea."""
    monkeypatch.setattr(
        auth_router,
        "respond_to_new_password_challenge",
        lambda **kwargs: {"access_token": "access", "refresh_token": "refresh"},
    )

    risposta = client.post(
        NUOVA_PASSWORD,
        json={"email": "mai-visto@example.com", "new_password": "PasswordNuova1!", "session": "s"},
    )

    assert risposta.status_code == 404
    assert "Contatta l'amministratore" in risposta.json()["detail"]


def test_la_prima_password_accettata_consegna_subito_la_sessione(
    client, standard_user, monkeypatch
):
    monkeypatch.setattr(
        auth_router,
        "respond_to_new_password_challenge",
        lambda **kwargs: {"access_token": "access", "refresh_token": "refresh"},
    )
    monkeypatch.setattr(auth_router, "_bind_fresh_token", lambda *args, **kwargs: None)

    risposta = client.post(
        NUOVA_PASSWORD,
        json={
            "email": standard_user.email,
            "new_password": "PasswordNuova1!",
            "session": "sessione-1",
        },
    )

    assert risposta.status_code == 200
    assert f"{ACCESS_TOKEN_COOKIE}=access" in "".join(risposta.headers.get_list("set-cookie"))


# ── Le regole della password ──────────────────────────────────────────


def test_una_password_che_rispetta_tutte_le_regole_non_ha_niente_da_dire():
    assert validate_password_strength("PasswordNuova1!") == []


@pytest.mark.parametrize(
    ("password", "mancante"),
    [
        ("Corta1!", "almeno 12 caratteri"),
        ("passwordnuova1!", "una lettera maiuscola"),
        ("PASSWORDNUOVA1!", "una lettera minuscola"),
        ("PasswordNuova!!", "un numero"),
        ("PasswordNuova12", "un simbolo (es. !@#$%)"),
    ],
)
def test_ogni_regola_non_rispettata_si_nomina(password, mancante):
    """Le regole sono quelle del pool di Cognito: se qui passasse qualcosa
    che di là viene rifiutato, l'utente vedrebbe un errore dopo aver già
    scelto la password."""
    assert mancante in validate_password_strength(password)


def test_i_simboli_ammessi_sono_quelli_che_cognito_conta_come_tali():
    """Un carattere che Cognito non considera un simbolo non deve valere
    come simbolo nemmeno qui, o la password passa il controllo locale e
    viene respinta dal pool."""
    assert validate_password_strength("PasswordNuova1_") == []
    assert "un simbolo (es. !@#$%)" in validate_password_strength("PasswordNuova1€")


# ── Il cambio password di chi è già dentro ────────────────────────────


def test_il_cambio_password_chiede_a_cognito_la_password_attuale(
    user_client, monkeypatch, standard_user, cambio_password_riuscito
):
    """Il cookie rubato da solo non basta a prendersi l'account: la vecchia
    password la verifica Cognito, non questo endpoint."""
    ricevuti = {}

    def _cambia(access_token, previous, nuova):
        ricevuti.update(token=access_token, previous=previous, nuova=nuova)

    monkeypatch.setattr(auth_router, "change_own_password", _cambia)
    user_client.cookies.set(ACCESS_TOKEN_COOKIE, "token-di-sessione")

    risposta = user_client.post(
        CAMBIO_PASSWORD,
        json={"current_password": "Vecchia1!", "new_password": "PasswordNuova1!"},
    )
    user_client.cookies.clear()

    assert risposta.status_code == 200
    assert ricevuti == {
        "token": "token-di-sessione",
        "previous": "Vecchia1!",
        "nuova": "PasswordNuova1!",
    }


def test_senza_il_cookie_della_sessione_non_c_e_niente_da_cambiare(user_client):
    """Non capita da un browser, capita da un client che manda solo
    l'intestazione: senza il token di accesso, Cognito non saprebbe di chi
    è la password."""
    risposta = user_client.post(
        CAMBIO_PASSWORD,
        json={"current_password": "Vecchia1!", "new_password": "PasswordNuova1!"},
    )

    assert risposta.status_code == 401


def test_la_nuova_password_debole_si_ferma_prima_di_cognito(user_client, monkeypatch):
    def _mai(*args, **kwargs):
        raise AssertionError("Cognito non doveva essere chiamato")

    monkeypatch.setattr(auth_router, "change_own_password", _mai)

    risposta = user_client.post(
        CAMBIO_PASSWORD, json={"current_password": "Vecchia1!", "new_password": "corta"}
    )

    assert risposta.status_code == 400
    assert "almeno 12 caratteri" in risposta.json()["detail"]


def test_una_password_attuale_sbagliata_lo_dice(user_client, monkeypatch):
    def _rifiuta(*args):
        raise RuntimeError("La password attuale non è corretta.")

    monkeypatch.setattr(auth_router, "change_own_password", _rifiuta)
    user_client.cookies.set(ACCESS_TOKEN_COOKIE, "token-di-sessione")

    risposta = user_client.post(
        CAMBIO_PASSWORD,
        json={"current_password": "Sbagliata1!", "new_password": "PasswordNuova1!"},
    )
    user_client.cookies.clear()

    assert risposta.status_code == 400
    assert "password attuale non è corretta" in risposta.json()["detail"]


def test_l_account_di_sistema_non_puo_cambiare_la_sua_password(
    client, db_session, act_as, monkeypatch
):
    """Non esiste su Cognito: la richiesta partirebbe verso un utente che di
    là non c'è, e tornerebbe un errore che non spiega niente."""
    from auth_dependency import get_or_create_mock_admin

    admin = get_or_create_mock_admin(db_session)
    act_as(admin)

    risposta = client.post(
        CAMBIO_PASSWORD,
        json={"current_password": "Vecchia1!", "new_password": "PasswordNuova1!"},
    )

    assert risposta.status_code == 400
    assert "account di sistema" in risposta.json()["detail"]
    assert admin.cognito_sub == MOCK_ADMIN_SUB


# ── Il cambio password chiude quello che la password vecchia aveva aperto ──


def _cambia_password(client, nuova="PasswordNuova1!"):
    client.cookies.set(ACCESS_TOKEN_COOKIE, "token-di-sessione")
    risposta = client.post(
        CAMBIO_PASSWORD, json={"current_password": "Vecchia1!", "new_password": nuova}
    )
    client.cookies.clear()
    return risposta


def test_il_cambio_password_chiude_tutte_le_sessioni_su_cognito(
    user_client, cambio_password_riuscito
):
    """Chi cambia la password teme quasi sempre che qualcuno la conoscesse:
    lasciare in piedi le sessioni già aperte non risponde a quel timore, il
    cookie rubato resterebbe buono per un'altra ora."""
    assert _cambia_password(user_client).status_code == 200

    assert cambio_password_riuscito["sign_out"] == "token-di-sessione"


def test_il_cambio_password_revoca_anche_le_sessioni_registrate_qui(
    user_client, db_session, standard_user, cambio_password_riuscito
):
    """L'altra metà della stessa chiusura: Cognito smette di rinnovare, la
    denylist ferma subito gli access token già emessi."""
    db_session.add(
        TokenSession(
            jti="jti-di-un-altro-browser",
            user_id=standard_user.id,
            client_ip="203.0.113.9",
            user_agent="Chrome/120.0",
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1),
        )
    )
    db_session.flush()

    _cambia_password(user_client)

    assert is_jti_revoked(db_session, "jti-di-un-altro-browser")


def test_dopo_il_cambio_password_il_browser_riceve_cookie_nuovi(
    user_client, cambio_password_riuscito, standard_user
):
    """Cognito non sa chiudere "tutte tranne una", quindi cade anche questa:
    chi ha appena dimostrato di conoscere entrambe le password non deve
    rifare il login per questo, e la sessione riparte qui."""
    risposta = _cambia_password(user_client)

    assert cambio_password_riuscito["rientro"] == (standard_user.email, "PasswordNuova1!")
    cookie = "".join(risposta.headers.get_list("set-cookie"))
    assert f"{ACCESS_TOKEN_COOKIE}=access-nuovo" in cookie
    assert f"{REFRESH_TOKEN_COOKIE}=refresh-nuovo" in cookie


def test_se_il_rientro_non_riesce_i_cookie_se_ne_vanno(user_client, monkeypatch):
    """La password è cambiata davvero, quindi la richiesta non è fallita: è
    la sessione che non c'è più, e il browser deve saperlo invece di
    portarsi dietro un cookie che nessuno onorerà."""
    monkeypatch.setattr(auth_router, "change_own_password", lambda *a: None)
    monkeypatch.setattr(auth_router, "global_sign_out", lambda token: None)

    def _cognito_giu(email, password):
        raise RuntimeError("Cognito irraggiungibile")

    monkeypatch.setattr(auth_router, "authenticate", _cognito_giu)

    risposta = _cambia_password(user_client)

    assert risposta.status_code == 200
    assert "Effettua nuovamente l'accesso" in risposta.json()["message"]
    cookie = "".join(risposta.headers.get_list("set-cookie"))
    assert f'{ACCESS_TOKEN_COOKIE}=""' in cookie or f"{ACCESS_TOKEN_COOKIE}=;" in cookie


def test_una_chiusura_fallita_su_cognito_non_ferma_il_cambio(
    user_client, monkeypatch, caplog, cambio_password_riuscito
):
    """La denylist locale ha già fermato gli access token: quello che resta
    in piedi è la possibilità di rinnovare, e vale una riga nei log."""

    def _cognito_giu(token):
        raise RuntimeError("Cognito irraggiungibile")

    monkeypatch.setattr(auth_router, "global_sign_out", _cognito_giu)

    with caplog.at_level(logging.ERROR):
        risposta = _cambia_password(user_client)

    assert risposta.status_code == 200
    assert "chiusura delle sessioni su Cognito fallita" in caplog.text


def test_troppi_cambi_password_falliti_di_fila_si_fermano(user_client, monkeypatch):
    """Chi ha in mano un cookie rubato ma non la password la proverebbe da
    qui, ed è l'unico posto in cui può farlo."""

    def _rifiuta(*args):
        raise RuntimeError("La password attuale non è corretta.")

    monkeypatch.setattr(auth_router, "change_own_password", _rifiuta)

    for _ in range(5):
        assert _cambia_password(user_client).status_code == 400

    risposta = _cambia_password(user_client)
    assert risposta.status_code == 429
    assert risposta.headers["Retry-After"]


def test_l_export_dei_propri_dati_ha_un_tetto(user_client, monkeypatch):
    """Nessuno lo sta indovinando: costa, e il modo di abusarne è chiederlo
    in continuazione."""
    monkeypatch.setattr(auth_router.personal_data, "export_zip", lambda db, user: b"zip")

    for _ in range(5):
        assert user_client.get("/api/auth/me/export").status_code == 200

    assert user_client.get("/api/auth/me/export").status_code == 429


def test_troppe_prime_password_rifiutate_di_fila_si_fermano(client, monkeypatch):
    """La sfida arriva da Cognito e non si indovina, ma l'endpoint è aperto
    e ogni tentativo è una chiamata ad AWS: il tetto sta sull'indirizzo, come
    quello dell'accesso."""

    def _rifiuta(email, new_password, session):
        raise RuntimeError("Sessione non valida.")

    monkeypatch.setattr(auth_router, "respond_to_new_password_challenge", _rifiuta)
    corpo = {
        "email": "tale@esempio.invalid",
        "new_password": "PasswordNuova1!",
        "session": "sessione-scaduta",
    }

    for _ in range(10):
        assert client.post(NUOVA_PASSWORD, json=corpo).status_code == 400

    risposta = client.post(NUOVA_PASSWORD, json=corpo)

    assert risposta.status_code == 429
    assert risposta.headers["Retry-After"]
