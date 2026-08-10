"""Il cronometro di un turno di conversazione vocale.

Non decide niente nell'app: scrive una riga di log. Si prova lo stesso
perché è la riga da cui si capisce **quale** pezzo della pipeline ha fatto
aspettare l'operatore, e una misura sbagliata è peggio di una misura
assente: manda a ottimizzare il pezzo giusto della cosa sbagliata.

I marchi qui si scrivono a mano invece di lasciarli prendere all'orologio.
Un test che aspetta davvero per misurare l'attesa misurerebbe il carico
della macchina che lo esegue, e sarebbe il primo a cadere in una CI lenta.
"""

import logging

import pytest

import turn_metrics
from turn_metrics import (
    MARK_BROWSER_FIRST_AUDIO,
    MARK_LLM_FIRST_TOKEN,
    MARK_LLM_REQUEST,
    MARK_TTS_FIRST_AUDIO,
    MARK_TTS_FIRST_SEND,
    CallMetrics,
    TurnTimer,
)


@pytest.fixture
def diagnostica_accesa(monkeypatch):
    """L'interruttore del log delle latenze, che nel .env di test è spento.

    Sta in una fixture e non in ogni test perché è un valore letto una volta
    all'import: senza rimetterlo a posto, il primo test che lo accende lo
    lascerebbe acceso a tutta la sessione.
    """
    monkeypatch.setattr(turn_metrics, "LATENCY_LOG_ENABLED", True)


def _turno(turn_id="t1", vad_ms=800.0, **marchi) -> TurnTimer:
    """Un turno già svolto, con i tempi che gli si vogliono dare."""
    timer = TurnTimer(turn_id, vad_ms)
    timer._marks.update(marchi)
    return timer


def _turno_completo(turn_id="t1", vad_ms=800.0, ttft=500.0, totale=900.0) -> TurnTimer:
    """Un turno arrivato fino all'audio, con tutti i suoi stadi."""
    return _turno(
        turn_id,
        vad_ms,
        **{
            MARK_LLM_REQUEST: 40.0,
            MARK_LLM_FIRST_TOKEN: 40.0 + ttft,
            MARK_TTS_FIRST_SEND: 40.0 + ttft + 10.0,
            MARK_TTS_FIRST_AUDIO: totale - 30.0,
            MARK_BROWSER_FIRST_AUDIO: totale,
        },
    )


# ── I marchi ──────────────────────────────────────────────────────────


def test_il_primo_passaggio_di_uno_stadio_e_quello_che_conta():
    """Gli stadi si raggiungono dentro un ciclo, e quello che si misura è
    il primo token, non l'ultimo: una seconda scrittura cancellerebbe
    proprio il momento che interessa."""
    timer = TurnTimer("t1", vad_ms=None)
    timer.mark(MARK_LLM_FIRST_TOKEN)
    primo = timer._marks[MARK_LLM_FIRST_TOKEN]
    timer.mark(MARK_LLM_FIRST_TOKEN)

    assert timer._marks[MARK_LLM_FIRST_TOKEN] == primo


def test_i_pezzi_di_testo_si_contano_solo_finche_la_voce_tace():
    """Più di uno vuol dire che il sintetizzatore aspettava parole, non che
    era lento: da lì in poi contarli non direbbe più niente."""
    timer = TurnTimer("t1", vad_ms=None)
    timer.count_tts_send()
    timer.count_tts_send()
    timer.mark(MARK_TTS_FIRST_AUDIO)
    timer.count_tts_send()

    assert timer.tts_sends == 2


def test_un_turno_annullato_non_ha_un_totale():
    """Chi riattacca a metà risposta non ha aspettato: se il totale valesse
    zero invece di niente, la mediana della chiamata si abbasserebbe a ogni
    interruzione."""
    timer = _turno(**{MARK_LLM_FIRST_TOKEN: 300.0})
    assert timer.total_ms is None
    assert timer.perceived_ms is None


def test_l_attesa_percepita_comprende_il_silenzio_prima_della_risposta():
    timer = _turno(vad_ms=800.0, **{MARK_BROWSER_FIRST_AUDIO: 1200.0})
    assert timer.perceived_ms == 2000.0


def test_senza_misura_del_silenzio_resta_il_solo_tempo_della_pipeline():
    timer = _turno(vad_ms=None, **{MARK_BROWSER_FIRST_AUDIO: 1200.0})
    assert timer.perceived_ms == 1200.0


# ── Gli stadi ─────────────────────────────────────────────────────────


def test_ogni_stadio_costa_quanto_e_passato_dal_precedente():
    timer = _turno_completo(ttft=500.0, totale=900.0)
    stadi = timer.segments()

    # Il primo parte dalla chiusura del turno, non da un altro marchio
    assert stadi["prep"] == 40.0
    assert stadi["llm_ttft"] == 500.0
    assert stadi["tok2tts"] == 10.0
    assert stadi["cartesia"] == 320.0
    assert stadi["send"] == 30.0


def test_gli_stadi_mai_raggiunti_non_compaiono():
    """Un turno interrotto a metà mostra quello che ha fatto, non degli zeri
    che sembrerebbero istantanei."""
    timer = _turno(**{MARK_LLM_REQUEST: 40.0, MARK_LLM_FIRST_TOKEN: 540.0})
    assert set(_turno_completo().segments()) > set(timer.segments())
    assert set(timer.segments()) == {"prep", "llm_ttft"}


def test_uno_stadio_senza_il_suo_inizio_viene_saltato():
    """Non capita in una pipeline che funziona, e se capitasse il conto
    sarebbe una sottrazione con un pezzo mancante."""
    timer = _turno(**{MARK_LLM_FIRST_TOKEN: 540.0})
    assert "llm_ttft" not in timer.segments()


# ── La riga di log ────────────────────────────────────────────────────


def test_la_riga_di_un_turno_riuscito_dice_il_totale_e_il_percepito():
    riga = _turno_completo(turn_id="t7", vad_ms=800.0, totale=900.0).format_line()

    assert "turn=t7" in riga
    assert "vad=800" in riga
    assert "llm_ttft=500" in riga
    assert "commit->audio=900ms" in riga
    assert "percepita=1700ms" in riga


def test_la_riga_dice_quando_il_sintetizzatore_aspettava_parole():
    """La marcatura fra parentesi è quello che distingue un sintetizzatore
    lento da un modello che scriveva piano."""
    timer = _turno_completo()
    timer.tts_sends = 3

    assert "cartesia=320(x3)" in timer.format_line()
    # Un pezzo solo è il caso normale e non merita rumore nella riga
    timer.tts_sends = 1
    assert "cartesia=320 " in timer.format_line()


def test_la_riga_di_un_turno_annullato_lo_dice_invece_di_inventare_un_tempo():
    riga = _turno(vad_ms=None, **{MARK_LLM_REQUEST: 40.0}).format_line()

    assert "ANNULLATO prima dell'audio" in riga
    assert "vad=n/d" in riga


# ── Il riepilogo della chiamata ───────────────────────────────────────


def test_a_diagnostica_spenta_non_si_scrive_e_non_si_accumula(caplog):
    """L'interruttore deve spegnere anche la raccolta: tenere i turni per un
    riepilogo che non verrà scritto è memoria spesa per niente."""
    metriche = CallMetrics()
    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.record(_turno_completo())
        metriche.report()

    assert caplog.records == []
    assert metriche._turns == []


def test_ogni_turno_finito_lascia_la_sua_riga(diagnostica_accesa, caplog):
    metriche = CallMetrics()
    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.record(_turno_completo(turn_id="t1"))

    assert "turn=t1" in caplog.text


def test_i_turni_annullati_si_contano_ma_non_entrano_nelle_mediane(diagnostica_accesa, caplog):
    metriche = CallMetrics()
    metriche.record(_turno_completo(turn_id="t1", totale=900.0))
    metriche.record(_turno(turn_id="t2", **{MARK_LLM_REQUEST: 40.0}))

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "1 turno completato, 1 annullato" in caplog.text


def test_il_riepilogo_mette_in_fila_le_mediane_di_ogni_stadio(diagnostica_accesa, caplog):
    metriche = CallMetrics()
    metriche.record(_turno_completo(turn_id="t1", ttft=400.0, totale=800.0))
    metriche.record(_turno_completo(turn_id="t2", ttft=600.0, totale=1000.0))
    metriche.record(_turno_completo(turn_id="t3", ttft=500.0, totale=900.0))

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "3 turni completati, 0 annullati" in caplog.text
    assert "llm_ttft" in caplog.text
    assert "mediana    500ms   max    600ms" in caplog.text
    assert "PERCEPITA" in caplog.text
    # Con più di un turno si vede se il primo paga ancora una connessione
    # fredda, che è il motivo per cui esiste il prewarm
    assert "primo turno" in caplog.text


def test_un_turno_solo_non_ha_un_primo_da_confrontare(diagnostica_accesa, caplog):
    metriche = CallMetrics()
    metriche.record(_turno_completo())

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "primo turno" not in caplog.text


def test_una_chiamata_senza_turni_completati_non_scrive_un_riepilogo_vuoto(
    diagnostica_accesa, caplog
):
    metriche = CallMetrics()
    metriche.record(_turno(**{MARK_LLM_REQUEST: 40.0}))
    caplog.clear()

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert caplog.records == []


def test_il_silenzio_compare_nel_riepilogo_solo_se_qualcuno_lo_ha_misurato(
    diagnostica_accesa, caplog
):
    metriche = CallMetrics()
    metriche.record(_turno_completo(turn_id="t1", vad_ms=None))
    metriche.record(_turno_completo(turn_id="t2", vad_ms=None))

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "vad " not in caplog.text
    assert "commit->audio" in caplog.text
