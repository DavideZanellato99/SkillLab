"""Il controllo del serbatoio: cosa segnala, cosa non segnala, cosa non blocca.

Il modello è finto nella parte che lo usa, e non è una rinuncia: quello che va
provato non è se riconosce una risposta inventata, è che le sue segnalazioni
arrivino a chi rivede attaccate alla domanda giusta, che quelle su domande
inesistenti cadano, e soprattutto che **niente di tutto questo fermi la
pubblicazione**, che è la promessa su cui il controllo sta in piedi.

La metà che non usa il modello, invece, si prova per intero: sono conti, e i
conti si verificano.
"""

import uuid

import pytest

import simulation_review
from models import (
    SIMULATION_STATUS_DRAFT,
    SimulationChunk,
    SimulationQuestion,
    TechnicalSimulation,
)
from simulation_review import (
    DUPLICATE_THRESHOLD,
    Finding,
    ReviewQuestion,
    build_report,
    duplicate_findings,
    fingerprint,
    option_findings,
    snapshot,
)

REVIEW = "/api/admin/simulations/{}/review"


@pytest.fixture
def make_pool(db_session, organization):
    """Una simulazione in bozza con il suo documento indicizzato e le domande."""

    def _factory(*, questions=3, source="ai") -> TechnicalSimulation:
        simulation = TechnicalSimulation(
            title="Sblocco carta",
            description="Test di prova",
            status=SIMULATION_STATUS_DRAFT,
            source=source,
            organization_id=organization.id,
            document_name="procedura.txt" if source == "ai" else "",
            document_text="La carta si sblocca dopo aver identificato il cliente."
            if source == "ai"
            else "",
        )
        db_session.add(simulation)
        db_session.flush()
        if source == "ai":
            db_session.add(
                SimulationChunk(
                    simulation_id=simulation.id,
                    ordinal=1,
                    content="La carta si sblocca dopo aver identificato il cliente.",
                    embedding=[0.1, 0.2, 0.3],
                )
            )
        for position in range(1, questions + 1):
            db_session.add(
                SimulationQuestion(
                    simulation_id=simulation.id,
                    position=position,
                    text=f"Domanda {position}",
                    options=["Alfa", "Beta", "Gamma", "Delta"],
                    correct_option=0,
                    expected_answer="",
                    explanation="Perché sì.",
                    source_chunks=[1] if source == "ai" else [],
                )
            )
        db_session.flush()
        db_session.refresh(simulation)
        return simulation

    return _factory


def _question(position=1, **campi) -> ReviewQuestion:
    base = {
        "position": position,
        "text": f"Domanda {position}",
        "options": ["Alfa", "Beta", "Gamma", "Delta"],
        "correct_option": 0,
        "expected_answer": "",
        "ordered_steps": [],
        "pairs": [],
        "source_chunks": [1],
    }
    base.update(campi)
    return ReviewQuestion(**base)


# ── I duplicati semantici ─────────────────────────────


def test_due_domande_vicine_vengono_segnalate():
    """Il buco lasciato aperto da `_without_duplicates`, che toglie solo le
    copie scritte identiche: la stessa domanda girata con altre parole
    passava, e l'estrazione poteva pescarle tutte e due."""
    identico = [1.0, 0.0, 0.0]

    findings = duplicate_findings([3, 7], [identico, identico])

    assert len(findings) == 1
    assert findings[0].kind == "duplicate"
    assert findings[0].positions == [3, 7]


def test_due_domande_solo_vicine_non_vengono_segnalate():
    """Su un documento aziendale le domande parlano tutte della stessa
    procedura e si somigliano tutte un po': la soglia è alta apposta, perché
    un elenco di cinquanta segnalazioni è lo stesso problema di cinquanta
    righe uguali."""
    findings = duplicate_findings([1, 2], [[1.0, 0.0], [0.5, 0.86]])

    assert findings == []


def test_la_soglia_dei_duplicati_resta_alta():
    """Se qualcuno la abbassa sotto questo valore, mezzo serbatoio comincia a
    comparire fra le segnalazioni e il pannello smette di essere letto."""
    assert DUPLICATE_THRESHOLD >= 0.9


# ── Le regole sulle alternative ───────────────────────


def test_la_corretta_molto_piu_lunga_viene_segnalata():
    """Chi non sa la procedura la indovina lo stesso, quindi la domanda non
    misura più niente."""
    question = _question(
        options=[
            "Si autorizza solo se il cliente ha firmato il modulo e sono passati meno di trenta "
            "giorni dall'addebito contestato",
            "Sempre",
            "Mai",
            "Solo il lunedì",
        ],
        correct_option=0,
    )

    findings = option_findings([question])

    assert [f.kind for f in findings] == ["longest_correct"]
    assert findings[0].positions == [1]


def test_alternative_di_lunghezza_simile_non_vengono_segnalate():
    findings = option_findings([_question()])

    assert findings == []


def test_la_corretta_sempre_nella_stessa_posizione_viene_segnalata():
    """Chi rifà il test più volte se ne accorge e risponde a caso con la
    stessa lettera. È una proprietà del serbatoio, quindi la segnalazione non
    porta posizioni: non c'è una riga da correggere, c'è una fila da
    rimescolare."""
    questions = [_question(position=i, correct_option=1) for i in range(1, 13)]

    findings = option_findings(questions)

    sbilanciata = [f for f in findings if f.kind == "answer_position"]
    assert len(sbilanciata) == 1
    assert sbilanciata[0].positions == []
    assert "B" in sbilanciata[0].message


def test_su_poche_domande_la_distribuzione_non_dice_niente():
    """Su cinque domande tre "B" sono un caso, non un difetto."""
    questions = [_question(position=i, correct_option=1) for i in range(1, 6)]

    assert [f for f in option_findings(questions) if f.kind == "answer_position"] == []


def test_sugli_altri_tipi_le_regole_sulle_alternative_non_scattano():
    """Dove non ci sono alternative la lista esce vuota da sé, senza un caso
    speciale da ricordare."""
    aperte = [
        _question(position=i, options=[], correct_option=None, expected_answer="Traccia.")
        for i in range(1, 13)
    ]

    assert option_findings(aperte) == []


# ── L'impronta, cioè come l'esito invecchia ───────────


def test_correggere_una_domanda_cambia_l_impronta():
    prima = fingerprint([_question(text="Entro quanti giorni")])
    dopo = fingerprint([_question(text="Entro quanti giorni lavorativi")])

    assert prima != dopo


def test_lo_stesso_serbatoio_da_la_stessa_impronta():
    """Riletto in un altro ordine resta lo stesso serbatoio: l'impronta si
    calcola sulle domande ordinate per posizione."""
    a = fingerprint([_question(position=1), _question(position=2)])
    b = fingerprint([_question(position=2), _question(position=1)])

    assert a == b


def test_la_spiegazione_non_entra_nell_impronta(db_session, make_pool):
    """Nessun controllo la legge, quindi correggere un refuso in una
    spiegazione non deve far invecchiare un esito ancora valido."""
    simulation = make_pool(questions=1)
    prima = fingerprint(snapshot(simulation.questions))
    simulation.questions[0].explanation = "Un'altra spiegazione, riscritta."
    db_session.flush()

    assert fingerprint(snapshot(simulation.questions)) == prima


# ── L'ordine in cui si leggono ────────────────────────


def test_le_segnalazioni_escono_dalla_piu_grave():
    """È l'ordine in cui chi rivede vuole lavorarci, cioè il motivo per cui
    questo controllo esiste."""
    report = build_report(
        [
            Finding("longest_correct", simulation_review.SEVERITY_LOW, [2], "bassa"),
            Finding("unsupported", simulation_review.SEVERITY_HIGH, [40], "alta"),
            Finding("duplicate", simulation_review.SEVERITY_MEDIUM, [5, 9], "media"),
        ],
        checked=50,
    )

    assert [f["severity"] for f in report["findings"]] == ["high", "medium", "low"]
    assert report["checked"] == 50


# ── L'endpoint ────────────────────────────────────────


def _finto_controllo(monkeypatch, findings=None, embeddings=None, errore=None):
    """Sostituisce le due chiamate a OpenAI dentro il router che le fa."""

    async def _embed(texts):
        if errore:
            raise errore
        # Vettori tutti diversi: nessun duplicato, se non si chiede altro
        return embeddings or [
            [1.0 if i == k else 0.0 for i in range(len(texts))] for k in range(len(texts))
        ]

    async def _grounding(questions, chunks, kind):
        return findings or []

    monkeypatch.setattr("routers.admin_simulations.embed_texts", _embed)
    monkeypatch.setattr("routers.admin_simulations.grounding_findings", _grounding)


def test_l_esito_viene_salvato_e_torna_col_dettaglio(admin_client, make_pool, monkeypatch):
    simulation = make_pool(questions=3)
    _finto_controllo(
        monkeypatch,
        findings=[
            Finding(
                "unsupported", simulation_review.SEVERITY_HIGH, [2], "Il documento non lo dice."
            )
        ],
    )

    risposta = admin_client.post(REVIEW.format(simulation.id))

    assert risposta.status_code == 200, risposta.text
    review = risposta.json()["review"]
    assert review["findings"][0]["kind"] == "unsupported"
    assert review["findings"][0]["positions"] == [2]
    assert review["is_stale"] is False


def test_il_controllo_non_blocca_la_pubblicazione(admin_client, make_pool, monkeypatch):
    """La promessa su cui tutto il resto sta in piedi: due domande simili
    sono un difetto piccolo, e un controllo che sbaglia e blocca è peggio di
    uno che sbaglia e avvisa."""
    # Scritta a mano, dove il serbatoio pieno sono dieci domande: qui si
    # prova che a fermare la pubblicazione non sono le segnalazioni, non che
    # il serbatoio basti.
    simulation = make_pool(questions=10, source="manual")
    _finto_controllo(
        monkeypatch,
        findings=[
            Finding("unsupported", simulation_review.SEVERITY_HIGH, [1], "Inventata."),
            Finding("unsupported", simulation_review.SEVERITY_HIGH, [2], "Anche questa."),
        ],
    )
    admin_client.post(REVIEW.format(simulation.id))

    pubblicazione = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/status", json={"status": "published"}
    )

    assert pubblicazione.status_code == 200
    assert pubblicazione.json()["status"] == "published"
    # E l'esito resta lì da leggere, con le sue segnalazioni aperte. Sono più
    # delle due finte: il serbatoio della fixture ha la corretta sempre in
    # prima posizione, e il controllo che si conta lo dice per conto suo.
    findings = pubblicazione.json()["review"]["findings"]
    assert sum(1 for f in findings if f["kind"] == "unsupported") == 2


def test_riscrivere_una_domanda_fa_invecchiare_l_esito(admin_client, make_pool, monkeypatch):
    """L'esito parla di un serbatoio che non c'è più, e lo dice invece di
    rigenerarsi da solo: rifarlo a ogni virgola corretta sarebbe una chiamata
    a pagamento fatta da nessuno."""
    simulation = make_pool(questions=3)
    _finto_controllo(monkeypatch)
    admin_client.post(REVIEW.format(simulation.id))

    domande = admin_client.get(f"/api/admin/simulations/{simulation.id}").json()["questions"]
    payload = [
        {
            "text": "Un testo del tutto diverso" if q["position"] == 1 else q["text"],
            "options": q["options"],
            "correct_option": q["correct_option"],
            "expected_answer": q["expected_answer"],
            "ordered_steps": None,
            "pairs": None,
            "explanation": q["explanation"],
        }
        for q in domande
    ]
    dopo = admin_client.put(
        f"/api/admin/simulations/{simulation.id}/questions", json={"questions": payload}
    )

    assert dopo.status_code == 200, dopo.text
    assert dopo.json()["review"]["is_stale"] is True


def test_senza_domande_non_c_e_niente_da_controllare(admin_client, make_pool, monkeypatch):
    simulation = make_pool(questions=0)
    _finto_controllo(monkeypatch)

    risposta = admin_client.post(REVIEW.format(simulation.id))

    assert risposta.status_code == 409


def test_su_una_simulazione_a_mano_il_modello_non_viene_chiamato(
    admin_client, make_pool, monkeypatch
):
    """Non c'è nessun documento da cui una domanda debba essere sostenuta:
    restano i controlli che non costano niente."""
    simulation = make_pool(questions=3, source="manual")
    chiamato = {"grounding": False}

    async def _embed(texts):
        return [[1.0 if i == k else 0.0 for i in range(len(texts))] for k in range(len(texts))]

    async def _grounding(questions, chunks, kind):
        chiamato["grounding"] = True
        return []

    monkeypatch.setattr("routers.admin_simulations.embed_texts", _embed)
    monkeypatch.setattr("routers.admin_simulations.grounding_findings", _grounding)

    risposta = admin_client.post(REVIEW.format(simulation.id))

    assert risposta.status_code == 200
    # La rotta la chiama comunque, ed è lei a non avere niente da verificare:
    # la regola sta in un posto solo, non in un caso speciale del router
    assert chiamato["grounding"] is True
    assert risposta.json()["review"]["checked"] == 0


def test_il_fornitore_che_non_risponde_e_un_502(admin_client, make_pool, monkeypatch):
    simulation = make_pool(questions=3)
    _finto_controllo(monkeypatch, errore=RuntimeError("embedding non disponibili"))

    risposta = admin_client.post(REVIEW.format(simulation.id))

    assert risposta.status_code == 502
    assert admin_client.get(f"/api/admin/simulations/{simulation.id}").json()["review"] is None


def test_niente_controllo_e_null_non_una_lista_vuota(admin_client, make_pool):
    """Nessuno lo ha ancora chiesto, che è diverso da un controllo passato
    senza rilievi: quello è un esito con la lista vuota, ed è una notizia."""
    simulation = make_pool(questions=3)

    dettaglio = admin_client.get(f"/api/admin/simulations/{simulation.id}").json()

    assert dettaglio["review"] is None


def test_un_org_admin_non_controlla_un_altro_tenant(
    org_admin_client, db_session, make_pool, monkeypatch
):
    """404 e non 403: fuori dal proprio tenant una simulazione non esiste."""
    from models import Organization

    altra = Organization(name="Altra", slug=f"altra-{uuid.uuid4().hex[:6]}")
    db_session.add(altra)
    db_session.flush()
    simulation = make_pool(questions=3)
    simulation.organization_id = altra.id
    db_session.flush()
    _finto_controllo(monkeypatch)

    assert org_admin_client.post(REVIEW.format(simulation.id)).status_code == 404
