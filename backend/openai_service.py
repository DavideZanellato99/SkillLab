"""OpenAI service for the avatar conversation LLM (roleplay) and the
post-call evaluation.

The live voice conversation streams from a low-latency model (OPENAI_MODEL).
The post-call evaluation runs separately on a stronger reasoning model
(OPENAI_EVAL_MODEL) since it's a single one-shot judgment call, not
latency-sensitive. The persona prompt building lives in persona_prompt
(pure string templating, provider-agnostic).
"""

import json
import os

from dotenv import load_dotenv
from openai import AsyncOpenAI

import tls_setup  # noqa: F401  (TLS via OS store: must precede the openai import)
from persona_prompt import (
    CHANNEL_TEXT,
    CHANNEL_VOICE,
    build_persona_prompt,
    profile_section,
)

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL")
if not OPENAI_MODEL:
    raise RuntimeError("OPENAI_MODEL non configurato. Aggiungilo al file .env del backend.")
OPENAI_EVAL_MODEL = os.getenv("OPENAI_EVAL_MODEL")
if not OPENAI_EVAL_MODEL:
    raise RuntimeError("OPENAI_EVAL_MODEL non configurato. Aggiungilo al file .env del backend.")

# When the primary model is saturated or unavailable we retry the same
# request on these, in order (comma-separated; empty = no fallback).
OPENAI_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv("OPENAI_FALLBACK_MODELS", "").split(",")
    if m.strip()
]
OPENAI_EVAL_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv("OPENAI_EVAL_FALLBACK_MODELS", "").split(",")
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


def _roleplay_messages(
    messages_history: list[dict],
    avatar_profile: dict,
    channel: str,
) -> list[dict]:
    """Preflight the roleplay request and build its messages payload."""
    if not async_client:
        raise RuntimeError(
            "OPENAI_API_KEY non configurata. "
            "Aggiungi OPENAI_API_KEY al file .env del backend."
        )
    if not avatar_profile:
        raise RuntimeError(
            "Avatar senza scheda persona: impossibile generare la risposta."
        )
    return _build_messages(build_persona_prompt(avatar_profile, channel), messages_history)


async def prewarm_roleplay(avatar_profile: dict) -> None:
    """Open the connection to OpenAI and prime the persona prompt cache.

    Meant to run while the phone is still ringing, where the wait costs the
    operator nothing. It pays two things up front that the first turn would
    otherwise pay in full: the DNS/TCP/TLS handshake to the API, and the
    prefill of the persona prompt, which is the cacheable prefix every turn
    of the call then reuses.

    Best effort by design: it asks for a single token and swallows any
    failure, since the worst case is simply the first turn paying what it
    would have paid without this.
    """
    if not async_client or not avatar_profile:
        return
    try:
        await async_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=_build_messages(
                build_persona_prompt(avatar_profile, CHANNEL_VOICE), []
            ),
            max_completion_tokens=1,
            **_completion_kwargs(OPENAI_MODEL),
        )
    except Exception as e:
        print(f"[WARN] Prewarm OpenAI non riuscito: {str(e)[:120]}")


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
    messages = _roleplay_messages(messages_history, avatar_profile, CHANNEL_VOICE)

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


async def generate_avatar_reply(
    messages_history: list[dict],
    avatar_profile: dict,
) -> str:
    """
    Generate one roleplay reply as a whole string (text chat mode).

    Same persona and same fallback chain as the voice mode, but the reply
    is not streamed: the chat endpoint answers a single HTTP request, so
    there is nothing to stream it into. The last entry of messages_history
    must be the new operator message. Raises RuntimeError on failure.
    """
    messages = _roleplay_messages(messages_history, avatar_profile, CHANNEL_TEXT)

    last_error: Exception | None = None
    for model in _candidate_models():
        try:
            response = await async_client.chat.completions.create(
                model=model,
                messages=messages,
                max_completion_tokens=1024,
                **_completion_kwargs(model),
            )
        except Exception as e:
            if not _is_retryable(e):
                print(f"[ERROR] OpenAI chat call failed ({model}): {e}")
                raise RuntimeError(f"Errore nella comunicazione con OpenAI: {str(e)}")
            print(f"[WARN] Modello {model} non disponibile, provo il successivo: {str(e)[:120]}")
            last_error = e
            continue

        reply = (response.choices[0].message.content or "").strip() if response.choices else ""
        if reply:
            return reply
        # An empty reply leaves the operator with nothing to answer to:
        # treat it like an unavailable model and try the next one.
        print(f"[WARN] Risposta vuota da {model}, provo il successivo")
        last_error = RuntimeError("risposta vuota")

    print(f"[ERROR] Tutti i modelli OpenAI non disponibili: {last_error}")
    raise RuntimeError(f"Errore nella comunicazione con OpenAI: {str(last_error)}")


# ── Post-call evaluation (operator coaching) ──────────

# (key, label, weight%). The weights drive the overall score and must add
# up to 100: the two criteria that decide whether the call was handled at
# all (identifying the customer, understanding the case) carry the most.
EVALUATION_CRITERIA = [
    ("rispetto_fasi_chiamata", "Rispetto delle fasi della chiamata", 18),
    ("empatia", "Empatia e gestione dello stato d'animo del cliente", 15),
    ("sicurezza_competenza", "Sicurezza, competenza e autorevolezza", 13),
    ("appropriatezza_linguaggio", "Appropriatezza di linguaggio, cortesia e professionalità", 10),
    ("identificazione_cliente", "Corretta identificazione del cliente", 22),
    ("comprensione_casistica", "Comprensione della casistica e risposte pertinenti", 22),
]

# Below this score a criterion comes with improvement suggestions
EVALUATION_SUGGESTION_THRESHOLD = 8

# Scores live on a 1..10 scale: 0 is not a valid judgement, the floor is a
# gravely insufficient performance, not the absence of one.
EVALUATION_MIN_SCORE = 1.0
EVALUATION_MAX_SCORE = 10.0


# What to look at and what to penalize, per criterion. Labels and weights
# are not repeated here: the guide below is stitched onto the canonical ones
# from EVALUATION_CRITERIA, so prompt and scoring can never drift apart.
_CRITERIA_GUIDANCE = {
    "rispetto_fasi_chiamata": (
        "Valuta se l'operatore ha gestito correttamente la struttura della chiamata.\n"
        "Elementi da osservare:\n"
        "- si presenta indicando nome e cognome per intero;\n"
        "- apre il contatto in modo professionale;\n"
        "- comprende progressivamente la casistica del cliente;\n"
        "- gestisce il contatto in modo ordinato, senza perdere il controllo della conversazione;\n"
        "- effettua il rilancio a fine chiamata, ad esempio chiedendo \"posso esserle utile in "
        "altro?\" o formula equivalente;\n"
        "- conclude il contatto in maniera cordiale e professionale.\n"
        "Penalizza se:\n"
        "- manca la presentazione completa;\n"
        "- la chiamata è disordinata;\n"
        "- l'operatore salta passaggi importanti;\n"
        "- non effettua il rilancio finale;\n"
        "- chiude in modo frettoloso, brusco o poco professionale."
    ),
    "empatia": (
        "Valuta la capacità dell'operatore di comprendere lo stato d'animo del cliente e di "
        "gestirlo in modo adeguato.\n"
        "Elementi da osservare:\n"
        "- ascolta il cliente senza interromperlo inutilmente;\n"
        "- riconosce eventuali emozioni, dubbi, frustrazione, urgenza o preoccupazione;\n"
        "- mostra comprensione e disponibilità;\n"
        "- tranquillizza e rassicura il cliente quando necessario;\n"
        "- mantiene equilibrio tra vicinanza relazionale e professionalità;\n"
        "- adatta il tono alla situazione senza diventare eccessivamente confidenziale.\n"
        "Penalizza se:\n"
        "- ignora lo stato d'animo del cliente;\n"
        "- risponde in modo meccanico o freddo;\n"
        "- non rassicura quando sarebbe opportuno;\n"
        "- mostra impazienza;\n"
        "- eccede con confidenza, informalità o familiarità non adeguata al contesto;\n"
        "- perde professionalità nel tentativo di essere empatico."
    ),
    "sicurezza_competenza": (
        "Valuta se l'operatore trasmette sicurezza, competenza e padronanza nella gestione del "
        "contatto.\n"
        "Elementi da osservare:\n"
        "- fornisce risposte con tono sicuro e professionale;\n"
        "- dimostra padronanza delle informazioni comunicate;\n"
        "- evita esitazioni eccessive, risposte vaghe o contraddittorie;\n"
        "- mantiene controllo della conversazione anche in presenza di dubbi, lamentele o "
        "pressione del cliente;\n"
        "- comunica in modo coerente con il livello di complessità della richiesta.\n"
        "Penalizza se:\n"
        "- appare insicuro;\n"
        "- fornisce informazioni poco chiare o non motivate;\n"
        "- cambia versione senza spiegazione;\n"
        "- usa formule eccessivamente vaghe come \"forse\", \"credo\", \"non saprei\" senza "
        "gestire correttamente l'incertezza;\n"
        "- non riesce a guidare il cliente."
    ),
    "appropriatezza_linguaggio": (
        "Valuta la qualità del linguaggio utilizzato dall'operatore.\n"
        "Elementi da osservare:\n"
        "- usa un linguaggio chiaro, corretto e comprensibile;\n"
        "- mantiene un tono cortese e professionale;\n"
        "- trasmette competenza senza risultare eccessivamente tecnico;\n"
        "- adatta il linguaggio al cliente;\n"
        "- utilizza sempre il \"Lei\" nei confronti del cliente, anche se il cliente usa il \"tu\";\n"
        "- può usare lievi locuzioni informali solo se compatibili con il contesto e senza "
        "ridurre la professionalità.\n"
        "Penalizza se:\n"
        "- usa un linguaggio troppo tecnico e poco comprensibile;\n"
        "- usa un linguaggio troppo informale;\n"
        "- dà del \"tu\" al cliente;\n"
        "- usa espressioni poco professionali;\n"
        "- risulta scortese, freddo, sbrigativo o poco chiaro;\n"
        "- non riesce a spiegare concetti complessi in modo semplice.\n"
        "Nota: proprietà di linguaggio, cortesia, chiarezza e professionalità devono essere "
        "considerate anche come elementi trasversali in tutti gli altri criteri, ma il peso "
        "specifico principale di questa dimensione resta quello indicato qui."
    ),
    "identificazione_cliente": (
        "Valuta se l'operatore si accerta correttamente dell'identità del cliente prima di "
        "procedere con la gestione della richiesta.\n"
        "Elementi da osservare:\n"
        "- verifica l'identità del cliente attraverso domande anagrafiche o di controllo adeguate;\n"
        "- comprende che l'identificazione è un passaggio necessario per la sicurezza del cliente;\n"
        "- non procede alla gestione operativa della richiesta se il cliente non è stato "
        "identificato correttamente;\n"
        "- se il cliente manifesta fastidio o lamentela, spiega con calma che le domande servono "
        "a tutelare la sicurezza del cliente stesso;\n"
        "- trova un equilibrio tra accuratezza dell'identificazione e fluidità della conversazione.\n"
        "Criteri di valutazione:\n"
        "- più domande corrette e pertinenti pone, maggiore è il livello di sicurezza;\n"
        "- tuttavia, un numero eccessivo di domande, se non necessario o mal gestito, può "
        "diventare negativo perché può spazientire il cliente;\n"
        "- l'identificazione deve essere completa quanto basta, ma non inutilmente pesante.\n"
        "Penalizza fortemente se:\n"
        "- non identifica il cliente;\n"
        "- procede con informazioni o gestione della richiesta senza adeguata identificazione;\n"
        "- interrompe l'identificazione solo perché il cliente si lamenta;\n"
        "- non spiega il motivo delle domande di sicurezza;\n"
        "- risulta rigido, freddo o burocratico nella fase di identificazione;\n"
        "- eccede con controlli ridondanti e non motivati, causando irritazione evitabile."
    ),
    "comprensione_casistica": (
        "Valuta la capacità dell'operatore di comprendere correttamente il problema del cliente "
        "e fornire risposte pertinenti e orientate alla risoluzione.\n"
        "Elementi da osservare:\n"
        "- pone domande utili e mirate per comprendere la situazione;\n"
        "- approfondisce gli aspetti necessari prima di fornire una risposta;\n"
        "- non dà risposte premature o generiche;\n"
        "- riformula o verifica la comprensione della casistica quando opportuno;\n"
        "- fornisce risposte coerenti con il problema emerso;\n"
        "- orienta la conversazione verso una soluzione, un chiarimento o un prossimo passo "
        "concreto;\n"
        "- distingue correttamente tra ciò che può gestire, ciò che deve verificare e ciò che "
        "eventualmente richiede escalation o ulteriore supporto.\n"
        "Penalizza se:\n"
        "- non comprende davvero la richiesta del cliente;\n"
        "- fa poche domande o domande non pertinenti;\n"
        "- dà risposte generiche;\n"
        "- propone soluzioni non collegate alla problematica;\n"
        "- ignora dettagli importanti forniti dal cliente;\n"
        "- non porta la conversazione verso una gestione chiara della casistica."
    ),
}


def _criteria_guide() -> str:
    """The six criteria, numbered, each with its weight and its guidance."""
    return "\n\n".join(
        f'{i}. {label} (chiave JSON: "{key}")\nPeso: {weight}%\n\n{_CRITERIA_GUIDANCE[key]}'
        for i, (key, label, weight) in enumerate(EVALUATION_CRITERIA, start=1)
    )


def _evaluation_prompt(profile: dict, channel: str = CHANNEL_VOICE) -> str:
    """System prompt for the trainer that judges the operator's performance."""
    nome = str(profile.get("NOME", "") or "").strip()
    cognome = str(profile.get("COGNOME", "") or "").strip()
    cliente = f"{nome} {cognome}".strip() or "il cliente simulato"
    contatto = "chat" if channel == CHANNEL_TEXT else "telefonata"

    contesto = profile_section(profile, [
        ("TIPO_SCENARIO", "Scenario della chiamata"),
        ("DESCRIZIONE_PROBLEMATICA", "Vera causa del problema (ignota al cliente)"),
        ("OBIETTIVO_NASCOSTO", "Obiettivo nascosto della simulazione"),
        ("EMOZIONE_INIZIALE", "Emozione iniziale del cliente"),
        ("GRADO_DIFFICOLTA", "Grado di difficoltà"),
    ])
    pesi = "\n".join(f"- {key}: {weight}%" for key, _, weight in EVALUATION_CRITERIA)
    # The criteria speak of a phone call: on the text channel the same phases
    # apply to the written contact, so the judge is told to read them that way
    # instead of penalizing what the medium itself makes impossible.
    nota_canale = (
        "\nATTENZIONE: questo contatto è avvenuto via CHAT TESTUALE, non al telefono. "
        "Leggi ogni riferimento alla \"chiamata\" come riferito al contatto scritto e non "
        "penalizzare l'operatore per elementi che il canale scritto non prevede, come il "
        "tono di voce.\n"
        if channel == CHANNEL_TEXT
        else ""
    )

    return (
        "Sei un valutatore esperto di qualità conversazionale, customer care e formazione "
        "operatori telefonici.\n\n"
        "Il tuo compito è analizzare l'intera conversazione tra operatore e cliente simulato "
        "e valutare esclusivamente la performance dell'operatore.\n\n"
        "La valutazione deve essere oggettiva, coerente, severa ma costruttiva. Non devi "
        "valutare il comportamento del cliente, se non in funzione di come l'operatore lo ha "
        "gestito.\n\n"
        "Devi basarti solo su ciò che è effettivamente presente nella conversazione. Non "
        "inventare informazioni, non presumere azioni non esplicitate e non premiare "
        "l'operatore per comportamenti non osservabili.\n\n"
        f"La trascrizione è quella di una {contatto} di formazione tra un operatore in "
        f"addestramento e {cliente}, un cliente simulato.\n"
        + nota_canale
        + "\n"
        # The scenario sheet is the trainer's answer key: it says what the case
        # really was, which is the only way to tell a real diagnosis from a
        # plausible guess. It is not evidence of what the operator did.
        + (
            "## CONTESTO DELLA SIMULAZIONE (solo come riferimento)\n"
            f"{contesto}\n"
            "Questo contesto serve unicamente a farti capire quale fosse la vera casistica e "
            "quanto l'operatore ci si sia avvicinato. Non è parte della conversazione: non "
            "attribuire all'operatore nulla che non abbia detto e non penalizzarlo per "
            "informazioni che il cliente non gli ha mai fornito.\n\n"
            if contesto
            else ""
        )
        + "## CRITERI DI VALUTAZIONE\n\n"
        f"{_criteria_guide()}\n\n"
        "## REGOLE GENERALI DI VALUTAZIONE\n"
        "La valutazione deve considerare l'intera conversazione, non singole frasi isolate.\n"
        "Attribuisci punteggi alti solo quando il comportamento dell'operatore è chiaramente "
        "osservabile nella conversazione.\n"
        "Non assegnare punteggi massimi se:\n"
        "- il comportamento positivo è solo parziale;\n"
        "- alcune fasi sono implicite ma non espresse;\n"
        "- l'operatore arriva alla soluzione ma con gestione debole, disordinata o poco "
        "professionale.\n\n"
        "Usa questa scala orientativa:\n"
        "1-2 = performance gravemente insufficiente, con errori rilevanti o mancata gestione "
        "del criterio.\n"
        "3-4 = performance insufficiente, con diversi errori o omissioni importanti.\n"
        "5-6 = performance parziale o appena sufficiente, con elementi corretti ma anche "
        "lacune evidenti.\n"
        "7-8 = buona performance, con gestione solida e pochi margini di miglioramento.\n"
        "9-10 = performance eccellente, completa, professionale, efficace e coerente in tutto "
        "il criterio.\n\n"
        f"Il punteggio complessivo deve rispettare i pesi:\n{pesi}\n"
        "Il punteggio complessivo deve essere compreso tra 1 e 10, arrotondato a una cifra "
        "decimale.\n\n"
        "## ISTRUZIONI SUI CAMPI\n"
        f"- \"score\" deve essere sempre un numero da {EVALUATION_MIN_SCORE:.0f} a "
        f"{EVALUATION_MAX_SCORE:.0f}, con massimo una cifra decimale.\n"
        "- \"comment\" deve spiegare in modo sintetico il motivo del punteggio, citando quando "
        f"utile momenti specifici della {contatto}.\n"
        "- \"suggestions\" deve contenere suggerimenti concreti e utili se il punteggio del "
        f"criterio è inferiore a {EVALUATION_SUGGESTION_THRESHOLD}.\n"
        f"- Se il punteggio del criterio è pari o superiore a {EVALUATION_SUGGESTION_THRESHOLD}, "
        "\"suggestions\" può essere una stringa vuota.\n"
        "- \"overall_feedback\" deve sintetizzare i principali punti di forza e le principali "
        "aree di miglioramento dell'operatore.\n"
        "- Scrivi tutto in italiano.\n\n"
        "## FORMATO DELLA RISPOSTA\n"
        "Restituisci esclusivamente un JSON valido, senza testo aggiuntivo prima o dopo, con "
        "questa struttura esatta:\n"
        '{"overall_score": 0.0, "overall_feedback": "", "criteria": '
        '{"<chiave criterio>": {"score": 0.0, "comment": "", "suggestions": ""}}}\n'
        "L'oggetto \"criteria\" deve contenere tutte e sei le chiavi elencate sopra."
    )


def _clamp_score(value) -> float:
    score = float(value)  # raises TypeError/ValueError on junk → retried
    return max(EVALUATION_MIN_SCORE, min(EVALUATION_MAX_SCORE, round(score, 1)))


def _normalize_evaluation(raw: dict) -> dict:
    """Validate/normalize the model's JSON into the stored result shape.

    The model is asked for an overall score too, but the stored one is
    recomputed here as the weighted average of the six criteria: it is the
    only way to guarantee the weights are actually respected, and it keeps
    two evaluations comparable even when the judge is feeling generous.
    """
    raw_criteria = raw.get("criteria") or {}
    criteria = []
    for key, label, weight in EVALUATION_CRITERIA:
        entry = raw_criteria.get(key) or {}
        score = _clamp_score(entry.get("score"))
        suggestions = str(entry.get("suggestions") or "").strip() or None
        if score >= EVALUATION_SUGGESTION_THRESHOLD:
            suggestions = None
        criteria.append({
            "key": key,
            "label": label,
            "weight": weight,
            "score": score,
            "comment": str(entry.get("comment") or "").strip(),
            "suggestions": suggestions,
        })

    total_weight = sum(weight for _, _, weight in EVALUATION_CRITERIA)
    overall = round(
        sum(c["score"] * c["weight"] for c in criteria) / total_weight, 1
    )

    return {
        "overall_score": overall,
        # Stored (and served) as "summary": the API and the UI have always
        # called this field that way, only the prompt renamed it.
        "summary": str(raw.get("overall_feedback") or raw.get("summary") or "").strip(),
        "criteria": criteria,
    }


async def evaluate_conversation(
    messages_history: list[dict],
    avatar_profile: dict,
    channel: str = CHANNEL_VOICE,
) -> dict:
    """
    Judge the operator's performance over the whole conversation with a
    reasoning-capable OpenAI model (OPENAI_EVAL_MODEL).

    The criteria are the same for a call and a chat; the channel only tells
    the trainer which medium it is reading, so the feedback speaks of the
    right one.

    Returns {"overall_score": float, "summary": str, "criteria": [...]}
    where each criterion carries score, weight, comment and (only when the
    score is below EVALUATION_SUGGESTION_THRESHOLD) improvement suggestions.
    The overall score is the weighted average of the criteria, recomputed
    here rather than taken from the model. Raises RuntimeError on failure.
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

    contatto = "CHAT" if channel == CHANNEL_TEXT else "CHIAMATA"
    messages = [
        {"role": "system", "content": _evaluation_prompt(avatar_profile or {}, channel)},
        {"role": "user", "content": f"## TRASCRIZIONE DELLA {contatto}\n{transcript}"},
    ]

    last_error: Exception | None = None
    for model in _eval_candidate_models():
        try:
            response = await async_client.chat.completions.create(
                model=model,
                messages=messages,
                # Six criteria with comment and suggestions, plus the
                # reasoning tokens that "high" effort spends before writing
                # a single one of them: a tight budget here comes back as
                # truncated JSON, not as a shorter evaluation.
                max_completion_tokens=6144,
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
