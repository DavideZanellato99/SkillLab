"""Finto ElevenLabs Scribe v2 Realtime.

Parla il protocollo che si aspetta voice_pipeline._stt_loop: riceve i JSON
`input_audio_chunk` con l'audio in base64 e risponde con `partial_transcript`
mentre l'operatore parla e `committed_transcript` quando tace.

La VAD è vera, non finta a tempo: decodifica il base64 e misura il picco dei
campioni PCM, esattamente come farebbe il servizio reale. Due motivi. Il primo
è che il costo di decodifica deve esserci, altrimenti il volume di dati che
attraversa il backend non somiglia a quello di produzione. Il secondo è che
così il generatore controlla i turni con l'audio che manda, invece che con
accordi presi a parte, e la conversazione simulata resta una conversazione.

La soglia di silenzio viene letta dalla query string, quindi rispetta lo
stesso ELEVENLABS_VAD_SILENCE_SECS che sta nel .env del backend.
"""

import asyncio
import base64
import json
import os
import random
import time
from array import array
from urllib.parse import parse_qs, urlparse

# Ritardo di rete simulato verso il fornitore, in millisecondi. A zero il
# mock risponde istantaneamente, cosa che non falsa la misura di capacità
# (il lavoro del backend è lo stesso) ma rende le latenze assolute più
# ottimistiche del vero. Alzarlo per avvicinarsi ai tempi reali.
NET_DELAY_MS = float(os.getenv("MOCK_NET_DELAY_MS", "0"))

# Sopra questo picco il frame conta come voce. Il generatore manda voce
# attorno a 8000 e silenzio attorno a 40, quindi la soglia è larga.
SPEECH_PEAK = int(os.getenv("MOCK_STT_SPEECH_PEAK", "1500"))

# Ogni quanto esce un partial mentre l'operatore parla
PARTIAL_EVERY_SECS = 0.3

# Quota di commit spezzati a metà frase, come fa il servizio vero sulle
# battute lunghe. A zero ogni commit finisce col punto e il backend risponde
# subito; alzarla mette alla prova la finestra di aggregazione VOICE_SETTLE_MS.
SPLIT_COMMIT_RATIO = float(os.getenv("MOCK_STT_SPLIT_RATIO", "0"))

# Battute plausibili di un operatore di call center, che è quello che il
# finto LLM riceverà come storia della conversazione.
FRASI = [
    "Buongiorno, sono Marco del servizio clienti, in cosa posso aiutarla.",
    "Certo, mi può confermare il suo codice fiscale per favore.",
    "Capisco perfettamente la sua situazione, verifico subito sul sistema.",
    "Ho controllato la sua posizione e vedo che il pagamento risulta sospeso.",
    "Mi dispiace molto per il disagio, provvedo io stesso a sistemare tutto.",
    "Le confermo che la pratica è stata aperta con numero di riferimento interno.",
    "Ha bisogno di altro oppure posso considerare risolta la richiesta.",
]


def _path(ws) -> str:
    """La request path, con le due API di websockets che ci sono in giro."""
    request = getattr(ws, "request", None)
    if request is not None and getattr(request, "path", None):
        return request.path
    return getattr(ws, "path", "") or ""


def _vad_silence_secs(ws) -> float:
    """La soglia di silenzio che il backend ha messo nella query string."""
    query = parse_qs(urlparse(_path(ws)).query)
    try:
        return float(query.get("vad_silence_threshold_secs", ["0.6"])[0])
    except (TypeError, ValueError):
        return 0.6


def _peak(pcm: bytes) -> int:
    """Picco del frame, campionato: serve una soglia, non una misura."""
    samples = array("h")
    samples.frombytes(pcm[: len(pcm) // 2 * 2])
    if not samples:
        return 0
    return max(abs(s) for s in samples[::16])


class _Turn:
    """La battuta che l'operatore sta pronunciando in questo momento."""

    def __init__(self):
        self.frase = random.choice(FRASI)
        self.parole = self.frase.split()
        self.dette = 0

    def avanza(self) -> str:
        """Il prefisso della frase pronunciato finora."""
        self.dette = min(len(self.parole), self.dette + random.randint(1, 3))
        return " ".join(self.parole[: self.dette])

    def testo_finale(self) -> str:
        return self.frase


async def handler(ws) -> None:
    silence_secs = _vad_silence_secs(ws)
    turn: _Turn | None = None
    last_speech: float | None = None
    last_partial = 0.0

    async def send(payload: dict) -> None:
        if NET_DELAY_MS:
            await asyncio.sleep(NET_DELAY_MS / 1000)
        await ws.send(json.dumps(payload, ensure_ascii=False))

    async for raw in ws:
        try:
            event = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        if event.get("message_type") != "input_audio_chunk":
            continue

        pcm = base64.b64decode(event.get("audio_base_64") or "")
        now = time.monotonic()
        parla = _peak(pcm) > SPEECH_PEAK

        if parla:
            last_speech = now
            if turn is None:
                turn = _Turn()
            if now - last_partial >= PARTIAL_EVERY_SECS:
                last_partial = now
                await send({"message_type": "partial_transcript", "text": turn.avanza()})
            continue

        # Silenzio: la VAD commette solo dopo che è passata la soglia
        if turn is None or last_speech is None or (now - last_speech) < silence_secs:
            continue

        testo = turn.testo_finale()
        if random.random() < SPLIT_COMMIT_RATIO:
            # Commit forzato a metà battuta, senza punto finale: è il caso
            # che VOICE_SETTLE_MS esiste per assorbire.
            taglio = max(1, len(testo.split()) // 2)
            testo = " ".join(testo.split()[:taglio])
        await send({"message_type": "committed_transcript", "text": testo})
        turn = None
        last_speech = None
