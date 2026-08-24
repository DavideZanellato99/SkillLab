"""La creazione e la modifica di un avatar, con quello che le rifiuta.

L'archivio sta in ``test_avatar_archive`` e gli aiutanti del form in
``test_avatar_studio``; qui ci sono le due scritture vere e i controlli che
le precedono.

Tre di quei controlli meritano di essere fissati. Il nome dell'avatar non si
scrive: si ricava dalla scheda persona, quindi una scheda senza nome né
cognome è una scheda che darebbe un avatar senza nome in galleria. La
categoria deve appartenere al tenant dell'avatar, e siccome cambiare tenant
è possibile, la categoria si rilegge **dopo** il tenant nuovo e mai prima.
Il ritratto, quando non lo si carica, viene disegnato qui: senza, la
galleria mostrerebbe un riquadro vuoto.
"""

import os
import uuid

import pytest

import routers.admin_avatars as admin_avatars
from models import Organization

AVATARS = "/api/admin/avatars"


@pytest.fixture(autouse=True)
def ritratti_in_una_cartella_temporanea(tmp_path, monkeypatch):
    """I segnaposto sono file veri: senza questo la suite riempirebbe
    static/avatars del repository con un'immagine per esecuzione."""
    monkeypatch.setattr(admin_avatars, "_AVATARS_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def altra_organizzazione(db_session):
    org = Organization(name="Altra org", slug="altra-org")
    db_session.add(org)
    db_session.flush()
    return org


def _payload(organization, category, **campi) -> dict:
    return {
        "profile": {"NOME": "Anna", "COGNOME": "Bianchi"},
        "category_id": str(category.id),
        "organization_id": str(organization.id),
        "description": "Cliente con una carta bloccata",
        "image_url": "",
        "voice_id": "",
        **campi,
    }


# ── Il nome, che viene dalla scheda ───────────────────────────────────


def test_il_nome_dell_avatar_si_ricava_dalla_scheda(admin_client, organization, make_category):
    """Non è un campo del form: è quello che dice la scheda persona, così i
    due non possono raccontare due cose diverse."""
    risposta = admin_client.post(AVATARS, json=_payload(organization, make_category()))

    assert risposta.status_code == 201
    assert risposta.json()["name"] == "Anna Bianchi"


def test_un_solo_pezzo_del_nome_basta(admin_client, organization, make_category):
    risposta = admin_client.post(
        AVATARS,
        json=_payload(organization, make_category(), profile={"NOME": "", "COGNOME": "Bianchi"}),
    )

    assert risposta.status_code == 201
    assert risposta.json()["name"] == "Bianchi"


@pytest.mark.parametrize("profilo", [{}, {"NOME": "  ", "COGNOME": " "}, {"ETA": "40"}])
def test_una_scheda_senza_nome_non_diventa_un_avatar(
    admin_client, organization, make_category, profilo
):
    risposta = admin_client.post(
        AVATARS, json=_payload(organization, make_category(), profile=profilo)
    )

    assert risposta.status_code == 400
    assert "scheda persona" in risposta.json()["detail"]


# ── Il tenant e la sua categoria ──────────────────────────────────────


def test_un_avatar_senza_organizzazione_non_si_crea(db_session):
    """L'avatar è privato del suo tenant: senza proprietario non si saprebbe
    a chi mostrarlo.

    Si prova sulla funzione perché dall'API non ci si arriva: il payload
    dichiara l'organizzazione obbligatoria, quindi una richiesta senza si
    ferma già alla validazione con un 422. Questo è il presidio dietro,
    quello che regge se un domani il campo diventasse facoltativo.
    """
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as errore:
        admin_avatars._resolve_avatar_org_or_400(db_session, None)

    assert errore.value.status_code == 400
    assert "organizzazione proprietaria" in errore.value.detail


def test_un_organizzazione_che_non_esiste_viene_rifiutata(
    admin_client, organization, make_category
):
    risposta = admin_client.post(
        AVATARS, json=_payload(organization, make_category(), organization_id=str(uuid.uuid4()))
    )

    assert risposta.status_code == 400
    assert "Organizzazione non trovata" in risposta.json()["detail"]


def test_una_categoria_che_non_esiste_viene_rifiutata(admin_client, organization, make_category):
    risposta = admin_client.post(
        AVATARS, json=_payload(organization, make_category(), category_id=str(uuid.uuid4()))
    )

    assert risposta.status_code == 400
    assert "Categoria non trovata" in risposta.json()["detail"]


def test_una_categoria_di_un_altro_tenant_viene_rifiutata(
    admin_client, organization, make_category, altra_organizzazione
):
    """La chiave composta lo impedirebbe comunque nel database: qui si fa
    perché l'admin legga una frase invece di un errore di integrità."""
    categoria_altrui = make_category("clienti", organization_id=altra_organizzazione.id)

    risposta = admin_client.post(AVATARS, json=_payload(organization, categoria_altrui))

    assert risposta.status_code == 400
    assert "un'altra organizzazione" in risposta.json()["detail"]


def test_spostare_un_avatar_di_tenant_gli_da_una_categoria_di_quel_tenant(
    admin_client, organization, make_category, altra_organizzazione, make_avatar
):
    """La categoria si rilegge dopo il tenant nuovo: tenersi la vecchia
    lascerebbe l'avatar in un gruppo che nella sua organizzazione non
    esiste."""
    avatar = make_avatar()
    categoria_nuova = make_category("nuovi clienti", organization_id=altra_organizzazione.id)

    risposta = admin_client.put(
        f"{AVATARS}/{avatar.id}",
        json=_payload(altra_organizzazione, categoria_nuova),
    )

    assert risposta.status_code == 200
    assert risposta.json()["organization_id"] == str(altra_organizzazione.id)
    assert risposta.json()["category_id"] == str(categoria_nuova.id)


def test_spostare_un_avatar_tenendo_la_categoria_vecchia_viene_rifiutato(
    admin_client, organization, make_category, altra_organizzazione, make_avatar
):
    avatar = make_avatar()

    risposta = admin_client.put(
        f"{AVATARS}/{avatar.id}", json=_payload(altra_organizzazione, avatar.category)
    )

    assert risposta.status_code == 400
    assert "un'altra organizzazione" in risposta.json()["detail"]


# ── Il ritratto ───────────────────────────────────────────────────────


def test_un_avatar_senza_ritratto_ne_riceve_uno_disegnato(
    admin_client, organization, make_category, ritratti_in_una_cartella_temporanea
):
    """Le iniziali su uno sfondo sfumato: la galleria non deve mai mostrare
    un riquadro vuoto."""
    risposta = admin_client.post(AVATARS, json=_payload(organization, make_category()))

    url = risposta.json()["image_url"]
    assert url.startswith("/static/avatars/avatar_")
    assert url.endswith(".svg")
    scritto = os.listdir(ritratti_in_una_cartella_temporanea)
    assert len(scritto) == 1
    contenuto = (ritratti_in_una_cartella_temporanea / scritto[0]).read_text(encoding="utf-8")
    assert ">AB<" in contenuto


def test_un_ritratto_indicato_a_mano_vince_sul_segnaposto(
    admin_client, organization, make_category, ritratti_in_una_cartella_temporanea
):
    risposta = admin_client.post(
        AVATARS,
        json=_payload(organization, make_category(), image_url="  /static/avatars/mio.png  "),
    )

    assert risposta.json()["image_url"] == "/static/avatars/mio.png"
    assert os.listdir(ritratti_in_una_cartella_temporanea) == []


def test_un_ritratto_ospitato_altrove_viene_rifiutato(
    admin_client, organization, make_category, ritratti_in_una_cartella_temporanea
):
    """Non si vedrebbe, e non deve nemmeno esistere.

    Non si vedrebbe perché la CSP ammette immagini solo dalla propria origine
    (caddy/Caddyfile), e non deve esistere perché sarebbe una richiesta a un
    dominio di terzi fatta dal browser di chiunque apra la galleria, cioè il
    suo indirizzo IP consegnato a qualcuno che non compare in nessuna
    informativa.
    """
    risposta = admin_client.post(
        AVATARS,
        json=_payload(organization, make_category(), image_url="https://cdn.esempio.it/mario.png"),
    )

    assert risposta.status_code == 422
    assert "carica il file" in str(risposta.json())


def test_un_percorso_sulla_propria_origine_passa(
    admin_client, organization, make_category, ritratti_in_una_cartella_temporanea
):
    """Il confine è lo schema dell'indirizzo, non la parola "http": un file
    che si chiama httpsomething.png non ha niente che non va."""
    risposta = admin_client.post(
        AVATARS,
        json=_payload(organization, make_category(), image_url="/static/avatars/https-mario.png"),
    )

    assert risposta.status_code == 201
    assert risposta.json()["image_url"] == "/static/avatars/https-mario.png"


def test_svuotare_il_ritratto_non_lo_toglie_a_chi_ce_l_aveva(
    admin_client, organization, make_category, make_avatar
):
    """Un campo lasciato vuoto nel form vuol dire "non lo cambio", non
    "cancellalo": il ritratto compare nelle conversazioni già avvenute."""
    avatar = make_avatar()

    risposta = admin_client.put(
        f"{AVATARS}/{avatar.id}", json=_payload(organization, avatar.category, image_url="")
    )

    assert risposta.json()["image_url"] == "/static/avatars/test.png"


def test_un_avatar_rimasto_senza_ritratto_ne_riceve_uno_alla_modifica(
    admin_client, organization, make_category, make_avatar, db_session
):
    avatar = make_avatar()
    avatar.image_url = ""
    db_session.flush()

    risposta = admin_client.put(
        f"{AVATARS}/{avatar.id}", json=_payload(organization, avatar.category, image_url="")
    )

    assert risposta.json()["image_url"].endswith(".svg")


def test_le_iniziali_di_un_nome_solo_sono_una_sola(tmp_path, monkeypatch):
    monkeypatch.setattr(admin_avatars, "_AVATARS_DIR", str(tmp_path))
    identificativo = uuid.uuid4()

    admin_avatars._generate_avatar_image("Bianchi", identificativo)

    contenuto = (tmp_path / f"avatar_{identificativo}.svg").read_text(encoding="utf-8")
    assert ">B<" in contenuto


def test_un_nome_vuoto_non_lascia_il_ritratto_senza_lettere(tmp_path, monkeypatch):
    """Non ci si arriva dal form, perché la scheda senza nome è già stata
    rifiutata: se ci si arrivasse, meglio un punto interrogativo di un
    riquadro con dentro niente."""
    monkeypatch.setattr(admin_avatars, "_AVATARS_DIR", str(tmp_path))
    identificativo = uuid.uuid4()

    admin_avatars._generate_avatar_image("   ", identificativo)

    contenuto = (tmp_path / f"avatar_{identificativo}.svg").read_text(encoding="utf-8")
    assert ">?<" in contenuto


# ── Il formato di un ritratto caricato ────────────────────────────────


def test_il_formato_si_riconosce_dal_contenuto_e_non_dal_nome():
    """Il nome del file lo sceglie chi carica: l'unica cosa che dice davvero
    cosa c'è dentro è la firma dei primi byte."""
    assert admin_avatars._image_extension(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16) == "png"
    assert admin_avatars._image_extension(b"\xff\xd8\xff" + b"\x00" * 16) == "jpg"
    assert admin_avatars._image_extension(b"<svg xmlns=") is None


def test_un_webp_dichiarato_ma_non_scritto_non_passa():
    """La firma RIFF la portano anche i wav e gli avi: senza il secondo
    controllo passerebbe qualunque contenitore RIFF."""
    assert admin_avatars._image_extension(b"RIFF" + b"\x00" * 4 + b"WEBPVP8 ") == "webp"
    assert admin_avatars._image_extension(b"RIFF" + b"\x00" * 4 + b"WAVEfmt ") is None


# ── Quello che non c'è ────────────────────────────────────────────────


def test_modificare_un_avatar_che_non_esiste_risponde_404(
    admin_client, organization, make_category
):
    risposta = admin_client.put(
        f"{AVATARS}/{uuid.uuid4()}", json=_payload(organization, make_category())
    )

    assert risposta.status_code == 404
