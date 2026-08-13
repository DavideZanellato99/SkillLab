"""La bozza di scheda persona: cosa si tiene di quello che il modello risponde.

Il modello qui è finto, e non è una rinuncia: quello che va provato non è se
inventa un buon cliente, è cosa succede quando risponde con un campo che la
scheda non ha, con una percentuale scritta a parole o senza lo scenario. Sono
le parti che decidono se chi ha premuto "genera" si ritrova una scheda da
correggere o una scheda da rifare, e nessuna dipende da quale modello ha
risposto.

Il primo test è di un'altra specie e vale per tutti gli altri: verifica che
ogni campo che il modello viene istruito a scrivere sia un campo che il prompt
del roleplay legge davvero. Un campo generato e mai letto sarebbe lavoro
buttato che nessuno vede, perché nella scheda compare compilato.
"""

import asyncio

import pytest

from persona_draft import (
    ALL_KEYS,
    DIFFICULTY_KEY,
    REQUIRED_KEYS,
    SOURCE_CONVERSATION,
    SOURCE_DESCRIPTION,
    _system_prompt,
    draft_persona,
    normalize_profile,
)
from persona_prompt import CHANNEL_TEXT, CHANNEL_VOICE, build_persona_prompt

DRAFT = "/api/admin/avatars/draft"

# Un caso raccontato, lungo abbastanza da passare il minimo della richiesta.
CASO = (
    "Cliente che ha visto due addebiti uguali sulla carta nello stesso giorno e "
    "chiama convinto di essere stato truffato."
)


def _scheda(**campi) -> dict:
    """Una risposta del modello con il minimo indispensabile, più quello che si passa."""
    base = {
        "NOME": "Mario",
        "COGNOME": "Rossi",
        "TIPO_SCENARIO": "Vede due addebiti uguali e teme una truffa.",
        "DESCRIZIONE_PROBLEMATICA": "Una preautorizzazione non ancora stornata dal circuito.",
        "EMOZIONE_INIZIALE": "Arrabbiato",
        "OBIETTIVO_NASCOSTO": "Verificare se l'operatore distingue un addebito doppio da una preautorizzazione.",
    }
    base.update(campi)
    return base


# ── Il patto con il prompt del roleplay ───────────────


def test_ogni_campo_generato_finisce_nel_prompt():
    """Il modello non deve scrivere campi che poi nessuno legge.

    La scheda ha una settantina di campi e il prompt ne legge un elenco suo:
    finché i due elenchi sono scritti in due file diversi, la sola cosa che
    tiene insieme il generatore e il roleplay è questo test. Le due varianti
    di canale servono perché un campo esiste solo al telefono (la velocità
    del parlato non ha un equivalente scritto).
    """
    sentinelle = {key: f"SENTINELLA{i}" for i, key in enumerate(ALL_KEYS)}
    reso = build_persona_prompt(sentinelle, CHANNEL_VOICE) + build_persona_prompt(
        sentinelle, CHANNEL_TEXT
    )

    mai_lette = [key for key, valore in sentinelle.items() if valore not in reso]

    # Il grado di difficoltà è l'eccezione dichiarata: non entra nel prompt
    # perché non è una cosa che il personaggio sa di sé, è la targhetta che
    # lo studente legge in galleria (vedi Avatar.difficulty).
    assert mai_lette == [DIFFICULTY_KEY]


def test_le_istruzioni_nominano_tutti_i_campi():
    """Un campo che il prompt non elenca è un campo che non verrà mai scritto."""
    istruzioni = _system_prompt(SOURCE_DESCRIPTION)

    assert [key for key in ALL_KEYS if f'"{key}"' not in istruzioni] == []


def test_le_due_fonti_chiedono_due_cose_diverse():
    """Da una conversazione si ricava, da una descrizione si inventa: se le
    istruzioni fossero le stesse, la trascrizione servirebbe solo da spunto."""
    descrizione = _system_prompt(SOURCE_DESCRIPTION)
    conversazione = _system_prompt(SOURCE_CONVERSATION)

    assert "inventare" in descrizione
    assert "RICAVATO" in conversazione
    assert "anonimizzata" in conversazione


def test_il_grado_richiesto_entra_nelle_istruzioni():
    assert "8/10" in _system_prompt(SOURCE_DESCRIPTION, "8/10")
    # Senza, non si inventa un grado: lo sceglie il modello
    assert "difficoltà richiesto" not in _system_prompt(SOURCE_DESCRIPTION)


# ── La pulizia della risposta ─────────────────────────


def test_tiene_solo_le_chiavi_della_scheda():
    profilo = normalize_profile(_scheda(CAMPO_INVENTATO="qualcosa", NOTE="ciao"))

    assert "CAMPO_INVENTATO" not in profilo
    assert "NOTE" not in profilo
    assert set(profilo) == set(ALL_KEYS)


def test_i_campi_non_risposti_restano_vuoti_e_presenti():
    """Presenti perché il form li disegna tutti, vuoti perché non si inventa."""
    profilo = normalize_profile(_scheda())

    assert profilo["ANIMALI_DOMESTICI"] == ""
    assert profilo["NOME_CONIUGE"] == ""


@pytest.mark.parametrize(
    "risposta,atteso",
    [
        ("70%", "70%"),
        ("70", "70%"),
        ("circa il 70%", "70%"),
        ("120%", "100%"),
        # Non è una percentuale: inventarci un numero vorrebbe dire mettere in
        # scheda un valore che nessuno ha scelto
        ("alta", ""),
        ("", ""),
    ],
)
def test_le_percentuali_prendono_la_forma_della_scheda(risposta, atteso):
    profilo = normalize_profile(_scheda(LIVELLO_PAZIENZA=risposta))

    assert profilo["LIVELLO_PAZIENZA"] == atteso


@pytest.mark.parametrize(
    "risposta,atteso",
    [("8/10", "8/10"), ("8", "8/10"), ("difficoltà 8 su 10", "8/10"), ("99", "10/10"), ("x", "")],
)
def test_il_grado_prende_il_formato_della_galleria(risposta, atteso):
    profilo = normalize_profile(_scheda(GRADO_DIFFICOLTA=risposta))

    assert profilo[DIFFICULTY_KEY] == atteso


def test_i_valori_a_scelta_tornano_sull_elenco():
    profilo = normalize_profile(_scheda(INTENSITA_EMOZIONE="alta", FORMALITA_LINGUAGGIO="FORMALE"))

    assert profilo["INTENSITA_EMOZIONE"] == "Alta"
    assert profilo["FORMALITA_LINGUAGGIO"] == "Formale"


def test_un_valore_fuori_elenco_resta_quello_che_ha_scritto_il_modello():
    """Il prompt del roleplay legge testo libero, e chi rilegge la scheda lo
    vede: cancellarlo toglierebbe un'informazione senza avvisare."""
    profilo = normalize_profile(_scheda(INTENSITA_EMOZIONE="Molto alta"))

    assert profilo["INTENSITA_EMOZIONE"] == "Molto alta"


@pytest.mark.parametrize("marcatore", ["/", "n/d", "N/A", "-", "."])
def test_i_marcatori_di_vuoto_valgono_vuoto(marcatore):
    """Il prompt del roleplay li scarterebbe comunque: tenerli in scheda
    servirebbe solo a far credere che quel campo sia compilato."""
    profilo = normalize_profile(_scheda(ANIMALI_DOMESTICI=marcatore))

    assert profilo["ANIMALI_DOMESTICI"] == ""


def test_una_scheda_incartata_in_una_chiave_viene_aperta():
    """Certi modelli rispondono {"profile": {...}}: dentro c'è la scheda, e
    buttarla per ritentare costerebbe un minuto per un involucro."""
    profilo = normalize_profile({"scheda": _scheda()})

    assert profilo["NOME"] == "Mario"


# ── Quando la risposta non è utilizzabile ─────────────


@pytest.mark.parametrize("mancante", REQUIRED_KEYS)
def test_senza_un_campo_chiave_la_risposta_e_fallita(mancante):
    """Sono lo scenario, la sua chiave di correzione, il punto di partenza
    emotivo e il senso didattico: senza, la bozza va rifatta a mano proprio
    dove costa di più. L'errore fa ritentare sul modello di riserva, perché
    la normalizzazione gira dentro quel giro."""
    with pytest.raises(ValueError, match=mancante):
        normalize_profile(_scheda(**{mancante: ""}))


def test_senza_nome_ne_cognome_la_risposta_e_fallita():
    with pytest.raises(ValueError, match="nome"):
        normalize_profile(_scheda(NOME="", COGNOME=""))


def test_basta_il_cognome():
    """Come nel form: di certi clienti si conosce solo quello."""
    assert normalize_profile(_scheda(NOME=""))["COGNOME"] == "Rossi"


def test_una_risposta_che_non_e_un_oggetto():
    with pytest.raises(ValueError):
        normalize_profile(["una", "lista"])


def test_una_fonte_sconosciuta_non_arriva_al_modello():
    with pytest.raises(ValueError, match="Fonte sconosciuta"):
        asyncio.run(draft_persona(CASO, "telepatia"))


# ── L'endpoint ────────────────────────────────────────


def _finto_modello(monkeypatch, profilo=None, errore=None):
    """Sostituisce la chiamata a OpenAI dentro il modulo che la fa."""

    async def _draft(text, source, difficulty=""):
        if errore:
            raise errore
        return normalize_profile(profilo or _scheda())

    monkeypatch.setattr("routers.admin_avatars.draft_persona", _draft)


def test_la_bozza_torna_al_form(admin_client, monkeypatch):
    _finto_modello(monkeypatch)

    risposta = admin_client.post(DRAFT, json={"text": CASO, "source": SOURCE_DESCRIPTION})

    assert risposta.status_code == 200
    profilo = risposta.json()["profile"]
    assert profilo["NOME"] == "Mario"
    assert profilo["OBIETTIVO_NASCOSTO"]


def test_generare_non_crea_nessun_avatar(admin_client, db_session, monkeypatch):
    """La bozza è una proposta: diventa un avatar solo con il salvataggio,
    che è un'altra richiesta e passa dalla revisione di chi l'ha chiesta."""
    from models import Avatar

    prima = db_session.query(Avatar).count()
    _finto_modello(monkeypatch)

    admin_client.post(DRAFT, json={"text": CASO})

    assert db_session.query(Avatar).count() == prima


def test_un_caso_troppo_corto_non_arriva_al_modello(admin_client, monkeypatch):
    """Da tre parole il modello inventa uno scenario suo, che è esattamente
    quello che chi genera una scheda non vuole."""
    _finto_modello(monkeypatch)

    risposta = admin_client.post(DRAFT, json={"text": "un cliente arrabbiato"})

    assert risposta.status_code == 422


def test_una_fonte_inventata_viene_rifiutata(admin_client, monkeypatch):
    _finto_modello(monkeypatch)

    risposta = admin_client.post(DRAFT, json={"text": CASO, "source": "telepatia"})

    assert risposta.status_code == 422


def test_il_fornitore_che_non_risponde_e_un_502(admin_client, monkeypatch):
    _finto_modello(monkeypatch, errore=RuntimeError("Errore nella generazione: modello assente"))

    risposta = admin_client.post(DRAFT, json={"text": CASO})

    assert risposta.status_code == 502
    assert "generazione" in risposta.json()["detail"]


def test_generare_una_scheda_e_del_super_admin(user_client, org_admin_client):
    """Gli avatar li scrive il super admin, e questa è una scrittura di
    avatar con un aiuto in più."""
    for client in (user_client, org_admin_client):
        assert client.post(DRAFT, json={"text": CASO}).status_code == 403


def test_generare_richiede_di_essere_qualcuno(client):
    assert client.post(DRAFT, json={"text": CASO}).status_code == 401
