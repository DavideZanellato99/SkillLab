"""OpenAI service for the avatar conversation LLM (roleplay) and the
post-call evaluation.

The live voice conversation streams from a low-latency model (OPENAI_MODEL).
The post-call evaluation runs separately on a stronger reasoning model
(OPENAI_EVAL_MODEL) since it's a single one-shot judgment call, not
latency-sensitive. The persona prompt building lives in gemini_service
(pure string templating, provider-agnostic).
"""

import json
import os
from dotenv import load_dotenv
from openai import AsyncOpenAI

from gemini_service import build_persona_prompt, profile_section

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
OPENAI_EVAL_MODEL = os.getenv("OPENAI_EVAL_MODEL", "gpt-5.6-terra")

# When the primary model is saturated or unavailable we retry the same
# request on these, in order (comma-separated; empty = no fallback).
OPENAI_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv("OPENAI_FALLBACK_MODELS", "").split(",")
    if m.strip()
]
OPENAI_EVAL_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv("OPENAI_EVAL_FALLBACK_MODELS", "gpt-5.1,gpt-4.1-mini").split(",")
    if m.strip()
]

async_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


def _candidate_models() -> list[str]:
    return [OPENAI_MODEL] + [m for m in OPENAI_FALLBACK_MODELS if m != OPENAI_MODEL]


def _eval_candidate_models() -> list[str]:
    return [OPENAI_EVAL_MODEL] + [
        m for m in OPENAI_EVAL_FALLBACK_MODELS if m != OPENAI_EVAL_MODEL
    ]


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


def _eval_completion_kwargs(model: str) -> dict:
    """Per-model sampling params for the post-call evaluation.

    Unlike the roleplay, the evaluation is a single one-shot judgment call
    with no latency pressure, so reasoning models get a deliberate ("high")
    effort instead of the roleplay's "none"/"minimal" — better-calibrated
    scores are worth the extra time.
    """
    if model.startswith("gpt-5"):
        return {"reasoning_effort": "high"}
    return {"temperature": 0.3}


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


# ── Post-call evaluation (operator coaching) ──────────

EVALUATION_CRITERIA = [
    ("linguaggio", "Linguaggio e professionalità"),
    ("affidabilita", "Affidabilità e competenza"),
    ("empatia", "Empatia e ascolto"),
    ("gestione_emotiva", "Gestione dell'emotività del cliente"),
    ("risoluzione", "Efficacia e risoluzione del problema"),
]

# Below this score a criterion comes with improvement suggestions
EVALUATION_SUGGESTION_THRESHOLD = 10


def _evaluation_prompt(profile: dict) -> str:
    """System prompt for the trainer that judges the operator's performance."""
    nome = str(profile.get("NOME", "") or "").strip()
    cognome = str(profile.get("COGNOME", "") or "").strip()
    cliente = f"{nome} {cognome}".strip() or "il cliente simulato"

    contesto = profile_section(profile, [
        ("TIPO_SCENARIO", "Scenario della chiamata"),
        ("DESCRIZIONE_PROBLEMATICA", "Vera causa del problema (ignota al cliente)"),
        ("OBIETTIVO_NASCOSTO", "Obiettivo nascosto della simulazione"),
        ("EMOZIONE_INIZIALE", "Emozione iniziale del cliente"),
        ("GRADO_DIFFICOLTA", "Grado di difficoltà"),
    ])
    criteri = "\n".join(f'- "{key}": {label}' for key, label in EVALUATION_CRITERIA)

    return (
        "Sei un formatore esperto di customer service bancario. Valuta la performance "
        "dell'OPERATORE (mai quella del cliente) nella trascrizione di una telefonata di "
        f"formazione tra un operatore in addestramento e {cliente}, un cliente simulato.\n\n"
        + (f"## CONTESTO DELLA SIMULAZIONE\n{contesto}\n\n" if contesto else "")
        + f"## CRITERI DA VALUTARE\n{criteri}\n\n"
        "## CRITERIO DI VALUTAZIONE (scala)\n"
        "Questa è una simulazione di formazione, non un esame di eccellenza: valuta con il "
        "metro di un formatore comprensivo, non di un giudice severo.\n"
        "- 0-3: mancanze gravi, l'operatore ha danneggiato la relazione con il cliente o gestito "
        "molto male l'aspetto valutato.\n"
        "- 4-5: prestazione insufficiente, mancano elementi importanti rispetto al criterio.\n"
        "- 6-7: SUFFICIENTE — l'operatore adempie al criterio in modo accettabile e professionale, "
        "anche con qualche imperfezione o margine di miglioramento. Questo è il livello atteso per "
        "un operatore in formazione che se la cava senza errori gravi: NON riservarlo solo a "
        "prestazioni quasi perfette.\n"
        "- 8-9: prestazione molto buona, imperfezioni minime.\n"
        "- 10: eccellente, nessun margine di miglioramento reale.\n"
        "Riserva i punteggi sotto la sufficienza (0-5) solo a mancanze concrete e significative "
        "riscontrabili nella trascrizione, non a piccole imperfezioni stilistiche o a un'ipotetica "
        "versione perfetta della risposta. In caso di dubbio tra due fasce, scegli quella più alta.\n\n"
        "## ISTRUZIONI\n"
        "- Assegna a ogni criterio un punteggio intero da 0 a 10, seguendo la scala sopra.\n"
        "- Per ogni criterio scrivi un commento breve (1-2 frasi), citando quando utile "
        "momenti specifici della chiamata.\n"
        f"- Se il punteggio di un criterio è inferiore a {EVALUATION_SUGGESTION_THRESHOLD}, "
        "aggiungi suggerimenti concreti e pratici su come migliorare; altrimenti usa null.\n"
        "- Assegna anche un punteggio complessivo da 0 a 10 e una sintesi di 2-3 frasi.\n"
        "- Scrivi tutto in italiano.\n\n"
        "## FORMATO DELLA RISPOSTA\n"
        "Rispondi SOLO con un oggetto JSON con questa struttura esatta:\n"
        '{"criteria": {"<chiave criterio>": {"score": 0-10, "comment": "...", '
        '"suggestions": "..." oppure null}}, "overall_score": 0-10, "summary": "..."}'
    )


def _clamp_score(value) -> float:
    score = float(value)  # raises TypeError/ValueError on junk → retried
    return max(0.0, min(10.0, round(score, 1)))


def _normalize_evaluation(raw: dict) -> dict:
    """Validate/normalize the model's JSON into the stored result shape."""
    raw_criteria = raw.get("criteria") or {}
    criteria = []
    for key, label in EVALUATION_CRITERIA:
        entry = raw_criteria.get(key) or {}
        score = _clamp_score(entry.get("score"))
        suggestions = str(entry.get("suggestions") or "").strip() or None
        if score >= EVALUATION_SUGGESTION_THRESHOLD:
            suggestions = None
        criteria.append({
            "key": key,
            "label": label,
            "score": score,
            "comment": str(entry.get("comment") or "").strip(),
            "suggestions": suggestions,
        })

    try:
        overall = _clamp_score(raw.get("overall_score"))
    except (TypeError, ValueError):
        overall = round(sum(c["score"] for c in criteria) / len(criteria), 1)

    return {
        "overall_score": overall,
        "summary": str(raw.get("summary") or "").strip(),
        "criteria": criteria,
    }


async def evaluate_conversation(messages_history: list[dict], avatar_profile: dict) -> dict:
    """
    Judge the operator's performance over the whole conversation with a
    reasoning-capable OpenAI model (OPENAI_EVAL_MODEL).

    Returns {"overall_score": float, "summary": str, "criteria": [...]}
    where each criterion carries score, comment and (only when score < 10)
    improvement suggestions. Raises RuntimeError on failure.
    """
    if not async_client:
        raise RuntimeError(
            "OPENAI_API_KEY non configurata. "
            "Aggiungi OPENAI_API_KEY al file .env del backend."
        )

    transcript = "\n".join(
        f"{'OPERATORE' if m['role'] == 'user' else 'CLIENTE'}: {m['content']}"
        for m in messages_history
        if str(m.get("content", "")).strip()
    )
    if not transcript:
        raise RuntimeError("Conversazione vuota: impossibile generare la valutazione.")

    messages = [
        {"role": "system", "content": _evaluation_prompt(avatar_profile or {})},
        {"role": "user", "content": f"## TRASCRIZIONE DELLA CHIAMATA\n{transcript}"},
    ]

    last_error: Exception | None = None
    for model in _eval_candidate_models():
        try:
            response = await async_client.chat.completions.create(
                model=model,
                messages=messages,
                max_completion_tokens=2048,
                response_format={"type": "json_object"},
                **_eval_completion_kwargs(model),
            )
        except Exception as e:
            if not _is_retryable(e):
                print(f"[ERROR] OpenAI evaluation failed ({model}): {e}")
                raise RuntimeError(f"Errore nella generazione della valutazione: {str(e)}")
            print(f"[WARN] Modello {model} non disponibile per la valutazione: {str(e)[:120]}")
            last_error = e
            continue
        try:
            return _normalize_evaluation(json.loads(response.choices[0].message.content or ""))
        except (json.JSONDecodeError, TypeError, ValueError, IndexError) as e:
            # Malformed/incomplete JSON: try the next model
            print(f"[WARN] Valutazione non valida da {model}, provo il successivo: {e}")
            last_error = e

    print(f"[ERROR] Valutazione fallita su tutti i modelli OpenAI: {last_error}")
    raise RuntimeError(f"Errore nella generazione della valutazione: {str(last_error)}")
