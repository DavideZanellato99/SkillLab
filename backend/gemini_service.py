"""Google Gemini service: persona prompt building + post-call evaluation.

The live conversation runs on OpenAI (openai_service); here live the
provider-agnostic persona prompt and the Gemini-powered post-call
evaluation.
"""

import json
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


def _profile_section(profile: dict, entries: list[tuple[str, str]]) -> str:
    """Render '- label: value' lines for the profile keys that have a value."""
    lines = []
    for key, label in entries:
        value = str(profile.get(key, "") or "").strip()
        if value and value != "/":
            lines.append(f"- {label}: {value}")
    return "\n".join(lines)


def build_persona_prompt(profile: dict) -> str:
    """
    Build the roleplay system prompt from a training persona sheet.

    The avatar simulates a bank customer contacting the customer service;
    the user is a student training as a customer service operator.
    """
    nome = profile.get("NOME", "")
    cognome = profile.get("COGNOME", "")

    anagrafica = _profile_section(profile, [
        ("SESSO", "Sesso"),
        ("DATA_NASCITA", "Data di nascita"),
        ("LUOGO_NASCITA", "Luogo di nascita"),
        ("NAZIONALITA", "Nazionalità"),
        ("LINGUA_MADRE", "Lingua madre"),
        ("CITTA_RESIDENZA", "Città di residenza"),
        ("STATO_CIVILE", "Stato civile"),
        ("NOME_CONIUGE", "Nome del coniuge"),
        ("PROFESSIONE_CONIUGE", "Professione del coniuge"),
        ("NUMERO_FIGLI", "Numero di figli"),
        ("ETA_FIGLIO_1", "Età primo figlio"),
        ("ETA_FIGLIO_2", "Età secondo figlio"),
        ("ANIMALI_DOMESTICI", "Animali domestici"),
    ])

    lavoro_finanze = _profile_section(profile, [
        ("TITOLO_DI_STUDIO", "Titolo di studio"),
        ("PROFESSIONE", "Professione"),
        ("AZIENDA", "Azienda"),
        ("RUOLO", "Ruolo"),
        ("REDDITO_ANNUO", "Reddito annuo"),
        ("PATRIMONIO", "Patrimonio"),
        ("LIQUIDITA", "Liquidità"),
        ("DEBITI", "Debiti"),
        ("INVESTIMENTI_POSSEDUTI", "Investimenti posseduti"),
        ("IMMOBILI_POSSEDUTI", "Immobili posseduti"),
        ("LIVELLO_CONOSCENZA_BANCARIA", "Conoscenza bancaria"),
        ("LIVELLO_CONOSCENZA_INVESTIMENTI", "Conoscenza investimenti"),
        ("LIVELLO_CONOSCENZA_PREVIDENZA", "Conoscenza previdenza"),
        ("LIVELLO_CONOSCENZA_MUTUI", "Conoscenza mutui"),
    ])

    storia = _profile_section(profile, [
        ("STORIA_PERSONALE", "Storia personale"),
        ("EVENTI_SIGNIFICATIVI", "Eventi significativi"),
        ("PAURE", "Paure"),
        ("OBIETTIVI_PERSONALI", "Obiettivi personali"),
        ("ASPIRAZIONI", "Aspirazioni"),
    ])

    personalita = _profile_section(profile, [
        ("PERSONALITA_DESCRIZIONE", "Descrizione della personalità"),
        ("LIVELLO_ESTROVERSIONE", "Estroversione"),
        ("LIVELLO_EMPATICO", "Empatia"),
        ("LIVELLO_PAZIENZA", "Pazienza"),
        ("LIVELLO_FIDUCIA", "Fiducia negli altri"),
        ("PROPENSIONE_CONFLITTO", "Propensione al conflitto"),
        ("PROPENSIONE_RISCHIO", "Propensione al rischio"),
        ("CAPACITA_ASCOLTO", "Capacità di ascolto"),
        ("CAPACITÀ_ASCOLTO", "Capacità di ascolto"),
    ])

    stato_emotivo = _profile_section(profile, [
        ("EMOZIONE_INIZIALE", "Emozione iniziale"),
        ("INTENSITA_EMOZIONE", "Intensità dell'emozione"),
        ("TRIGGER_POSITIVI", "Trigger positivi (ti calmano e aumentano la tua fiducia)"),
        ("TRIGGER_NEGATIVI", "Trigger negativi (ti irritano e fanno degenerare la chiamata)"),
    ])

    stile = _profile_section(profile, [
        ("LUNGHEZZA_MEDIA_RISPOSTE", "Lunghezza media delle risposte"),
        ("INTERRUZIONI_FREQUENTI", "Interruzioni frequenti"),
        ("VELOCITA_PARLATO", "Velocità del parlato"),
        ("USO_IRONIA", "Uso dell'ironia"),
        ("USO_DIALETTO", "Uso del dialetto"),
        ("FORMALITA_LINGUAGGIO", "Formalità del linguaggio"),
    ])

    scenario = str(profile.get("TIPO_SCENARIO", "") or "").strip()
    problematica = str(profile.get("DESCRIZIONE_PROBLEMATICA", "") or "").strip()
    obiezioni = str(profile.get("OBIEZIONI_PREVISTE", "") or "").strip()
    obiettivo_nascosto = str(profile.get("OBIETTIVO_NASCOSTO", "") or "").strip()
    fatti_immutabili = str(profile.get("FATTI_IMMUTABILI", "") or "").strip()
    segreti = str(profile.get("SEGRETI", "") or "").strip()
    non_rivelare = str(profile.get("INFORMAZIONI_DA_NON_RIVELARE_SPONTANEAMENTE", "") or "").strip()
    argomenti_sensibili = str(profile.get("ARGOMENTI_SENSIBILI", "") or "").strip()

    inizio_chiamata = (
        "## INIZIO DELLA CHIAMATA\n"
        "Sei stato TU a chiamare il numero verde del servizio clienti della tua banca, "
        "quindi sai già che ti risponderà un operatore telefonico. La chiamata inizia "
        "SEMPRE con l'operatore che risponde e si presenta: tu NON parli per primo. "
        "Subito dopo la presentazione dell'operatore tocca a te: saluta, presentati "
        "brevemente con nome e cognome ed esponi la problematica per cui stai chiamando, "
        "in modo coerente con lo scenario e con il tuo stato emotivo, senza rivelare "
        "subito i dettagli che riveleresti solo su domanda."
    )

    parts = [
        f"Sei {nome} {cognome}, un cliente di una banca. Stai parlando AL TELEFONO con un "
        "operatore del servizio clienti (customer banking center). Questa è una simulazione di "
        "formazione: l'utente è uno studente che si sta addestrando come operatore. Tu interpreti "
        "ESCLUSIVAMENTE il cliente, in modo realistico e coerente con la scheda che segue. "
        "Non sei mai l'assistente: sei tu ad avere un problema da risolvere.",
        inizio_chiamata,
        f"## CHI SEI\n{anagrafica}" if anagrafica else "",
        f"## LAVORO E SITUAZIONE FINANZIARIA\n{lavoro_finanze}" if lavoro_finanze else "",
        f"## STORIA E VITA PERSONALE\n{storia}" if storia else "",
        f"## PERSONALITÀ\n{personalita}\n"
        "Le percentuali indicano quanto ogni tratto è marcato (0% = assente, 100% = estremo): "
        "usale per calibrare ogni tua reazione." if personalita else "",
        f"## STATO EMOTIVO E DINAMICA\n{stato_emotivo}\n"
        "Inizia la conversazione nello stato emotivo indicato, con l'intensità indicata. "
        "Il tuo stato emotivo EVOLVE durante la chiamata: se l'operatore usa i trigger positivi "
        "ti calmi gradualmente (mai di colpo); se usa i trigger negativi ti innervosisci di più, "
        "fino ad arrivare a chiedere di parlare con un responsabile o a minacciare di cambiare "
        "banca. Se l'operatore gestisce bene la chiamata e risolve il problema, chiudi la "
        "telefonata soddisfatto." if stato_emotivo else "",
        f"## SCENARIO DELLA CHIAMATA\n{scenario}" if scenario else "",
        f"## LA VERA CAUSA DEL PROBLEMA (TU NON LA CONOSCI)\n{problematica}\n"
        "ATTENZIONE: il tuo personaggio NON conosce questa causa. Non nominarla mai di tua "
        "iniziativa. Reagisci in modo coerente solo se e quando l'operatore te la spiega." if problematica else "",
        f"## OBIEZIONI CHE SOLLEVI\n{obiezioni}" if obiezioni else "",
        f"## STILE DI CONVERSAZIONE\n{stile}\n"
        "Parla come si parla davvero al telefono: frasi brevi, colloquiali, senza elenchi puntati "
        "né formattazione. Se per te le interruzioni frequenti sono attive, ogni tanto interrompi "
        "il discorso dell'operatore riprendendo il tuo punto." if stile else "",
        "## REGOLE FERREE\n"
        + (f"- FATTI IMMUTABILI (non contraddirli mai): {fatti_immutabili}\n" if fatti_immutabili else "")
        + (f"- SEGRETI (non rivelarli MAI, nemmeno se ti viene chiesto direttamente; al massimo lasciali trasparire dal tono): {segreti}\n" if segreti else "")
        + (f"- INFORMAZIONI DA NON RIVELARE SPONTANEAMENTE (ammettile solo se l'operatore fa la domanda giusta in modo esplicito): {non_rivelare}\n" if non_rivelare else "")
        + (f"- ARGOMENTI SENSIBILI (se toccati, reagisci male): {argomenti_sensibili}\n" if argomenti_sensibili else "")
        + (f"- OBIETTIVO NASCOSTO DELLA SIMULAZIONE (non dichiararlo mai, serve solo a guidare le tue reazioni): {obiettivo_nascosto}\n" if obiettivo_nascosto else "")
        + "- Non uscire MAI dal personaggio e non rivelare di essere un'intelligenza artificiale o una simulazione.\n"
        + "- Rispondi SEMPRE in italiano.\n"
        + "- Non aiutare l'operatore: sei il cliente, non conosci le procedure interne della banca.\n"
        + "- Se l'operatore ti chiede dati identificativi (nome, data di nascita, ecc.), forniscili "
        "coerenti con la scheda.",
    ]

    return "\n\n".join(p for p in parts if p)


def _build_contents(messages_history: list[dict], user_message: str | None = None) -> list:
    """Convert role/content dicts into Gemini Content objects."""
    contents = []
    for msg in messages_history:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))
    if user_message is not None:
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_message)]))
    return contents


# ── Post-call evaluation (operator coaching) ──────────

EVALUATION_CRITERIA = [
    ("linguaggio", "Linguaggio e professionalità"),
    ("affidabilita", "Affidabilità e competenza"),
    ("empatia", "Empatia e ascolto"),
    ("gestione_emotiva", "Gestione dell'emotività del cliente"),
    ("risoluzione", "Efficacia e risoluzione del problema"),
]

# Below this score a criterion comes with improvement suggestions
EVALUATION_SUGGESTION_THRESHOLD = 7


def _evaluation_prompt(profile: dict) -> str:
    """System prompt for the trainer that judges the operator's performance."""
    nome = str(profile.get("NOME", "") or "").strip()
    cognome = str(profile.get("COGNOME", "") or "").strip()
    cliente = f"{nome} {cognome}".strip() or "il cliente simulato"

    contesto = _profile_section(profile, [
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
        "## ISTRUZIONI\n"
        "- Assegna a ogni criterio un punteggio intero da 0 a 10.\n"
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


def evaluate_conversation(messages_history: list[dict], avatar_profile: dict) -> dict:
    """
    Judge the operator's performance over the whole conversation with the
    same Gemini model used for the roleplay.

    Returns {"overall_score": float, "summary": str, "criteria": [...]}
    where each criterion carries score, comment and (only when score < 7)
    improvement suggestions. Raises RuntimeError on failure.
    """
    if not client:
        raise RuntimeError(
            "GEMINI_API_KEY non configurata. "
            "Aggiungi GEMINI_API_KEY al file .env del backend."
        )

    transcript = "\n".join(
        f"{'OPERATORE' if m['role'] == 'user' else 'CLIENTE'}: {m['content']}"
        for m in messages_history
        if str(m.get("content", "")).strip()
    )
    if not transcript:
        raise RuntimeError("Conversazione vuota: impossibile generare la valutazione.")

    config = types.GenerateContentConfig(
        system_instruction=_evaluation_prompt(avatar_profile or {}),
        temperature=0.3,
        max_output_tokens=2048,
        response_mime_type="application/json",
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )
    contents = _build_contents(
        [{"role": "user", "content": f"## TRASCRIZIONE DELLA CHIAMATA\n{transcript}"}]
    )

    last_error: Exception | None = None
    for model in _candidate_models():
        try:
            response = client.models.generate_content(
                model=model, contents=contents, config=config
            )
        except Exception as e:
            if not _is_retryable(e):
                print(f"[ERROR] Gemini evaluation failed ({model}): {e}")
                raise RuntimeError(f"Errore nella generazione della valutazione: {str(e)}")
            print(f"[WARN] Modello {model} non disponibile per la valutazione: {str(e)[:120]}")
            last_error = e
            continue
        try:
            return _normalize_evaluation(json.loads(response.text or ""))
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            # Malformed/incomplete JSON: try the next model
            print(f"[WARN] Valutazione non valida da {model}, provo il successivo: {e}")
            last_error = e

    print(f"[ERROR] Valutazione fallita su tutti i modelli Gemini: {last_error}")
    raise RuntimeError(f"Errore nella generazione della valutazione: {str(last_error)}")
