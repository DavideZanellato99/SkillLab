"""Quando la gestione degli account va storta, e l'account di sistema.

Il ciclo felice sta in ``test_admin_users``; qui ci sono i due gruppi di
rifiuti che quel file non copre.

Il primo è Cognito che non risponde. Ogni gesto su un account tocca due
sistemi, il provider di identità e il database locale, e quando il primo si
rifiuta la risposta deve dirlo per quello che è: un guasto a monte (502) e
non una richiesta sbagliata, altrimenti chi amministra va a cercare l'errore
nei dati che ha appena scritto.

Il secondo è l'account di sistema, l'admin locale che non esiste su Cognito.
Ogni operazione che passerebbe da Cognito deve rifiutarlo esplicitamente:
senza, partirebbe una chiamata per un utente che dall'altra parte non c'è, e
il messaggio che tornerebbe indietro non spiegherebbe niente a nessuno.
"""

import uuid

import pytest

import routers.admin as admin_router
from auth_dependency import ensure_roles, get_or_create_mock_admin
from models import (
    ROLE_ORGANIZATION_ADMIN,
    ROLE_SUPER_ADMIN,
    ROLE_USER,
    USER_STATUS_ACTIVE,
    USER_STATUS_SUSPENDED,
    Organization,
    Role,
    User,
)

UTENTI = "/api/admin/users"


@pytest.fixture
def cognito(monkeypatch):
    """Cognito che risponde bene, o che si rifiuta se glielo si chiede."""

    def _installa(guasto=None, nuovo_sub=None):
        def _fallisce(*args, **kwargs):
            raise guasto

        def _crea(email):
            return f"cognito-sub-{uuid.uuid4()}"

        def _rinvia(email):
            return nuovo_sub or f"cognito-sub-{uuid.uuid4()}"

        monkeypatch.setattr(admin_router, "admin_create_user", _fallisce if guasto else _crea)
        monkeypatch.setattr(
            admin_router, "admin_delete_user", _fallisce if guasto else lambda email: None
        )
        monkeypatch.setattr(
            admin_router,
            "admin_set_user_enabled",
            _fallisce if guasto else (lambda email, enabled: None),
        )
        monkeypatch.setattr(
            admin_router, "admin_resend_credentials", _fallisce if guasto else _rinvia
        )

    return _installa


@pytest.fixture
def admin_di_sistema(db_session):
    """L'admin locale, quello che su Cognito non esiste."""
    return get_or_create_mock_admin(db_session)


def _payload(organization, **campi) -> dict:
    return {
        "email": "mario.rossi@example.com",
        "nome": "Mario",
        "cognome": "Rossi",
        "ruolo": ROLE_USER,
        "organization_id": str(organization.id),
        **campi,
    }


# ── Chi non c'è ───────────────────────────────────────────────────────


def test_ogni_gesto_su_un_utente_inesistente_risponde_404(admin_client, cognito, organization):
    cognito()
    inesistente = uuid.uuid4()

    assert admin_client.put(f"{UTENTI}/{inesistente}", json={"nome": "Mario"}).status_code == 404
    assert (
        admin_client.put(
            f"{UTENTI}/{inesistente}/status", json={"status": USER_STATUS_SUSPENDED}
        ).status_code
        == 404
    )
    assert admin_client.post(f"{UTENTI}/{inesistente}/resend-credentials").status_code == 404
    assert admin_client.delete(f"{UTENTI}/{inesistente}").status_code == 404


# ── Il ruolo e la sua organizzazione ──────────────────────────────────


def test_un_ruolo_inventato_viene_rifiutato_con_l_elenco_di_quelli_veri(
    admin_client, cognito, organization
):
    cognito()

    risposta = admin_client.post(UTENTI, json=_payload(organization, ruolo="capo-reparto"))

    assert risposta.status_code == 400
    assert ROLE_SUPER_ADMIN in risposta.json()["detail"]


def test_un_ruolo_che_manca_nel_database_e_un_guasto_di_configurazione(
    admin_client, cognito, organization, db_session
):
    """I ruoli si creano all'avvio: se uno sparisce, la risposta deve dire
    che il problema è nel sistema e non in quello che ha scritto l'admin."""
    cognito()
    ensure_roles(db_session)
    db_session.query(Role).filter(Role.name == ROLE_USER).delete()
    db_session.flush()

    risposta = admin_client.post(UTENTI, json=_payload(organization))

    assert risposta.status_code == 500
    assert "non presente nel database" in risposta.json()["detail"]


def test_un_organizzazione_che_non_esiste_viene_rifiutata(admin_client, cognito, organization):
    cognito()

    risposta = admin_client.post(
        UTENTI, json=_payload(organization, organization_id=str(uuid.uuid4()))
    )

    assert risposta.status_code == 400
    assert "Organizzazione non trovata" in risposta.json()["detail"]


def test_un_admin_di_organizzazione_senza_organizzazione_viene_rifiutato(
    admin_client, cognito, organization
):
    cognito()

    risposta = admin_client.post(
        UTENTI,
        json=_payload(organization, ruolo=ROLE_ORGANIZATION_ADMIN, organization_id=None),
    )

    assert risposta.status_code == 400
    assert "deve avere un'organizzazione" in risposta.json()["detail"]


# ── Cognito che non risponde ──────────────────────────────────────────


def test_una_creazione_rifiutata_da_cognito_non_lascia_niente_qui(
    admin_client, cognito, organization, db_session
):
    """L'account nasce prima là e poi qui: se là non nasce, qui non deve
    restare una riga che promette un invito mai partito."""
    cognito(guasto=RuntimeError("Un utente con questa email esiste già su Cognito."))
    prima = db_session.query(User).count()

    risposta = admin_client.post(UTENTI, json=_payload(organization))

    assert risposta.status_code == 400
    assert "esiste già" in risposta.json()["detail"]
    assert db_session.query(User).count() == prima


def test_un_cambio_di_stato_che_cognito_rifiuta_e_un_guasto_a_monte(
    admin_client, cognito, standard_user, db_session
):
    """502 e non 400: sospendere solo qui lascerebbe l'account capace di
    ottenere token nuovi da Cognito, cioè una sospensione a metà."""
    cognito(guasto=RuntimeError("Errore nella sospensione su Cognito"))

    risposta = admin_client.put(
        f"{UTENTI}/{standard_user.id}/status", json={"status": USER_STATUS_SUSPENDED}
    )

    assert risposta.status_code == 502
    db_session.refresh(standard_user)
    assert standard_user.status == USER_STATUS_ACTIVE


def test_un_rinvio_che_cognito_rifiuta_e_un_guasto_a_monte(admin_client, cognito, standard_user):
    cognito(guasto=RuntimeError("Errore nel rinvio dell'invito"))

    risposta = admin_client.post(f"{UTENTI}/{standard_user.id}/resend-credentials")

    assert risposta.status_code == 502


def test_un_eliminazione_che_cognito_rifiuta_lascia_i_dati_al_loro_posto(
    admin_client, cognito, standard_user, db_session
):
    """Cognito si tocca per primo proprio per questo: se fallisce là, qui
    non si è ancora cancellato niente e l'operazione si ripete."""
    cognito(guasto=RuntimeError("Errore nell'eliminazione da Cognito"))

    risposta = admin_client.delete(f"{UTENTI}/{standard_user.id}")

    assert risposta.status_code == 502
    assert db_session.query(User).filter(User.id == standard_user.id).count() == 1


def test_uno_stato_inventato_viene_rifiutato(admin_client, cognito, standard_user):
    cognito()

    risposta = admin_client.put(f"{UTENTI}/{standard_user.id}/status", json={"status": "in ferie"})

    assert risposta.status_code == 400
    assert "Lo stato deve essere uno tra" in risposta.json()["detail"]


def test_riscrivere_lo_stesso_stato_non_disturba_cognito(
    admin_client, cognito, standard_user, monkeypatch
):
    """Un salvataggio senza cambiamenti non deve diventare una chiamata a
    Cognito: sarebbe una scrittura per niente su un servizio esterno."""
    chiamate = []
    monkeypatch.setattr(
        admin_router,
        "admin_set_user_enabled",
        lambda email, enabled: chiamate.append(email),
    )

    risposta = admin_client.put(
        f"{UTENTI}/{standard_user.id}/status", json={"status": USER_STATUS_ACTIVE}
    )

    assert risposta.status_code == 200
    assert chiamate == []


# ── Il rinvio delle credenziali ───────────────────────────────────────


def test_un_account_ricreato_su_cognito_si_porta_dietro_l_identificativo_nuovo(
    admin_client, cognito, standard_user, db_session
):
    """Ricreare l'account cambia il suo sub: se non lo si scrivesse qui, la
    riga locale resterebbe legata a un'identità che non esiste più, e
    quella persona non riuscirebbe più a entrare."""
    cognito(nuovo_sub="cognito-sub-rinato")

    risposta = admin_client.post(f"{UTENTI}/{standard_user.id}/resend-credentials")

    assert risposta.status_code == 200
    db_session.refresh(standard_user)
    assert standard_user.cognito_sub == "cognito-sub-rinato"


def test_le_credenziali_non_si_rinviano_a_se_stessi(admin_client, cognito, super_admin_user):
    cognito()

    risposta = admin_client.post(f"{UTENTI}/{super_admin_user.id}/resend-credentials")

    assert risposta.status_code == 400
    assert "tuo stesso account" in risposta.json()["detail"]


# ── L'account di sistema ──────────────────────────────────────────────


def test_l_account_di_sistema_non_cambia_ruolo(admin_client, cognito, admin_di_sistema):
    """Non esiste su Cognito: qualunque gesto che passi da là su di lui
    tornerebbe indietro con un errore che non spiega niente."""
    cognito()

    risposta = admin_client.put(f"{UTENTI}/{admin_di_sistema.id}", json={"ruolo": ROLE_USER})

    assert risposta.status_code == 400
    assert "account di sistema" in risposta.json()["detail"]


def test_l_account_di_sistema_non_cambia_stato(admin_client, cognito, admin_di_sistema):
    cognito()

    risposta = admin_client.put(
        f"{UTENTI}/{admin_di_sistema.id}/status", json={"status": USER_STATUS_SUSPENDED}
    )

    assert risposta.status_code == 400
    assert "account di sistema" in risposta.json()["detail"]


def test_l_account_di_sistema_non_riceve_credenziali(admin_client, cognito, admin_di_sistema):
    cognito()

    risposta = admin_client.post(f"{UTENTI}/{admin_di_sistema.id}/resend-credentials")

    assert risposta.status_code == 400
    assert "account di sistema" in risposta.json()["detail"]


def test_l_account_di_sistema_non_si_elimina(admin_client, cognito, admin_di_sistema, db_session):
    cognito()

    risposta = admin_client.delete(f"{UTENTI}/{admin_di_sistema.id}")

    assert risposta.status_code == 400
    assert "account di sistema" in risposta.json()["detail"]
    assert db_session.query(User).filter(User.id == admin_di_sistema.id).count() == 1


def test_l_account_di_sistema_resta_super_admin_anche_riscrivendoglielo(
    admin_client, cognito, admin_di_sistema
):
    """Il rifiuto riguarda il cambio di ruolo, non il salvataggio:
    riscrivere il ruolo che ha già non è un cambio."""
    cognito()

    risposta = admin_client.put(f"{UTENTI}/{admin_di_sistema.id}", json={"ruolo": ROLE_SUPER_ADMIN})

    assert risposta.status_code == 200
    assert risposta.json()["ruolo"] == ROLE_SUPER_ADMIN


# ── Il passaggio a super admin ────────────────────────────────────────


def test_promuovere_qualcuno_a_super_admin_lo_toglie_dalla_sua_organizzazione(
    admin_client, cognito, standard_user, db_session
):
    """Il super admin sta sopra i tenant: lasciargli l'organizzazione
    vecchia lo farebbe cadere sulla regola che sospende tutti i suoi."""
    cognito()

    risposta = admin_client.put(f"{UTENTI}/{standard_user.id}", json={"ruolo": ROLE_SUPER_ADMIN})

    assert risposta.status_code == 200
    assert risposta.json()["organization_id"] is None
    db_session.refresh(standard_user)
    assert standard_user.organization_id is None


def test_declassare_un_super_admin_gli_chiede_un_organizzazione(
    admin_client, cognito, db_session, organization
):
    cognito()
    roles = ensure_roles(db_session)
    altro_super = User(
        cognito_sub=f"test-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@test.invalid",
        nome="Altro",
        cognome="Super",
        role_id=roles[ROLE_SUPER_ADMIN].id,
    )
    db_session.add(altro_super)
    db_session.flush()

    risposta = admin_client.put(f"{UTENTI}/{altro_super.id}", json={"ruolo": ROLE_USER})

    assert risposta.status_code == 400
    assert "deve avere un'organizzazione" in risposta.json()["detail"]


def test_spostare_qualcuno_in_un_altra_organizzazione_si_puo(
    admin_client, cognito, standard_user, db_session
):
    cognito()
    altra = Organization(name="Altra org", slug="altra-org")
    db_session.add(altra)
    db_session.flush()

    risposta = admin_client.put(
        f"{UTENTI}/{standard_user.id}", json={"organization_id": str(altra.id)}
    )

    assert risposta.status_code == 200
    assert risposta.json()["organization_id"] == str(altra.id)
