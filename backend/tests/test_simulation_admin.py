"""Il ciclo di una simulazione generata: documento, domande, pubblicazione.

Le simulazioni scritte a mano stanno in ``test_simulation_manual``; qui c'è
l'altra strada, quella che parte da un documento aziendale.

I tre momenti sono tre chiamate distinte, e il motivo si vede meglio dai
fallimenti che dai successi: un modello lento o non disponibile non deve far
perdere il documento appena caricato, quindi caricare e generare sono due
gesti separati e un caricamento riuscito resta riuscito. È la ragione per
cui qui si provano soprattutto le vie di mezzo, cioè i casi in cui una delle
tre parti va storta e le altre due devono restare in piedi.

Il modello è finto, come in ``test_simulation_generation``: quello che si
verifica è cosa il router fa dei passaggi e delle domande, non come sono
scritte.
"""

import io

import pytest

from models import (
    SIMULATION_GENERATED_ITEMS,
    SIMULATION_KIND_MATCHING,
    SIMULATION_KIND_MULTIPLE,
    SIMULATION_KIND_OPEN,
    SIMULATION_KIND_ORDERING,
    SIMULATION_POOL_COUNT,
    SIMULATION_STATUS_DRAFT,
    SIMULATION_STATUS_PUBLISHED,
    SimulationQuestion,
    TechnicalSimulation,
)
from routers import admin_simulations as admin_router

SIMULAZIONI = "/api/admin/simulations"


@pytest.fixture
def indicizzazione(monkeypatch):
    """I vettori dei passaggi, senza la chiamata a OpenAI.

    Un vettore per passaggio, tutti diversi: il recupero vero sta in
    ``test_simulation_rag``, qui serve solo che i numeri tornino.
    """

    async def _embed(texts):
        return [[float(i == j) for j in range(len(texts))] for i in range(len(texts))]

    monkeypatch.setattr(admin_router, "embed_texts", _embed)


@pytest.fixture
def generazione(monkeypatch):
    """Il generatore di domande, con l'esito che serve al test."""

    def _installa(domande=None, errore=None):
        async def _genera(chunks, embeddings, kind):
            if errore is not None:
                raise errore
            return domande

        monkeypatch.setattr(admin_router, "generate_questions", _genera)

    return _installa


def _domanda_generata(indice: int) -> dict:
    return {
        "text": f"Domanda {indice}?",
        "options": ["Prima", "Seconda", "Terza", "Quarta"],
        "correct_option": indice % 4,
        "expected_answer": "",
        "ordered_steps": None,
        "pairs": None,
        "explanation": f"Spiegazione {indice}.",
        "source_chunks": [1],
    }


def _documento(nome="procedura.txt", contenuto=b"La carta si sblocca dopo la verifica."):
    return {"file": (nome, io.BytesIO(contenuto), "text/plain")}


def _crea(admin_client, organization, *, kind=SIMULATION_KIND_MULTIPLE, file=None, **campi):
    return admin_client.post(
        SIMULAZIONI,
        data={
            "organization_id": str(organization.id),
            "title": "Procedure dal manuale",
            "kind": kind,
            "source": "ai",
            **campi,
        },
        files=file if file is not None else _documento(),
    )


# ── Il caricamento del documento ──────────────────────────────────────


def test_il_documento_caricato_diventa_passaggi_indicizzati(
    admin_client, organization, indicizzazione, db_session
):
    """Il testo si conserva per intero e spezzato: il primo serve a chi
    rilegge, i passaggi servono a scrivere le domande.

    Il testo intero resta in banca dati e non nella risposta: chi amministra
    ne legge il nome e quanti passaggi ne sono usciti, mentre il testo lo
    rilegge il modello quando genera e quando controlla."""
    risposta = _crea(admin_client, organization)

    assert risposta.status_code == 201
    corpo = risposta.json()
    assert corpo["document_name"] == "procedura.txt"
    assert corpo["chunk_count"] == 1
    assert corpo["status"] == SIMULATION_STATUS_DRAFT
    salvata = db_session.query(TechnicalSimulation).filter_by(id=corpo["id"]).one()
    assert "La carta si sblocca" in salvata.document_text


def test_una_simulazione_nasce_sempre_in_bozza_e_senza_domande(
    admin_client, organization, indicizzazione
):
    """Generarle è il passo dopo: tenerlo separato significa che un modello
    non disponibile non fa perdere il documento appena caricato."""
    corpo = _crea(admin_client, organization).json()

    assert corpo["questions"] == []
    assert corpo["status"] == SIMULATION_STATUS_DRAFT


def test_un_formato_che_non_si_sa_leggere_viene_rifiutato(admin_client, organization):
    risposta = _crea(admin_client, organization, file=_documento("foglio.xlsx"))

    assert risposta.status_code == 400
    assert "Formato non supportato" in risposta.json()["detail"]


def test_un_file_vuoto_viene_rifiutato(admin_client, organization):
    risposta = _crea(admin_client, organization, file=_documento(contenuto=b""))

    assert risposta.status_code == 400
    assert "vuoto" in risposta.json()["detail"]


def test_un_documento_troppo_grande_viene_rifiutato(admin_client, organization, monkeypatch):
    """Il tetto si abbassa nel test invece di caricare dieci megabyte veri:
    quello che si verifica è che il controllo ci sia e risponda 413."""
    monkeypatch.setattr(admin_router.document_text, "MAX_DOCUMENT_BYTES", 32)

    risposta = _crea(admin_client, organization, file=_documento(contenuto=b"x" * 100))

    assert risposta.status_code == 413
    assert "non può superare" in risposta.json()["detail"]


def test_un_documento_senza_testo_leggibile_lo_dice(admin_client, organization, indicizzazione):
    """Un PDF di pagine scansionate contiene immagini di testo: da qui esce
    vuoto, e nessun ritentativo lo cambia. Il messaggio deve dirlo, o chi ha
    caricato riprova con lo stesso file."""
    risposta = _crea(admin_client, organization, file=_documento(contenuto=b"   \n\n  "))

    assert risposta.status_code == 400
    assert "testo leggibile" in risposta.json()["detail"]


def test_un_indicizzazione_fallita_si_ferma_prima_di_scrivere_qualcosa(
    admin_client, organization, db_session, monkeypatch
):
    """502 e nessun salvataggio: senza i vettori quella simulazione non si
    potrebbe mai generare, e una riga scritta a metà resterebbe lì a
    sembrare un documento caricato.

    Che la riga non resti lo garantisce la sessione della richiesta, che si
    chiude senza commit; qui non si può osservare, perché la fixture tiene
    aperta la transazione fino a fine test. Quello che si verifica è che il
    commit non venga mai raggiunto.
    """

    async def _embed_rotto(texts):
        raise RuntimeError("Errore nell'indicizzazione del documento")

    monkeypatch.setattr(admin_router, "embed_texts", _embed_rotto)
    commit = db_session.commit
    commit_chiamati = []
    db_session.commit = lambda: commit_chiamati.append(1)
    try:
        risposta = _crea(admin_client, organization)
    finally:
        db_session.commit = commit

    assert risposta.status_code == 502
    assert commit_chiamati == []


def test_un_titolo_vuoto_viene_rifiutato(admin_client, organization, indicizzazione):
    risposta = _crea(admin_client, organization, title="   ")

    assert risposta.status_code == 400
    assert "titolo è obbligatorio" in risposta.json()["detail"]


def test_un_tipo_di_test_inventato_viene_rifiutato(admin_client, organization, indicizzazione):
    risposta = _crea(admin_client, organization, kind="a-crocette")

    assert risposta.status_code == 400
    assert "Tipo di test non valido" in risposta.json()["detail"]


def test_una_simulazione_di_un_organizzazione_che_non_esiste_non_si_crea(
    admin_client, organization, indicizzazione
):
    import uuid

    risposta = admin_client.post(
        SIMULAZIONI,
        data={
            "organization_id": str(uuid.uuid4()),
            "title": "Procedure",
            "source": "ai",
        },
        files=_documento(),
    )

    assert risposta.status_code == 404


# ── La sostituzione del documento ─────────────────────────────────────


def test_ricaricare_il_documento_rifa_i_passaggi_e_lascia_stare_le_domande(
    admin_client, organization, indicizzazione, generazione, db_session
):
    """Le domande sono il test: non si azzerano perché è stata caricata una
    versione aggiornata della procedura. Sta al super admin decidere se
    rigenerarle."""
    simulazione = _crea(admin_client, organization).json()
    generazione(domande=[_domanda_generata(1)])
    admin_client.post(f"{SIMULAZIONI}/{simulazione['id']}/generate")

    risposta = admin_client.post(
        f"{SIMULAZIONI}/{simulazione['id']}/document",
        files=_documento("procedura-v2.txt", b"Primo paragrafo.\n\nSecondo paragrafo."),
    )

    assert risposta.status_code == 200
    corpo = risposta.json()
    assert corpo["document_name"] == "procedura-v2.txt"
    assert len(corpo["questions"]) == 1
    salvata = db_session.query(TechnicalSimulation).filter_by(id=corpo["id"]).one()
    assert "Secondo paragrafo" in salvata.document_text


def test_sostituire_il_documento_di_una_simulazione_che_non_esiste_risponde_404(
    admin_client, indicizzazione
):
    import uuid

    risposta = admin_client.post(f"{SIMULAZIONI}/{uuid.uuid4()}/document", files=_documento())

    assert risposta.status_code == 404


# ── La generazione ────────────────────────────────────────────────────


def test_le_domande_generate_si_scrivono_nell_ordine_in_cui_arrivano(
    admin_client, organization, indicizzazione, generazione
):
    simulazione = _crea(admin_client, organization).json()
    generazione(domande=[_domanda_generata(i) for i in range(1, 4)])

    risposta = admin_client.post(f"{SIMULAZIONI}/{simulazione['id']}/generate")

    assert risposta.status_code == 200
    domande = risposta.json()["questions"]
    assert [d["position"] for d in domande] == [1, 2, 3]
    assert domande[0]["text"] == "Domanda 1?"
    assert domande[0]["source_chunks"] == [1]


def test_rigenerare_sostituisce_il_serbatoio_e_riporta_in_bozza(
    admin_client, organization, db_session, indicizzazione, generazione
):
    """Le domande nuove non le ha ancora lette nessuno: la revisione umana
    prima della pubblicazione è la regola, non un passaggio da saltare
    quando si ha fretta."""
    simulazione = _crea(admin_client, organization).json()
    generazione(domande=[_domanda_generata(i) for i in range(1, SIMULATION_POOL_COUNT + 1)])
    admin_client.post(f"{SIMULAZIONI}/{simulazione['id']}/generate")
    admin_client.put(
        f"{SIMULAZIONI}/{simulazione['id']}/status", json={"status": SIMULATION_STATUS_PUBLISHED}
    )

    generazione(domande=[_domanda_generata(99)])
    corpo = admin_client.post(f"{SIMULAZIONI}/{simulazione['id']}/generate").json()

    assert corpo["status"] == SIMULATION_STATUS_DRAFT
    assert [d["text"] for d in corpo["questions"]] == ["Domanda 99?"]
    assert (
        db_session.query(SimulationQuestion)
        .filter(SimulationQuestion.simulation_id == simulazione["id"])
        .count()
        == 1
    )


def test_generare_senza_un_documento_indicizzato_non_si_puo(
    admin_client, organization, db_session, generazione
):
    """Non capita passando dalla creazione, capita su una simulazione
    rimasta a metà: senza passaggi non c'è niente da leggere."""
    simulazione = TechnicalSimulation(title="Vuota", organization_id=organization.id)
    db_session.add(simulazione)
    db_session.flush()
    generazione(domande=[_domanda_generata(1)])

    risposta = admin_client.post(f"{SIMULAZIONI}/{simulazione.id}/generate")

    assert risposta.status_code == 409
    assert "Nessun documento indicizzato" in risposta.json()["detail"]


def test_un_modello_che_non_risponde_lascia_la_simulazione_com_era(
    admin_client, organization, indicizzazione, generazione
):
    """502: il guasto è a monte, e chi ha premuto genera deve capire che
    riprovare ha senso."""
    simulazione = _crea(admin_client, organization).json()
    generazione(errore=RuntimeError("Errore nella generazione: OpenAI non risponde"))

    risposta = admin_client.post(f"{SIMULAZIONI}/{simulazione['id']}/generate")

    assert risposta.status_code == 502
    assert admin_client.get(f"{SIMULAZIONI}/{simulazione['id']}").json()["questions"] == []


def test_una_risposta_inutilizzabile_del_modello_si_distingue_da_un_guasto(
    admin_client, organization, indicizzazione, generazione
):
    """422 e non 502: il modello ha risposto, è quello che ha risposto a non
    servire. Rilanciare la stessa generazione può bastare, cambiare
    documento è l'altra strada."""
    simulazione = _crea(admin_client, organization).json()
    generazione(errore=ValueError("Nessuna domanda utilizzabile nella risposta del modello."))

    risposta = admin_client.post(f"{SIMULAZIONI}/{simulazione['id']}/generate")

    assert risposta.status_code == 422


def test_una_generazione_incompleta_si_scrive_lo_stesso(
    admin_client, organization, indicizzazione, generazione
):
    """Quaranta domande su cinquanta si completano a mano; buttarle vorrebbe
    dire rifare minuti di generazione per averne di nuovo quaranta."""
    simulazione = _crea(admin_client, organization).json()
    generazione(domande=[_domanda_generata(i) for i in range(1, 41)])

    corpo = admin_client.post(f"{SIMULAZIONI}/{simulazione['id']}/generate").json()

    assert len(corpo["questions"]) == 40
    assert corpo["status"] == SIMULATION_STATUS_DRAFT


# ── Titolo, descrizione e cancellazione ───────────────────────────────


def test_titolo_e_descrizione_si_correggono(admin_client, organization, indicizzazione):
    simulazione = _crea(admin_client, organization).json()

    risposta = admin_client.put(
        f"{SIMULAZIONI}/{simulazione['id']}",
        json={"title": "  Procedure di sportello  ", "description": "  Aggiornata a marzo  "},
    )

    assert risposta.status_code == 200
    assert risposta.json()["title"] == "Procedure di sportello"
    assert risposta.json()["description"] == "Aggiornata a marzo"


def test_una_descrizione_svuotata_torna_a_non_esserci(admin_client, organization, indicizzazione):
    """Una descrizione di soli spazi non è una descrizione: la colonna torna
    vuota invece di conservare quello che è rimasto premendo la barra."""
    simulazione = _crea(admin_client, organization, description="C'era").json()

    risposta = admin_client.put(
        f"{SIMULAZIONI}/{simulazione['id']}", json={"title": "Procedure", "description": "   "}
    )

    assert risposta.json()["description"] is None


def test_un_titolo_di_soli_spazi_non_si_salva(admin_client, organization, indicizzazione):
    """La lunghezza minima dello schema conta i caratteri, e la barra
    spaziatrice ne è uno: un titolo così arriverebbe vuoto in tabella."""
    simulazione = _crea(admin_client, organization).json()

    risposta = admin_client.put(
        f"{SIMULAZIONI}/{simulazione['id']}", json={"title": "   ", "description": ""}
    )

    assert risposta.status_code == 400
    assert "titolo" in risposta.json()["detail"].lower()


def test_cancellare_una_simulazione_porta_via_anche_i_suoi_passaggi(
    admin_client, organization, db_session, indicizzazione
):
    """Definitiva, al contrario dell'archiviazione di un avatar: un
    tentativo si porta dietro la propria fotografia e non ha bisogno che la
    simulazione esista ancora."""
    simulazione = _crea(admin_client, organization).json()

    risposta = admin_client.delete(f"{SIMULAZIONI}/{simulazione['id']}")

    assert risposta.status_code == 200
    assert db_session.query(TechnicalSimulation).count() == 0
    assert db_session.query(admin_router.SimulationChunk).count() == 0


def test_una_simulazione_inesistente_risponde_404_ovunque(admin_client):
    import uuid

    inesistente = uuid.uuid4()

    assert admin_client.get(f"{SIMULAZIONI}/{inesistente}").status_code == 404
    assert admin_client.delete(f"{SIMULAZIONI}/{inesistente}").status_code == 404
    assert admin_client.put(f"{SIMULAZIONI}/{inesistente}", json={"title": "x"}).status_code == 404


# ── Cosa impedisce di pubblicare, tipo per tipo ───────────────────────


@pytest.fixture
def simulazione_di_tipo(db_session, organization):
    """Una simulazione già piena di domande del suo tipo, in bozza.

    Il serbatoio è quello che serve a pubblicare, così l'unica cosa che può
    fermare la pubblicazione è la domanda incompleta che il test ci mette
    dentro apposta.
    """

    def _factory(kind, domanda_storta=None):
        simulazione = TechnicalSimulation(
            title=f"Test {kind}", organization_id=organization.id, kind=kind
        )
        db_session.add(simulazione)
        db_session.flush()
        for position in range(1, SIMULATION_POOL_COUNT + 1):
            colonne = _colonne_complete(kind, position)
            if position == 1 and domanda_storta is not None:
                colonne = {**colonne, **domanda_storta}
            db_session.add(
                SimulationQuestion(
                    simulation_id=simulazione.id,
                    position=position,
                    text=f"Domanda {position}?",
                    explanation="Spiegazione.",
                    **colonne,
                )
            )
        db_session.flush()
        db_session.refresh(simulazione)
        return simulazione

    return _factory


def _colonne_complete(kind: str, position: int) -> dict:
    if kind == SIMULATION_KIND_OPEN:
        return {"expected_answer": "Deve dire che si verifica il documento."}
    if kind == SIMULATION_KIND_ORDERING:
        return {"ordered_steps": [f"Passo {i}" for i in range(SIMULATION_GENERATED_ITEMS)]}
    if kind == SIMULATION_KIND_MATCHING:
        return {
            "pairs": [
                {"left": f"Caso {i}", "right": f"Ufficio {i}"}
                for i in range(SIMULATION_GENERATED_ITEMS)
            ]
        }
    return {"options": ["Prima", "Seconda", "Terza", "Quarta"], "correct_option": position % 4}


def _pubblica(admin_client, simulazione):
    return admin_client.put(
        f"{SIMULAZIONI}/{simulazione.id}/status", json={"status": SIMULATION_STATUS_PUBLISHED}
    )


@pytest.mark.parametrize(
    "kind",
    [
        SIMULATION_KIND_MULTIPLE,
        SIMULATION_KIND_OPEN,
        SIMULATION_KIND_ORDERING,
        SIMULATION_KIND_MATCHING,
    ],
)
def test_un_serbatoio_completo_si_pubblica_qualunque_sia_il_tipo(
    admin_client, simulazione_di_tipo, kind
):
    risposta = _pubblica(admin_client, simulazione_di_tipo(kind))

    assert risposta.status_code == 200
    assert risposta.json()["status"] == SIMULATION_STATUS_PUBLISHED


def test_una_domanda_senza_testo_non_si_pubblica(admin_client, simulazione_di_tipo):
    simulazione = simulazione_di_tipo(SIMULATION_KIND_MULTIPLE)
    simulazione.questions[0].text = "   "

    risposta = _pubblica(admin_client, simulazione)

    assert risposta.status_code == 409
    assert "La domanda 1 non ha il testo" in risposta.json()["detail"]


def test_una_domanda_aperta_senza_traccia_non_si_pubblica(admin_client, simulazione_di_tipo):
    """La traccia è il metro con cui il modello correggerà: senza, quella
    domanda arriverebbe a chi risponde e nessuno saprebbe valutarla."""
    simulazione = simulazione_di_tipo(SIMULATION_KIND_OPEN, {"expected_answer": "  "})

    risposta = _pubblica(admin_client, simulazione)

    assert risposta.status_code == 409
    assert "non ha la risposta attesa" in risposta.json()["detail"]


def test_un_ordinamento_con_un_passo_vuoto_non_si_pubblica(admin_client, simulazione_di_tipo):
    simulazione = simulazione_di_tipo(
        SIMULATION_KIND_ORDERING, {"ordered_steps": ["Primo", "  ", "Terzo"]}
    )

    risposta = _pubblica(admin_client, simulazione)

    assert risposta.status_code == 409
    assert "ha un passo vuoto" in risposta.json()["detail"]


def test_un_ordinamento_con_due_passi_uguali_non_si_pubblica(admin_client, simulazione_di_tipo):
    """Sarebbero due risposte giuste, e chi risponde non avrebbe modo di
    sapere quale delle due il test si aspetta."""
    simulazione = simulazione_di_tipo(
        SIMULATION_KIND_ORDERING,
        {"ordered_steps": ["Verifica il documento", "verifica  IL documento"]},
    )

    risposta = _pubblica(admin_client, simulazione)

    assert risposta.status_code == 409
    assert "ha due passi uguali" in risposta.json()["detail"]


@pytest.mark.parametrize(
    ("coppie", "atteso"),
    [
        ([{"left": "  ", "right": "Ufficio"}], "ha una voce da abbinare vuota"),
        ([{"left": "Caso", "right": "  "}], "ha un abbinamento vuoto"),
        (
            [
                {"left": "Reclamo", "right": "Ufficio A"},
                {"left": " reclamo ", "right": "Ufficio B"},
            ],
            "ha due voci uguali da abbinare",
        ),
        (
            [{"left": "Reclamo", "right": "Ufficio A"}, {"left": "Rimborso", "right": "ufficio a"}],
            "ha due abbinamenti uguali",
        ),
    ],
)
def test_un_abbinamento_ambiguo_o_incompleto_non_si_pubblica(
    admin_client, simulazione_di_tipo, coppie, atteso
):
    simulazione = simulazione_di_tipo(SIMULATION_KIND_MATCHING, {"pairs": coppie})

    risposta = _pubblica(admin_client, simulazione)

    assert risposta.status_code == 409
    assert atteso in risposta.json()["detail"]


def test_ritirare_una_simulazione_non_chiede_niente(
    admin_client, organization, db_session, indicizzazione
):
    """È la ragione per cui esiste: quando c'è qualcosa che non va, il primo
    gesto deve poter essere toglierla di mezzo."""
    simulazione = _crea(admin_client, organization).json()

    risposta = admin_client.put(
        f"{SIMULAZIONI}/{simulazione['id']}/status", json={"status": SIMULATION_STATUS_DRAFT}
    )

    assert risposta.status_code == 200
    assert risposta.json()["status"] == SIMULATION_STATUS_DRAFT
