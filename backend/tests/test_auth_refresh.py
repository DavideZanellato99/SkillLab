"""Il rinnovo del token e l'uscita, cioè i due punti dove una sessione muore.

Il rinnovo è il momento più delicato dell'autenticazione: è l'unico in cui
il backend consegna un token nuovo a chi presenta soltanto dei cookie. Se
qui il controllo del contesto non ci fosse, chi ha rubato i due cookie si
farebbe emettere un token di accesso legato al **suo** indirizzo, e da
quel momento la sessione sarebbe sua a tutti gli effetti.

I controlli sono due e stanno ai due lati della chiamata a Cognito. Prima:
il vecchio token di accesso deve venire dallo stesso posto in cui è nato,
e la verifica passa anche se è scaduto, perché quello che serve è
l'identificativo e non la validità. Dopo: il token appena emesso deve
corrispondere all'ancora scritta al login. Il primo esiste perché il
secondo da solo arriverebbe troppo tardi, cioè a token già coniato.

Ogni rifiuto risponde la stessa frase e porta via i cookie. La frase è
generica di proposito: al browser non serve sapere quale dei controlli non
è passato, e a chi ha rubato i cookie serve ancora meno.
"""

from datetime import UTC, datetime, timedelta

import pytest

import token_denylist
from auth_dependency import ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE
from models import AuditLog, TokenSession
from routers import auth as auth_router
from token_denylist import is_jti_revoked

REFRESH = "/api/auth/refresh"
LOGOUT = "/api/auth/logout"

# Come si presenta il client di prova: sono i due valori che compongono il
# legame, e le righe seminate qui devono portare gli stessi.
IP_DEL_CLIENT = "testclient"
UA_DEL_CLIENT = "testclient"


@pytest.fixture(autouse=True)
def _reset_denylist_cache():
    """La denylist ha una cache di processo, che va svuotata fra un test e
    l'altro o un jti revocato qui resta revocato per la suite intera."""
    token_denylist._cache.clear()
    token_denylist._cache_loaded_at = None
    yield
    token_denylist._cache.clear()
    token_denylist._cache_loaded_at = None


@pytest.fixture
def cognito(monkeypatch):
    """Cognito che rinnova e revoca, con quello che serve al test.

    ``claims`` è un dizionario da token alle sue dichiarazioni, oppure
    un'eccezione se quel token non deve essere verificabile.
    """
    revocati: list[str] = []

    def _installa(claims=None, nuovo_token="access-nuovo", rinnovo=None):
        claims = claims or {}

        def _verify(token, verify_exp=True):
            esito = claims.get(token)
            if esito is None or isinstance(esito, Exception):
                raise esito or RuntimeError(f"Token non verificabile: {token}")
            return esito

        def _refresh(refresh_token):
            if isinstance(rinnovo, Exception):
                raise rinnovo
            return {"access_token": nuovo_token}

        monkeypatch.setattr(auth_router, "verify_access_token", _verify)
        monkeypatch.setattr(auth_router, "refresh_tokens", _refresh)
        monkeypatch.setattr(auth_router, "revoke_refresh_token", revocati.append)
        return revocati

    return _installa


def _semina_ancora(db_session, jti, *, ip=IP_DEL_CLIENT, user_agent=UA_DEL_CLIENT) -> TokenSession:
    """Il contesto registrato al login, che è quello che il rinnovo guarda."""
    riga = TokenSession(
        jti=jti,
        client_ip=ip,
        user_agent=user_agent,
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
    )
    db_session.add(riga)
    db_session.flush()
    return riga


def _con_cookie(client, *, refresh="refresh", access=None):
    client.cookies.clear()
    if refresh is not None:
        client.cookies.set(REFRESH_TOKEN_COOKIE, refresh)
    if access is not None:
        client.cookies.set(ACCESS_TOKEN_COOKIE, access)
    return client


def _cookie_puliti(risposta) -> bool:
    """Una risposta che porta via i cookie li riscrive scaduti."""
    intestazioni = "".join(risposta.headers.get_list("set-cookie"))
    return ACCESS_TOKEN_COOKIE in intestazioni and REFRESH_TOKEN_COOKIE in intestazioni


# ── Il rinnovo riuscito ───────────────────────────────────────────────


def test_il_rinnovo_consegna_un_token_nuovo_a_chi_e_rimasto_dov_era(
    client, db_session, standard_user, cognito
):
    _semina_ancora(db_session, "origin-1")
    cognito(
        claims={
            "access-vecchio": {"jti": "jti-1", "origin_jti": "origin-1"},
            "access-nuovo": {
                "jti": "jti-2",
                "origin_jti": "origin-1",
                "sub": standard_user.cognito_sub,
            },
        }
    )
    _semina_ancora(db_session, "jti-1")

    risposta = _con_cookie(client, access="access-vecchio").post(REFRESH)

    assert risposta.status_code == 200
    assert f"{ACCESS_TOKEN_COOKIE}=access-nuovo" in "".join(risposta.headers.get_list("set-cookie"))


def test_il_token_nuovo_nasce_gia_legato_a_chi_lo_ha_chiesto(
    client, db_session, standard_user, cognito
):
    """Senza questa riga il token appena emesso sarebbe un token senza
    legame, e alla richiesta successiva verrebbe rifiutato da solo."""
    _semina_ancora(db_session, "origin-1")
    cognito(
        claims={
            "access-nuovo": {
                "jti": "jti-2",
                "origin_jti": "origin-1",
                "sub": standard_user.cognito_sub,
            }
        }
    )

    _con_cookie(client).post(REFRESH)

    riga = db_session.get(TokenSession, "jti-2")
    assert riga.client_ip == IP_DEL_CLIENT
    assert riga.user_id == standard_user.id


def test_un_vecchio_cookie_illeggibile_non_blocca_il_rinnovo(client, db_session, cognito):
    """Un cookie corrotto non identifica niente, quindi il controllo prima
    della chiamata si salta: quello dopo, sull'ancora, regge comunque la
    rotazione."""
    _semina_ancora(db_session, "origin-1")
    cognito(
        claims={
            "spazzatura": RuntimeError("Token non valido o scaduto"),
            "access-nuovo": {"jti": "jti-2", "origin_jti": "origin-1"},
        }
    )

    risposta = _con_cookie(client, access="spazzatura").post(REFRESH)

    assert risposta.status_code == 200


def test_un_token_senza_identificativo_passa_senza_controlli(client, db_session, cognito):
    """È l'admin locale: il suo token non viene da Cognito e non ha un jti,
    quindi non c'è niente da confrontare con niente."""
    cognito(claims={"access-nuovo": {"sub": "mock-admin-sub-0000-0000-0000"}})

    risposta = _con_cookie(client).post(REFRESH)

    assert risposta.status_code == 200


# ── Il rinnovo rifiutato ──────────────────────────────────────────────


def test_senza_il_cookie_del_rinnovo_non_c_e_niente_da_rinnovare(client):
    risposta = _con_cookie(client, refresh=None).post(REFRESH)

    assert risposta.status_code == 401
    assert "Refresh token mancante" in risposta.json()["detail"]


def test_un_rinnovo_da_un_altro_posto_uccide_la_sessione_prima_di_coniare(
    client, db_session, cognito
):
    """Il controllo che conta: si ferma **prima** della chiamata a Cognito,
    quindi il token nuovo non nasce nemmeno. Se aspettasse la verifica
    dopo, un token legato al ladro sarebbe già stato emesso."""
    _semina_ancora(db_session, "jti-1", ip="198.51.100.4")
    # Un rinnovo che arrivasse fino a Cognito farebbe fallire il test qui:
    # AssertionError non è fra le eccezioni che l'endpoint assorbe
    revocati = cognito(
        claims={"access-rubato": {"jti": "jti-1", "origin_jti": "origin-1"}},
        rinnovo=AssertionError("Cognito non doveva coniare niente"),
    )

    risposta = _con_cookie(client, access="access-rubato").post(REFRESH)

    assert risposta.status_code == 401
    # Non solo rifiutato: la sessione muore di qua e su Cognito
    assert is_jti_revoked(db_session, "jti-1") is True
    assert revocati == ["refresh"]
    assert _cookie_puliti(risposta)


def test_una_sessione_gia_revocata_non_si_rinnova(client, db_session, cognito):
    """Chi è uscito è uscito: i cookie rimasti nel browser non riaprono la
    porta."""
    revocati = cognito(claims={"access-vecchio": {"jti": "jti-1", "origin_jti": "origin-1"}})
    token_denylist.revoke_jtis(
        db_session, [("jti-1", datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1))]
    )

    risposta = _con_cookie(client, access="access-vecchio").post(REFRESH)

    assert risposta.status_code == 401
    assert revocati == ["refresh"]


def test_un_refresh_token_che_cognito_rifiuta_chiude_la_sessione(client, cognito):
    cognito(rinnovo=RuntimeError("Refresh Token has been revoked"))

    risposta = _con_cookie(client).post(REFRESH)

    assert risposta.status_code == 401
    assert risposta.json()["detail"] == "Sessione scaduta. Effettua nuovamente il login."
    assert _cookie_puliti(risposta)


def test_un_token_emesso_ma_non_verificabile_non_diventa_un_cookie(client, cognito):
    """Non capita se Cognito funziona: se capitasse, consegnarlo lascerebbe
    il browser con un cookie che ogni richiesta successiva rifiuta."""
    cognito(claims={})

    risposta = _con_cookie(client).post(REFRESH)

    assert risposta.status_code == 401


def test_un_token_nuovo_di_una_sessione_revocata_viene_buttato(client, db_session, cognito):
    revocati = cognito(claims={"access-nuovo": {"jti": "jti-2", "origin_jti": "origin-1"}})
    token_denylist.revoke_jtis(
        db_session, [("origin-1", datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1))]
    )

    risposta = _con_cookie(client).post(REFRESH)

    assert risposta.status_code == 401
    assert revocati == ["refresh"]


def test_un_rinnovo_senza_ancora_registrata_non_passa(client, db_session, cognito):
    """Nessuna riga da confrontare vale come confronto fallito: un token che
    non risulta nato qui non rinnova niente."""
    revocati = cognito(claims={"access-nuovo": {"jti": "jti-2", "origin_jti": "origin-mai-vista"}})

    risposta = _con_cookie(client).post(REFRESH)

    assert risposta.status_code == 401
    # Muore tutto: il token appena coniato, la sua sessione e il refresh
    assert is_jti_revoked(db_session, "jti-2") is True
    assert is_jti_revoked(db_session, "origin-mai-vista") is True
    assert revocati == ["refresh"]


def test_un_rinnovo_dalla_stessa_sessione_ma_da_un_altro_browser_non_passa(
    client, db_session, cognito
):
    _semina_ancora(db_session, "origin-1", user_agent="un-altro-browser")
    cognito(claims={"access-nuovo": {"jti": "jti-2", "origin_jti": "origin-1"}})

    risposta = _con_cookie(client).post(REFRESH)

    assert risposta.status_code == 401


# ── L'uscita ──────────────────────────────────────────────────────────


def test_il_logout_toglie_i_cookie_e_uccide_la_sessione_dai_due_lati(
    client, db_session, standard_user, cognito
):
    """Le due revoche insieme sono quello che chiude davvero la sessione: il
    refresh token non conia più niente su Cognito, e il token di accesso
    smette subito invece di vivere i suoi sessanta minuti."""
    revocati = cognito(
        claims={
            "access-mio": {
                "jti": "jti-1",
                "origin_jti": "origin-1",
                "sub": standard_user.cognito_sub,
            }
        }
    )

    risposta = _con_cookie(client, access="access-mio").post(LOGOUT)

    assert risposta.status_code == 200
    assert revocati == ["refresh"]
    assert is_jti_revoked(db_session, "jti-1") is True
    assert is_jti_revoked(db_session, "origin-1") is True
    assert _cookie_puliti(risposta)


def test_il_logout_scrive_chi_e_uscito(client, db_session, standard_user, cognito):
    cognito(claims={"access-mio": {"jti": "jti-1", "sub": standard_user.cognito_sub}})

    _con_cookie(client, access="access-mio").post(LOGOUT)

    riga = db_session.query(AuditLog).filter(AuditLog.action == "auth.logout").one()
    assert riga.user_id == standard_user.id


def test_un_token_scaduto_esce_lo_stesso_senza_lasciare_una_riga_anonima(
    client, db_session, cognito
):
    """Con un token illeggibile nessuno sa chi stava uscendo, e una riga
    senza autore non direbbe niente: la sessione era comunque già morta."""
    cognito(claims={"access-scaduto": RuntimeError("Token non valido o scaduto")})

    risposta = _con_cookie(client, access="access-scaduto").post(LOGOUT)

    assert risposta.status_code == 200
    assert db_session.query(AuditLog).filter(AuditLog.action == "auth.logout").count() == 0
    assert _cookie_puliti(risposta)


def test_il_logout_toglie_i_cookie_anche_senza_niente_da_revocare(client, cognito):
    """Uscire deve funzionare sempre: se un guasto potesse impedirlo,
    l'utente resterebbe chiuso dentro la sessione da cui vuole uscire."""
    cognito(claims={})

    risposta = _con_cookie(client, refresh=None).post(LOGOUT)

    assert risposta.status_code == 200
    assert _cookie_puliti(risposta)


def test_una_revoca_che_va_storta_non_trattiene_nessuno(client, db_session, monkeypatch, caplog):
    """Il guasto resta nei log, dove lo legge chi amministra: il prezzo è un
    refresh token che vive fino a scadenza su Cognito."""

    def _cognito_giu(_token):
        raise RuntimeError("Cognito irraggiungibile")

    monkeypatch.setattr(auth_router, "revoke_refresh_token", _cognito_giu)
    monkeypatch.setattr(
        auth_router, "verify_access_token", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x"))
    )

    risposta = _con_cookie(client).post(LOGOUT)

    assert risposta.status_code == 200
    assert "Logout: revoca del refresh token fallita" in caplog.text


def test_un_token_senza_scadenza_resta_nella_denylist_quanto_puo_vivere(
    client, db_session, standard_user, cognito
):
    """La scadenza scritta nel token dice fino a quando la riga serve; senza
    quella si tiene la durata massima di un token di accesso, che è la sola
    cosa che si sa con certezza."""
    cognito(claims={"access-mio": {"jti": "jti-senza-exp", "sub": standard_user.cognito_sub}})

    _con_cookie(client, access="access-mio").post(LOGOUT)

    assert is_jti_revoked(db_session, "jti-senza-exp") is True


# ── Il tetto sui rinnovi rifiutati ────────────────────────────────────


def test_troppi_rinnovi_rifiutati_di_fila_si_fermano(client, cognito):
    """Chi prova cookie che non sono suoi lo fa da qui: è l'unico endpoint
    che consegna un token nuovo a chi presenta soltanto dei cookie. Si
    contano i rifiuti e non i rinnovi riusciti, perché un rinnovo riuscito è
    la cosa più normale che un browser faccia."""
    cognito()
    client.cookies.set(REFRESH_TOKEN_COOKIE, "refresh-di-un-altro")

    for _ in range(20):
        assert client.post(REFRESH).status_code == 401

    risposta = client.post(REFRESH)
    client.cookies.clear()

    assert risposta.status_code == 429
    assert risposta.headers["Retry-After"]
