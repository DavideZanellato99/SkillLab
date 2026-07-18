"""OpenAI service for the avatar conversation LLM (roleplay).

Powers the live conversation — streaming roleplay responses and the
avatar's opening line — on OpenAI models. The persona prompt building
lives in gemini_service (provider-agnostic), and the post-call
evaluation stays on Gemini (gemini_service.evaluate_conversation).
"""

import os
from dotenv import load_dotenv
from openai import OpenAI

from gemini_service import build_persona_prompt, _OPENING_LINE_INSTRUCTION

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.1")

# When the primary model is saturated or unavailable we retry the same
# request on these, in order.
OPENAI_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv("OPENAI_FALLBACK_MODELS", "gpt-5-mini").split(",")
    if m.strip()
]

client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


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
    ("none" exists only from 5.1 onward). Older models get the same
    creative temperature used for the roleplay on Gemini.
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


def generate_opening_line(avatar_profile: dict) -> str:
    """
    Generate the brief self-introduction the avatar speaks when it is the one
    starting the call. Falls back to a neutral presentation if OpenAI fails.
    """
    nome = str((avatar_profile or {}).get("NOME", "") or "").strip()
    cognome = str((avatar_profile or {}).get("COGNOME", "") or "").strip()
    fallback = (
        f"Pronto, buongiorno. Sono {nome} {cognome}. "
        "La chiamo perché ho un problema che vorrei risolvere con voi."
    )

    if not client or not avatar_profile:
        return fallback

    system_prompt = build_persona_prompt(avatar_profile)
    messages = _build_messages(
        system_prompt, [{"role": "user", "content": _OPENING_LINE_INSTRUCTION}]
    )

    for model in _candidate_models():
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                max_completion_tokens=256,
                **_completion_kwargs(model),
            )
            text = (response.choices[0].message.content or "").strip()
            if text:
                return text
        except Exception as e:
            if not _is_retryable(e):
                print(f"[ERROR] OpenAI opening line failed ({model}): {e}")
                break
            print(f"[WARN] Modello {model} non disponibile per la battuta di apertura: {str(e)[:120]}")

    return fallback


def stream_avatar_response(
    messages_history: list[dict],
    avatar_profile: dict,
):
    """
    Stream a roleplay response from OpenAI as text chunks.

    Every avatar is a training persona: avatar_profile is its sheet
    (required). The last entry of messages_history must be the new user
    message. Yields text fragments as soon as OpenAI produces them.
    """
    if not client:
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
            stream = client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                max_completion_tokens=1024,
                **_completion_kwargs(model),
            )
            for chunk in stream:
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
