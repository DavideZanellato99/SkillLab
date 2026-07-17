"""Google Gemini service for avatar chat roleplay."""

import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

# Free-tier/preview models get overloaded in waves (503 UNAVAILABLE): when the
# primary model is saturated we retry the same request on these, in order.
GEMINI_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv(
        "GEMINI_FALLBACK_MODELS",
        "gemini-3-flash-preview,gemini-3.5-flash,gemini-flash-latest",
    ).split(",")
    if m.strip()
]

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None


def _candidate_models() -> list[str]:
    return [GEMINI_MODEL] + [m for m in GEMINI_FALLBACK_MODELS if m != GEMINI_MODEL]


def _is_retryable(error: Exception) -> bool:
    """True for transient overload/quota errors worth retrying on another model."""
    msg = str(error)
    return any(s in msg for s in ("503", "UNAVAILABLE", "overloaded", "429", "RESOURCE_EXHAUSTED"))


def _generation_config(system_prompt: str) -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.9,
        max_output_tokens=1024,
        # No thinking: keeps voice-mode latency low
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )


def build_system_prompt(avatar_name: str, avatar_description: str, avatar_category: str) -> str:
    """Build the system prompt for avatar roleplay."""
    return (
        f"Sei {avatar_name}. {avatar_description}\n"
        f"Appartieni alla categoria: {avatar_category}.\n\n"
        "ISTRUZIONI:\n"
        "- Devi interpretare questo personaggio in ogni risposta.\n"
        "- Rispondi SEMPRE in italiano.\n"
        "- Sii coinvolgente, creativo e resta nel personaggio.\n"
        "- Usa un tono che rispecchi la personalità del personaggio.\n"
        "- Non rompere mai il personaggio e non rivelare di essere un'intelligenza artificiale.\n"
        "- Mantieni le risposte concise ma interessanti (1-2 paragrafi massimo).\n"
    )


def _build_contents(messages_history: list[dict], user_message: str | None = None) -> list:
    """Convert role/content dicts into Gemini Content objects."""
    contents = []
    for msg in messages_history:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))
    if user_message is not None:
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_message)]))
    return contents


def stream_avatar_response(
    avatar_name: str,
    avatar_description: str,
    avatar_category: str,
    messages_history: list[dict],
):
    """
    Stream a roleplay response from Google Gemini as text chunks.

    The last entry of messages_history must be the new user message.
    Yields text fragments as soon as Gemini produces them.
    """
    if not client:
        raise RuntimeError(
            "GEMINI_API_KEY non configurata. "
            "Aggiungi GEMINI_API_KEY al file .env del backend."
        )

    system_prompt = build_system_prompt(avatar_name, avatar_description or "", avatar_category)
    contents = _build_contents(messages_history)

    last_error: Exception | None = None
    for model in _candidate_models():
        started = False
        try:
            stream = client.models.generate_content_stream(
                model=model,
                contents=contents,
                config=_generation_config(system_prompt),
            )
            for chunk in stream:
                if chunk.text:
                    started = True
                    yield chunk.text
            return
        except Exception as e:
            # Once text has been emitted we can't switch model mid-response
            if started or not _is_retryable(e):
                print(f"[ERROR] Gemini streaming call failed ({model}): {e}")
                raise RuntimeError(f"Errore nella comunicazione con Gemini: {str(e)}")
            print(f"[WARN] Modello {model} non disponibile, provo il successivo: {str(e)[:120]}")
            last_error = e

    print(f"[ERROR] Tutti i modelli Gemini non disponibili: {last_error}")
    raise RuntimeError(f"Errore nella comunicazione con Gemini: {str(last_error)}")
