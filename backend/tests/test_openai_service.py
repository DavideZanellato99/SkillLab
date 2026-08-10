"""Il giro attorno alle chiamate a OpenAI: riserve, guasti e attese.

La normalizzazione della valutazione sta in ``test_evaluation``; qui c'è
tutto quello che le gira attorno, cioè le decisioni che l'app prende quando
il modello non risponde come dovrebbe. Sono decisioni che nessuno vede finché
non capita, ed è il motivo per cui vanno provate: un sovraccarico di OpenAI
si presenta a chi sta parlando come un avatar che ammutolisce, e il modo di
non farlo succedere è passare al modello di riserva prima di arrendersi.

Il cliente è finto e non è un limite dei test: la regola da verificare è
**quando** si cambia modello e quando invece è troppo tardi per farlo, e
quella non dipende da chi risponde dall'altra parte. La riserva vale su un
sovraccarico, non su un errore di programmazione; e non vale più appena una
parola è uscita, perché una risposta non si può ricominciare a metà con
un'altra voce.
"""

import asyncio
import json
from types import SimpleNamespace

import pytest

import openai_service
from openai_service import (
    EVALUATION_CRITERIA,
    EVALUATION_SUGGESTION_THRESHOLD,
    _candidate_models,
    _clamp_score,
    _completion_kwargs,
    _eval_candidate_models,
    _eval_completion_kwargs,
    _evaluation_prompt,
    _is_retryable,
    _normalize_evaluation,
    embed_texts,
    eval_json_completion,
    evaluate_conversation,
    prewarm_roleplay,
    stream_avatar_response,
)
from persona_prompt import CHANNEL_TEXT, CHANNEL_VOICE


class _Sovraccarico(Exception):
    """Come si presenta un modello saturo: la libreria porta lo stato HTTP."""

    status_code = 429


def _risposta(contenuto: str):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=contenuto))])


class _ClienteFinto:
    """Un cliente OpenAI che risponde quello che gli si dice, per modello.

    ``esiti`` è una voce per chiamata, nell'ordine: una stringa è il JSON che
    torna indietro, un'eccezione è quello che solleva.
    """

    def __init__(self, esiti):
        self.esiti = list(esiti)
        self.modelli_chiamati: list[str] = []
        self.opzioni: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        self.embeddings = SimpleNamespace(create=self._embed)

    def with_options(self, **kwargs):
        self.opzioni.append(kwargs)
        return self

    async def _create(self, *, model, **kwargs):
        self.modelli_chiamati.append(model)
        esito = self.esiti.pop(0)
        if isinstance(esito, Exception):
            raise esito
        return _risposta(esito)

    async def _embed(self, *, model, input):
        self.modelli_chiamati.append(model)
        esito = self.esiti.pop(0)
        if isinstance(esito, Exception):
            raise esito
        return esito


@pytest.fixture
def modelli(monkeypatch):
    """Il primario e la sua riserva, senza dipendere dal .env di chi esegue."""
    monkeypatch.setattr(openai_service, "OPENAI_EVAL_MODEL", "modello-primario")
    monkeypatch.setattr(openai_service, "OPENAI_EVAL_FALLBACK_MODELS", ["modello-riserva"])
    monkeypatch.setattr(openai_service, "OPENAI_MODEL", "live-primario")
    monkeypatch.setattr(openai_service, "OPENAI_FALLBACK_MODELS", ["live-riserva"])


@pytest.fixture
def cliente(monkeypatch):
    def _installa(esiti):
        finto = _ClienteFinto(esiti)
        monkeypatch.setattr(openai_service, "async_client", finto)
        return finto

    return _installa


@pytest.fixture
def senza_chiave(monkeypatch):
    """Il backend avviato senza OPENAI_API_KEY: il cliente resta spento."""
    monkeypatch.setattr(openai_service, "async_client", None)


# ── Quando vale la pena riprovare ─────────────────────────────────────


@pytest.mark.parametrize("status", [429, 500, 502, 503])
def test_un_modello_saturo_merita_la_riserva(status):
    errore = Exception("qualcosa")
    errore.status_code = status
    assert _is_retryable(errore) is True


@pytest.mark.parametrize(
    "messaggio",
    ["Error code: 429", "rate limit exceeded", "the engine is currently overloaded", "502 Bad"],
)
def test_il_sovraccarico_si_riconosce_anche_solo_dal_messaggio(messaggio):
    """Non tutte le eccezioni della libreria portano lo stato HTTP: il testo
    è l'ultima rete, e senza di essa un sovraccarico diventerebbe un errore
    definitivo."""
    assert _is_retryable(Exception(messaggio)) is True


def test_un_errore_di_programmazione_non_si_ritenta():
    """Riprovarlo sul modello di riserva vorrebbe dire aspettare due volte
    per lo stesso errore."""
    errore = Exception("Unsupported parameter: temperature")
    errore.status_code = 400
    assert _is_retryable(errore) is False
    assert _is_retryable(TypeError("argomento mancante")) is False


# ── I parametri, che cambiano da modello a modello ────────────────────


def test_i_modelli_di_ragionamento_non_accettano_la_temperatura():
    """La rifiutano con un errore, quindi non è una preferenza: è la
    differenza fra una risposta e un 400."""
    assert _completion_kwargs("gpt-5.1-mini") == {"reasoning_effort": "none"}
    assert _completion_kwargs("gpt-5-mini") == {"reasoning_effort": "minimal"}
    assert _completion_kwargs("gpt-4o") == {"temperature": 0.9}


def test_la_valutazione_ragiona_quanto_serve_invece_di_correre():
    """Dal vivo il ragionamento è tempo tolto alla conversazione; qui nessuno
    è in linea, e un voto calibrato vale l'attesa."""
    assert _eval_completion_kwargs("gpt-5") == {"reasoning_effort": "high"}
    assert _eval_completion_kwargs("gpt-4o") == {"temperature": 0.3}


def test_il_primario_si_prova_per_primo_e_una_volta_sola(modelli, monkeypatch):
    assert _candidate_models() == ["live-primario", "live-riserva"]
    assert _eval_candidate_models() == ["modello-primario", "modello-riserva"]

    # Un .env che ripete il primario fra le riserve non lo fa provare due volte
    monkeypatch.setattr(openai_service, "OPENAI_FALLBACK_MODELS", ["live-primario", "altro"])
    assert _candidate_models() == ["live-primario", "altro"]


# ── La risposta in JSON ───────────────────────────────────────────────


def _json_completion():
    return asyncio.run(
        eval_json_completion(
            [{"role": "system", "content": "sistema"}, {"role": "user", "content": "utente"}],
            max_completion_tokens=100,
            normalize=lambda raw: raw["valore"],
            what="prova",
        )
    )


def test_senza_chiave_configurata_lo_dice_invece_di_provarci(senza_chiave):
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        _json_completion()


def test_la_risposta_buona_passa_dalla_normalizzazione(modelli, cliente):
    finto = cliente(['{"valore": 42}'])

    assert _json_completion() == 42
    assert finto.modelli_chiamati == ["modello-primario"]


def test_la_valutazione_si_prende_il_tempo_lungo_senza_toccare_quello_del_vivo(modelli, cliente):
    """``with_options`` restituisce una copia: la battuta successiva della
    chiamata in corso torna ad avere i venti secondi di prima."""
    finto = cliente(['{"valore": 1}'])
    _json_completion()

    assert finto.opzioni == [{"timeout": 120, "max_retries": 1}]


def test_un_json_illeggibile_fa_passare_al_modello_di_riserva(modelli, cliente):
    finto = cliente(["non sono json", '{"valore": 7}'])

    assert _json_completion() == 7
    assert finto.modelli_chiamati == ["modello-primario", "modello-riserva"]


def test_una_risposta_a_cui_manca_un_campo_vale_come_una_mancata_risposta(modelli, cliente):
    """Un modello che risponde con i campi sbagliati ha fallito quanto uno
    che non ha risposto, e il rimedio è lo stesso: il modello dopo."""
    finto = cliente(['{"altro": 1}', '{"valore": 3}'])

    assert _json_completion() == 3
    assert len(finto.modelli_chiamati) == 2


def test_un_modello_saturo_lascia_il_posto_alla_riserva(modelli, cliente):
    finto = cliente([_Sovraccarico("overloaded"), '{"valore": 9}'])

    assert _json_completion() == 9
    assert finto.modelli_chiamati == ["modello-primario", "modello-riserva"]


def test_un_errore_definitivo_non_fa_provare_gli_altri(modelli, cliente):
    """Aspettare due volte lo stesso errore è tempo tolto a chi guarda la
    rotella girare."""
    finto = cliente([ValueError("parametro non supportato"), '{"valore": 1}'])

    with pytest.raises(RuntimeError, match="prova"):
        _json_completion()
    assert finto.modelli_chiamati == ["modello-primario"]


def test_quando_nessun_modello_risponde_il_motivo_arriva_a_chi_ha_chiesto(modelli, cliente):
    cliente([_Sovraccarico("overloaded"), _Sovraccarico("overloaded")])

    with pytest.raises(RuntimeError, match="prova"):
        _json_completion()


# ── I vettori dei passaggi ────────────────────────────────────────────


def test_i_vettori_tornano_nell_ordine_dei_testi(cliente):
    """L'API non promette di rispondere in ordine ma numera ogni vettore: se
    ci si fidasse dell'ordine, i passaggi finirebbero appaiati al vettore di
    un altro e la ricerca sbaglierebbe in silenzio."""
    cliente(
        [
            SimpleNamespace(
                data=[
                    SimpleNamespace(index=1, embedding=[0.0, 1.0]),
                    SimpleNamespace(index=0, embedding=[1.0, 0.0]),
                ]
            )
        ]
    )

    assert asyncio.run(embed_texts(["primo", "secondo"])) == [[1.0, 0.0], [0.0, 1.0]]


def test_una_lista_vuota_non_diventa_una_chiamata(cliente):
    cliente([])
    assert asyncio.run(embed_texts([])) == []


def test_l_indicizzazione_fallita_lo_dice_con_le_parole_del_caricamento(cliente):
    """Nessun modello di riserva qui: i vettori di due modelli diversi non si
    confrontano, e mezzo documento indicizzato dall'uno e mezzo dall'altro
    darebbe ricerche sbagliate senza accorgersene."""
    cliente([_Sovraccarico("overloaded")])

    with pytest.raises(RuntimeError, match="indicizzazione del documento"):
        asyncio.run(embed_texts(["passaggio"]))


def test_senza_chiave_non_si_indicizza(senza_chiave):
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        asyncio.run(embed_texts(["passaggio"]))


# ── Il roleplay che scorre ────────────────────────────────────────────


def _pezzo(testo: str | None):
    return SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=testo))])


class _ClienteChiChiacchiera:
    """Un cliente il cui streaming produce i pezzi che gli si danno."""

    def __init__(self, per_modello):
        self.per_modello = per_modello
        self.modelli_chiamati: list[str] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, *, model, **kwargs):
        self.modelli_chiamati.append(model)
        esito = self.per_modello[model]
        if isinstance(esito, Exception):
            raise esito

        async def _flusso():
            for pezzo in esito:
                if isinstance(pezzo, Exception):
                    raise pezzo
                yield _pezzo(pezzo)

        return _flusso()


def _raccogli(**kwargs) -> list[str]:
    async def _leggi():
        return [pezzo async for pezzo in stream_avatar_response(**kwargs)]

    return asyncio.run(_leggi())


def _conversazione():
    return [{"role": "user", "content": "Buongiorno, sono Mario Rossi."}]


def _scheda():
    return {"NOME": "Anna", "COGNOME": "Bianchi", "GRADO_DIFFICOLTA": "5/10"}


def test_la_risposta_arriva_a_pezzi_man_mano_che_il_modello_la_scrive(modelli, monkeypatch):
    finto = _ClienteChiChiacchiera({"live-primario": ["Buon", "giorno", None, " a lei"]})
    monkeypatch.setattr(openai_service, "async_client", finto)

    assert _raccogli(messages_history=_conversazione(), avatar_profile=_scheda()) == [
        "Buon",
        "giorno",
        " a lei",
    ]


def test_un_modello_saturo_cede_il_turno_prima_di_aprire_bocca(modelli, monkeypatch):
    finto = _ClienteChiChiacchiera(
        {"live-primario": _Sovraccarico("overloaded"), "live-riserva": ["Pronto"]}
    )
    monkeypatch.setattr(openai_service, "async_client", finto)

    assert _raccogli(messages_history=_conversazione(), avatar_profile=_scheda()) == ["Pronto"]
    assert finto.modelli_chiamati == ["live-primario", "live-riserva"]


def test_a_risposta_iniziata_non_si_cambia_piu_modello(modelli, monkeypatch):
    """Una battuta non si può ricominciare a metà con un'altra voce: quello
    che è già uscito dall'altoparlante è stato detto."""
    finto = _ClienteChiChiacchiera(
        {"live-primario": ["Buongi", _Sovraccarico("overloaded")], "live-riserva": ["Pronto"]}
    )
    monkeypatch.setattr(openai_service, "async_client", finto)

    with pytest.raises(RuntimeError, match="comunicazione con OpenAI"):
        _raccogli(messages_history=_conversazione(), avatar_profile=_scheda())
    assert finto.modelli_chiamati == ["live-primario"]


def test_quando_nessun_modello_e_disponibile_la_chiamata_lo_dice(modelli, monkeypatch):
    finto = _ClienteChiChiacchiera(
        {"live-primario": _Sovraccarico("overloaded"), "live-riserva": _Sovraccarico("overloaded")}
    )
    monkeypatch.setattr(openai_service, "async_client", finto)

    with pytest.raises(RuntimeError, match="comunicazione con OpenAI"):
        _raccogli(messages_history=_conversazione(), avatar_profile=_scheda())


def test_un_avatar_senza_scheda_persona_non_puo_recitare(modelli, cliente):
    cliente([])

    with pytest.raises(RuntimeError, match="scheda persona"):
        _raccogli(messages_history=_conversazione(), avatar_profile={})


def test_senza_chiave_non_si_recita(senza_chiave):
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        _raccogli(messages_history=_conversazione(), avatar_profile=_scheda())


# ── Il preriscaldamento, mentre il telefono squilla ───────────────────


def test_il_preriscaldamento_apre_la_connessione_e_scalda_il_prompt(modelli, cliente):
    finto = cliente(["ok"])

    asyncio.run(prewarm_roleplay(_scheda()))

    assert finto.modelli_chiamati == ["live-primario"]


def test_un_preriscaldamento_fallito_non_rovina_la_chiamata(modelli, cliente):
    """Il caso peggiore è il primo turno che paga quello che avrebbe pagato
    comunque: non c'è niente da riferire a nessuno."""
    cliente([_Sovraccarico("overloaded")])

    asyncio.run(prewarm_roleplay(_scheda()))


def test_senza_cliente_o_senza_scheda_non_si_scalda_niente(senza_chiave):
    asyncio.run(prewarm_roleplay(_scheda()))
    asyncio.run(prewarm_roleplay({}))


# ── La valutazione della conversazione ────────────────────────────────


def _valutazione_grezza(**primo_criterio) -> str:
    """Una risposta ben formata del giudice, come JSON."""
    criteri = {
        chiave: {"score": 6, "comment": "commento", "suggestions": "fai meglio"}
        for chiave, _, _ in EVALUATION_CRITERIA
    }
    criteri[EVALUATION_CRITERIA[0][0]].update(primo_criterio)
    return json.dumps({"overall_feedback": "riassunto", "criteria": criteri})


def _spia_sui_messaggi(finto) -> dict:
    """Trattiene quello che è stato mandato al modello, lasciandolo passare."""
    inviato: dict = {}
    creazione = finto.chat.completions.create

    async def _spia(*, model, messages, **kwargs):
        inviato["messages"] = messages
        return await creazione(model=model, messages=messages, **kwargs)

    finto.chat.completions.create = _spia
    return inviato


def test_una_conversazione_vuota_non_si_valuta(modelli, cliente):
    cliente([])

    with pytest.raises(RuntimeError, match="Conversazione vuota"):
        asyncio.run(evaluate_conversation([{"role": "user", "content": "   "}], _scheda()))


def test_la_trascrizione_arriva_numerata_e_con_i_ruoli_scritti(modelli, cliente):
    """I numeri fra parentesi quadre sono quelli con cui il giudice cita i
    momenti su cui fonda i voti: senza, le citazioni non tornerebbero a
    nessun messaggio."""
    inviato = _spia_sui_messaggi(cliente([_valutazione_grezza()]))

    esito = asyncio.run(
        evaluate_conversation(
            [
                {"role": "user", "content": "Buongiorno."},
                {"role": "assistant", "content": "Salve."},
            ],
            _scheda(),
        )
    )

    trascrizione = inviato["messages"][1]["content"]
    assert "TRASCRIZIONE DELLA CHIAMATA" in trascrizione
    assert "[1] OPERATORE: Buongiorno." in trascrizione
    assert "[2] CLIENTE: Salve." in trascrizione
    assert len(esito["criteria"]) == len(EVALUATION_CRITERIA)
    assert esito["summary"] == "riassunto"


def test_su_una_chat_il_valutatore_sa_di_leggere_uno_scritto(modelli, cliente):
    """Senza, penalizzerebbe l'operatore per il tono di voce di una
    conversazione che non aveva voce."""
    inviato = _spia_sui_messaggi(cliente([_valutazione_grezza()]))

    asyncio.run(
        evaluate_conversation(
            [{"role": "user", "content": "Buongiorno."}], _scheda(), channel=CHANNEL_TEXT
        )
    )

    assert "TRASCRIZIONE DELLA CHAT" in inviato["messages"][1]["content"]
    assert "CHAT TESTUALE" in inviato["messages"][0]["content"]


def test_il_prompt_porta_la_scheda_dello_scenario_come_chiave_di_lettura():
    """È l'unico modo per distinguere una diagnosi vera da una plausibile,
    ma non è prova di cosa l'operatore abbia fatto: il prompt lo dice."""
    prompt = _evaluation_prompt(
        {
            "NOME": "Anna",
            "COGNOME": "Bianchi",
            "DESCRIZIONE_PROBLEMATICA": "La carta è bloccata per tentativi errati.",
        }
    )

    assert "Anna Bianchi" in prompt
    assert "La carta è bloccata per tentativi errati." in prompt
    assert "solo come riferimento" in prompt.lower()
    assert "telefonata" in prompt


def test_senza_scheda_il_prompt_resta_valido_e_parla_di_un_cliente_simulato():
    prompt = _evaluation_prompt({}, channel=CHANNEL_VOICE)

    assert "il cliente simulato" in prompt
    # Nessun contesto da mostrare: la sezione non compare invece di comparire vuota
    assert "CONTESTO DELLA SIMULAZIONE" not in prompt


# ── La scala dei voti ─────────────────────────────────────────────────


def test_un_voto_fuori_scala_rientra_invece_di_far_cadere_la_valutazione():
    """Lo zero non è un giudizio: il minimo è una prestazione gravemente
    insufficiente, non la sua assenza."""
    assert _clamp_score(0) == 1.0
    assert _clamp_score(11) == 10.0
    assert _clamp_score("7.46") == 7.5


def test_un_voto_che_non_e_un_numero_manda_la_valutazione_al_modello_dopo():
    with pytest.raises((TypeError, ValueError)):
        _clamp_score("ottimo")


def test_i_suggerimenti_spariscono_quando_il_criterio_e_gia_buono():
    """Un consiglio su un criterio da nove è rumore: chi legge deve trovare
    scritto dove intervenire, non dappertutto."""
    grezza = json.loads(_valutazione_grezza(score=EVALUATION_SUGGESTION_THRESHOLD))

    esito = _normalize_evaluation(grezza, [])

    buono, *altri = esito["criteria"]
    assert buono["suggestions"] is None
    # Gli altri stanno sotto la soglia e il consiglio se lo tengono
    assert all(c["suggestions"] == "fai meglio" for c in altri)
