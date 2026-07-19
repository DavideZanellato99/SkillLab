"""OpenAI service for the avatar conversation LLM (roleplay).

Powers the live voice conversation — streaming roleplay responses — on a
single low-latency OpenAI model (OPENAI_MODEL). The persona prompt
building lives in gemini_service (provider-agnostic), and the post-call
evaluation stays on Gemini (gemini_service.evaluate_conversation).
"""

import os
from dotenv import load_dotenv
from openai import AsyncOpenAI

from gemini_service import build_persona_prompt

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

# When the primary model is saturated or unavailable we retry the same
# request on these, in order (comma-separated; empty = no fallback).
OPENAI_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv("OPENAI_FALLBACK_MODELS", "").split(",")
    if m.strip()
]

async_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


def _candidate_models() -> list[str]:
    return [OPENAI_MODEL] + [m for m in OPENAI_FALLBACK_MODELS if m != OPENAI_MODEL]


def _is_retryable(error: Exception) -> bool:
    """True for transient overload/quota errors worth retrying on another model."""
    status = getattr(error, "status_code", None)
    if status in (429, 500, 502, 503):
        return True
    msg = str(error)
    return any(s in msg for s in ("429", "rate limit", "overloaded", "502", "503"))


def _completion_kwargs(model: str) -> dict:
    """Per-model sampling params.

    The GPT-5 family are reasoning models: they reject `temperature`, and
    reasoning is disabled/minimized to keep voice-mode latency low
    ("none" exists only from 5.1 onward). Other models get a creative
    temperature suited to the roleplay.
    """
    if model.startswith("gpt-5.1"):
        return {"reasoning_effort": "none"}
    if model.startswith("gpt-5"):
        return {"reasoning_effort": "minimal"}
    return {"temperature": 0.9}


def _build_messages(system_prompt: str, messages_history: list[dict]) -> list[dict]:
    """Convert role/content dicts into Chat Completions messages."""
    messages = [{"role": "system", "content": system_prompt}]
    for msg in messages_history:
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["content"]})
    return messages


async def stream_avatar_response(
    messages_history: list[dict],
    avatar_profile: dict,
):
    """
    Stream a roleplay response as text chunks (async, used by the voice
    pipeline). Every avatar is a training persona: avatar_profile is its
    sheet (required). The last entry of messages_history must be the new
    user message. Yields text fragments as soon as OpenAI produces them.
    """
    if not async_client:
        raise RuntimeError(
            "OPENAI_API_KEY non configurata. "
            "Aggiungi OPENAI_API_KEY al file .env del backend."
        )
    if not avatar_profile:
        raise RuntimeError(
            "Avatar senza scheda persona: impossibile generare la risposta."
        )

    system_prompt = build_persona_prompt(avatar_profile)
    messages = _build_messages(system_prompt, messages_history)

    last_error: Exception | None = None
    for model in _candidate_models():
        started = False
        try:
            stream = await async_client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                max_completion_tokens=1024,
                **_completion_kwargs(model),
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    started = True
                    yield delta
            return
        except Exception as e:
            # Once text has been emitted we can't switch model mid-response
            if started or not _is_retryable(e):
                print(f"[ERROR] OpenAI streaming call failed ({model}): {e}")
                raise RuntimeError(f"Errore nella comunicazione con OpenAI: {str(e)}")
            print(f"[WARN] Modello {model} non disponibile, provo il successivo: {str(e)[:120]}")
            last_error = e

    print(f"[ERROR] Tutti i modelli OpenAI non disponibili: {last_error}")
    raise RuntimeError(f"Errore nella comunicazione con OpenAI: {str(last_error)}")
