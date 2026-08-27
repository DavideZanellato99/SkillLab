"""Per-turn latency instrumentation for the realtime voice pipeline.

One TurnTimer per assistant turn records monotonic marks as the turn moves
through the pipeline, so a sluggish reply can be attributed to the stage
that actually caused it instead of guessed at. Marks are plain floats and
the only I/O is one log line when the turn's first audio is out, so nothing
here sits on the audio hot path.

Two numbers carry most of the perceived delay:
  vad       how long ElevenLabs' VAD sat on silence before committing the
            operator's turn. Approximated as the gap between the last
            partial transcript that carried *new* words and the commit, so
            it also absorbs the STT's own processing time; it tracks
            ELEVENLABS_VAD_SILENCE_SECS but will not match it exactly.
  llm_ttft  time to the model's first token. Dominant, because audio starts
            streaming out from there: the reply's total length barely
            matters, only how long the model takes to *begin*.

A turn split across several commits needs two clocks, not one. The timer is
anchored to the *first* commit of the group, so "commit->audio" still shows
what the aggregation cost end to end; "attesa" is the part of that the
operator spent still talking, and every figure meant to read as a wait the
operator actually sat through is measured from the *last* commit instead.
Without that split a turn where the operator talked for fourteen seconds
straight reports a seventeen-second delay that nobody ever experienced.

The headline figure is "percepita": vad + the pipeline after the last
commit, i.e. everything between the operator falling silent for good and
the first avatar audio leaving the backend. It excludes the browser's own
playback cushion (PLAYBACK_CUSHION_SECS in voiceCall.ts), which adds a
further fixed amount.
"""

import logging
import os
import time
from statistics import median

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# I due interruttori della diagnostica. Valori ammessi e significato stanno
# nel .env del backend, che è l'unico posto dove sono scritti: qui si legge
# soltanto. Mancante o scritto in qualunque altro modo vale spento.
LATENCY_LOG_ENABLED = os.getenv("VOICE_LATENCY_LOG") == "1"
STT_DEBUG_ENABLED = os.getenv("VOICE_STT_DEBUG") == "1"

# Marks, in the order the pipeline reaches them
MARK_LLM_REQUEST = "llm_request"
MARK_LLM_FIRST_TOKEN = "llm_first_token"  # noqa: S105 (metric mark name, not a secret)
MARK_TTS_FIRST_SEND = "tts_first_send"
MARK_TTS_FIRST_AUDIO = "tts_first_audio"
MARK_BROWSER_FIRST_AUDIO = "browser_first_audio"

# (label, from_mark, to_mark); from_mark None means "since the commit"
_SEGMENTS = [
    ("prep", None, MARK_LLM_REQUEST),
    ("llm_ttft", MARK_LLM_REQUEST, MARK_LLM_FIRST_TOKEN),
    ("tok2tts", MARK_LLM_FIRST_TOKEN, MARK_TTS_FIRST_SEND),
    ("tts", MARK_TTS_FIRST_SEND, MARK_TTS_FIRST_AUDIO),
    ("send", MARK_TTS_FIRST_AUDIO, MARK_BROWSER_FIRST_AUDIO),
]


class TurnTimer:
    """Stopwatch for one assistant turn, started when the STT commits."""

    __slots__ = ("_marks", "_start", "context_id", "held_ms", "tts_sends", "turn_id", "vad_ms")

    def __init__(self, turn_id: str, vad_ms: float | None):
        self.turn_id = turn_id
        # Set once the turn opens its TTS context, so the TTS loop can
        # tell this turn's audio from a cancelled one's.
        self.context_id: str | None = None
        self.vad_ms = vad_ms
        # Time from the first commit of the group to the last one: the stretch
        # the operator was still speaking, held by the aggregation. Stays 0
        # for the ordinary one-commit turn.
        self.held_ms = 0.0
        # Transcript chunks pushed before the TTS answered with audio
        self.tts_sends = 0
        self._start = time.perf_counter()
        self._marks: dict[str, float] = {}

    def hold(self, vad_ms: float | None) -> None:
        """Take a further commit into the same turn.

        The wait that matters restarts here: the earlier commit was the STT
        cutting a sentence in half, not the operator stopping, so the silence
        to report is this commit's and the pipeline is timed from this point.
        """
        self.held_ms = (time.perf_counter() - self._start) * 1000
        self.vad_ms = vad_ms

    def count_tts_send(self) -> None:
        """Count one transcript chunk pushed while the TTS is still silent.

        More than one means the TTS was waiting on text rather than
        synthesising: the 'tts' segment is then the LLM's token rate
        wearing the TTS's clothes, and speeding up the TTS would buy nothing.
        """
        if MARK_TTS_FIRST_AUDIO not in self._marks:
            self.tts_sends += 1

    def mark(self, name: str) -> None:
        """Record a stage, in ms since the commit. First write wins.

        The marks that matter are all firsts ("first token", "first audio
        chunk") and the pipeline reaches them inside loops, so later calls
        must not overwrite the moment the stage was actually reached.
        """
        if name not in self._marks:
            self._marks[name] = (time.perf_counter() - self._start) * 1000

    @property
    def total_ms(self) -> float | None:
        """First commit to first audio out, or None if it never got there.

        On an aggregated turn this spans the operator's own speech too, so it
        measures what the aggregation cost, not what anyone waited.
        """
        return self._marks.get(MARK_BROWSER_FIRST_AUDIO)

    @property
    def reply_ms(self) -> float | None:
        """Last commit to first audio out: the pipeline's own cost."""
        total = self.total_ms
        if total is None:
            return None
        return total - self.held_ms

    @property
    def perceived_ms(self) -> float | None:
        """What the operator waits: the VAD silence plus the pipeline."""
        reply = self.reply_ms
        if reply is None:
            return None
        return reply + (self.vad_ms or 0)

    def segments(self) -> dict[str, float]:
        """Per-stage costs, skipping stages the turn never reached."""
        out: dict[str, float] = {}
        if self.held_ms:
            out["attesa"] = self.held_ms
        for label, start, end in _SEGMENTS:
            if end not in self._marks:
                continue
            # The stages start where the operator stopped talking, so on an
            # aggregated turn the held stretch is charged to "attesa" alone
            # and does not also inflate prep.
            begin = self.held_ms if start is None else self._marks.get(start)
            if begin is None:
                continue
            out[label] = self._marks[end] - begin
        return out

    def format_line(self) -> str:
        vad = f"vad={self.vad_ms:.0f}" if self.vad_ms is not None else "vad=n/d"
        stages = " ".join(
            # Flag a starved TTS inline: "tts=274(x3)" reads as "it took
            # three chunks of text before any audio came back".
            f"{k}={v:.0f}(x{self.tts_sends})"
            if k == "tts" and self.tts_sends > 1
            else f"{k}={v:.0f}"
            for k, v in self.segments().items()
        )
        total = self.total_ms
        if total is None:
            return f"[LATENCY] turn={self.turn_id} {vad} | {stages} | ANNULLATO prima dell'audio"
        # Only an aggregated turn needs both: elsewhere the two coincide and
        # printing them twice would suggest a distinction that isn't there.
        risposta = f"risposta={self.reply_ms:.0f}ms " if self.held_ms else ""
        return (
            f"[LATENCY] turn={self.turn_id} {vad} | {stages} | "
            f"commit->audio={total:.0f}ms {risposta}percepita={self.perceived_ms:.0f}ms"
        )


class CallMetrics:
    """Collects the turns of one call and logs a summary on hang-up."""

    def __init__(self):
        self._turns: list[TurnTimer] = []
        self._cancelled = 0
        self._call_start = time.perf_counter()
        # Quanto a lungo resta aperto il contesto TTS di un turno. È il
        # tempo in cui la chiamata occupa uno slot di concorrenza del piano,
        # che non è la durata dell'audio: il browser riproduce per quindici
        # secondi quello che la sintesi ha prodotto in due.
        self._slot_open: dict[str, float] = {}
        self._slot_durations: list[float] = []
        self._slot_interrupted = 0

    def open_tts_slot(self, context_id: str) -> None:
        """Segna l'apertura del contesto TTS di un turno.

        La chiama ogni pezzo di testo mandato alla sintesi, ma conta solo il
        primo: i successivi entrano in un contesto già aperto, che lo slot lo
        sta occupando da prima.
        """
        if not LATENCY_LOG_ENABLED or context_id in self._slot_open:
            return
        self._slot_open[context_id] = time.perf_counter()

    def close_tts_slot(self, context_id: str, *, interrotto: bool = False) -> None:
        """Chiude lo slot, che il turno abbia finito o sia stato tolto di mezzo.

        Un turno interrotto lo slot lo ha occupato lo stesso fino a lì, quindi
        la durata si conta comunque: quello che cambia è la lettura della
        mediana, e per questo le interruzioni si contano a parte.
        """
        started = self._slot_open.pop(context_id, None)
        if started is None:
            return
        self._slot_durations.append((time.perf_counter() - started) * 1000)
        if interrotto:
            self._slot_interrupted += 1

    def record(self, timer: TurnTimer) -> None:
        """Log one finished turn and keep it for the end-of-call summary."""
        if not LATENCY_LOG_ENABLED:
            return
        if timer.total_ms is None:
            self._cancelled += 1
        else:
            self._turns.append(timer)
        logger.info(timer.format_line())

    def _concurrency_lines(self) -> list[str]:
        """Quanto di uno slot TTS è costata questa chiamata.

        Il limite del piano si conta in sintesi attive nello stesso istante,
        non in chiamate, e una chiamata tiene lo slot occupato solo a tratti:
        da qui quante ne stanno dentro uno slot, che è il numero da mettere
        davvero a confronto con il piano. È una media sulla singola chiamata,
        senza margine per le collisioni, quindi va letta come tetto teorico e
        non come dimensionamento.
        """
        durata = (time.perf_counter() - self._call_start) * 1000
        if not self._slot_durations or durata <= 0:
            return []
        quota = sum(self._slot_durations) / durata * 100
        if quota <= 0:
            return []
        lines = [
            f"[LATENCY]   slot TTS occupato il {quota:.1f}% della chiamata, "
            f"cioè circa {100 / quota:.0f} chiamate per slot"
        ]
        if self._slot_interrupted:
            # Una sintesi tagliata a metà ha occupato meno di quanto avrebbe
            # occupato finendo, quindi tira la mediana verso il basso.
            interrotti = (
                "1 turno interrotto"
                if self._slot_interrupted == 1
                else f"{self._slot_interrupted} turni interrotti"
            )
            lines.append(f"[LATENCY]   {interrotti} prima della fine della sintesi")
        return lines

    def report(self) -> None:
        if not LATENCY_LOG_ENABLED or not self._turns:
            return

        def stat(values: list[float]) -> str:
            return f"mediana {median(values):>6.0f}ms   max {max(values):>6.0f}ms"

        def row(label: str, values: list[float]) -> str:
            return f"[LATENCY]   {label:<14}{stat(values)}"

        done = len(self._turns)
        completati = "1 turno completato" if done == 1 else f"{done} turni completati"
        annullati = "1 annullato" if self._cancelled == 1 else f"{self._cancelled} annullati"
        lines = [f"[LATENCY] Riepilogo chiamata: {completati}, {annullati}"]
        vads = [t.vad_ms for t in self._turns if t.vad_ms is not None]
        if vads:
            lines.append(row("vad", vads))
        # Only the turns the STT actually split have one, and a median taken
        # over the others' zeros would read as if every turn waited.
        attese = [t.held_ms for t in self._turns if t.held_ms]
        if attese:
            lines.append(row("attesa", attese))
        for label, _, _ in _SEGMENTS:
            values = [s[label] for t in self._turns if (s := t.segments()).get(label) is not None]
            if values:
                lines.append(row(label, values))
        lines.append(row("commit->audio", [t.total_ms for t in self._turns]))
        if attese:
            lines.append(row("risposta", [t.reply_ms for t in self._turns]))
        lines.append(row("PERCEPITA", [t.perceived_ms for t in self._turns]))
        if self._slot_durations:
            lines.append(row("slot_tts", self._slot_durations))

        lines.extend(self._concurrency_lines())

        # Does the first turn still pay for a cold connection? With the
        # prewarm working these two lines should sit close together.
        if len(self._turns) >= 2:
            # Sulla risposta e non sul totale: un turno spezzato dalla STT
            # porterebbe nel confronto i secondi in cui l'operatore parlava.
            first, rest = self._turns[0], self._turns[1:]
            later = median([t.reply_ms for t in rest])
            lines.append(
                f"[LATENCY]   primo turno   {first.reply_ms:>6.0f}ms   "
                f"contro {later:.0f}ms di mediana sui successivi"
            )
        logger.info("\n".join(lines))
