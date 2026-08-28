"""Le rotte HTTP della chiamata vocale: aprirla e riascoltarla.

Il socket vero non passa da qui, ed è escluso dalla copertura per scelta:
richiede ElevenLabs dal vivo. Quello che passa da qui sono i due
gesti attorno alla chiamata, cioè aprire la sessione e conservarne l'audio,
e sono i due che decidono chi può fare cosa.

Il primo è quello che stabilisce il legame fra una persona, un avatar e una
conversazione: l'identificativo di sessione che ne esce è l'unica
credenziale che apre il socket, quindi ogni controllo che qui non viene
fatto non verrà fatto più. Il secondo tocca la registrazione di una
telefonata, che è un dato personale: chi può riascoltarla è la stessa
domanda di chi può leggerne la trascrizione, e la risposta deve essere la
stessa.

Una conversazione che non si può vedere risponde "non trovata" e non
"vietato": la differenza fra le due confermerebbe che quella conversazione
esiste, a chi non deve saperlo.
"""

import uuid
from datetime import UTC, datetime

import pytest

from models import (
    CONVERSATION_MODE_TEXT,
    CONVERSATION_MODE_VOICE,
    ChatConversation,
    ChatMessage,
    ConversationRecording,
    Organization,
)
from routers import voice as voice_router

SESSIONE = "/api/voice/session"
WEBM = "audio/webm;codecs=opus"


@pytest.fixture(autouse=True)
def servizi_vocali_configurati(monkeypatch):
    """La chiave che l'apertura pretende.

    Nel .env di test è vuota, ed è giusto che lo sia: senza, la risposta è
    503 e non c'è niente da provare oltre a quella.
    """
    monkeypatch.setattr(voice_router, "ELEVENLABS_API_KEY", "chiave-vocale")


@pytest.fixture
def avatar(make_avatar):
    return make_avatar(name="Anna Bianchi")


@pytest.fixture
def make_conversation(db_session, standard_user, avatar):
    """Una conversazione già aperta, del canale che serve al test."""

    def _factory(*, mode=CONVERSATION_MODE_VOICE, user=None, ended_at=None, messaggi=()):
        conversazione = ChatConversation(
            user_id=(user or standard_user).id,
            avatar_id=avatar.id,
            title="Clienti 1",
            mode=mode,
            ended_at=ended_at,
        )
        db_session.add(conversazione)
        db_session.flush()
        for ruolo, testo in messaggi:
            db_session.add(ChatMessage(conversation_id=conversazione.id, role=ruolo, content=testo))
        db_session.flush()
        return conversazione

    return _factory


# ── L'apertura della chiamata ─────────────────────────────────────────


def test_aprire_una_chiamata_nuova_crea_la_conversazione_e_l_identificativo(
    user_client, db_session, avatar
):
    risposta = user_client.post(SESSIONE, json={"avatar_id": str(avatar.id)})

    assert risposta.status_code == 200
    corpo = risposta.json()
    # L'identificativo è la sola credenziale che apre il socket: deve essere
    # lungo abbastanza da non potersi indovinare
    assert len(corpo["session_id"]) >= 32
    conversazione = db_session.get(ChatConversation, uuid.UUID(corpo["conversation_id"]))
    assert conversazione.mode == CONVERSATION_MODE_VOICE
    assert conversazione.title


def test_senza_la_chiave_dei_servizi_vocali_la_chiamata_non_si_apre(
    user_client, avatar, monkeypatch
):
    """Meglio dirlo qui che far squillare a vuoto: senza sintesi e senza
    trascrizione il socket si aprirebbe per chiudersi subito."""
    monkeypatch.setattr(voice_router, "ELEVENLABS_API_KEY", "")

    risposta = user_client.post(SESSIONE, json={"avatar_id": str(avatar.id)})

    assert risposta.status_code == 503


def test_un_avatar_che_non_si_vede_non_si_chiama(user_client, make_avatar, db_session):
    """Di un altro tenant: la risposta è la stessa che darebbe un avatar
    inesistente, perché il contrario direbbe che esiste."""
    altro = Organization(name="Altra org", slug="altra-org")
    db_session.add(altro)
    db_session.flush()
    avatar_altrui = make_avatar(name="Avatar altrui", organization_id=altro.id)

    risposta = user_client.post(SESSIONE, json={"avatar_id": str(avatar_altrui.id)})

    assert risposta.status_code == 404


def test_un_avatar_archiviato_non_si_chiama_piu(user_client, db_session, avatar):
    """Una chiamata già aperta si finisce, una nuova no: l'archiviazione
    toglie l'avatar dall'addestramento, non le conversazioni che ci sono
    state."""
    avatar.deleted_at = datetime.now(UTC)
    db_session.flush()

    risposta = user_client.post(SESSIONE, json={"avatar_id": str(avatar.id)})

    assert risposta.status_code == 409


def test_riprendere_una_conversazione_vocale_non_ne_apre_una_seconda(
    user_client, avatar, make_conversation
):
    conversazione = make_conversation()

    risposta = user_client.post(
        SESSIONE,
        json={"avatar_id": str(avatar.id), "conversation_id": str(conversazione.id)},
    )

    assert risposta.status_code == 200
    assert risposta.json()["conversation_id"] == str(conversazione.id)


def test_la_storia_gia_scritta_parte_insieme_alla_sessione(
    user_client, avatar, make_conversation, db_session
):
    """La pipeline non rilegge il database a ogni turno: quello che sa della
    conversazione precedente è la fotografia scattata qui."""
    conversazione = make_conversation(
        messaggi=[
            ("user", "Buongiorno, come posso aiutarla?"),
            ("assistant", "Non riesco a pagare."),
        ]
    )

    risposta = user_client.post(
        SESSIONE,
        json={"avatar_id": str(avatar.id), "conversation_id": str(conversazione.id)},
    )

    from voice_sessions import load_voice_session

    sessione = load_voice_session(risposta.json()["session_id"])
    assert [m["content"] for m in sessione.prior_history] == [
        "Buongiorno, come posso aiutarla?",
        "Non riesco a pagare.",
    ]


def test_una_chat_scritta_non_prosegue_al_telefono(user_client, avatar, make_conversation):
    """Il canale si fissa alla creazione: una conversazione scritta non è
    una telefonata a cui manca la voce, è un'altra cosa."""
    conversazione = make_conversation(mode=CONVERSATION_MODE_TEXT)

    risposta = user_client.post(
        SESSIONE,
        json={"avatar_id": str(avatar.id), "conversation_id": str(conversazione.id)},
    )

    assert risposta.status_code == 409
    assert "chat" in risposta.json()["detail"]


def test_una_chiamata_gia_riagganciata_non_si_riprende(
    user_client, avatar, make_conversation, db_session
):
    """Riagganciare è definitivo, ed è quello che rende la trascrizione una
    cosa conclusa su cui si può dare una valutazione."""
    conversazione = make_conversation(ended_at=datetime.now(UTC))

    risposta = user_client.post(
        SESSIONE,
        json={"avatar_id": str(avatar.id), "conversation_id": str(conversazione.id)},
    )

    assert risposta.status_code == 409
    assert "terminata" in risposta.json()["detail"]


def test_la_conversazione_di_un_altro_non_si_riprende(
    user_client, avatar, make_conversation, db_session, org_admin_user
):
    conversazione = make_conversation(user=org_admin_user)

    risposta = user_client.post(
        SESSIONE,
        json={"avatar_id": str(avatar.id), "conversation_id": str(conversazione.id)},
    )

    assert risposta.status_code == 404


# ── La registrazione della chiamata ───────────────────────────────────


def _carica(client, conversazione, audio=b"audio-finto", tipo=WEBM, **parametri):
    return client.post(
        f"/api/voice/recording/{conversazione.id}",
        content=audio,
        headers={"content-type": tipo},
        params=parametri,
    )


def test_l_audio_della_chiamata_si_conserva_con_la_sua_durata(
    user_client, make_conversation, db_session
):
    conversazione = make_conversation()

    risposta = _carica(user_client, conversazione, duration_ms=125_000)

    assert risposta.status_code == 200
    assert risposta.json()["duration_ms"] == 125_000
    assert risposta.json()["size_bytes"] == len(b"audio-finto")
    assert db_session.query(ConversationRecording).count() == 1


def test_ricaricare_la_stessa_chiamata_sostituisce_invece_di_aggiungere(
    user_client, make_conversation, db_session
):
    """Un secondo tentativo dopo una rete ballerina non deve lasciare due
    mezze registrazioni della stessa telefonata."""
    conversazione = make_conversation()
    _carica(user_client, conversazione, audio=b"primo tentativo")

    _carica(user_client, conversazione, audio=b"secondo tentativo piu lungo")

    assert db_session.query(ConversationRecording).count() == 1
    registrazione = db_session.query(ConversationRecording).one()
    assert registrazione.size_bytes == len(b"secondo tentativo piu lungo")


def test_un_formato_audio_che_il_browser_non_produce_viene_rifiutato(
    user_client, make_conversation
):
    risposta = _carica(user_client, make_conversation(), tipo="audio/wav")

    assert risposta.status_code == 415
    assert "audio/wav" in risposta.json()["detail"]


def test_una_registrazione_vuota_viene_rifiutata(user_client, make_conversation):
    risposta = _carica(user_client, make_conversation(), audio=b"")

    assert risposta.status_code == 400


def test_una_registrazione_enorme_viene_rifiutata_prima_di_leggerla(
    user_client, make_conversation, monkeypatch
):
    """La lunghezza dichiarata è una promessa e non una garanzia, ma su una
    promessa spudorata si può già rispondere di no senza aver letto niente."""
    monkeypatch.setattr(voice_router, "MAX_RECORDING_BYTES", 10)

    risposta = _carica(user_client, make_conversation(), audio=b"x" * 100)

    assert risposta.status_code == 413


def test_una_registrazione_senza_lunghezza_dichiarata_si_ferma_lo_stesso(
    user_client, make_conversation, monkeypatch
):
    """Il caso che il controllo sulla lunghezza dichiarata non copre: con
    Transfer-Encoding: chunked quella lunghezza non c'è proprio, e prima il
    corpo cresceva in memoria fino alla fine per poi essere rifiutato. Ora
    si legge a pezzi e si smette al primo che manda oltre il tetto."""
    monkeypatch.setattr(voice_router, "MAX_RECORDING_BYTES", 10)

    risposta = user_client.post(
        f"/api/voice/recording/{make_conversation().id}",
        content=iter([b"x" * 8, b"x" * 8]),
        headers={"content-type": WEBM},
    )

    assert risposta.status_code == 413


def test_si_conserva_il_formato_validato_e_non_quello_dichiarato(
    user_client, make_conversation, db_session
):
    """Quella stringa torna indietro come Content-Type al riascolto, quindi
    quello che si scrive deve essere una delle tre forme accettate, non i
    parametri che il client ci aveva attaccato dietro."""
    conversazione = make_conversation()

    _carica(user_client, conversazione, tipo="audio/webm;codecs=opus")

    assert db_session.query(ConversationRecording).one().mime_type == "audio/webm"
    riascolto = user_client.get(f"/api/voice/recording/{conversazione.id}")
    assert riascolto.headers["content-type"] == "audio/webm"


def test_la_registrazione_di_una_conversazione_altrui_non_si_carica(
    user_client, make_conversation, org_admin_user
):
    """Nemmeno un admin: caricare l'audio è un gesto di chi ha fatto la
    chiamata, non di chi la corregge."""
    conversazione = make_conversation(user=org_admin_user)

    risposta = _carica(user_client, conversazione)

    assert risposta.status_code == 404


# ── Il riascolto ──────────────────────────────────────────────────────


def test_una_chiamata_mai_registrata_risponde_che_non_ce_n_e(user_client, make_conversation):
    """Null e non 404: la pagina deve sapere che non c'è un lettore da
    mostrare, non che la conversazione non esiste."""
    risposta = user_client.get(f"/api/voice/recording/{make_conversation().id}/info")

    assert risposta.status_code == 200
    assert risposta.json() is None


def test_le_informazioni_arrivano_senza_tirarsi_dietro_l_audio(user_client, make_conversation):
    conversazione = make_conversation()
    _carica(user_client, conversazione, duration_ms=60_000)

    corpo = user_client.get(f"/api/voice/recording/{conversazione.id}/info").json()

    assert corpo["duration_ms"] == 60_000
    assert "audio" not in corpo


def test_l_audio_torna_nel_formato_in_cui_e_stato_registrato(user_client, make_conversation):
    conversazione = make_conversation()
    _carica(user_client, conversazione, audio=b"i byte della telefonata")

    risposta = user_client.get(f"/api/voice/recording/{conversazione.id}")

    assert risposta.status_code == 200
    assert risposta.content == b"i byte della telefonata"
    assert risposta.headers["content-type"].startswith("audio/webm")
    # Privata: una registrazione non deve finire in una cache condivisa
    assert "private" in risposta.headers["cache-control"]


def test_chiedere_l_audio_di_una_chiamata_muta_risponde_404(user_client, make_conversation):
    risposta = user_client.get(f"/api/voice/recording/{make_conversation().id}")

    assert risposta.status_code == 404


def test_il_super_admin_puo_riascoltare_qualunque_chiamata(
    client, act_as, standard_user, super_admin_user, make_conversation
):
    conversazione = make_conversation()
    act_as(standard_user)
    _carica(client, conversazione)

    act_as(super_admin_user)
    risposta = client.get(f"/api/voice/recording/{conversazione.id}")

    assert risposta.status_code == 200


def test_l_admin_di_un_organizzazione_riascolta_solo_la_propria(
    client, act_as, standard_user, org_admin_user, make_conversation, db_session
):
    """È la stessa regola della trascrizione: un admin corregge chi allena,
    e chi allena sta nella sua organizzazione."""
    conversazione = make_conversation()
    act_as(standard_user)
    _carica(client, conversazione)

    act_as(org_admin_user)
    assert client.get(f"/api/voice/recording/{conversazione.id}").status_code == 200

    # Spostato altrove chi ha fatto la chiamata, l'admin non la sente più
    altra = Organization(name="Altra org", slug="altra-org")
    db_session.add(altra)
    db_session.flush()
    standard_user.organization_id = altra.id
    db_session.flush()

    assert client.get(f"/api/voice/recording/{conversazione.id}").status_code == 404


def test_una_conversazione_che_non_esiste_risponde_404(user_client):
    assert user_client.get(f"/api/voice/recording/{uuid.uuid4()}/info").status_code == 404


# ── Quando le linee sono tutte occupate ───────────────────────────────


def test_oltre_il_tetto_di_chiamate_la_linea_risponde_occupato(
    user_client, avatar, voice_socket, monkeypatch
):
    """Rifiutare è meglio che accettare e servire male tutti: la sessione
    resta valida, quindi lo stesso identificativo funziona al tentativo
    dopo."""
    session_id = user_client.post(SESSIONE, json={"avatar_id": str(avatar.id)}).json()["session_id"]
    monkeypatch.setattr(voice_router.voice_capacity, "take_slot", lambda: False)

    with voice_socket(session_id) as socket:
        messaggio = socket.receive_json()

    assert messaggio["type"] == "error"
    assert "linee sono occupate" in messaggio["message"]
