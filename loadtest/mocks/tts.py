"""Finta sintesi ElevenLabs.

Parla il protocollo di elevenlabs_tts_service: riceve pezzi di testo dentro
un context_id e restituisce messaggi con `audio` PCM16 a 24 kHz in base64,
poi un `isFinal`. Gestisce anche il `close_context`, che il backend manda
sia a fine turno sia quando un turno viene interrotto.

Il testo vuoto lo ignora senza chiudere niente: è il keep alive con cui il
backend tiene su la socket mentre parla l'operatore, e sintetizzarlo
gonfierebbe la banda misurata con audio che non esiste.

Le due cose che rendono valida la simulazione:

- **L'audio esce a tempo reale**, 48000 byte al secondo come i 24 kHz veri.
  Un mock che sputasse tutto il turno in un colpo solo farebbe fare al
  backend un lavoro completamente diverso, e la misura non varrebbe niente.
- **L'audio è rumore, non silenzio.** La WebSocket può comprimere, e una
  sfilza di zeri si comprime a nulla: la banda misurata sarebbe una decina
  di volte più bassa del vero. Il parlato sintetico è incomprimibile, quindi
  il rumore è la simulazione onesta.
"""

import asyncio
import base64
import json
import os
import random
import time

SAMPLE_RATE = 24000
BYTES_PER_SEC = SAMPLE_RATE * 2

# Audio emesso ogni 40 ms, come una TTS che streamma di continuo
CHUNK_MS = 40
CHUNK_BYTES = BYTES_PER_SEC * CHUNK_MS // 1000

# Quanto ci mette il primo audio ad arrivare dopo il primo pezzo di testo.
# È il segmento "tts" che compare nelle righe [LATENCY] del backend.
TTFB_MS = float(os.getenv("MOCK_TTS_TTFB_MS", "180"))

# Velocità del parlato: quanti caratteri di testo diventano un secondo di
# audio. L'italiano parlato sta attorno ai 14, e da qui esce la durata di
# ogni turno, cioè quanto a lungo la chiamata tiene occupata la banda.
CHARS_PER_SEC = float(os.getenv("MOCK_TTS_CHARS_PER_SEC", "14"))

# Rumore pregenerato in cui ciclare: incomprimibile come l'audio vero, ma
# generato una volta sola perché il mock non deve costare CPU.
_NOISE = bytes(random.getrandbits(8) for _ in range(BYTES_PER_SEC * 2))


def _audio(offset: int, size: int) -> bytes:
    """Un pezzo di rumore, scorrendo il buffer per non ripetere lo stesso."""
    start = offset % (len(_NOISE) - size)
    return _NOISE[start : start + size]


class _Context:
    """Un turno dell'avatar: testo che entra, audio che esce a tempo reale."""

    def __init__(self, ws, context_id: str):
        self.ws = ws
        self.context_id = context_id
        self.queue: asyncio.Queue = asyncio.Queue()
        self.task = asyncio.create_task(self._run())

    def push(self, text: str) -> None:
        # Il testo vuoto è il keep alive: tiene su la connessione e non
        # sintetizza niente, esattamente come il fornitore vero.
        if text.strip():
            self.queue.put_nowait(text)

    def close(self) -> None:
        """Fine del testo: quel che resta in cassa si sintetizza comunque."""
        self.queue.put_nowait(None)

    def cancel(self) -> None:
        self.task.cancel()

    async def _run(self) -> None:
        # Byte di audio ancora da emettere per il testo ricevuto finora
        budget = 0.0
        chiuso = False
        offset = 0
        primo = True
        deadline = time.monotonic()

        while True:
            # Senza audio in coda si aspetta altro testo, a meno che il
            # backend abbia già chiuso il contesto: allora il turno è finito.
            if budget < CHUNK_BYTES:
                if chiuso:
                    break
                item = await self.queue.get()
                if item is None:
                    chiuso = True
                else:
                    budget += len(item) / CHARS_PER_SEC * BYTES_PER_SEC
                continue

            if primo:
                primo = False
                await asyncio.sleep(TTFB_MS / 1000)
                deadline = time.monotonic()

            # Testo arrivato nel frattempo, preso senza bloccare
            while not self.queue.empty():
                item = self.queue.get_nowait()
                if item is None:
                    chiuso = True
                else:
                    budget += len(item) / CHARS_PER_SEC * BYTES_PER_SEC

            pezzo = _audio(offset, CHUNK_BYTES)
            offset += CHUNK_BYTES
            budget -= CHUNK_BYTES
            await self.ws.send(
                json.dumps(
                    {
                        "audio": base64.b64encode(pezzo).decode("ascii"),
                        "contextId": self.context_id,
                    }
                )
            )

            # Ritmo tenuto su una scadenza assoluta: uno sleep fisso
            # accumulerebbe ritardo e dopo qualche minuto l'audio non
            # sarebbe più a tempo reale.
            deadline += CHUNK_MS / 1000
            await asyncio.sleep(max(0.0, deadline - time.monotonic()))

        await self.ws.send(json.dumps({"isFinal": True, "contextId": self.context_id}))


async def handler(ws) -> None:
    contexts: dict[str, _Context] = {}
    try:
        async for raw in ws:
            try:
                event = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue

            context_id = event.get("context_id")
            if not context_id:
                continue

            if event.get("close_context"):
                ctx = contexts.pop(context_id, None)
                if ctx:
                    ctx.close()
                continue

            ctx = contexts.get(context_id)
            if ctx is None or ctx.task.done():
                ctx = _Context(ws, context_id)
                contexts[context_id] = ctx
            ctx.push(event.get("text") or "")
    finally:
        for ctx in contexts.values():
            ctx.cancel()
