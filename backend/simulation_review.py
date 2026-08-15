"""Il controllo del serbatoio, cioè quello che si vede senza leggere tutto.

Cinquanta domande da rileggere una per una sono il punto in cui la revisione
umana si sfilaccia. Non perché nessuno voglia farla: perché sono cinquanta
righe tutte uguali, e chi le apre non ha nessun modo di sapere da quale
cominciare. Questo modulo dà quell'ordine, e non fa nient'altro.

**Segnala e basta.** La pubblicazione resta possibile con tutte le
segnalazioni aperte, ed è una scelta: due domande simili sono un difetto
piccolo, il conto di quanto due testi si somiglino è una soglia e non una
verità, e un controllo che sbaglia e blocca è peggio di uno che sbaglia e
avvisa. L'unica cosa che ferma la pubblicazione resta quella che la fermava
già, cioè una domanda a metà (vedi ``_unfinished_question``).

Le segnalazioni sono di due specie e nascono in due posti. Qui stanno quelle
che non costano niente:

- **i duplicati semantici**, che sono il buco lasciato aperto da
  ``_without_duplicates``: quello toglie solo le copie scritte identiche,
  mentre la stessa domanda girata con altre parole passa, e l'estrazione può
  pescarle tutte e due nello stesso tentativo. Gli embedding sono già in
  casa, quindi costa quanto un'indicizzazione;
- **le due regole sulle alternative che si contano**, cioè la corretta
  sistematicamente più lunga e la corretta sempre nella stessa posizione. Non
  servono un modello perché non sono giudizi, sono misure.

Quelle che un giudizio lo richiedono stanno in ``simulation_grounding``.
"""

import hashlib
import json
from collections import Counter
from dataclasses import asdict, dataclass

from simulation_rag import cosine_similarity

# Le specie di segnalazione, e quanto pesano. La gravità non è decorazione:
# è quello con cui il pannello ordina le domande, cioè la ragione per cui
# questo controllo esiste.
SEVERITY_HIGH = "high"
SEVERITY_MEDIUM = "medium"
SEVERITY_LOW = "low"

# Sopra questa somiglianza due domande chiedono la stessa cosa.
#
# La soglia è alta di proposito. Su un documento aziendale le domande parlano
# tutte della stessa procedura e quindi si somigliano tutte un po': a 0.80
# verrebbe segnalato mezzo serbatoio, e un elenco di cinquanta segnalazioni è
# lo stesso problema di cinquanta righe uguali, con un passaggio in più.
# Quello che si vuole prendere è la domanda riscritta, non la domanda
# vicina.
DUPLICATE_THRESHOLD = 0.93

# Quanto la risposta corretta deve essere più lunga di tutte le altre perché
# sia riconoscibile a occhio. Il rapporto e non la differenza: su alternative
# di tre parole due parole in più sono tanto, su alternative di trenta no.
LONGEST_CORRECT_RATIO = 1.6

# Quanto può stare sbilanciata la posizione della risposta corretta prima che
# diventi una scorciatoia. Con quattro alternative il caso vuole un quarto
# delle domande per posizione; metà è già un test in cui rispondere sempre
# "B" prende la sufficienza.
ANSWER_POSITION_SHARE = 0.5

# Sotto questo numero di domande la distribuzione delle risposte non dice
# niente: su cinque domande tre "B" sono un caso, non un difetto.
ANSWER_POSITION_MIN_QUESTIONS = 10


@dataclass(frozen=True)
class ReviewQuestion:
    """Una domanda staccata dalla sessione, come il controllo la legge.

    Il controllo aspetta il modello per decine di secondi, e in quel tempo la
    connessione al database è già tornata al pool: una riga della sessione a
    cui si chiedesse il testo dopo il commit tornerebbe a interrogare il
    database proprio mentre nessuno gliela sta tenendo. È la stessa ragione
    per cui il catalogo di una bozza di percorso passa da una dataclass.

    Ci sono tutti e quattro i tipi di chiave: quale sia piena lo decide il
    tipo del test, e questo modulo non ha nessun motivo di saperlo.
    """

    position: int
    text: str
    options: list
    correct_option: int | None
    expected_answer: str
    ordered_steps: list
    pairs: list
    source_chunks: list[int]


@dataclass(frozen=True)
class ReviewChunk:
    """Un passaggio del documento, staccato dalla sessione."""

    ordinal: int
    content: str


def snapshot(questions) -> list[ReviewQuestion]:
    """Le domande del serbatoio, in ordine e staccate dal database."""
    return [
        ReviewQuestion(
            position=q.position,
            text=q.text or "",
            options=list(q.options or []),
            correct_option=q.correct_option,
            expected_answer=q.expected_answer or "",
            ordered_steps=list(q.ordered_steps or []),
            pairs=list(q.pairs or []),
            source_chunks=list(q.source_chunks or []),
        )
        for q in sorted(questions, key=lambda q: q.position)
    ]


@dataclass(frozen=True)
class Finding:
    """Una segnalazione: cosa non va, su quali domande, e quanto pesa."""

    kind: str
    severity: str
    # Le posizioni delle domande a cui si riferisce, da 1. Sono più d'una sui
    # duplicati, che parlano di una coppia, e vuote sulle segnalazioni che
    # riguardano il serbatoio nel suo insieme.
    positions: list[int]
    message: str


def fingerprint(questions) -> str:
    """L'impronta del serbatoio com'è adesso.

    Le domande non hanno una data di modifica, perché si riscrivono in blocco
    (vedi ``save_questions``): senza questa, un esito salvato continuerebbe a
    parlare di un serbatoio che non c'è più, e sarebbe la cosa peggiore che
    un controllo possa fare, cioè rassicurare su qualcosa che nessuno ha
    guardato.

    Entra tutto quello che una segnalazione può riguardare: il testo, la
    chiave del tipo e le citazioni. Non entra la spiegazione, che nessun
    controllo legge, così correggere un refuso in una spiegazione non fa
    invecchiare un esito ancora valido.

    **Passa sempre da ``snapshot``**, qualunque cosa le si dia. I due
    chiamanti le passano due cose diverse, la fotografia da una parte e le
    righe del database dall'altra, e su quelle una chiave vuota è ``None``
    mentre sulla fotografia è una lista vuota: senza questa riga le due
    impronte non coinciderebbero mai, e ogni esito nascerebbe già vecchio.
    """
    material = [
        [
            q.position,
            q.text,
            q.options,
            q.correct_option,
            q.expected_answer,
            q.ordered_steps,
            q.pairs,
            q.source_chunks,
        ]
        for q in snapshot(questions)
    ]
    payload = json.dumps(material, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def is_stale(simulation) -> bool:
    """True quando le domande sono cambiate dopo l'ultimo controllo.

    Come ``reviews.is_stale`` e come il debriefing: non si aggiorna niente da
    solo, si dice a chi legge che quello che ha davanti non parla più di
    quello che sta guardando. Rifare il controllo da sé a ogni salvataggio
    sarebbe una chiamata a pagamento fatta da nessuno, e ne partirebbe una a
    ogni virgola corretta.
    """
    if not simulation.review_fingerprint:
        return False
    return simulation.review_fingerprint != fingerprint(simulation.questions)


def duplicate_findings(positions: list[int], embeddings: list[list[float]]) -> list[Finding]:
    """Le coppie di domande che chiedono la stessa cosa.

    Il conto è lo stesso prodotto scalare del recupero dei passaggi
    (``simulation_rag.cosine_similarity``): cinquanta domande sono
    milleduecento confronti, cioè lavoro da millisecondi, e non serve
    nient'altro di quello che il progetto ha già.

    Una domanda può comparire in più coppie, e le coppie non si raggruppano:
    chi rivede deve vedere quali due si somigliano, perché è guardandole
    accanto che decide quale delle due tenere.
    """
    findings = []
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            score = cosine_similarity(embeddings[i], embeddings[j])
            if score < DUPLICATE_THRESHOLD:
                continue
            findings.append(
                Finding(
                    kind="duplicate",
                    severity=SEVERITY_MEDIUM,
                    positions=[positions[i], positions[j]],
                    message=(
                        f"Le domande {positions[i]} e {positions[j]} chiedono quasi la stessa "
                        "cosa: se l'estrazione le pesca insieme, chi risponde vede due volte "
                        "la stessa domanda."
                    ),
                )
            )
    return findings


def _longest_correct(question) -> Finding | None:
    """La risposta corretta riconoscibile perché è la più lunga.

    È l'errore più comune di una domanda scritta in fretta, dal modello come
    da una persona: la corretta si porta dietro la condizione, l'eccezione e
    il perché, le sbagliate stanno in cinque parole. Chi non sa la procedura
    la indovina lo stesso, quindi la domanda non misura più niente.
    """
    options = [str(o or "") for o in (question.options or [])]
    index = question.correct_option
    if len(options) < 2 or index is None or not 0 <= index < len(options):
        return None
    correct = len(options[index])
    others = [len(o) for k, o in enumerate(options) if k != index]
    if not others or not correct:
        return None
    if correct < max(others) * LONGEST_CORRECT_RATIO:
        return None
    return Finding(
        kind="longest_correct",
        severity=SEVERITY_LOW,
        positions=[question.position],
        message=(
            f"Nella domanda {question.position} la risposta corretta è molto più lunga delle "
            "altre: si riconosce senza conoscere la procedura."
        ),
    )


def _answer_position(questions) -> Finding | None:
    """La risposta corretta quasi sempre nello stesso posto.

    È una proprietà del serbatoio e non di una domanda, quindi la
    segnalazione non porta posizioni: non c'è una riga da correggere, c'è una
    fila da rimescolare. Il prompt della generazione chiede già di variare la
    posizione, e questo è il controllo che dice se lo ha fatto davvero.
    """
    counts = Counter(
        q.correct_option for q in questions if q.correct_option is not None and (q.options or [])
    )
    total = sum(counts.values())
    if total < ANSWER_POSITION_MIN_QUESTIONS:
        return None
    index, most = counts.most_common(1)[0]
    if most / total <= ANSWER_POSITION_SHARE:
        return None
    lettera = chr(ord("A") + index)
    return Finding(
        kind="answer_position",
        severity=SEVERITY_LOW,
        positions=[],
        message=(
            f"La risposta corretta è la {lettera} in {most} domande su {total}: chi rifà il "
            "test più volte se ne accorge e risponde a caso con la stessa lettera."
        ),
    )


def option_findings(questions) -> list[Finding]:
    """Le due regole sulle alternative che si contano invece di giudicarle.

    Valgono solo dove ci sono delle alternative, cioè sulla scelta multipla:
    sugli altri tre tipi la lista esce vuota da sé, senza un caso speciale da
    ricordare.
    """
    findings = [f for f in (_longest_correct(q) for q in questions) if f is not None]
    sbilanciata = _answer_position(questions)
    if sbilanciata is not None:
        findings.append(sbilanciata)
    return findings


# Le segnalazioni si leggono dalla più grave, e a parità dalla domanda che
# viene prima: è l'ordine in cui chi rivede vuole lavorarci, cioè il motivo
# per cui questo controllo esiste.
_SEVERITY_ORDER = {SEVERITY_HIGH: 0, SEVERITY_MEDIUM: 1, SEVERITY_LOW: 2}


def build_report(findings: list[Finding], checked: int) -> dict:
    """L'esito come viene salvato sulla simulazione, già in ordine di lettura."""
    ordered = sorted(
        findings,
        key=lambda f: (_SEVERITY_ORDER.get(f.severity, 9), min(f.positions or [10**6])),
    )
    return {"findings": [asdict(f) for f in ordered], "checked": checked}
