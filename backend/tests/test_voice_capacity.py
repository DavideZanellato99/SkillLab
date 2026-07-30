"""Il tetto sulle chiamate contemporanee di un processo.

Un event loop pieno non rifiuta, rallenta, e rallenta per tutti insieme: la
chiamata di troppo degrada anche le quaranta che stavano andando bene. Il
tetto sceglie il male minore, cioè perderne una e dirlo.

L'ultimo test è quello che conta davvero, perché guarda il comportamento che
vede l'utente: linee occupate, con un messaggio leggibile e un codice di
chiusura che dice "riprova", non un errore di rete qualsiasi.
"""

import pytest
from starlette.websockets import WebSocketDisconnect

import voice_capacity
from models import ChatConversation, VoiceSessionRecord
from voice_sessions import create_voice_session


@pytest.fixture(autouse=True)
def slot_puliti():
    """Il contatore è di modulo: senza questo un test si porterebbe dietro
    i posti occupati da quello prima."""
    voice_capacity._active = 0
    yield
    voice_capacity._active = 0


@pytest.fixture
def sessione_vocale(db_session, standard_user, make_avatar) -> str:
    avatar = make_avatar()
    conversazione = ChatConversation(
        user_id=standard_user.id, avatar_id=avatar.id, title="Clienti 1", mode="voice"
    )
    db_session.add(conversazione)
    db_session.flush()
    return create_voice_session(
        db_session,
        user_id=standard_user.id,
        avatar_id=avatar.id,
        conversation_id=conversazione.id,
        avatar_profile={"nome": "Anna Verdi"},
        prior_history=[],
        voice_id="voce-abc",
    )


# ── Il contatore ───────────────────────────────────────────────────────


def test_i_posti_finiscono(monkeypatch):
    monkeypatch.setattr(voice_capacity, "MAX_CONCURRENT_CALLS", 2)

    assert voice_capacity.take_slot()
    assert voice_capacity.take_slot()
    assert not voice_capacity.take_slot()


def test_chiudere_una_chiamata_libera_il_posto(monkeypatch):
    monkeypatch.setattr(voice_capacity, "MAX_CONCURRENT_CALLS", 1)
    assert voice_capacity.take_slot()
    assert not voice_capacity.take_slot()

    voice_capacity.release_slot()

    assert voice_capacity.take_slot()


def test_un_rilascio_di_troppo_non_regala_capacita(monkeypatch):
    """Una via d'uscita imprevista del percorso del socket non deve poter
    far scendere il contatore sotto zero, o il tetto varrebbe di più di
    quello che dice."""
    monkeypatch.setattr(voice_capacity, "MAX_CONCURRENT_CALLS", 1)

    voice_capacity.release_slot()
    voice_capacity.release_slot()

    assert voice_capacity.active_calls() == 0
    assert voice_capacity.take_slot()
    assert not voice_capacity.take_slot()


# ── Quello che vede chi chiama ─────────────────────────────────────────


def test_a_linee_occupate_la_chiamata_viene_rifiutata_con_un_messaggio(
    client, sessione_vocale, monkeypatch
):
    """Il processo è pieno: la connessione viene aperta solo per spiegare
    perché, e chiusa con il codice che invita a riprovare."""
    monkeypatch.setattr(voice_capacity, "MAX_CONCURRENT_CALLS", 1)
    assert voice_capacity.take_slot()  # l'unico posto è già occupato

    with (
        pytest.raises(WebSocketDisconnect) as scoppio,
        client.websocket_connect(f"/api/voice/ws?session_id={sessione_vocale}") as ws,
    ):
        evento = ws.receive_json()
        assert evento["type"] == "error"
        assert "occupate" in evento["message"]
        ws.receive_text()  # la chiusura che segue

    assert scoppio.value.code == 1013


def test_la_chiamata_rifiutata_puo_riprovare_con_lo_stesso_id(
    client, db_session, sessione_vocale, monkeypatch
):
    """Niente è stato consumato, quindi la sessione resta valida: sarebbe
    assurdo far ricominciare da capo chi ha trovato occupato."""
    monkeypatch.setattr(voice_capacity, "MAX_CONCURRENT_CALLS", 1)
    voice_capacity.take_slot()

    with client.websocket_connect(f"/api/voice/ws?session_id={sessione_vocale}") as ws:
        assert ws.receive_json()["type"] == "error"

    rimasta = (
        db_session.query(VoiceSessionRecord)
        .filter(VoiceSessionRecord.id == sessione_vocale)
        .count()
    )
    assert rimasta == 1
