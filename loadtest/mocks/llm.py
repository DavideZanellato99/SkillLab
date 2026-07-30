"""Finto endpoint OpenAI Chat Completions.

Il client OpenAI legge OPENAI_BASE_URL dall'ambiente per conto suo, quindi
puntarlo qui non richiede di toccare openai_service.py.

Serve due cose:
  POST /v1/chat/completions con stream=true   il turno dell'avatar, in SSE
  POST /v1/chat/completions senza stream      il prewarm, che chiede 1 token

Di tutto quello che fa un modello vero, qui contano solo due numeri: quanto
ci mette ad arrivare il primo token, che è il segmento che domina la latenza
percepita, e ogni quanto arrivano i successivi, che è il ritmo con cui il
backend deve alimentare la TTS.

HTTP scritto a mano su asyncio invece che con un framework, per due motivi:
il mock non deve costare CPU quanto il backend che sta misurando, e la
connessione deve restare keep-alive come con l'API vera, altrimenti ogni
turno pagherebbe un handshake che in produzione non paga.
"""

import asyncio
import json
import os
import random
import time

TTFT_MS = float(os.getenv("MOCK_LLM_TTFT_MS", "250"))
TOKEN_INTERVAL_MS = float(os.getenv("MOCK_LLM_TOKEN_MS", "25"))
TOKENS_MIN = int(os.getenv("MOCK_LLM_TOKENS_MIN", "25"))
TOKENS_MAX = int(os.getenv("MOCK_LLM_TOKENS_MAX", "60"))

# Il cliente al telefono: frasi da cui pescare i token della risposta.
PAROLE = (
    "Buongiorno sì la chiamo perché ho un problema con il mio conto corrente "
    "da questa mattina non riesco più ad accedere all'applicazione e mi "
    "compare un messaggio di errore che non capisco ho già provato a "
    "reinstallare tutto ma non cambia niente e domani devo assolutamente "
    "fare un bonifico importante quindi le chiedo cortesemente di verificare "
    "cosa sta succedendo perché comincio a essere davvero preoccupato"
).split()


def _sse(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode()


def _chunk_frame(data: bytes) -> bytes:
    """Un pezzo in Transfer-Encoding: chunked."""
    return f"{len(data):x}\r\n".encode() + data + b"\r\n"


def _delta(model: str, content: str | None, finish: str | None) -> dict:
    delta = {"content": content} if content is not None else {}
    return {
        "id": "chatcmpl-mock",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }


async def _rispondi_stream(writer: asyncio.StreamWriter, model: str) -> None:
    writer.write(
        b"HTTP/1.1 200 OK\r\n"
        b"Content-Type: text/event-stream\r\n"
        b"Cache-Control: no-cache\r\n"
        b"Transfer-Encoding: chunked\r\n"
        b"\r\n"
    )
    await writer.drain()

    await asyncio.sleep(TTFT_MS / 1000)

    start = random.randrange(0, max(1, len(PAROLE) - TOKENS_MAX))
    quanti = random.randint(TOKENS_MIN, TOKENS_MAX)
    deadline = time.monotonic()
    for i in range(quanti):
        parola = PAROLE[(start + i) % len(PAROLE)]
        testo = parola if i == 0 else f" {parola}"
        writer.write(_chunk_frame(_sse(_delta(model, testo, None))))
        await writer.drain()
        deadline += TOKEN_INTERVAL_MS / 1000
        await asyncio.sleep(max(0.0, deadline - time.monotonic()))

    writer.write(_chunk_frame(_sse(_delta(model, None, "stop"))))
    writer.write(_chunk_frame(b"data: [DONE]\n\n"))
    writer.write(b"0\r\n\r\n")
    await writer.drain()


async def _rispondi_singola(writer: asyncio.StreamWriter, model: str) -> None:
    """La risposta non in streaming, che è quella che chiede il prewarm."""
    body = json.dumps(
        {
            "id": "chatcmpl-mock",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": "Pronto"},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        }
    ).encode()
    writer.write(
        b"HTTP/1.1 200 OK\r\n"
        b"Content-Type: application/json\r\n"
        + f"Content-Length: {len(body)}\r\n".encode()
        + b"\r\n"
        + body
    )
    await writer.drain()


async def _errore(writer: asyncio.StreamWriter, status: str) -> None:
    body = json.dumps({"error": {"message": status}}).encode()
    writer.write(
        f"HTTP/1.1 {status}\r\n".encode()
        + b"Content-Type: application/json\r\n"
        + f"Content-Length: {len(body)}\r\n".encode()
        + b"\r\n"
        + body
    )
    await writer.drain()


async def _serve(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while True:
            testa = await reader.readuntil(b"\r\n\r\n")
            righe = testa.decode("latin-1").split("\r\n")
            metodo, percorso, *_ = righe[0].split(" ")
            headers = {}
            for riga in righe[1:]:
                if ":" in riga:
                    k, v = riga.split(":", 1)
                    headers[k.strip().lower()] = v.strip()

            corpo = b""
            lunghezza = int(headers.get("content-length", "0") or 0)
            if lunghezza:
                corpo = await reader.readexactly(lunghezza)

            if metodo != "POST" or not percorso.endswith("/chat/completions"):
                await _errore(writer, "404 Not Found")
                continue

            try:
                richiesta = json.loads(corpo or b"{}")
            except json.JSONDecodeError:
                await _errore(writer, "400 Bad Request")
                continue

            model = richiesta.get("model", "mock")
            if richiesta.get("stream"):
                await _rispondi_stream(writer, model)
            else:
                await _rispondi_singola(writer, model)
    except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError):
        pass
    finally:
        writer.close()


async def serve(host: str, port: int) -> asyncio.AbstractServer:
    return await asyncio.start_server(_serve, host, port)
