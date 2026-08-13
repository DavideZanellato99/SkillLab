"""La lettura degli slot di concorrenza della STT.

ElevenLabs concede un numero di sessioni simultanee che dipende dal piano,
e la connessione WebSocket ne occupa una solo mentre il modello lavora: il
margine che resta davvero non si deduce dal numero di chiamate in corso, si
legge negli header dell'handshake. Quella riga di log è l'unica misura che
abbiamo, quindi vale la pena provare che esca quando i dati ci sono e che
non faccia cadere la chiamata quando mancano.
"""

import logging

from elevenlabs_service import log_stt_concurrency


class _Risposta:
    def __init__(self, headers):
        self.headers = headers


class _Connessione:
    """Quel poco della connessione `websockets` che la funzione guarda."""

    def __init__(self, headers=None):
        self.response = _Risposta(headers) if headers is not None else None


def test_logga_slot_occupati_e_totali(caplog):
    connessione = _Connessione(
        {"current-concurrent-requests": "3", "maximum-concurrent-requests": "15"}
    )
    with caplog.at_level(logging.INFO, logger="elevenlabs_service"):
        log_stt_concurrency(connessione)
    assert "in uso 3 su 15" in caplog.text


def test_logga_anche_con_un_solo_header(caplog):
    """Mezza misura resta una misura: dice comunque quanto stiamo occupando."""
    connessione = _Connessione({"current-concurrent-requests": "2"})
    with caplog.at_level(logging.INFO, logger="elevenlabs_service"):
        log_stt_concurrency(connessione)
    assert "in uso 2 su ?" in caplog.text


def test_tace_se_gli_header_non_ci_sono(caplog):
    with caplog.at_level(logging.INFO, logger="elevenlabs_service"):
        log_stt_concurrency(_Connessione({}))
    assert caplog.text == ""


def test_tace_se_la_connessione_non_espone_la_risposta(caplog):
    """Un mock nei test, o un client che cambia forma, non deve far cadere
    la chiamata: qui si registra una diagnostica, non si decide niente."""
    with caplog.at_level(logging.INFO, logger="elevenlabs_service"):
        log_stt_concurrency(_Connessione())
        log_stt_concurrency(object())
    assert caplog.text == ""
