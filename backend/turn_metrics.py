"""Per-turn latency instrumentation for the realtime voice pipeline.

One TurnTimer per assistant turn records monotonic marks as the turn moves
through the pipeline, so a sluggish reply can be attributed to the stage
that actually caused it instead of guessed at. Marks are plain floats and
the only I/O is one print when the turn's first audio is out, so nothing
here sits on the audio hot path.

Two numbers carry most of the perceived delay:
  vad       how long ElevenLabs' VAD sat on silence before committing the
            operator's turn. Approximated as the gap between the last
            partial transcript and the commit, so it also absorbs the STT's
            own processing time; it tracks ELEVENLABS_VAD_SILENCE_SECS but
            will not match it exactly.
  llm_ttft  time to the model's first token. Dominant, because audio starts
            streaming out from there: the reply's total length barely
            matters, only how long the model takes to *begin*.

The headline figure is "percepita": vad + commit→audio, i.e. everything
between the operator falling silent and the first avatar audio leaving the
backend. It excludes the browser's own playback cushion
(PLAYBACK_CUSHION_SECS in voiceCall.ts), which adds a further fixed amount.
"""

import os
import time
from statistics import median

# Diagnostic, not configuration: unlike the service modules this one keeps a
# default instead of raising, so a .env without the flag still runs a call.
LATENCY_LOG_ENABLED = os.getenv("VOICE_LATENCY_LOG", "1").strip().lower() not in (
    "0",
    "false",
    "no",
    "",
)

# Marks, in the order the pipeline reaches them
MARK_LLM_REQUEST = "llm_request"
MARK_LLM_FIRST_TOKEN = "llm_first_token"
MARK_TTS_FIRST_SEND = "tts_first_send"
MARK_TTS_FIRST_AUDIO = "tts_first_audio"
MARK_BROWSER_FIRST_AUDIO = "browser_first_audio"

# (label, from_mark, to_mark); from_mark None means "since the commit"
_SEGMENTS = [
    ("prep", None, MARK_LLM_REQUEST),
    ("llm_ttft", MARK_LLM_REQUEST, MARK_LLM_FIRST_TOKEN),
    ("tok2tts", MARK_LLM_FIRST_TOKEN, MARK_TTS_FIRST_SEND),
    ("cartesia", MARK_TTS_FIRST_SEND, MARK_TTS_FIRST_AUDIO),
    ("send", MARK_TTS_FIRST_AUDIO, MARK_BROWSER_FIRST_AUDIO),
]


class TurnTimer:
    """Stopwatch for one assistant turn, started when the STT commits."""

    __slots__ = ("turn_id", "context_id", "vad_ms", "tts_sends", "_start", "_marks")

    def __init__(self, turn_id: str, vad_ms: float | None):
        self.turn_id = turn_id
        # Set once the turn opens its Cartesia context, so the TTS loop can
        # tell this turn's audio from a cancelled one's.
        self.context_id: str | None = None
        self.vad_ms = vad_ms
        # Transcript chunks pushed before the TTS answered with audio
        self.tts_sends = 0
        self._start = time.perf_counter()
        self._marks: dict[str, float] = {}

    def count_tts_send(self) -> None:
        """Count one transcript chunk pushed while the TTS is still silent.

        More than one means Cartesia was waiting on text rather than
        synthesising: the 'cartesia' segment is then the LLM's token rate
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
        """Commit to first audio out, or None if the turn never got there."""
        return self._marks.get(MARK_BROWSER_FIRST_AUDIO)

    @property
    def perceived_ms(self) -> float | None:
        """What the operator waits: the VAD silence plus the pipeline."""
        total = self.total_ms
        if total is None:
            return None
        return total + (self.vad_ms or 0)

    def segments(self) -> dict[str, float]:
        """Per-stage costs, skipping stages the turn never reached."""
        out: dict[str, float] = {}
        for label, start, end in _SEGMENTS:
            if end not in self._marks:
                continue
            begin = 0.0 if start is None else self._marks.get(start)
            if begin is None:
                continue
            out[label] = self._marks[end] - begin
        return out

    def format_line(self) -> str:
        vad = f"vad={self.vad_ms:.0f}" if self.vad_ms is not None else "vad=n/d"
        stages = " ".join(
            # Flag a starved TTS inline: "cartesia=274(x3)" reads as "it took
            # three chunks of text before any audio came back".
            f"{k}={v:.0f}(x{self.tts_sends})"
            if k == "cartesia" and self.tts_sends > 1
            else f"{k}={v:.0f}"
            for k, v in self.segments().items()
        )
        total = self.total_ms
        if total is None:
            return f"[LATENCY] turn={self.turn_id} {vad} | {stages} | ANNULLATO prima dell'audio"
        return (
            f"[LATENCY] turn={self.turn_id} {vad} | {stages} | "
            f"commit->audio={total:.0f}ms percepita={self.perceived_ms:.0f}ms"
        )


class CallMetrics:
    """Collects the turns of one call and prints a summary on hang-up."""

    def __init__(self):
        self._turns: list[TurnTimer] = []
        self._cancelled = 0

    def record(self, timer: TurnTimer) -> None:
        """Log one finished turn and keep it for the end-of-call summary."""
        if not LATENCY_LOG_ENABLED:
            return
        if timer.total_ms is None:
            self._cancelled += 1
        else:
            self._turns.append(timer)
        print(timer.format_line())

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
        for label, _, _ in _SEGMENTS:
            values = [s[label] for t in self._turns if (s := t.segments()).get(label) is not None]
            if values:
                lines.append(row(label, values))
        lines.append(row("commit->audio", [t.total_ms for t in self._turns]))
        lines.append(row("PERCEPITA", [t.perceived_ms for t in self._turns]))

        # Does the first turn still pay for a cold connection? With the
        # prewarm working these two lines should sit close together.
        if len(self._turns) >= 2:
            first, rest = self._turns[0], self._turns[1:]
            later = median([t.total_ms for t in rest])
            lines.append(
                f"[LATENCY]   primo turno   {first.total_ms:>6.0f}ms   "
                f"contro {later:.0f}ms di mediana sui successivi"
            )
        print("\n".join(lines))
