"""Cosa si tiene e cosa si butta di quello che il modello risponde.

Come le domande si spartiscono fra argomenti e chiamate sta in
``test_simulation_questions``; qui c'è il resto della generazione: la
pulizia di quello che torna indietro, tipo per tipo, e il giro delle cinque
chiamate messe insieme.

Il modello è finto, e non è una rinuncia: quello che si vuole provare non è
se scrive belle domande, è cosa succede quando ne scrive una storta o quando
una delle cinque chiamate va persa. Sono le parti che decidono se il super
admin si ritrova cinquanta domande o quaranta, e nessuna dipende da quale
modello ha risposto.

Il criterio degli scarti è sempre lo stesso: una domanda malformata si butta
da sola e non porta con sé le altre nove della sua chiamata. Vale però solo
finché la domanda buttata è una domanda in meno; una domanda **tenuta** con
la chiave mancante sarebbe una domanda che nessuno può correggere, ed è il
motivo per cui ogni tipo ha una regola sua su cosa lo renda inutilizzabile.
"""

import asyncio

import pytest

import simulation_questions
from models import (
    SIMULATION_GENERATED_ITEMS,
    SIMULATION_KIND_MATCHING,
    SIMULATION_KIND_MULTIPLE,
    SIMULATION_KIND_OPEN,
    SIMULATION_KIND_ORDERING,
    SIMULATION_OPTION_COUNT,
    SIMULATION_POOL_COUNT,
)
from simulation_questions import (
    MAX_TOPICS,
    QUESTIONS_PER_CALL,
    _batch_input,
    _clean_pairs,
    _has_duplicates,
    _normalize_questions,
    _normalize_topics,
    _valid_sources,
    generate_questions,
)


def _domanda_multipla(**extra) -> dict:
    return {
        "text": "Entro quanto si registra un reclamo?",
        "options": [f"Alternativa {i}" for i in range(SIMULATION_OPTION_COUNT)],
        "correct_option": 1,
        "explanation": "Il documento indica cinque giorni.",
        "source_chunks": [1],
        **extra,
    }


def _passi(quanti=SIMULATION_GENERATED_ITEMS) -> list[str]:
    return [f"Passo numero {i}" for i in range(quanti)]


def _coppie(quante=SIMULATION_GENERATED_ITEMS) -> list[dict]:
    return [{"left": f"Caso {i}", "right": f"Ufficio {i}"} for i in range(quante)]


# ── Gli argomenti ─────────────────────────────────────────────────────


def test_gli_argomenti_vuoti_non_contano_come_argomenti():
    assert _normalize_topics({"topics": ["  Rimborsi ", "", "   ", "Reclami"]}) == [
        "Rimborsi",
        "Reclami",
    ]


def test_un_documento_senza_argomenti_ferma_la_generazione():
    """Meglio dirlo subito: senza argomenti la seconda passata scriverebbe
    cinquanta domande sul nulla."""
    with pytest.raises(ValueError, match="Nessun argomento"):
        _normalize_topics({"topics": []})
    with pytest.raises(ValueError, match="Nessun argomento"):
        _normalize_topics({})


def test_gli_argomenti_in_eccesso_si_tagliano():
    """Il numero nel prompt è un tetto, ma un modello che lo supera non deve
    poter allungare la generazione a piacere."""
    topics = _normalize_topics({"topics": [f"Argomento {i}" for i in range(MAX_TOPICS + 10)]})
    assert len(topics) == MAX_TOPICS


def test_ogni_argomento_porta_scritto_quante_domande_vuole():
    """Il numero sta sotto ogni argomento e non solo nel totale: senza, il
    modello distribuisce a suo gusto e gli argomenti in fondo restano
    scoperti."""
    testo = _batch_input(
        [(0, 3), (1, 7)],
        topics=["Rimborsi allo sportello", "Reclami scritti"],
        passages=["[1] Il rimborso si autorizza...", "[2] Il reclamo si registra..."],
    )

    assert "DOMANDE DA SCRIVERE IN TUTTO: 10" in testo
    assert "ARGOMENTO: Rimborsi allo sportello\nDomande da scrivere su questo argomento: 3" in testo
    assert "ARGOMENTO: Reclami scritti\nDomande da scrivere su questo argomento: 7" in testo
    assert "[1] Il rimborso si autorizza..." in testo


# ── Le citazioni dei passaggi ─────────────────────────────────────────


def test_i_passaggi_citati_che_non_esistono_si_buttano():
    """La citazione accompagna la spiegazione, non la sostiene: un ordinale
    inventato si toglie invece di far cadere la domanda."""
    assert _valid_sources([1, 99, 3], valid_ordinals={1, 2, 3}) == [1, 3]


def test_una_citazione_ripetuta_compare_una_volta_sola():
    assert _valid_sources([2, 2, 1], valid_ordinals={1, 2}) == [2, 1]


def test_una_citazione_che_non_e_un_numero_non_fa_cadere_la_domanda():
    assert _valid_sources(["due", None, "3"], valid_ordinals={2, 3}) == [3]
    assert _valid_sources(None, valid_ordinals={1}) == []


# ── Le ripetizioni dentro una domanda ─────────────────────────────────


def test_due_elementi_uguali_a_meno_di_spazi_e_maiuscole_sono_lo_stesso():
    assert _has_duplicates(["Verifica il documento", "verifica  il DOCUMENTO"]) is True
    assert _has_duplicates(["Verifica il documento", "Registra la pratica"]) is False


# ── Le coppie di un abbinamento ───────────────────────────────────────


def test_le_coppie_buone_passano_pulite():
    coppie = [{"left": " Reclamo ", "right": " Ufficio reclami "}, *_coppie(4)]

    assert _clean_pairs(coppie) == [{"left": "Reclamo", "right": "Ufficio reclami"}, *_coppie(4)]


def test_una_coppia_con_un_lato_vuoto_annulla_la_domanda():
    """Non se ne possono tenere quattro su cinque: la domanda ha un numero
    fisso di righe, e una riga in meno è una domanda diversa da quella
    scritta."""
    assert _clean_pairs([*_coppie(4), {"left": "Caso", "right": ""}]) is None


def test_un_numero_di_coppie_diverso_annulla_la_domanda():
    assert _clean_pairs(_coppie(SIMULATION_GENERATED_ITEMS - 1)) is None
    assert _clean_pairs([]) is None


def test_un_abbinato_che_vale_per_due_casi_annulla_la_domanda():
    """Chi conosce la procedura sbaglierebbe lo stesso, ed è il modo più
    veloce di rendere odiato un tipo di test."""
    assert _clean_pairs([*_coppie(4), {"left": "Caso nuovo", "right": "Ufficio 0"}]) is None


def test_una_riga_che_non_e_nemmeno_una_coppia_annulla_la_domanda():
    assert _clean_pairs(["Reclamo -> Ufficio reclami"]) is None


# ── La pulizia delle domande, tipo per tipo ───────────────────────────


def test_una_domanda_a_scelta_multipla_esce_con_i_campi_degli_altri_tipi_vuoti():
    """Chi scrive la riga nel database non deve sapere di che tipo era."""
    (domanda,) = _normalize_questions(
        {"questions": [_domanda_multipla()]}, {1}, SIMULATION_KIND_MULTIPLE, limit=10
    )

    assert domanda["correct_option"] == 1
    assert domanda["expected_answer"] == ""
    assert domanda["ordered_steps"] is None
    assert domanda["pairs"] is None


@pytest.mark.parametrize(
    "storta",
    [
        {"options": ["Solo una"]},
        {"correct_option": SIMULATION_OPTION_COUNT},
        {"correct_option": -1},
        {"correct_option": "prima"},
        {"correct_option": None},
        {"text": "   "},
    ],
)
def test_una_domanda_a_scelta_multipla_senza_chiave_valida_si_scarta(storta):
    buona = _domanda_multipla(text="Domanda buona")
    domande = _normalize_questions(
        {"questions": [_domanda_multipla(**storta), buona]}, {1}, SIMULATION_KIND_MULTIPLE, 10
    )

    assert [d["text"] for d in domande] == ["Domanda buona"]


def test_una_domanda_aperta_senza_traccia_si_scarta():
    """Senza traccia non è una domanda a cui manca un pezzo, è una domanda
    che nessuno potrebbe correggere."""
    domande = _normalize_questions(
        {
            "questions": [
                {"text": "Senza traccia", "expected_answer": "  "},
                {"text": "Con traccia", "expected_answer": "Deve dire che..."},
            ]
        },
        {1},
        SIMULATION_KIND_OPEN,
        10,
    )

    assert [d["text"] for d in domande] == ["Con traccia"]
    assert domande[0]["options"] is None


def test_un_ordinamento_con_due_passi_identici_si_scarta():
    """Avrebbe due risposte giuste, e chi conosce la procedura ne
    sbaglierebbe una."""
    domande = _normalize_questions(
        {
            "questions": [
                {"text": "Doppioni", "ordered_steps": ["Verifica", "Verifica", *_passi(3)]},
                {"text": "Corto", "ordered_steps": _passi(SIMULATION_GENERATED_ITEMS - 1)},
                {"text": "Buona", "ordered_steps": _passi()},
            ]
        },
        {1},
        SIMULATION_KIND_ORDERING,
        10,
    )

    assert [d["text"] for d in domande] == ["Buona"]
    assert domande[0]["ordered_steps"] == _passi()


def test_un_abbinamento_valido_esce_con_le_sue_coppie():
    domande = _normalize_questions(
        {
            "questions": [
                {"text": "Storta", "pairs": _coppie(2)},
                {"text": "Buona", "pairs": _coppie()},
            ]
        },
        {1},
        SIMULATION_KIND_MATCHING,
        10,
    )

    assert [d["text"] for d in domande] == ["Buona"]
    assert domande[0]["pairs"] == _coppie()


def test_una_riga_che_non_e_una_domanda_non_fa_cadere_le_altre():
    domande = _normalize_questions(
        {"questions": ["una stringa", None, _domanda_multipla()]},
        {1},
        SIMULATION_KIND_MULTIPLE,
        10,
    )

    assert len(domande) == 1


def test_una_chiamata_senza_nemmeno_una_domanda_buona_e_una_chiamata_persa():
    """Il chiamante deve poterla distinguere da una riuscita: è l'unico a
    sapere se rifarla o mostrare al super admin quello che c'è."""
    with pytest.raises(ValueError, match="Nessuna domanda utilizzabile"):
        _normalize_questions({"questions": []}, {1}, SIMULATION_KIND_MULTIPLE, 10)


def test_una_chiamata_non_restituisce_piu_domande_di_quante_ne_erano_state_chieste():
    domande = _normalize_questions(
        {"questions": [_domanda_multipla(text=f"Domanda {i}") for i in range(10)]},
        {1},
        SIMULATION_KIND_MULTIPLE,
        limit=3,
    )

    assert len(domande) == 3


# ── La generazione intera, con il modello simulato ────────────────────


@pytest.fixture
def modello(monkeypatch):
    """Il modello finto, con le due passate distinte da ``what``.

    La normalizzazione vera passa comunque: quello che si sta provando è il
    giro attorno alle chiamate, non una normalizzazione scavalcata.
    """

    stato = {"sistemi": [], "utenti": [], "chiamate_domande": 0}

    def _installa(domande_per_chiamata, argomenti=None, guasto=None):
        argomenti = argomenti or [f"Argomento {i}" for i in range(5)]

        async def _eval(messages, max_completion_tokens, normalize, what):
            stato["sistemi"].append(messages[0]["content"])
            stato["utenti"].append(messages[1]["content"])
            if what == "individuazione degli argomenti":
                return normalize({"topics": argomenti})
            indice = stato["chiamate_domande"]
            stato["chiamate_domande"] += 1
            if guasto is not None and indice in guasto:
                raise guasto[indice]
            return normalize({"questions": domande_per_chiamata(indice)})

        async def _embed(texts):
            # Un vettore per argomento, tutti diversi fra loro
            return [[float(i == j) for j in range(len(texts))] for i in range(len(texts))]

        monkeypatch.setattr(simulation_questions, "eval_json_completion", _eval)
        monkeypatch.setattr(simulation_questions, "embed_texts", _embed)
        return stato

    return _installa


def _documento(passaggi=8):
    chunks = [f"Passaggio numero {i} della procedura aziendale." for i in range(passaggi)]
    embeddings = [[float(i == j) for j in range(passaggi)] for i in range(passaggi)]
    return chunks, embeddings


def _dieci_multiple(indice: int) -> list[dict]:
    return [_domanda_multipla(text=f"Domanda {indice}-{n}") for n in range(QUESTIONS_PER_CALL)]


def test_un_documento_vuoto_non_arriva_nemmeno_al_modello():
    with pytest.raises(ValueError, match="Documento vuoto"):
        asyncio.run(generate_questions([], []))


def test_il_serbatoio_esce_pieno_e_senza_ripetizioni(modello):
    stato = modello(_dieci_multiple)
    chunks, embeddings = _documento()

    domande = asyncio.run(generate_questions(chunks, embeddings))

    assert len(domande) == SIMULATION_POOL_COUNT
    assert stato["chiamate_domande"] == 5
    assert len({d["text"] for d in domande}) == SIMULATION_POOL_COUNT


def test_ogni_argomento_arriva_al_modello_con_i_passaggi_che_ne_parlano(modello):
    """È il senso delle due passate: le domande si scrivono avendo sott'occhio
    il pezzo di documento da cui nascono, non il documento intero."""
    stato = modello(_dieci_multiple, argomenti=["Rimborsi"])
    chunks, embeddings = _documento()

    asyncio.run(generate_questions(chunks, embeddings))

    # La prima è la lettura d'insieme, le successive sono le domande
    assert "## DOCUMENTO" in stato["utenti"][0]
    assert "ARGOMENTO: Rimborsi" in stato["utenti"][1]
    assert "[1] Passaggio numero 0" in stato["utenti"][1]


@pytest.mark.parametrize(
    ("kind", "frase"),
    [
        (SIMULATION_KIND_OPEN, "risposta aperta"),
        (SIMULATION_KIND_ORDERING, "rimettere in ordine"),
        (SIMULATION_KIND_MATCHING, "abbinare gli elementi"),
        (SIMULATION_KIND_MULTIPLE, "risposta multipla"),
    ],
)
def test_il_tipo_del_test_cambia_solo_cosa_si_chiede_di_scrivere(modello, kind, frase):
    contenuti = {
        SIMULATION_KIND_OPEN: lambda i: [
            {"text": f"Aperta {i}", "expected_answer": "Deve dire che..."}
        ],
        SIMULATION_KIND_ORDERING: lambda i: [{"text": f"Ordina {i}", "ordered_steps": _passi()}],
        SIMULATION_KIND_MATCHING: lambda i: [{"text": f"Abbina {i}", "pairs": _coppie()}],
        SIMULATION_KIND_MULTIPLE: _dieci_multiple,
    }[kind]
    stato = modello(contenuti)
    chunks, embeddings = _documento()

    domande = asyncio.run(generate_questions(chunks, embeddings, kind=kind))

    assert domande
    # La prima passata non nomina il tipo: gli argomenti su cui vale la pena
    # interrogare qualcuno sono gli stessi in tutti i casi
    assert "risposta multipla" not in stato["sistemi"][0]
    assert frase in stato["sistemi"][1]


def test_un_tipo_sconosciuto_scrive_domande_a_scelta_multipla(modello):
    """È il tipo di ogni simulazione nata prima che i tipi esistessero."""
    stato = modello(_dieci_multiple)
    chunks, embeddings = _documento()

    asyncio.run(generate_questions(chunks, embeddings, kind="un-tipo-che-non-esiste"))

    assert "risposta multipla" in stato["sistemi"][1]


def test_una_chiamata_andata_storta_si_porta_via_solo_il_suo_gruppo(modello):
    """Rigenerare costa minuti: quaranta domande buone si completano a mano,
    zero domande sono da rifare tutto."""
    modello(_dieci_multiple, guasto={2: RuntimeError("OpenAI non risponde")})
    chunks, embeddings = _documento()

    domande = asyncio.run(generate_questions(chunks, embeddings))

    assert len(domande) == SIMULATION_POOL_COUNT - QUESTIONS_PER_CALL


def test_quando_falliscono_tutte_risale_il_primo_motivo(modello):
    """Il router lo traduce in 502 o 422 come quando la chiamata era una
    sola: chi ha premuto genera deve leggere perché non è andata."""
    modello(_dieci_multiple, guasto=dict.fromkeys(range(5), RuntimeError("OpenAI non risponde")))
    chunks, embeddings = _documento()

    with pytest.raises(RuntimeError, match="OpenAI non risponde"):
        asyncio.run(generate_questions(chunks, embeddings))
