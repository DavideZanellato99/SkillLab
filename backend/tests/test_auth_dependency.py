"""La dipendenza che decide chi sta chiamando, richiesta per richiesta.

I 401 e i 403 delle rotte protette stanno in ``test_auth_guards``, che
verifica il contratto dal di fuori; qui si guarda dentro, cioè la fila di
controlli che un token deve superare prima che la richiesta arrivi
all'endpoint. Sono cinque, e l'ordine conta quanto i controlli stessi: la
firma, la denylist, il legame con il browser, l'identità dell'account, lo
stato dell'account.

I due che meritano di stare qui più degli altri sono il terzo e il quinto.
La denylist è quello che fa morire davvero un token al logout, invece di
lasciarlo valido per i sessanta minuti che gli restano. Lo stato
dell'account è quello che fa cadere la sessione di chi viene sospeso nel
momento in cui viene sospeso: senza, un token già emesso continuerebbe a
funzionare fino a scadenza, cioè per quasi un'ora dopo che qualcuno ha
premuto "sospendi".

Qui non si verificano firme vere: quello sta in ``test_cognito_service``.
Quello che si prova è cosa succede a un token già verificato.
"""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

import auth_dependency
import token_denylist
from auth_dependency import (
    ACCESS_TOKEN_COOKIE,
    MOCK_ADMIN_SUB,
    ensure_roles,
    get_or_create_mock_admin,
    get_role_by_name,
)
from models import (
    ORG_STATUS_SUSPENDED,
    ROLE_SUPER_ADMIN,
    ROLE_USER,
    USER_STATUS_SUSPENDED,
    Role,
    User,
)

ME = "/api/auth/me"


@pytest.fixture(autouse=True)
def _reset_denylist_cache():
    token_denylist._cache.clear()
    token_denylist._cache_loaded_at = None
    yield
    token_denylist._cache.clear()
    token_denylist._cache_loaded_at = None


@pytest.fixture
def token_di(monkeypatch, client):
    """Il client che presenta un token con le dichiarazioni volute.

    La firma è già stata verificata: da qui in poi conta solo cosa il token
    dice e cosa il backend ne fa. Il legame con il browser resta acceso, ed
    è il motivo per cui la maggior parte di questi test lo registra: è un
    controllo vero della fila, non un dettaglio da spegnere.
    """

    def _installa(claims, *, token="token-di-test"):
        def _verify(valore, verify_exp=True):
            if isinstance(claims, Exception):
                raise claims
            return claims

        monkeypatch.setattr(auth_dependency, "verify_access_token", _verify)
        client.cookies.set(ACCESS_TOKEN_COOKIE, token)
        return client

    yield _installa
    client.cookies.clear()


@pytest.fixture
def senza_legame(monkeypatch):
    """Spegne il solo controllo del legame, per i test che guardano altro."""
    monkeypatch.setattr(auth_dependency, "enforce_session_binding", lambda *a, **k: None)


# ── Il token, prima ancora di sapere di chi è ─────────────────────────


def test_senza_token_non_si_entra(client):
    risposta = client.get(ME)

    assert risposta.status_code == 401
    assert risposta.headers["www-authenticate"] == "Bearer"


def test_il_token_si_puo_presentare_anche_nell_intestazione(
    client, monkeypatch, standard_user, senza_legame
):
    """I browser usano il cookie; l'intestazione resta per gli strumenti da
    riga di comando e per le prove."""
    monkeypatch.setattr(
        auth_dependency,
        "verify_access_token",
        lambda token, verify_exp=True: {"sub": standard_user.cognito_sub},
    )

    risposta = client.get(ME, headers={"Authorization": "Bearer token-di-test"})

    assert risposta.status_code == 200
    assert risposta.json()["id"] == str(standard_user.id)


def test_un_token_che_non_si_verifica_non_entra(token_di):
    risposta = token_di(RuntimeError("Token non valido o scaduto: expired")).get(ME)

    assert risposta.status_code == 401
    assert "scaduto" in risposta.json()["detail"]


def test_un_token_senza_identificativo_utente_non_entra(token_di, senza_legame):
    """Firmato e valido ma senza sub: non c'è nessuno da cercare, e lasciarlo
    passare vorrebbe dire una richiesta autenticata senza autore."""
    risposta = token_di({"jti": "jti-1"}).get(ME)

    assert risposta.status_code == 401
    assert "identificativo utente" in risposta.json()["detail"]


def test_un_token_di_qualcuno_che_qui_non_esiste_non_entra(token_di, senza_legame):
    risposta = token_di({"sub": "sub-mai-visto"}).get(ME)

    assert risposta.status_code == 401
    assert "non trovato" in risposta.json()["detail"]


# ── La denylist, cioè il logout che funziona davvero ──────────────────


def test_un_token_revocato_al_logout_smette_subito(
    token_di, db_session, standard_user, senza_legame
):
    """Senza questo controllo un token rubato continuerebbe a valere per i
    sessanta minuti che gli restano, logout o non logout."""
    token_denylist.revoke_jtis(
        db_session, [("jti-uscito", datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1))]
    )

    risposta = token_di({"sub": standard_user.cognito_sub, "jti": "jti-uscito"}).get(ME)

    assert risposta.status_code == 401
    assert "Sessione terminata" in risposta.json()["detail"]


def test_basta_che_sia_revocata_la_sessione_e_non_il_singolo_token(
    token_di, db_session, standard_user, senza_legame
):
    """L'ancora è condivisa da tutti i token nati dallo stesso rinnovo:
    revocarla li porta via tutti, compreso quello appena emesso che il
    logout non aveva ancora visto."""
    token_denylist.revoke_jtis(
        db_session, [("origin-1", datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1))]
    )

    risposta = token_di(
        {"sub": standard_user.cognito_sub, "jti": "jti-nuovo", "origin_jti": "origin-1"}
    ).get(ME)

    assert risposta.status_code == 401


# ── Il legame con il browser, sulla richiesta di tutti i giorni ───────


def test_un_token_mai_legato_a_nessun_browser_non_entra(token_di, standard_user):
    """Un jti che non risulta emesso qui non ha un contesto con cui
    confrontarsi, e senza confronto non si passa."""
    risposta = token_di({"sub": standard_user.cognito_sub, "jti": "jti-senza-legame"}).get(ME)

    assert risposta.status_code == 401
    assert "Sessione non valida" in risposta.json()["detail"]


def test_il_token_dell_admin_locale_non_ha_un_legame_da_verificare(token_di, db_session):
    """Non viene da Cognito e non ha un jti: è l'unico caso in cui non c'è
    niente da confrontare, e infatti passa."""
    risposta = token_di({"sub": MOCK_ADMIN_SUB}).get(ME)

    assert risposta.status_code == 200
    assert risposta.json()["email"] == "admin"


# ── Lo stato dell'account, riletto a ogni richiesta ───────────────────


def test_un_account_sospeso_cade_alla_richiesta_successiva(
    token_di, db_session, standard_user, senza_legame
):
    """Il controllo sta qui e non solo nell'accesso proprio per questo: i
    token già emessi devono smettere nel momento in cui l'admin sospende,
    non alla loro scadenza."""
    client = token_di({"sub": standard_user.cognito_sub})
    assert client.get(ME).status_code == 200

    standard_user.status = USER_STATUS_SUSPENDED
    db_session.flush()

    risposta = client.get(ME)
    assert risposta.status_code == 401
    assert "account" in risposta.json()["detail"].lower()


def test_un_organizzazione_sospesa_porta_giu_tutti_i_suoi(
    token_di, db_session, standard_user, organization, senza_legame
):
    organization.status = ORG_STATUS_SUSPENDED
    db_session.flush()

    risposta = token_di({"sub": standard_user.cognito_sub}).get(ME)

    assert risposta.status_code == 401
    assert "organizzazione" in risposta.json()["detail"].lower()


def test_il_super_admin_non_ha_un_organizzazione_che_possa_sospenderlo(
    token_di, db_session, super_admin_user, organization, senza_legame
):
    """Sta sopra i tenant: la seconda regola non lo tocca, e infatti passa
    anche mentre un'organizzazione è sospesa."""
    organization.status = ORG_STATUS_SUSPENDED
    db_session.flush()

    assert token_di({"sub": super_admin_user.cognito_sub}).get(ME).status_code == 200


# ── I ruoli e l'account di sistema ────────────────────────────────────


def test_i_ruoli_di_sistema_si_creano_una_volta_e_poi_si_rileggono(db_session):
    """Sono la tabella su cui si regge ogni permesso: se mancassero, la
    prima richiesta autenticata non troverebbe il ruolo del suo utente."""
    prima = ensure_roles(db_session)
    seconda = ensure_roles(db_session)

    assert set(prima) == set(seconda)
    assert prima[ROLE_USER].id == seconda[ROLE_USER].id
    assert db_session.query(Role).filter(Role.name == ROLE_USER).count() == 1


def test_un_ruolo_si_cerca_per_nome(db_session):
    ensure_roles(db_session)

    assert get_role_by_name(db_session, ROLE_SUPER_ADMIN).name == ROLE_SUPER_ADMIN
    assert get_role_by_name(db_session, "capo-reparto") is None


@pytest.fixture
def senza_admin_locale(db_session):
    """Il database senza la riga dell'admin di sviluppo.

    Serve ai due test che guardano proprio come nasce: il database di
    sviluppo può già contenerla, e allora quei test passerebbero senza aver
    provato niente. La cancellazione vive nella transazione del test e se ne
    va con lei.
    """
    db_session.query(User).filter(User.cognito_sub == MOCK_ADMIN_SUB).delete()
    db_session.query(User).filter(User.email == "admin").delete()
    db_session.flush()


def test_l_admin_locale_nasce_una_volta_sola(db_session, senza_admin_locale):
    primo = get_or_create_mock_admin(db_session)
    secondo = get_or_create_mock_admin(db_session)

    assert primo.id == secondo.id
    assert primo.cognito_sub == MOCK_ADMIN_SUB
    assert primo.ruolo == ROLE_SUPER_ADMIN


def test_un_admin_locale_gia_presente_con_un_altro_identificativo_si_riusa(
    db_session, senza_admin_locale
):
    """Il caso dell'installazione vecchia: la riga "admin" c'era già prima
    che l'identificativo finto esistesse. Crearne una seconda lascerebbe due
    super admin che si chiamano uguale, e l'email è unica: la seconda non
    nascerebbe nemmeno."""
    roles = ensure_roles(db_session)
    esistente = User(
        cognito_sub="un-vecchio-identificativo",
        email="admin",
        nome="Admin",
        cognome="Storico",
        role_id=roles[ROLE_SUPER_ADMIN].id,
    )
    db_session.add(esistente)
    db_session.flush()

    assert get_or_create_mock_admin(db_session).id == esistente.id


# ── Chi pubblica l'autore della richiesta ─────────────────────────────


def test_ogni_richiesta_autenticata_timbra_l_ultima_attivita(
    token_di, db_session, standard_user, senza_legame
):
    """È il solo passaggio da cui passano tutte: contarla altrove
    significherebbe contare solo alcune delle cose che una persona fa."""
    assert standard_user.last_activity_at is None

    token_di({"sub": standard_user.cognito_sub}).get("/api/avatars")

    db_session.expire(standard_user)
    assert db_session.query(User).filter(User.id == standard_user.id).one().last_activity_at


def test_un_ruolo_richiesto_che_l_utente_non_ha_non_e_un_problema_di_autenticazione(user_client):
    """403 e non 401: chi bussa è stato riconosciuto, non gli spetta quella
    porta. Confonderli manderebbe l'app a chiedere di nuovo il login a
    qualcuno che il login lo ha già fatto."""
    assert user_client.get("/api/admin/users").status_code == 403


def test_una_dipendenza_di_ruolo_si_puo_chiedere_anche_fuori_da_una_rotta(
    db_session, standard_user, super_admin_user
):
    """La funzione è la stessa che protegge le rotte: provarla qui fissa il
    contratto senza dipendere da quale endpoint la stia usando oggi."""
    from auth_dependency import get_current_super_admin

    assert get_current_super_admin(super_admin_user) is super_admin_user
    with pytest.raises(HTTPException) as errore:
        get_current_super_admin(standard_user)
    assert errore.value.status_code == 403
