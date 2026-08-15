"""La domanda regge davvero il documento da cui dice di nascere?

È la metà del controllo del serbatoio che un giudizio lo richiede, e prende
l'errore grave: **una domanda la cui risposta indicata il documento non
sostiene**. Le altre segnalazioni sono difetti di forma, questa è una
domanda sbagliata, e chi la sbaglia se la porta al lavoro convinto di avere
imparato una procedura che non c'è scritta da nessuna parte.

Nasce dalla regola che il prompt della generazione ripete a ogni chiamata,
cioè che se i passaggi non bastano si scrivono domande partendo da dettagli
diversi degli stessi passaggi, **mai inventando** soglie o regole. Quella
regola non è verificabile mentre si scrive: è verificabile dopo, rileggendo
la domanda accanto ai passaggi che cita, ed è esattamente quello che questo
modulo fa fare al modello.

Nella stessa lettura entra la seconda cosa che un conto non può dire, cioè
se le **alternative sbagliate sono errori plausibili** o assurdità che
nessuno sceglierebbe. Non sono due lavori diversi come lo sono i due prompt
della bozza di scheda persona: è una lettura sola della stessa domanda con
gli stessi passaggi davanti, e chiederla in due chiamate vorrebbe dire
pagare due volte la stessa pagina di documento.

**Vale solo dove c'è un documento.** Su una simulazione scritta a mano non
c'è niente da cui una domanda debba essere sostenuta, e le domande senza
citazioni restano fuori: la citazione accompagna la spiegazione, e una
domanda che non ne ha non è per questo infondata, semplicemente non dice a
cosa confrontarla.
"""

import asyncio

from openai_service import eval_json_completion
from simulation_review import SEVERITY_HIGH, SEVERITY_LOW, Finding

# Quante domande per chiamata. Meno delle dieci della generazione, e per la
# ragione opposta: là si scrive e la risposta è lunga, qui si legge e a
# essere lungo è l'ingresso, perché ogni domanda si porta dietro i suoi
# passaggi. Sei domande con i loro passaggi stanno comode in una lettura, e
# le chiamate partono comunque insieme.
QUESTIONS_PER_CALL = 6


def _system_prompt() -> str:
    return (
        "Sei un revisore di test di formazione aziendale. Ti vengono consegnate delle domande "
        "già scritte, insieme ai passaggi del documento aziendale da cui dicono di nascere, e "
        "il tuo compito è dire quali non reggono.\n\n"
        "## COSA DEVI VERIFICARE\n"
        "**1. La risposta indicata è sostenuta dai passaggi.** È la cosa che conta di più. "
        "Segnala la domanda quando la risposta indicata come corretta non si ricava dai "
        "passaggi che la domanda cita, quando i passaggi dicono qualcosa di diverso, e "
        "soprattutto quando la domanda introduce una soglia, un termine, un importo o una "
        "regola che nei passaggi non compare. Una domanda con una risposta inventata è un "
        "errore che qualcuno porterà al lavoro.\n"
        "**2. Le alternative sbagliate sono errori plausibili.** Segnala la domanda quando "
        "una o più alternative sbagliate sono assurdità che nessun operatore sceglierebbe: "
        "una domanda in cui tre alternative su quattro si scartano senza sapere niente non "
        "misura la procedura, misura il buon senso.\n\n"
        "## COSA NON DEVI FARE\n"
        "- **Non riscrivere le domande** e non proporre versioni migliori: chi ti legge le "
        "correggerà da sé, e serve sapere quali guardare.\n"
        "- **Non segnalare una domanda perché è difficile**, perché è formulata in modo "
        "asciutto o perché tu avresti scelto un altro aspetto dell'argomento. Il difetto è "
        "che la risposta non regga, non che la domanda non ti piaccia.\n"
        "- **Non segnalare quello che i passaggi non coprono ma nemmeno contraddicono.** I "
        "passaggi citati sono una parte del documento, non tutto: se la risposta è coerente "
        "con quello che leggi e non ci sono numeri o regole comparsi dal nulla, la domanda "
        "va bene.\n"
        "- **Nel dubbio non segnalare.** Un elenco lungo di segnalazioni deboli è lo stesso "
        "problema di cinquanta domande tutte uguali, con un passaggio in più: chi rivede "
        "smette di leggerlo.\n\n"
        "## FORMATO DELLA RISPOSTA\n"
        "Restituisci esclusivamente un JSON valido, senza testo prima o dopo, con questa "
        "struttura esatta:\n"
        '{"findings": [{"position": 0, "kind": "", "message": ""}]}\n'
        '- "position": il numero della domanda, quello scritto accanto a lei.\n'
        '- "kind": "unsupported" se la risposta non è sostenuta dai passaggi, '
        '"implausible_options" se il problema sono le alternative sbagliate.\n'
        '- "message": una frase che dice cosa non torna, abbastanza precisa da poterla '
        "verificare rileggendo il passaggio. Scrivila in italiano.\n"
        "Se non c'è niente da segnalare, restituisci una lista vuota. È un esito normale e "
        "non un errore."
    )


def _key_of(question, kind: str) -> str:
    """La chiave della domanda, scritta come il suo tipo la vuole."""
    if kind == "open":
        return f"Traccia della risposta attesa: {question.expected_answer}"
    if kind == "ordering":
        passi = "; ".join(str(s) for s in (question.ordered_steps or []))
        return f"Sequenza corretta: {passi}"
    if kind == "matching":
        coppie = "; ".join(f"{p.get('left')} -> {p.get('right')}" for p in (question.pairs or []))
        return f"Abbinamenti corretti: {coppie}"
    options = question.options or []
    index = question.correct_option
    righe = [
        f"  {chr(ord('A') + i)}. {o}{'   <-- indicata come corretta' if i == index else ''}"
        for i, o in enumerate(options)
    ]
    return "Alternative:\n" + "\n".join(righe)


def _batch_input(batch, chunks_by_ordinal: dict[int, str], kind: str) -> str:
    """Le domande di una chiamata con i passaggi che citano.

    I passaggi si scrivono **una volta sola** in testa e le domande li
    richiamano per ordinale, invece di ripeterli sotto ciascuna. Le domande
    di uno stesso argomento citano quasi sempre gli stessi tre o quattro
    passaggi, quindi ripeterli vorrebbe dire pagare quattro volte la stessa
    pagina di documento a ogni chiamata. È anche la forma in cui il modello
    li ha già visti mentre le domande le scriveva.
    """
    usati = sorted({o for q in batch for o in (q.source_chunks or []) if o in chunks_by_ordinal})
    passaggi = "\n\n".join(f"[{o}] {chunks_by_ordinal[o]}" for o in usati)

    domande = []
    for question in batch:
        citati = ", ".join(str(o) for o in (question.source_chunks or [])) or "nessuno"
        domande.append(
            f"### DOMANDA {question.position}\n"
            f"Passaggi citati: {citati}\n"
            f"Testo: {question.text}\n"
            f"{_key_of(question, kind)}"
        )
    return f"## PASSAGGI DEL DOCUMENTO\n{passaggi}\n\n## DOMANDE DA VERIFICARE\n" + "\n\n".join(
        domande
    )


def _normalize(raw: dict, valid_positions: set[int]) -> list[Finding]:
    """Le segnalazioni del modello, ridotte a quelle utilizzabili.

    Una segnalazione su una domanda che non era in questa chiamata cade: è il
    modo in cui un modello inventa un numero, e lascerebbe chi rivede a
    cercare una posizione che non c'entra. Cade anche quella senza testo,
    perché "la domanda 7 ha un problema" non è una segnalazione, è un
    sospetto.
    """
    findings = []
    for entry in raw.get("findings") or []:
        if not isinstance(entry, dict):
            continue
        try:
            position = int(entry.get("position"))
        except (TypeError, ValueError):
            continue
        message = str(entry.get("message") or "").strip()
        if position not in valid_positions or not message:
            continue
        unsupported = str(entry.get("kind") or "").strip() != "implausible_options"
        findings.append(
            Finding(
                kind="unsupported" if unsupported else "implausible_options",
                # La risposta che il documento non sostiene è l'errore grave;
                # un distrattore assurdo rende la domanda più facile, non
                # sbagliata, e va letto dopo.
                severity=SEVERITY_HIGH if unsupported else SEVERITY_LOW,
                positions=[position],
                message=message,
            )
        )
    return findings


async def _check_batch(batch, chunks_by_ordinal: dict[int, str], kind: str) -> list[Finding]:
    valid = {q.position for q in batch}
    return await eval_json_completion(
        [
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": _batch_input(batch, chunks_by_ordinal, kind)},
        ],
        # Sei domande di cui, nel caso peggiore, tutte da segnalare con una
        # frase verificabile ciascuna, più quello che il ragionamento spende
        # leggendo i passaggi prima di scriverne una. Il caso normale è una
        # lista vuota, quindi il budget è il tetto e non il costo.
        max_completion_tokens=2048,
        normalize=lambda raw: _normalize(raw, valid),
        what="controllo del serbatoio",
    )


async def grounding_findings(questions, chunks, kind: str) -> list[Finding]:
    """Le domande che il documento non sostiene, e quelle mal costruite.

    Le chiamate partono **insieme**, come le cinque della generazione: il
    controllo è già un'attesa lunga, e metterle in fila la moltiplicherebbe
    per otto.

    **Una chiamata che va storta si porta via il proprio gruppo e non le
    altre**, ed è voluto qui più che altrove: un controllo che fallisce per
    intero perché sei domande su cinquanta non si sono lasciate leggere
    lascerebbe chi rivede senza niente, che è peggio di un esito parziale.
    Quante ne sono state davvero controllate lo dice il chiamante, che è
    l'unico a poterlo scrivere accanto all'esito.
    """
    chunks_by_ordinal = {c.ordinal: c.content for c in chunks}
    # Solo le domande che citano qualcosa di ancora esistente: dopo un
    # ricaricamento del documento le citazioni possono puntare a passaggi che
    # non ci sono più (vedi ``replace_document``), e su quelle non c'è niente
    # con cui confrontare.
    verificabili = [
        q for q in questions if any(o in chunks_by_ordinal for o in (q.source_chunks or []))
    ]
    if not verificabili:
        return []

    batches = [
        verificabili[i : i + QUESTIONS_PER_CALL]
        for i in range(0, len(verificabili), QUESTIONS_PER_CALL)
    ]
    outcomes = await asyncio.gather(
        *(_check_batch(batch, chunks_by_ordinal, kind) for batch in batches),
        return_exceptions=True,
    )

    findings: list[Finding] = []
    for outcome in outcomes:
        if not isinstance(outcome, BaseException):
            findings.extend(outcome)
    return findings


def verifiable_count(questions, chunks) -> int:
    """Quante domande la passata del modello può davvero verificare.

    Sta qui e non nel router perché è la stessa regola di ``grounding_findings``,
    e scritta due volte finirebbe per dire due numeri diversi: l'esito
    direbbe di aver controllato cinquanta domande dopo averne lette trenta.
    """
    ordinali = {c.ordinal for c in chunks}
    return sum(1 for q in questions if any(o in ordinali for o in (q.source_chunks or [])))
