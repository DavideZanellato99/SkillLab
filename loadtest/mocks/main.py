"""Avvia i tre finti fornitori in un processo solo.

  8801  finto ElevenLabs Scribe   (WebSocket)
  8802  finta sintesi ElevenLabs  (WebSocket)
  8803  finto OpenAI              (HTTP)

Stanno insieme perché insieme costano pochissimo, e perché la regola vera
non è "un processo per servizio", è che tutto questo giri **su una macchina
diversa dal backend sotto misura**. Un mock che ruba CPU al processo che
stai cronometrando falsa il risultato nella direzione peggiore, cioè ti fa
credere che l'app regga meno di quanto regge.
"""

import asyncio
import os

import llm
import stt
import tts
import websockets

HOST = os.getenv("MOCK_HOST", "0.0.0.0")  # noqa: S104 (strumento di test, non produzione)
STT_PORT = int(os.getenv("MOCK_STT_PORT", "8801"))
TTS_PORT = int(os.getenv("MOCK_TTS_PORT", "8802"))
LLM_PORT = int(os.getenv("MOCK_LLM_PORT", "8803"))


def _adapt(handler):
    """Un handler che va bene sia alla vecchia API di websockets che alla nuova.

    Fino alla 13 la libreria passava (websocket, path), dalla 14 passa solo
    il websocket e la path si legge dalla request. Accettare *args copre
    entrambe senza dover sapere quale versione è installata.
    """

    async def wrapper(*args):
        await handler(args[0])

    return wrapper


async def main() -> None:
    llm_server = await llm.serve(HOST, LLM_PORT)
    async with (
        websockets.serve(_adapt(stt.handler), HOST, STT_PORT, max_size=16 * 1024 * 1024),
        websockets.serve(_adapt(tts.handler), HOST, TTS_PORT, max_size=16 * 1024 * 1024),
    ):
        print(
            f"[MOCK] STT ws://{HOST}:{STT_PORT}  "
            f"TTS ws://{HOST}:{TTS_PORT}  "
            f"LLM http://{HOST}:{LLM_PORT}/v1",
            flush=True,
        )
        async with llm_server:
            await asyncio.Future()


if __name__ == "__main__":
    with __import__("contextlib").suppress(KeyboardInterrupt):
        asyncio.run(main())
