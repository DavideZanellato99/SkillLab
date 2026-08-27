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


# ── Il turno spezzato in più commit ───────────────────────────────────


def test_il_tempo_in_cui_l_operatore_parlava_non_conta_come_attesa():
    """Il caso che rendeva illeggibili i log: la STT taglia una frase lunga a
    metà, l'operatore continua per quattordici secondi e il turno risultava
    aver fatto aspettare diciassette secondi che nessuno ha mai vissuto."""
    timer = _turno(vad_ms=900.0, **{MARK_BROWSER_FIRST_AUDIO: 16000.0})
    timer.held_ms = 14300.0

    # Il totale resta quello che l'aggregazione è costata da capo a fondo
    assert timer.total_ms == 16000.0
    # La risposta è quello che la pipeline ha fatto dall'ultimo commit
    assert timer.reply_ms == 1700.0
    assert timer.perceived_ms == 2600.0


def test_l_attesa_del_gruppo_non_gonfia_anche_il_primo_stadio():
    """Il tempo trattenuto ha già la sua voce: contarlo pure in prep lo
    farebbe sembrare tempo speso a preparare la richiesta, e prep è la voce
    su cui si andrebbe a cercare un collo di bottiglia che non c'è."""
    # La richiesta al modello parte 40ms dopo l'ultimo commit, che a sua
    # volta è arrivato tre secondi dopo il primo del gruppo.
    timer = _turno(
        **{
            MARK_LLM_REQUEST: 3040.0,
            MARK_LLM_FIRST_TOKEN: 3540.0,
            MARK_BROWSER_FIRST_AUDIO: 5000.0,
        }
    )
    timer.held_ms = 3000.0
    stadi = timer.segments()

    assert stadi["attesa"] == 3000.0
    assert stadi["prep"] == 40.0
    assert stadi["llm_ttft"] == 500.0


def test_un_turno_di_un_commit_solo_non_parla_di_attesa():
    """La stragrande maggioranza dei turni: una voce in più a zero direbbe
    che c'è stata un'attesa che non c'è stata."""
    timer = _turno_completo()

    assert "attesa" not in timer.segments()
    assert timer.reply_ms == timer.total_ms


def test_prendere_un_altro_commit_sposta_il_silenzio_su_quello_nuovo():
    """Il silenzio del primo commit non è mai esistito: lì l'operatore stava
    ancora parlando, ed è il commit che chiude davvero il turno a dire
    quanto ha taciuto."""
    timer = TurnTimer("t1", vad_ms=900.0)
    timer.hold(320.0)

    assert timer.vad_ms == 320.0
    assert timer.held_ms > 0


def test_la_riga_di_un_turno_spezzato_distingue_attesa_e_risposta():
    timer = _turno_completo(turn_id="t6", vad_ms=900.0, totale=16000.0)
    timer.held_ms = 14300.0
    riga = timer.format_line()

    assert "attesa=14300" in riga
    assert "commit->audio=16000ms" in riga
    assert "risposta=1700ms" in riga
    assert "percepita=2600ms" in riga


def test_la_riga_di_un_turno_normale_non_ripete_due_volte_lo_stesso_numero():
    riga = _turno_completo(totale=900.0).format_line()

    assert "risposta=" not in riga
    assert "commit->audio=900ms" in riga


# ── Gli stadi ─────────────────────────────────────────────────────────


def test_ogni_stadio_costa_quanto_e_passato_dal_precedente():
    timer = _turno_completo(ttft=500.0, totale=900.0)
    stadi = timer.segments()

    # Il primo parte dalla chiusura del turno, non da un altro marchio
    assert stadi["prep"] == 40.0
    assert stadi["llm_ttft"] == 500.0
    assert stadi["tok2tts"] == 10.0
    assert stadi["tts"] == 320.0
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

    assert "tts=320(x3)" in timer.format_line()
    # Un pezzo solo è il caso normale e non merita rumore nella riga
    timer.tts_sends = 1
    assert "tts=320 " in timer.format_line()


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


def test_il_riepilogo_parla_di_attesa_solo_se_qualche_turno_e_stato_spezzato(
    diagnostica_accesa, caplog
):
    """Su una chiamata senza tagli le due righe direbbero lo stesso numero,
    e una mediana calcolata sugli zeri degli altri turni farebbe sembrare
    che l'aggregazione costi a tutti."""
    metriche = CallMetrics()
    metriche.record(_turno_completo(turn_id="t1"))

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "attesa" not in caplog.text
    assert "risposta" not in caplog.text


def test_il_riepilogo_separa_le_due_misure_quando_un_turno_e_stato_spezzato(
    diagnostica_accesa, caplog
):
    metriche = CallMetrics()
    spezzato = _turno_completo(turn_id="t1", totale=5000.0)
    spezzato.held_ms = 4000.0
    metriche.record(spezzato)
    metriche.record(_turno_completo(turn_id="t2", totale=1000.0))

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "attesa" in caplog.text
    assert "risposta" in caplog.text


def test_il_confronto_col_primo_turno_guarda_la_risposta_non_il_totale(diagnostica_accesa, caplog):
    """Serve a vedere se il primo turno paga ancora una connessione fredda:
    se un turno successivo venisse spezzato dalla STT, il suo totale
    porterebbe nel confronto i secondi in cui l'operatore parlava e il
    prewarm sembrerebbe rotto."""
    metriche = CallMetrics()
    metriche.record(_turno_completo(turn_id="t1", totale=900.0))
    spezzato = _turno_completo(turn_id="t2", totale=9000.0)
    spezzato.held_ms = 8100.0
    metriche.record(spezzato)

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "primo turno      900ms   contro 900ms di mediana" in caplog.text


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


# ── Lo slot di concorrenza della sintesi ──────────────────────────────


@pytest.fixture
def orologio(monkeypatch):
    """Un tempo che avanza solo quando glielo si dice.

    Qui si misura un'occupazione, non una latenza: senza un orologio fermo
    il test misurerebbe quanto ci mette la macchina a eseguirlo.
    """
    adesso = {"t": 0.0}
    monkeypatch.setattr(turn_metrics.time, "perf_counter", lambda: adesso["t"])
    return adesso


def test_lo_slot_dura_dal_primo_invio_alla_chiusura(diagnostica_accesa, orologio, caplog):
    metriche = CallMetrics()
    metriche.open_tts_slot("ctx")
    orologio["t"] = 2.0
    metriche.close_tts_slot("ctx")
    metriche.record(_turno_completo())

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "slot_tts" in caplog.text
    assert "mediana   2000ms" in caplog.text


def test_gli_invii_successivi_non_riaprono_uno_slot_gia_aperto(
    diagnostica_accesa, orologio, caplog
):
    """Il turno manda alla sintesi una parola per volta: se ogni pezzo
    facesse ripartire il cronometro, resterebbe misurato solo l'ultimo."""
    metriche = CallMetrics()
    metriche.open_tts_slot("ctx")
    orologio["t"] = 1.5
    metriche.open_tts_slot("ctx")
    orologio["t"] = 2.0
    metriche.close_tts_slot("ctx")
    metriche.record(_turno_completo())

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "mediana   2000ms" in caplog.text


def test_la_quota_dice_quante_chiamate_stanno_dentro_uno_slot(diagnostica_accesa, orologio, caplog):
    """Dieci secondi di sintesi su cento di chiamata: uno slot del piano ne
    regge una decina, ed è questo il numero da confrontare con il piano,
    non il numero di chiamate."""
    metriche = CallMetrics()
    metriche.open_tts_slot("ctx")
    orologio["t"] = 10.0
    metriche.close_tts_slot("ctx")
    metriche.record(_turno_completo())
    orologio["t"] = 100.0

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "occupato il 10.0% della chiamata" in caplog.text
    assert "circa 10 chiamate per slot" in caplog.text


def test_i_turni_interrotti_si_contano_a_parte(diagnostica_accesa, orologio, caplog):
    """Una sintesi tagliata da un barge-in ha occupato lo slot per meno del
    dovuto: la quota resta vera, la mediana va letta sapendolo."""
    metriche = CallMetrics()
    metriche.open_tts_slot("ctx")
    orologio["t"] = 1.0
    metriche.close_tts_slot("ctx", interrotto=True)
    metriche.record(_turno_completo())

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "1 turno interrotto prima della fine della sintesi" in caplog.text


def test_chiudere_uno_slot_gia_chiuso_non_conta_niente(diagnostica_accesa, orologio, caplog):
    """Un barge-in cancella il contesto e poco dopo la sintesi risponde
    comunque con il suo evento: la seconda chiusura non deve raddoppiare
    l'occupazione né inventare un turno interrotto in più."""
    metriche = CallMetrics()
    metriche.open_tts_slot("ctx")
    orologio["t"] = 1.0
    metriche.close_tts_slot("ctx", interrotto=True)
    orologio["t"] = 5.0
    metriche.close_tts_slot("ctx")
    metriche.record(_turno_completo())
    orologio["t"] = 10.0

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "occupato il 10.0% della chiamata" in caplog.text
    assert "1 turno interrotto" in caplog.text


def test_senza_sintesi_misurate_il_riepilogo_non_parla_di_slot(diagnostica_accesa, caplog):
    metriche = CallMetrics()
    metriche.record(_turno_completo())

    with caplog.at_level(logging.INFO, logger="turn_metrics"):
        metriche.report()

    assert "slot_tts" not in caplog.text
    assert "chiamate per slot" not in caplog.text
