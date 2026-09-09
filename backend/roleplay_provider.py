"""Chi recita l'avatar dal vivo, e da quale fornitore.

Il roleplay è l'unica chiamata al modello che qualcuno aspetta in linea, ed è
anche l'unica per cui il fornitore sia una scelta aperta: la valutazione e gli
embedding restano su OpenAI (`openai_service`), la prima perché nessuno è in
attesa mentre ragiona, i secondi perché i vettori di due fornitori diversi non
si possono confrontare fra loro.

`ROLEPLAY_PROVIDER` sceglie quale dei due recita, e serve a metterli a
confronto sulle stesse chiamate invece che sulla carta: quello che li separa è
il tempo fra la richiesta e la prima parola, e quel numero si legge in
`turn_metrics` (segmento `llm_ttft`), non nei benchmark pubblicati, perché
dipende dal prompt della persona e dalla cache del prefisso più che dal
modello.

Gemini parla lo stesso protocollo delle Chat Completions da un endpoint
dedicato, quindi qui cambia il cliente e non il modo di chiamarlo: lo
streaming, il giro sui modelli di riserva e la lettura dei pezzi restano
quelli di `openai_service`. Le differenze vere sono due, il nome del tetto sui
token e il modo di spegnere il ragionamento, ed è tutto quello che questo file
sa in più.

Solo il fornitore scelto viene preteso dal `.env`: chi resta su OpenAI non
deve configurare Gemini per far partire il backend, e viceversa.
"""

import os
import re

from dotenv import load_dotenv
from openai import AsyncOpenAI

import tls_setup  # noqa: F401  (TLS via OS store: must precede the openai import)

load_dotenv()

# L'indirizzo dell'endpoint compatibile di Google. Non è configurazione: è una
# proprietà del fornitore, cambia con lui e non con l'installazione, come gli
# indirizzi in elevenlabs_service.
_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

# Quanto si aspetta il fornitore prima di dichiarare persa una richiesta.
#
# Senza questo la libreria usa il suo default, che è dell'ordine dei dieci
# minuti: pensato per uno script che elabora un file, non per qualcuno che
# aspetta al telefono. Il guaio non è la richiesta persa, è che perderla
# richiede più tempo di quanto la conversazione ne abbia. Passati venti
# secondi senza una parola la battuta è comunque rovinata, e arrendersi in
# fretta lascia almeno provare il modello di riserva mentre la chiamata è
# ancora viva. Sul flusso, che è il caso normale, questo tetto vale fra un
# pezzo e il successivo e non sull'intera risposta: un modello che parla
# lentamente non viene interrotto, uno che si è piantato sì.
LIVE_TIMEOUT_SECONDS = 20
# Nessun ritentativo dal vivo: due tentativi da venti secondi fanno quaranta
# secondi di silenzio in una conversazione parlata, e a quel punto non c'è più
# niente da salvare. Un sovraccarico passa comunque al modello di riserva, che
# è un'altra cosa dal ritentare lo stesso modello.
LIVE_MAX_RETRIES = 0

# La temperatura del roleplay: alta, perché un avatar che ripete la stessa
# battuta a due studenti diversi non allena nessuno. Non sta nel .env perché
# non è una manopola da girare per installazione, è una proprietà
# dell'esercizio.
ROLEPLAY_TEMPERATURE = 0.9

PROVIDER_OPENAI = "openai"
PROVIDER_GEMINI = "gemini"
_PROVIDERS = (PROVIDER_OPENAI, PROVIDER_GEMINI)

ROLEPLAY_PROVIDER = os.getenv("ROLEPLAY_PROVIDER")
if ROLEPLAY_PROVIDER not in _PROVIDERS:
    raise RuntimeError(
        "ROLEPLAY_PROVIDER non configurato o non riconosciuto "
        f"(atteso uno fra {', '.join(_PROVIDERS)}). Aggiungilo al file .env del backend."
    )


def _candidates(model_var: str, fallback_var: str) -> list[str]:
    """Il modello primario seguito dalle sue riserve, senza ripetizioni.

    Le riserve si provano nell'ordine scritto quando il primario è saturo. Un
    `.env` che ripete il primario fra le riserve non lo fa provare due volte:
    aspettare due volte lo stesso sovraccarico è tempo tolto alla chiamata.
    """
    primary = os.getenv(model_var)
    if not primary:
        raise RuntimeError(f"{model_var} non configurato. Aggiungilo al file .env del backend.")
    fallbacks = [m.strip() for m in os.getenv(fallback_var, "").split(",") if m.strip()]
    return [primary] + [m for m in fallbacks if m != primary]


# ── I parametri, che cambiano da famiglia a famiglia ──────────────────

# La versione minore della famiglia GPT-5, quando è quella: "gpt-5-mini" dà 0,
# "gpt-5.4-nano" dà 4, "gpt-4.1-mini" dà None. Serve una versione e non un
# prefisso letterale perché la regola qui sotto cambia fra la 5.0 e le
# successive, e un letterale come "gpt-5.1" manderebbe ogni versione uscita
# dopo sul ramo sbagliato senza dirlo.
_GPT5 = re.compile(r"^gpt-5(?:\.(\d+))?\b")


def _gpt5_minor(model: str) -> int | None:
    match = _GPT5.match(model)
    if not match:
        return None
    return int(match.group(1) or 0)


def _openai_kwargs(model: str) -> dict:
    """I parametri di campionamento per un modello OpenAI.

    Tre casi, e la differenza fra i primi due costa la prima parola di ogni
    battuta. Dalla 5.1 in avanti il ragionamento si spegne del tutto
    (`none`), e a quel punto la temperatura torna accettata: è la
    configurazione giusta per la voce, dove ogni token di ragionamento è
    silenzio prima che il TTS possa cominciare. La 5.0 non ha `none`, il suo
    minimo è `minimal`, e lì la temperatura resta vietata. Tutto il resto,
    gpt-4.1 e precedenti, non ragiona affatto e prende solo la temperatura.
    """
    minor = _gpt5_minor(model)
    if minor is None:
        return {"temperature": ROLEPLAY_TEMPERATURE}
    if minor == 0:
        return {"reasoning_effort": "minimal"}
    return {"reasoning_effort": "none", "temperature": ROLEPLAY_TEMPERATURE}


def _gemini_kwargs(model: str) -> dict:
    """I parametri di campionamento per un modello Gemini.

    Sui 2.5 il ragionamento si spegne con lo stesso `reasoning_effort: none`
    dei GPT-5.1, che l'endpoint compatibile traduce in un budget di pensiero
    nullo. Sui 3.x non si può, e non è una richiesta ignorata: è un 400, e
    quindi una chiamata persa. Nemmeno il budget di pensiero passa da qui,
    l'endpoint compatibile non conosce quel campo.

    Non spegnerlo si è rivelato meno grave di quanto la differenza suggerisca.
    Misurato su gemini-3.5-flash-lite senza toccare niente, la prima parola
    arriva intorno ai 600 ms, cioè meno della metà di quanto ci metta
    gpt-4.1-mini dalla stessa rete: il pensiero di un modello leggero costa
    poco, e il resto lo recupera altrove.
    """
    kwargs = {"temperature": ROLEPLAY_TEMPERATURE}
    if model.startswith("gemini-2.5"):
        kwargs["reasoning_effort"] = "none"
    return kwargs


# ── Il fornitore scelto ───────────────────────────────────────────────

if ROLEPLAY_PROVIDER == PROVIDER_GEMINI:
    _API_KEY_VAR = "GEMINI_API_KEY"
    _api_key = os.getenv(_API_KEY_VAR)
    _client = (
        AsyncOpenAI(
            api_key=_api_key,
            base_url=_GEMINI_BASE_URL,
            timeout=LIVE_TIMEOUT_SECONDS,
            max_retries=LIVE_MAX_RETRIES,
        )
        if _api_key
        else None
    )
    _models = _candidates("GEMINI_MODEL", "GEMINI_FALLBACK_MODELS")
    _kwargs = _gemini_kwargs
    # L'endpoint compatibile di Google riconosce il nome storico del tetto sui
    # token, non quello nuovo: chiedergli `max_completion_tokens` vuol dire una
    # risposta troncata dove decide lui invece che dove decidiamo noi.
    _max_tokens_param = "max_tokens"
else:
    _API_KEY_VAR = "OPENAI_API_KEY"
    _api_key = os.getenv(_API_KEY_VAR)
    _client = (
        AsyncOpenAI(
            api_key=_api_key,
            timeout=LIVE_TIMEOUT_SECONDS,
            max_retries=LIVE_MAX_RETRIES,
        )
        if _api_key
        else None
    )
    _models = _candidates("OPENAI_MODEL", "OPENAI_FALLBACK_MODELS")
    _kwargs = _openai_kwargs
    _max_tokens_param = "max_completion_tokens"


def roleplay_client() -> AsyncOpenAI | None:
    """Il cliente del fornitore scelto, o None se manca la sua chiave.

    None invece di un errore all'avvio perché è quello che il backend faceva
    già senza `OPENAI_API_KEY`: si avvia, e a lamentarsi è la prima chiamata
    che ne ha bisogno davvero, dicendo quale variabile manca.
    """
    return _client


def roleplay_models() -> list[str]:
    """Il primario e le sue riserve, nell'ordine in cui provarli."""
    return list(_models)


def roleplay_completion_kwargs(model: str, max_tokens: int) -> dict:
    """Tutto quello che cambia da fornitore a fornitore, in un posto solo.

    Il tetto sui token entra qui e non nei chiamanti proprio perché il suo
    nome è una di quelle differenze: chi chiama sa quante parole vuole, non
    come si chiama il parametro che le limita.
    """
    return {_max_tokens_param: max_tokens, **_kwargs(model)}


def missing_key_error() -> RuntimeError:
    """L'errore di chiave mancante, che nomina la variabile del fornitore attivo."""
    return RuntimeError(
        f"{_API_KEY_VAR} non configurata. Aggiungi {_API_KEY_VAR} al file .env del backend."
    )
