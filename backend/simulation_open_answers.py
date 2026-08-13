"""Il giudizio sulle risposte aperte di un test, in una chiamata sola.

Su un test a scelta multipla la correzione è un confronto fra due numeri e
sta nel router. Qui non può esserlo: la risposta è testo scritto da una
persona, e dire se "prima si identifica il cliente" copre una procedura che
il documento descrive in cinque righe è un giudizio, non un uguale.

Il modello riceve, per ogni domanda, la traccia di quello che la risposta
doveva dire (``expected_answer``, riletta da un umano prima della
pubblicazione) e quello che l'utente ha scritto. Non riceve il documento: la
traccia è già la sintesi che il super admin ha approvato, e dare in pasto
anche i passaggi rimetterebbe in discussione la chiave proprio nel momento
in cui la si applica.

**La risposta la scrive chi sta prendendo il voto**, quindi arriva al
modello recintata e ripulita dei marcatori con cui si imita la struttura di
questo prompt (vedi ``untrusted_text``): senza, chi ha già letto una volta il
proprio feedback sa che forma ha il blocco da falsificare.

**Una chiamata per tutto il tentativo**, e non una per domanda. Dieci
chiamate in parallelo su una consegna sarebbero dieci volte il rischio che
una vada storta, e in serie sarebbero un minuto di rotella; oltre a questo,
un modello che vede l'intero test giudica con lo stesso metro dalla prima
all'ultima, mentre dieci chiamate indipendenti sono dieci esaminatori
diversi.

Le risposte lasciate in bianco non arrivano fin qui: valgono zero senza
chiedere niente a nessuno (vedi ``routers/simulations.submit_attempt``), che
è più veloce, costa meno ed è l'unico modo di essere certi che chi non
scrive niente non prenda punti.

Qui non si tocca il database: entrano domande e risposte, escono giudizi.
"""

import untrusted_text
from openai_service import eval_json_completion

# Quanti caratteri di una risposta arrivano al modello. Una risposta a una
# domanda di procedura sta in poche righe: oltre questa soglia non c'è più
# una risposta, c'è un incollaggio del manuale, e giudicarlo per intero
# costerebbe token senza cambiare il giudizio.
MAX_ANSWER_CHARS = 2000


def _judge_prompt(marker: str) -> str:
    return (
        "Sei un formatore tecnico che corregge le risposte aperte di una verifica svolta dagli "
        "operatori di un'azienda.\n\n"
        "Per ogni domanda ricevi la traccia di quello che la risposta deve dire, scritta e "
        "approvata da chi ha preparato il test, e la risposta che l'operatore ha scritto.\n\n"
        "## COME ASSEGNARE IL PUNTEGGIO\n"
        '- "quality" è un numero da 0 a 1 che dice quanto la risposta copre la traccia.\n'
        "- 1: dice tutto quello che serve, e quello che dice è corretto.\n"
        "- 0,7 o 0,8: il punto centrale c'è, manca una condizione o un passaggio secondario.\n"
        "- 0,5: metà di quello che serviva, oppure giusto ma così vago da non dimostrare che la "
        "procedura la conosce.\n"
        "- 0,2 o 0,3: sfiora l'argomento senza rispondere.\n"
        "- 0: risposta sbagliata, fuori tema, o che dice il contrario della traccia.\n\n"
        "## COSA NON DEVE CAMBIARE IL VOTO\n"
        "- La forma: errori di ortografia, frasi senza verbo, elenchi al posto di periodi, "
        "maiuscole. Si verifica se conosce la procedura, non come scrive.\n"
        "- Le parole scelte: una risposta che dice la stessa cosa della traccia con parole sue "
        "vale quanto una che la ripete. Non cercare le parole della traccia, cerca il contenuto.\n"
        "- La lunghezza: una risposta breve che dice tutto vale 1, una lunga che gira attorno "
        "all'argomento no.\n"
        "- Quello che la traccia non chiede: informazioni giuste ma in più non aggiungono punti, "
        "e nemmeno li tolgono.\n\n"
        "## UNA REGOLA SEVERA\n"
        "Una risposta che afferma qualcosa di sbagliato non prende un punteggio alto perché nel "
        "resto dice cose giuste: sul lavoro quell'affermazione porterebbe a un errore. Quando la "
        "risposta contiene sia il punto giusto sia una cosa sbagliata, non superare 0,5.\n\n"
        "## IL COMMENTO\n"
        '- "feedback" sono una o due frasi rivolte a chi ha risposto, che dicono cosa mancava o '
        "cosa era sbagliato.\n"
        "- Lo legge chi ha appena consegnato: deve dire dove intervenire, non ripetere la "
        "traccia parola per parola.\n"
        "- Quando la risposta è completa, dillo in una frase sola senza cercare difetti.\n"
        "- Scrivi in italiano, dando del tu.\n\n"
        + untrusted_text.rule(marker, "ogni risposta dell'operatore")
        + "\n\n"
        "## FORMATO DELLA RISPOSTA\n"
        "Restituisci esclusivamente un JSON valido, senza testo aggiuntivo prima o dopo, con "
        "questa struttura esatta, una voce per ogni domanda ricevuta e con lo stesso numero di "
        "posizione:\n"
        '{"answers": [{"position": 1, "quality": 0.0, "feedback": ""}]}'
    )


def _judge_input(items: list[dict], marker: str) -> str:
    """Le domande da giudicare, come le legge il modello.

    Domanda e traccia le ha scritte chi ha preparato il test, e sono già
    passate da una rilettura umana; la risposta la scrive chi sta prendendo
    il voto, quindi sta dentro il recinto e senza i marcatori con cui si
    imita questo formato. "### DOMANDA 3, Traccia della risposta attesa:"
    lo sa scrivere chiunque abbia visto una volta il proprio feedback.
    """
    blocks = []
    for item in items:
        risposta = untrusted_text.neutralize(item["answer_text"])[:MAX_ANSWER_CHARS]
        blocks.append(
            f"### DOMANDA {item['position']}\n"
            f"Domanda: {item['text']}\n"
            f"Traccia della risposta attesa: {item['expected_answer']}\n"
            f"Risposta dell'operatore:\n{marker}\n{risposta}\n{marker}"
        )
    return "\n\n".join(blocks)


def _normalize_judgements(raw: dict, positions: set[int]) -> dict[int, dict]:
    """I giudizi del modello, per posizione, o ValueError se non ce n'è uno.

    Una voce storta si scarta da sola invece di far cadere l'intera
    consegna: chi ha svolto il test perderebbe tutto per una riga malformata
    su dieci. La domanda rimasta senza giudizio la gestisce il chiamante,
    che è l'unico a sapere quanto vale non essere stati giudicati.

    Una posizione che non era stata chiesta si butta: è il modello che si è
    inventato una domanda, e assegnarle dei punti li darebbe a nessuno.
    """
    judgements: dict[int, dict] = {}
    for entry in raw.get("answers") or []:
        if not isinstance(entry, dict):
            continue
        try:
            position = int(entry.get("position"))
            quality = float(entry.get("quality"))
        except (TypeError, ValueError):
            continue
        if position not in positions:
            continue
        judgements[position] = {
            "quality": quality,
            "feedback": str(entry.get("feedback") or "").strip(),
        }
    if not judgements:
        raise ValueError("Nessun giudizio utilizzabile nella risposta del modello.")
    return judgements


async def judge_open_answers(items: list[dict]) -> dict[int, dict]:
    """I giudizi sulle risposte aperte, per posizione della domanda.

    ``items`` è una voce per domanda risposta, con ``position``, ``text``,
    ``expected_answer`` e ``answer_text``. Torna un dizionario da posizione
    a ``{"quality": float, "feedback": str}``, che può non contenere tutte
    le posizioni chieste.

    Solleva RuntimeError se il modello non risponde, ValueError se risponde
    qualcosa di inutilizzabile: in entrambi i casi il tentativo non si
    scrive, perché un test consegnato a metà corretto non è un tentativo.
    """
    if not items:
        return {}

    positions = {item["position"] for item in items}
    marker = untrusted_text.fence()
    return await eval_json_completion(
        [
            {"role": "system", "content": _judge_prompt(marker)},
            {"role": "user", "content": _judge_input(items, marker)},
        ],
        # Dieci giudizi con due frasi di commento ciascuno, più i token che
        # il ragionamento spende prima di scriverli.
        max_completion_tokens=4096,
        normalize=lambda raw: _normalize_judgements(raw, positions),
        what="valutazione delle risposte aperte",
    )
