"""Le risposte finte di un test, nella forma in cui la consegna le fotografa.

Un tentativo porta con sé le domande, la risposta data e quella esatta come
erano al momento della consegna (vedi ``SimulationAttempt``), e ogni tipo di
test le fotografa a modo suo: la scelta multipla un indice e un tempo,
l'ordinamento due liste, l'abbinamento due elenchi di coppie, la risposta
aperta un testo e il giudizio del modello. Queste quattro funzioni scrivono
quelle fotografie con le stesse chiavi e gli stessi conti della consegna
vera (``routers/simulations.py``), così la vista dei contenuti, che le
riapre per contare quante volte ogni domanda è stata data giusta, non
distingue un tentativo finto da uno vero.

``bravura`` è la probabilità di azzeccare, da 0 a 1: è l'unica cosa che la
persona porta dentro, e il resto è il caso.
"""

import random

from models import (
    SIMULATION_KIND_MATCHING,
    SIMULATION_KIND_MULTIPLE,
    SIMULATION_KIND_OPEN,
    SIMULATION_KIND_ORDERING,
    SimulationQuestion,
)
from simulation_scoring import (
    is_partially_correct,
    matched_points,
    open_answer_points,
    question_points,
)

# Quante domande ha un tentativo, le stesse della consegna vera
DOMANDE_PER_TENTATIVO = 10


def _base(domanda: SimulationQuestion, posizione: int) -> dict:
    """Le chiavi che tutte le fotografie hanno in comune."""
    return {
        "question_id": str(domanda.id),
        "position": posizione,
        "text": domanda.text,
        "explanation": domanda.explanation,
    }


def _multipla(
    rng: random.Random, domanda: SimulationQuestion, posizione: int, bravura: float
) -> dict:
    """Una crocetta, con il tempo che ha richiesto."""
    # La seconda domanda del serbatoio è quella scritta male, e la nona è
    # quella che la gente lascia in bianco: sono i due casi che la tabella
    # delle domande deve far notare
    if domanda.position == 2:
        giusta = rng.random() < 0.1
        in_bianco = False
    elif domanda.position == 9:
        in_bianco = rng.random() < 0.5
        giusta = False if in_bianco else rng.random() < bravura
    else:
        in_bianco = False
        giusta = rng.random() < bravura

    opzioni = domanda.options or []
    if in_bianco:
        scelta = None
    elif giusta:
        scelta = domanda.correct_option
    else:
        sbagliate = [i for i in range(len(opzioni)) if i != domanda.correct_option]
        scelta = rng.choice(sbagliate) if sbagliate else None
    millisecondi = None if in_bianco else rng.randint(6000, 240000)
    return {
        **_base(domanda, posizione),
        "options": opzioni,
        "selected_option": scelta,
        "correct_option": domanda.correct_option,
        "is_correct": giusta,
        "elapsed_ms": millisecondi,
        "points": question_points(giusta, millisecondi),
    }


def _ordinamento(
    rng: random.Random, domanda: SimulationQuestion, posizione: int, bravura: float
) -> dict:
    """I passi rimessi in fila, con qualche scambio quando non si sa."""
    corretti = [str(s) for s in (domanda.ordered_steps or [])]
    if rng.random() < 0.05:
        proposti: list[str] = []
    elif rng.random() < bravura:
        proposti = list(corretti)
    else:
        # Uno, due o tre scambi di passi vicini: è come si sbaglia davvero
        # un ordine che si conosce a metà, non un mescolamento a caso
        proposti = list(corretti)
        for _ in range(rng.randint(1, 3)):
            if len(proposti) < 2:
                break
            i = rng.randrange(len(proposti) - 1)
            proposti[i], proposti[i + 1] = proposti[i + 1], proposti[i]
    indovinati = sum(
        1 for mio, giusto in zip(proposti, corretti, strict=False) if mio == giusto
    )
    punti = matched_points(indovinati, len(corretti))
    return {
        **_base(domanda, posizione),
        "given_steps": proposti,
        "correct_steps": corretti,
        "matched_count": indovinati,
        "item_count": len(corretti),
        "is_correct": is_partially_correct(punti),
        "points": punti,
    }


def _abbinamento(
    rng: random.Random, domanda: SimulationQuestion, posizione: int, bravura: float
) -> dict:
    """Le coppie proposte: quelle sbagliate si scambiano l'abbinato fra loro."""
    corrette = [
        {"left": str(p.get("left") or ""), "right": str(p.get("right") or "")}
        for p in (domanda.pairs or [])
    ]
    sapute = [c for c in corrette if rng.random() < bravura]
    confuse = [c for c in corrette if c not in sapute]
    destre = [c["right"] for c in confuse]
    rng.shuffle(destre)
    proposte = [dict(c) for c in sapute] + [
        {"left": c["left"], "right": d} for c, d in zip(confuse, destre, strict=True)
    ]
    proposte.sort(key=lambda p: [c["left"] for c in corrette].index(p["left"]))
    per_sinistra = {p["left"]: p["right"] for p in proposte}
    indovinate = sum(1 for c in corrette if per_sinistra.get(c["left"]) == c["right"])
    punti = matched_points(indovinate, len(corrette))
    return {
        **_base(domanda, posizione),
        "given_pairs": proposte,
        "correct_pairs": corrette,
        "matched_count": indovinate,
        "item_count": len(corrette),
        "is_correct": is_partially_correct(punti),
        "points": punti,
    }


def _aperta(
    rng: random.Random, domanda: SimulationQuestion, posizione: int, bravura: float
) -> dict:
    """Un testo scritto e il giudizio che avrebbe ricevuto.

    La risposta attesa è un elenco puntato; quella data ne riprende una
    parte, in prosa, e il giudizio è la quota ripresa. È quello che il
    modello farebbe su una risposta che dice le cose giuste ma non tutte.
    """
    attesi = [
        riga.lstrip("- ").strip()
        for riga in (domanda.expected_answer or "").splitlines()
        if riga.strip()
    ]
    if rng.random() < 0.08 or not attesi:
        scritta = None
        qualita = None
    else:
        quanti = max(
            1, round(len(attesi) * min(1.0, bravura + rng.uniform(-0.25, 0.15)))
        )
        ripresi = [attesi[i] for i in sorted(rng.sample(range(len(attesi)), quanti))]
        scritta = " ".join(ripresi)
        qualita = round(quanti / len(attesi) + rng.uniform(-0.1, 0.05), 2)

    punti = open_answer_points(qualita)
    if qualita is None:
        riscontro = ""
    elif punti >= 0.9:
        riscontro = (
            "Risposta completa: riporta tutti gli elementi della risposta attesa."
        )
    elif punti >= 0.6:
        riscontro = (
            "Risposta corretta ma parziale: manca almeno uno degli elementi della "
            "risposta attesa."
        )
    else:
        riscontro = "Risposta insufficiente: tocca solo una parte marginale di quanto richiesto."
    return {
        **_base(domanda, posizione),
        "answer_text": scritta,
        "expected_answer": domanda.expected_answer,
        "feedback": riscontro,
        "is_correct": is_partially_correct(punti),
        "points": punti,
    }


_PER_TIPO = {
    SIMULATION_KIND_MULTIPLE: _multipla,
    SIMULATION_KIND_ORDERING: _ordinamento,
    SIMULATION_KIND_MATCHING: _abbinamento,
    SIMULATION_KIND_OPEN: _aperta,
}


def risposte(
    rng: random.Random, tipo: str, domande: list[SimulationQuestion], bravura: float
) -> list[dict]:
    """La fotografia delle risposte di un tentativo su queste domande.

    Ne estrae dieci come la consegna vera, o tutte se sono meno.
    """
    costruisci = _PER_TIPO[tipo]
    scelte = rng.sample(domande, k=min(DOMANDE_PER_TENTATIVO, len(domande)))
    return [
        costruisci(rng, domanda, posizione, bravura)
        for posizione, domanda in enumerate(
            sorted(scelte, key=lambda d: d.position), start=1
        )
    ]
