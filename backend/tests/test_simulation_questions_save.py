"""Il salvataggio in blocco delle domande, tipo per tipo.

Il pannello di revisione manda tutte le domande insieme e il router le
riscrive da capo. Due cose vanno fissate qui, e nessuna delle due si vede
guardando una domanda a scelta multipla, che è il caso già coperto altrove.

La prima: una domanda deve portare **la chiave del tipo del suo test**, e il
tipo lo sa il server e non il payload. Una domanda di ordinamento senza i
passi non è una domanda a metà, è una domanda di un altro test: salvarla
manderebbe a chi risponde qualcosa che nessuna risposta indovina.

La seconda: le chiavi degli altri tipi si buttano invece di restare scritte.
Una traccia di risposta attesa salvata su un test a scelta multipla non la
legge nessuno, e resta lì a contraddire la domanda il giorno in cui qualcuno
va a guardare la riga.
"""

import pytest

from models import (
    SIMULATION_GENERATED_ITEMS,
    SIMULATION_KIND_MATCHING,
    SIMULATION_KIND_MULTIPLE,
    SIMULATION_KIND_OPEN,
    SIMULATION_KIND_ORDERING,
    SimulationQuestion,
    TechnicalSimulation,
)

SIMULAZIONI = "/api/admin/simulations"


@pytest.fixture
def simulazione(db_session, organization):
    """Una simulazione in bozza del tipo voluto, con il serbatoio vuoto."""

    def _factory(kind=SIMULATION_KIND_MULTIPLE):
        riga = TechnicalSimulation(
            title=f"Test {kind}", organization_id=organization.id, kind=kind, source="manual"
        )
        db_session.add(riga)
        db_session.flush()
        return riga

    return _factory


def _passi(quanti=SIMULATION_GENERATED_ITEMS) -> list[str]:
    return [f"Passo numero {i}" for i in range(quanti)]


def _coppie(quante=SIMULATION_GENERATED_ITEMS) -> list[dict]:
    return [{"left": f"Caso {i}", "right": f"Ufficio {i}"} for i in range(quante)]


def _domanda(**campi) -> dict:
    return {
        "text": "  Entro quanto si registra un reclamo?  ",
        "explanation": "  Perché sì.  ",
        **campi,
    }


def _salva(admin_client, simulazione, domande):
    return admin_client.put(
        f"{SIMULAZIONI}/{simulazione.id}/questions", json={"questions": domande}
    )


# ── Ogni tipo scrive la sua chiave e solo quella ──────────────────────


def test_una_domanda_aperta_conserva_la_traccia_e_niente_altro(admin_client, simulazione):
    test = simulazione(SIMULATION_KIND_OPEN)

    risposta = _salva(
        admin_client,
        test,
        [
            _domanda(
                expected_answer="  Deve dire che si verifica il documento.  ",
                # Arrivano dal form ma sono di un altro tipo: si buttano
                options=["Prima", "Seconda"],
                correct_option=0,
                ordered_steps=_passi(),
            )
        ],
    )

    assert risposta.status_code == 200
    (domanda,) = risposta.json()["questions"]
    assert domanda["expected_answer"] == "Deve dire che si verifica il documento."
    assert domanda["options"] == []
    assert domanda["correct_option"] is None
    assert domanda["ordered_steps"] is None
    # Il testo e la spiegazione arrivano dal form con gli spazi di chi scrive
    assert domanda["text"] == "Entro quanto si registra un reclamo?"


def test_un_ordinamento_conserva_i_passi_nell_ordine_giusto(admin_client, simulazione):
    """In ordine e non mescolati: la mescolata avviene molto più tardi,
    quando la domanda viene consegnata a chi risponde."""
    test = simulazione(SIMULATION_KIND_ORDERING)

    risposta = _salva(
        admin_client, test, [_domanda(ordered_steps=_passi(), expected_answer="ignorata")]
    )

    (domanda,) = risposta.json()["questions"]
    assert domanda["ordered_steps"] == _passi()
    assert domanda["expected_answer"] == ""
    assert domanda["pairs"] is None


def test_un_abbinamento_conserva_le_coppie_gia_accoppiate(admin_client, simulazione):
    test = simulazione(SIMULATION_KIND_MATCHING)

    risposta = _salva(admin_client, test, [_domanda(pairs=_coppie())])

    (domanda,) = risposta.json()["questions"]
    assert domanda["pairs"] == _coppie()
    assert domanda["ordered_steps"] is None


# ── La chiave del tipo deve esserci ───────────────────────────────────


@pytest.mark.parametrize(
    ("kind", "domanda", "atteso"),
    [
        (SIMULATION_KIND_ORDERING, {}, "non ha i passi da rimettere in ordine"),
        (SIMULATION_KIND_MATCHING, {}, "non ha le coppie da abbinare"),
        (SIMULATION_KIND_MULTIPLE, {}, "non ha le alternative fra cui scegliere"),
    ],
)
def test_una_domanda_di_un_altro_tipo_non_si_salva(
    admin_client, simulazione, kind, domanda, atteso
):
    test = simulazione(kind)

    risposta = _salva(admin_client, test, [_domanda(**domanda)])

    assert risposta.status_code == 422
    assert f"La domanda 1 {atteso}" in risposta.json()["detail"]


def test_il_numero_nel_messaggio_e_quello_della_domanda_storta(admin_client, simulazione):
    """Su cinquanta domande è l'unica cosa che permette di trovarla."""
    test = simulazione(SIMULATION_KIND_ORDERING)

    risposta = _salva(
        admin_client,
        test,
        [_domanda(ordered_steps=_passi()), _domanda(ordered_steps=_passi()), _domanda()],
    )

    assert risposta.status_code == 422
    assert "La domanda 3" in risposta.json()["detail"]


def test_una_domanda_aperta_senza_traccia_si_salva_lo_stesso(admin_client, simulazione):
    """Chi ne sta scrivendo trenta deve potersi fermare alla decima: a
    pretenderle finite è la pubblicazione, non il salvataggio."""
    test = simulazione(SIMULATION_KIND_OPEN)

    risposta = _salva(admin_client, test, [_domanda()])

    assert risposta.status_code == 200
    assert risposta.json()["questions"][0]["expected_answer"] == ""


# ── Le citazioni al documento ─────────────────────────────────────────


def test_correggere_un_refuso_non_toglie_il_rimando_al_documento(
    admin_client, simulazione, db_session
):
    """Gli ordinali dei passaggi non sono qualcosa che il super admin possa
    riscrivere nel form: perderli a ogni correzione toglierebbe a chi
    sbaglia il rimando alla procedura."""
    test = simulazione(SIMULATION_KIND_MULTIPLE)
    db_session.add(
        SimulationQuestion(
            simulation_id=test.id,
            position=1,
            text="Entro quanto si registra un reclamo?",
            options=["Prima", "Seconda", "Terza", "Quarta"],
            correct_option=1,
            explanation="Perché sì.",
            source_chunks=[3, 7],
        )
    )
    db_session.flush()

    invariata = _salva(
        admin_client,
        test,
        [
            _domanda(
                options=["Prima", "Seconda", "Terza", "Quarta"],
                correct_option=2,
                explanation="Spiegazione riscritta.",
            )
        ],
    )

    assert invariata.json()["questions"][0]["source_chunks"] == [3, 7]


def test_riscrivere_il_testo_di_una_domanda_ne_stacca_le_citazioni(
    admin_client, simulazione, db_session
):
    """Una domanda con un altro testo è un'altra domanda: tenerle i passaggi
    di prima le darebbe un rimando a un pezzo di procedura che non è più il
    suo."""
    test = simulazione(SIMULATION_KIND_MULTIPLE)
    db_session.add(
        SimulationQuestion(
            simulation_id=test.id,
            position=1,
            text="Entro quanto si registra un reclamo?",
            options=["Prima", "Seconda", "Terza", "Quarta"],
            correct_option=1,
            explanation="Perché sì.",
            source_chunks=[3, 7],
        )
    )
    db_session.flush()

    risposta = _salva(
        admin_client,
        test,
        [
            _domanda(
                text="Chi autorizza il rimborso?",
                options=["Prima", "Seconda", "Terza", "Quarta"],
                correct_option=1,
            )
        ],
    )

    assert risposta.json()["questions"][0]["source_chunks"] is None


def test_salvare_meno_domande_di_prima_toglie_quelle_in_fondo(
    admin_client, simulazione, db_session
):
    """Le righe si riscrivono da capo invece di aggiornarle una per una:
    così è impossibile lasciarne indietro una che l'admin aveva tolto."""
    test = simulazione(SIMULATION_KIND_OPEN)
    _salva(admin_client, test, [_domanda(expected_answer=f"Traccia {i}") for i in range(3)])

    risposta = _salva(admin_client, test, [_domanda(expected_answer="Rimasta")])

    assert [q["position"] for q in risposta.json()["questions"]] == [1]
    assert (
        db_session.query(SimulationQuestion)
        .filter(SimulationQuestion.simulation_id == test.id)
        .count()
        == 1
    )
