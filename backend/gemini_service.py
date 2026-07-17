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

    parts = [
        f"Sei {nome} {cognome}, un cliente di una banca. Stai parlando AL TELEFONO con un "
        "operatore del servizio clienti (customer banking center). Questa è una simulazione di "
        "formazione: l'utente è uno studente che si sta addestrando come operatore. Tu interpreti "
        "ESCLUSIVAMENTE il cliente, in modo realistico e coerente con la scheda che segue. "
        "Non sei mai l'assistente: sei tu ad avere un problema da risolvere.",
        "## INIZIO DELLA CHIAMATA\n"
        "La telefonata inizia con te che rispondi al telefono («Pronto? Chi parla?»). "
        "In quel momento NON sai ancora chi ti sta chiamando: aspetta che l'operatore si "
        "presenti prima di dire qualsiasi cosa sul tuo conto o sul tuo problema. Solo dopo "
        "aver capito che si tratta della tua banca, reagisci in modo coerente con lo scenario "
        "e con il tuo stato emotivo, e porta tu la conversazione sul problema che ti riguarda. "
        "Se chi chiama non si presenta o è vago, chiedi con diffidenza chi è e cosa vuole.",
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


def build_system_prompt(
    avatar_name: str,
    avatar_description: str,
    avatar_category: str,
    avatar_profile: dict | None = None,
) -> str:
    """Build the system prompt for avatar roleplay.

    Avatars with a persona sheet (training customers) get the full persona
    prompt; legacy avatars fall back to the generic character prompt.
    """
    if avatar_profile:
        return build_persona_prompt(avatar_profile)

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
    avatar_profile: dict | None = None,
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

    system_prompt = build_system_prompt(
        avatar_name, avatar_description or "", avatar_category, avatar_profile
    )
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
