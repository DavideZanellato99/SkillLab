"""Generatore di chiamate finte contro il backend SkillLab.

Apre N sessioni vocali vere (login, POST /api/voice/session, WebSocket) e
per ognuna spinge audio PCM16 a 16 kHz come farebbe un browser, alternando
battute e silenzi per far scattare la VAD e tenere viva una conversazione.

Tre cose che decidono se la misura vale qualcosa:

- **L'audio va a tempo reale, su una scadenza assoluta.** Con uno sleep
  fisso il ritmo deriva e dopo qualche minuto le chiamate finte non
  simulano più niente. Se il generatore non riesce a stare in orario lo
  dice: la riga "frame in ritardo" nel riepilogo è un avviso che quel giro
  va buttato, non un dettaglio.
- **Il silenzio è rumore di fondo, non zeri.** La WebSocket comprime, e una
  sfilza di zeri si comprime a nulla: misureresti una banda dieci volte più
  bassa del vero.
- **Il microfono tace mentre l'avatar parla**, come fa il browser vero
  (half-duplex). Altrimenti la STT commetterebbe sopra il turno in corso e
  passeresti il test a misurare barge-in che in produzione non succedono.

  python generator.py --base-url http://localhost:8000 \
      --email operatore@test.it --password ... --calls 10 --duration 300
"""

import argparse
import asyncio
import contextlib
import json
import random
import statistics
import time

import httpx
import websockets

# Il browser cattura a 16 kHz e manda frame da 20 ms
SAMPLE_RATE = 16000
FRAME_MS = 20
FRAME_BYTES = SAMPLE_RATE * 2 * FRAME_MS // 1000


def _rumore(ampiezza: int, secondi: float = 2.0) -> bytes:
    """Buffer di rumore PCM16 pregenerato, in cui poi si cicla."""
    campioni = int(SAMPLE_RATE * secondi)
    return b"".join(
        random.randint(-ampiezza, ampiezza).to_bytes(2, "little", signed=True)
        for _ in range(campioni)
    )


# Generati una volta sola: la voce sopra la soglia VAD del finto STT, il
# silenzio ben sotto, ma nessuno dei due comprimibile.
VOCE = _rumore(8000)
SILENZIO = _rumore(40)


def _frame(buffer: bytes, offset: int) -> bytes:
    start = (offset * FRAME_BYTES) % (len(buffer) - FRAME_BYTES)
    return buffer[start : start + FRAME_BYTES]


class Stats:
    """Quello che il generatore vede dal suo lato della WebSocket."""

    def __init__(self):
        self.attive = 0
        self.completate = 0
        self.fallite = 0
        self.turni = 0
        self.latenze: list[float] = []
        self.byte_inviati = 0
        self.byte_ricevuti = 0
        self.frame_in_ritardo = 0
        self.frame_totali = 0
        self.errori: dict[str, int] = {}

    def errore(self, motivo: str) -> None:
        self.errori[motivo] = self.errori.get(motivo, 0) + 1

    def riepilogo(self, elapsed: float) -> str:
        righe = [
            f"chiamate attive {self.attive}, completate {self.completate}, "
            f"fallite {self.fallite}",
            f"turni {self.turni}",
        ]
        if self.latenze:
            ordinate = sorted(self.latenze)
            p95 = ordinate[min(len(ordinate) - 1, int(len(ordinate) * 0.95))]
            righe.append(
                f"risposta lato client: mediana {statistics.median(ordinate):.0f}ms  "
                f"p95 {p95:.0f}ms  max {ordinate[-1]:.0f}ms"
            )
        if elapsed > 0:
            su = self.byte_inviati / elapsed / 1024
            giu = self.byte_ricevuti / elapsed / 1024
            righe.append(f"banda: {su:.0f} KB/s in salita, {giu:.0f} KB/s in discesa")
        if self.frame_totali:
            quota = self.frame_in_ritardo / self.frame_totali * 100
            nota = "  <-- IL GENERATORE NON TIENE IL RITMO" if quota > 1 else ""
            righe.append(f"frame in ritardo: {quota:.1f}%{nota}")
        if self.errori:
            righe.append("errori: " + ", ".join(f"{k} x{v}" for k, v in self.errori.items()))
        return " | ".join(righe)


class Chiamata:
    """Una conversazione finta, dall'apertura della sessione al riaggancio."""

    def __init__(self, args, client: httpx.AsyncClient, stats: Stats, indice: int):
        self.args = args
        self.client = client
        self.stats = stats
        self.indice = indice
        self.ws = None
        # "voce" mentre l'operatore parla, "silenzio" il resto del tempo
        self.mic = "silenzio"
        self.avatar_parla = asyncio.Event()
        self.avatar_muto = asyncio.Event()
        self.avatar_muto.set()
        # Istante del commit della battuta, per cronometrare la risposta
        self.attesa_da: float | None = None

    async def _apri_sessione(self) -> str:
        risposta = await self.client.post(
            "/api/voice/session", json={"avatar_id": self.args.avatar_id}
        )
        risposta.raise_for_status()
        return risposta.json()["session_id"]

    async def _mic_loop(self) -> None:
        """Spinge un frame ogni 20 ms, a tempo di orologio."""
        offset = 0
        deadline = time.monotonic()
        while True:
            buffer = VOCE if self.mic == "voce" else SILENZIO
            await self.ws.send(_frame(buffer, offset))
            self.stats.byte_inviati += FRAME_BYTES
            self.stats.frame_totali += 1
            offset += 1

            deadline += FRAME_MS / 1000
            ritardo = deadline - time.monotonic()
            if ritardo < -FRAME_MS / 1000:
                # Più di un frame di ritardo accumulato: il generatore è il
                # collo di bottiglia, non il backend.
                self.stats.frame_in_ritardo += 1
                deadline = time.monotonic()
            await asyncio.sleep(max(0.0, ritardo))

    async def _receive_loop(self) -> None:
        async for messaggio in self.ws:
            if isinstance(messaggio, bytes):
                self.stats.byte_ricevuti += len(messaggio)
                if self.attesa_da is not None:
                    self.stats.latenze.append((time.monotonic() - self.attesa_da) * 1000)
                    self.stats.turni += 1
                    self.attesa_da = None
                continue

            try:
                evento = json.loads(messaggio)
            except json.JSONDecodeError:
                continue
            tipo = evento.get("type")
            if tipo == "user_final":
                # Da qui parte l'attesa che l'operatore percepisce
                self.attesa_da = time.monotonic()
            elif tipo == "speaking_start":
                self.avatar_muto.clear()
                self.avatar_parla.set()
            elif tipo == "speaking_end":
                self.avatar_parla.clear()
                self.avatar_muto.set()
            elif tipo == "error":
                self.stats.errore(f"pipeline: {evento.get('message', '')[:60]}")

    async def _conversazione(self) -> None:
        """Alterna battute e attese finché la chiamata non scade."""
        fine = time.monotonic() + self.args.duration
        while time.monotonic() < fine:
            self.mic = "voce"
            await asyncio.sleep(self.args.speech_secs)
            self.mic = "silenzio"

            # L'avatar deve prima cominciare a parlare, poi finire. Il
            # timeout non è un dettaglio: se scade vuol dire che la risposta
            # non è mai arrivata, ed è esattamente il sintomo che il test
            # cerca. Viene contato e la conversazione riparte.
            try:
                await asyncio.wait_for(self.avatar_parla.wait(), timeout=self.args.reply_timeout)
                await asyncio.wait_for(self.avatar_muto.wait(), timeout=self.args.reply_timeout)
            except TimeoutError:
                self.stats.errore("nessuna risposta entro il timeout")
                self.attesa_da = None

            # La pausa che l'operatore fa prima di riprendere a parlare
            await asyncio.sleep(self.args.think_secs)

    async def run(self) -> None:
        try:
            session_id = await self._apri_sessione()
        except Exception as e:
            self.stats.fallite += 1
            self.stats.errore(f"sessione: {type(e).__name__}")
            return

        # L'id sta nei sottoprotocolli e non nell'indirizzo, come lo manda il
        # browser (vedi VOICE_WS_PROTOCOL nel backend).
        try:
            async with websockets.connect(
                self.args.ws_url,
                subprotocols=["skilllab-voice", session_id],
                max_size=16 * 1024 * 1024,
            ) as ws:
                self.ws = ws
                self.stats.attive += 1
                await ws.send(json.dumps({"type": "start"}))

                tasks = [
                    asyncio.create_task(self._mic_loop()),
                    asyncio.create_task(self._receive_loop()),
                    asyncio.create_task(self._conversazione()),
                ]
                try:
                    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                finally:
                    for t in tasks:
                        t.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)

                with contextlib.suppress(Exception):
                    await ws.send(json.dumps({"type": "end"}))
            self.stats.completate += 1
        except Exception as e:
            self.stats.fallite += 1
            self.stats.errore(f"ws: {type(e).__name__}")
        finally:
            self.stats.attive = max(0, self.stats.attive - 1)


async def _login(args) -> httpx.AsyncClient:
    client = httpx.AsyncClient(base_url=args.base_url, timeout=30)
    risposta = await client.post(
        "/api/auth/login", json={"email": args.email, "password": args.password}
    )
    if risposta.status_code != 200:
        await client.aclose()
        raise SystemExit(f"Login fallito ({risposta.status_code}): {risposta.text[:200]}")
    return client


async def _primo_avatar(client: httpx.AsyncClient) -> str:
    risposta = await client.get("/api/avatars")
    risposta.raise_for_status()
    dati = risposta.json()
    elenco = dati if isinstance(dati, list) else dati.get("items", [])
    if not elenco:
        raise SystemExit("Nessun avatar disponibile: passa --avatar-id esplicitamente.")
    return str(elenco[0]["id"])


async def _stampa_periodica(stats: Stats, ogni: int, inizio: float) -> None:
    while True:
        await asyncio.sleep(ogni)
        print(f"[{time.monotonic() - inizio:6.0f}s] {stats.riepilogo(time.monotonic() - inizio)}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Chiamate finte contro il backend SkillLab.")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--avatar-id", default=None, help="Se assente, prende il primo avatar.")
    parser.add_argument("--calls", type=int, default=10, help="Chiamate in parallelo.")
    parser.add_argument("--duration", type=int, default=300, help="Durata di ogni chiamata (s).")
    parser.add_argument("--ramp", type=float, default=10, help="Secondi su cui spalmare l'avvio.")
    parser.add_argument("--speech-secs", type=float, default=4.0, help="Lunghezza di una battuta.")
    parser.add_argument("--think-secs", type=float, default=0.8, help="Pausa prima di riparlare.")
    parser.add_argument("--reply-timeout", type=float, default=25.0)
    parser.add_argument("--report-every", type=int, default=15)
    args = parser.parse_args()

    origine = args.base_url.replace("https://", "wss://").replace("http://", "ws://")
    args.ws_url = origine.rstrip("/") + "/api/voice/ws"

    client = await _login(args)
    if not args.avatar_id:
        args.avatar_id = await _primo_avatar(client)
        print(f"Avatar scelto automaticamente: {args.avatar_id}")

    stats = Stats()
    inizio = time.monotonic()
    print(f"Avvio {args.calls} chiamate su {args.ramp}s, durata {args.duration}s ciascuna.\n")

    async def avvia(indice: int) -> None:
        # Le chiamate non partono tutte nello stesso istante: un'ondata
        # perfettamente simultanea è un caso più cattivo del vero e
        # misurerebbe l'apertura delle connessioni, non la conversazione.
        await asyncio.sleep(args.ramp * indice / max(1, args.calls))
        await Chiamata(args, client, stats, indice).run()

    reporter = asyncio.create_task(_stampa_periodica(stats, args.report_every, inizio))
    try:
        await asyncio.gather(*(avvia(i) for i in range(args.calls)))
    finally:
        reporter.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await reporter
        await client.aclose()

    elapsed = time.monotonic() - inizio
    print(f"\n=== Riepilogo dopo {elapsed:.0f}s ===")
    print(stats.riepilogo(elapsed))


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
