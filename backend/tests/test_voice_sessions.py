"""Il registro delle sessioni vocali, che è quello che rende possibile far
girare più di una replica del backend.

Il test che conta è il primo: la sessione viene scritta con la sessione DB
della richiesta HTTP e riletta da una connessione diversa, che è
esattamente quello che succede in produzione quando il POST che apre la
chiamata e il WebSocket che la usa finiscono su due processi diversi.
Finché quello stato viveva in un dizionario Python, quella sequenza
funzionava solo per fortuna, cioè finché il processo era uno solo.

Le verifiche di assenza passano tutte da una query e mai da ``db.get()``:
le righe vengono cancellate da una sessione diversa da quella del test, e
un ``get()`` risponderebbe dalla identity map senza guardare il database.
"""

from datetime import UTC, datetime, timedelta

import pytest
from starlette.websockets import WebSocketDisconnect

from erasure import erase_conversations
from models import ChatConversation, VoiceSessionRecord
from voice_sessions import (
    close_voice_session,
    create_voice_session,
    load_voice_session,
    purge_expired,
)

PROFILO = {"nome": "Anna Verdi", "problema": "carta bloccata"}
STORIA = [
    {"role": "user", "content": "Buongiorno, come posso aiutarla?"},
    {"role": "assistant", "content": "Non riesco più a pagare."},
]


@pytest.fixture
def conversation(db_session, standard_user, make_avatar) -> ChatConversation:
    """Una conversazione vocale a cui agganciare le sessioni del test."""
    avatar = make_avatar()
    conv = ChatConversation(
        user_id=standard_user.id, avatar_id=avatar.id, title="Clienti 1", mode="voice"
    )
    db_session.add(conv)
    db_session.flush()
    return conv


def _crea(db_session, conversation, **override) -> str:
    parametri = {
        "user_id": conversation.user_id,
        "avatar_id": conversation.avatar_id,
        "conversation_id": conversation.id,
        "avatar_profile": PROFILO,
        "prior_history": STORIA,
        "voice_id": "voce-abc",
    }
    parametri.update(override)
    return create_voice_session(db_session, **parametri)


def _esiste(db_session, session_id: str) -> bool:
    return (
        db_session.query(VoiceSessionRecord).filter(VoiceSessionRecord.id == session_id).count()
        == 1
    )


def _scadi(db_session, session_id: str) -> None:
    """Manda la sessione indietro nel tempo, senza passare dall'ORM."""
    db_session.query(VoiceSessionRecord).filter(VoiceSessionRecord.id == session_id).update(
        {"expires_at": datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=1)},
        synchronize_session=False,
    )
    db_session.flush()


# ── Il punto di tutto il cambiamento ───────────────────────────────────


def test_una_sessione_si_rilegge_da_una_connessione_diversa(db_session, conversation):
    """Scritta dalla richiesta HTTP, letta dal WebSocket: in produzione sono
    due processi diversi, qui sono due sessioni DB diverse."""
    session_id = _crea(db_session, conversation)

    caricata = load_voice_session(session_id)

    assert caricata is not None
    assert caricata.conversation_id == str(conversation.id)
    assert caricata.user_id == str(conversation.user_id)
    assert caricata.avatar_id == str(conversation.avatar_id)


def test_lo_snapshot_arriva_intatto_alla_pipeline(db_session, conversation):
    """Scheda persona e storia sono ciò che tiene il percorso caldo dei turni
    senza query: se si perdessero qui, ogni turno tornerebbe a leggere il
    database."""
    session_id = _crea(db_session, conversation)

    caricata = load_voice_session(session_id)

    assert caricata.avatar_profile == PROFILO
    assert caricata.prior_history == STORIA
    assert caricata.voice_id == "voce-abc"


def test_ogni_sessione_ha_un_id_diverso_e_lungo(db_session, conversation):
    """L'id è l'unica credenziale che apre il socket vocale."""
    primo = _crea(db_session, conversation)
    secondo = _crea(db_session, conversation)

    assert primo != secondo
    assert len(primo) >= 32


# ── Quando una sessione non vale ───────────────────────────────────────


def test_un_id_sconosciuto_non_apre_niente():
    assert load_voice_session("non-esiste") is None


def test_una_sessione_scaduta_non_vale_piu(db_session, conversation):
    session_id = _crea(db_session, conversation)

    _scadi(db_session, session_id)

    assert load_voice_session(session_id) is None


def test_il_socket_rifiuta_una_sessione_che_non_esiste(client):
    """4401: id sbagliato o scaduto, e il socket non viene nemmeno accettato."""
    with (
        pytest.raises(WebSocketDisconnect) as scoppio,
        client.websocket_connect("/api/voice/ws?session_id=inventato"),
    ):
        pass

    assert scoppio.value.code == 4401


def test_il_socket_rifiuta_una_richiesta_senza_sessione(client):
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/api/voice/ws"):
        pass


# ── Pulizia: la riga porta una copia della conversazione ───────────────


def test_chiudere_la_chiamata_cancella_la_sessione(db_session, conversation):
    """A chiamata finita la riga sparisce subito, senza aspettare la
    scadenza: dentro c'è una copia della storia della conversazione."""
    session_id = _crea(db_session, conversation)

    close_voice_session(session_id)

    assert load_voice_session(session_id) is None
    assert not _esiste(db_session, session_id)


def test_chiudere_due_volte_non_da_errore(db_session, conversation):
    """Il percorso del socket chiude anche quando la chiamata non è mai
    partita, quindi la seconda chiusura deve essere innocua."""
    session_id = _crea(db_session, conversation)

    close_voice_session(session_id)
    close_voice_session(session_id)

    assert not _esiste(db_session, session_id)


def test_il_purge_porta_via_solo_le_chiamate_mai_iniziate(db_session, conversation):
    """Quello che resta da spazzare è chi ha chiesto una chiamata e non l'ha
    mai aperta: le altre si cancellano da sole riagganciando."""
    viva = _crea(db_session, conversation)
    abbandonata = _crea(db_session, conversation)
    _scadi(db_session, abbandonata)

    # Lo sweep di housekeeping lavora su una Connection, non su una Session:
    # qui è quella della transazione del test, così il purge rientra nel
    # rollback come tutto il resto.
    eliminate = purge_expired(db_session.connection())

    assert eliminate == 1
    assert _esiste(db_session, viva)
    assert not _esiste(db_session, abbandonata)


def test_la_sessione_muore_con_la_conversazione(db_session, conversation):
    """È in CONVERSATION_CHILDREN, quindi la cancellazione di una
    conversazione (retention o diritto all'oblio) se la porta via."""
    session_id = _crea(db_session, conversation)

    erase_conversations(db_session, [conversation.id])

    assert not _esiste(db_session, session_id)
