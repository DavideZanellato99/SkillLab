"""Le dieci domande di una simulazione tecnica, ricavate dal documento.

Le domande sono a scelta multipla o a risposta aperta a seconda del tipo
della simulazione, e il procedimento è lo stesso: cambia solo la seconda
passata, cioè cosa si chiede al modello di scrivere per ogni argomento.
Quattro alternative con una giusta, oppure la traccia di quello che una
risposta deve dire. Gli argomenti su cui vale la pena interrogare qualcuno
sono gli stessi nei due casi, ed è il motivo per cui la prima passata non
sa niente del tipo.

Due passate sullo stesso modello che valuta le conversazioni, con il recupero
semantico in mezzo:

1. una lettura d'insieme del documento, campionato a passaggi regolari, da
   cui escono gli argomenti verificabili: non "di cosa parla il documento" ma
   "su cosa si può chiedere qualcosa che ha una risposta sola";
2. per ogni argomento si recuperano i passaggi che ne parlano davvero (vedi
   ``simulation_rag``), e una seconda chiamata scrive le domande avendo
   sott'occhio solo quel materiale, argomento per argomento.

La seconda passata è una chiamata sola e non dieci, e non è per risparmiare:
è perché un modello che scrive le dieci domande insieme vede quello che ha
già chiesto, mentre dieci chiamate indipendenti producono tre domande sulla
stessa cosa e nessuna su tutto il resto.

Il perché di due passate invece di dare il documento intero e basta: su un
manuale lungo il documento intero non ci sta, e anche quando ci sta il
modello scrive le domande su quello che ha letto per ultimo. Passando prima
dagli argomenti, le domande coprono il documento invece di coprirne un
pezzo, e ognuna si porta dietro i passaggi da cui è nata, che sono quelli
mostrati a chi sbaglia.

Qui non si tocca il database: entra il testo, escono delle domande. È il
router che decide quando generarle e cosa farne.
"""

from models import (
    SIMULATION_KIND_MULTIPLE,
    SIMULATION_KIND_OPEN,
    SIMULATION_OPTION_COUNT,
    SIMULATION_QUESTION_COUNT,
)
from openai_service import embed_texts, eval_json_completion
from simulation_rag import most_similar, sample_evenly

# Quanto documento entra nella prima passata, quella che cerca gli argomenti.
# Il campionamento a passaggi regolari (vedi sample_evenly) fa sì che questo
# tetto accorci il documento senza spostarne il baricentro.
TOPICS_BUDGET_CHARS = 30_000

# Quanti passaggi si recuperano per ogni argomento. Tre o quattro coprono una
# procedura per intero, comprese le eccezioni, che sono spesso il paragrafo
# dopo quello che risponde alla domanda.
CHUNKS_PER_TOPIC = 4

# Le lettere delle alternative, come si leggono nel test.
OPTION_LABELS = ["A", "B", "C", "D", "E", "F"][:SIMULATION_OPTION_COUNT]


def _topics_prompt() -> str:
    """Gli argomenti su cui interrogare, che non dipendono dalla forma.

    Un argomento su cui vale la pena fare una domanda è lo stesso sia che la
    risposta si scelga fra quattro sia che si scriva, quindi questo prompt
    non nomina il tipo del test: nominarlo sposterebbe gli argomenti verso
    quelli che si prestano alla forma, invece che verso quelli che contano.
    """
    return (
        "Sei un formatore tecnico che prepara una verifica per gli operatori di un'azienda.\n\n"
        f"Leggi il documento e individua esattamente {SIMULATION_QUESTION_COUNT} argomenti su cui "
        "ha senso verificare la preparazione di un operatore.\n\n"
        "Un argomento va bene se:\n"
        "- il documento dice qualcosa di preciso a riguardo, verificabile;\n"
        "- sbagliarlo nel lavoro reale avrebbe una conseguenza;\n"
        "- riguarda procedure, condizioni, limiti, tempi, responsabilità o eccezioni.\n\n"
        "Un argomento NON va bene se:\n"
        "- riguarda l'impaginazione del documento, la sua storia delle revisioni o chi lo ha "
        "scritto;\n"
        "- la risposta è un'opinione e non un fatto scritto nel documento;\n"
        "- ripete un argomento che hai già indicato.\n\n"
        "Gli argomenti devono coprire parti diverse del documento, non concentrarsi tutti "
        "sull'inizio.\n\n"
        "Scrivi ogni argomento come una frase breve e specifica, in italiano, che dica di cosa "
        'si tratta: ad esempio "condizioni per sbloccare una carta di credito bloccata per '
        'tentativi errati" e non "carte di credito".\n\n'
        "## FORMATO DELLA RISPOSTA\n"
        "Restituisci esclusivamente un JSON valido, senza testo aggiuntivo prima o dopo, con "
        "questa struttura esatta:\n"
        '{"topics": ["", ""]}'
    )


def _open_questions_prompt() -> str:
    """Le domande aperte: il testo e la traccia della risposta attesa.

    La traccia è la parte che conta. Sarà l'unica cosa che il giudice avrà
    davanti quando dovrà dire se quello che l'operatore ha scritto vale un
    punto (vedi ``simulation_open_answers``), quindi deve essere completa e
    verificabile, non un accenno: una traccia vaga non è una chiave, è
    un'opinione, e produce voti che nessuno saprebbe difendere.
    """
    return (
        "Sei un formatore tecnico che scrive le domande di una verifica a risposta aperta "
        "per gli operatori di un'azienda.\n\n"
        f"Riceverai {SIMULATION_QUESTION_COUNT} argomenti, e per ciascuno i passaggi del "
        "documento aziendale che lo riguardano. Ogni passaggio è preceduto dal suo numero fra "
        "parentesi quadre, ad esempio [7].\n\n"
        f"Scrivi esattamente una domanda per argomento, quindi {SIMULATION_QUESTION_COUNT} "
        "domande in tutto. A ogni domanda si risponde scrivendo qualche riga, non scegliendo "
        "fra alternative.\n\n"
        "## REGOLE PER LE DOMANDE\n"
        "- La risposta deve stare nei passaggi forniti per quell'argomento. Non inventare "
        "regole, soglie o passaggi che il documento non contiene.\n"
        "- La domanda deve riguardare il lavoro dell'operatore: cosa fare, quando, a quali "
        "condizioni, entro quali limiti.\n"
        "- Deve chiedere una cosa sola e delimitata, a cui si risponde in tre o quattro righe. "
        '"Descrivi la procedura di rimborso" è troppo larga, "quali condizioni devono valere '
        'perché un rimborso possa essere autorizzato allo sportello" va bene.\n'
        "- Deve avere una risposta verificabile, non un parere: niente domande che cominciano "
        'con "secondo te" o che chiedono cosa sarebbe meglio fare.\n'
        "- Deve essere comprensibile da sola, senza rimandare al documento: non scrivere "
        '"secondo il paragrafo 3" o "come indicato sopra".\n'
        "- Non fare domande sulla forma del documento (titoli, numerazione, date di revisione).\n\n"
        "## REGOLE PER LA RISPOSTA ATTESA\n"
        "- Scrivi quello che una risposta deve dire per essere considerata completa, prendendolo "
        "dai passaggi forniti: i punti che servono, le condizioni, i limiti, l'ordine se conta.\n"
        "- Elenca i punti in modo che si possano riconoscere uno per uno in quello che "
        "l'operatore scriverà: chi corregge deve poter dire quale manca.\n"
        "- Non è la risposta perfetta da copiare, è il metro con cui si giudica: scrivi il "
        "contenuto necessario, non una bella pagina.\n"
        "- Non includere niente che il documento non dica.\n\n"
        "## REGOLE PER LA SPIEGAZIONE\n"
        "- Spiega perché la risposta è quella, riprendendo quello che dice il documento, in due "
        "o tre frasi.\n"
        "- Quando su questo argomento c'è un errore tipico, di' perché è un errore.\n"
        "- La legge chi ha appena risposto, anche chi ha risposto bene: deve insegnare la "
        "procedura, non limitarsi a ripetere la traccia.\n\n"
        "## ISTRUZIONI SUI CAMPI\n"
        '- "expected_answer" è la traccia della risposta attesa, come testo.\n'
        '- "source_chunks" elenca i numeri fra parentesi quadre dei passaggi su cui la domanda '
        "si fonda.\n"
        "- Scrivi tutto in italiano.\n\n"
        "## FORMATO DELLA RISPOSTA\n"
        "Restituisci esclusivamente un JSON valido, senza testo aggiuntivo prima o dopo, con "
        "questa struttura esatta:\n"
        '{"questions": [{"text": "", "expected_answer": "", "explanation": "", '
        '"source_chunks": [0]}]}'
    )


def _questions_prompt() -> str:
    letters = ", ".join(OPTION_LABELS)
    return (
        "Sei un formatore tecnico che scrive le domande di una verifica a risposta multipla "
        "per gli operatori di un'azienda.\n\n"
        f"Riceverai {SIMULATION_QUESTION_COUNT} argomenti, e per ciascuno i passaggi del "
        "documento aziendale che lo riguardano. Ogni passaggio è preceduto dal suo numero fra "
        "parentesi quadre, ad esempio [7].\n\n"
        f"Scrivi esattamente una domanda per argomento, quindi {SIMULATION_QUESTION_COUNT} "
        f"domande in tutto, ognuna con {SIMULATION_OPTION_COUNT} alternative ({letters}) di cui "
        "una sola corretta.\n\n"
        "## REGOLE PER LE DOMANDE\n"
        "- La risposta corretta deve essere scritta nei passaggi forniti per quell'argomento. "
        "Non inventare regole, soglie o passaggi che il documento non contiene.\n"
        "- Se i passaggi di un argomento non bastano a formulare una domanda con una sola "
        "risposta certa, scrivi la domanda su un aspetto di quei passaggi che invece è certo.\n"
        "- La domanda deve riguardare il lavoro dell'operatore: cosa fare, quando, a quali "
        "condizioni, entro quali limiti.\n"
        "- Deve essere comprensibile da sola, senza rimandare al documento: non scrivere "
        '"secondo il paragrafo 3" o "come indicato sopra".\n'
        "- Non fare domande sulla forma del documento (titoli, numerazione, date di revisione).\n\n"
        "## REGOLE PER LE ALTERNATIVE\n"
        "- Le alternative sbagliate devono essere plausibili per chi non conosce la procedura: "
        "errori realistici, scambi con casi simili, scorciatoie che sembrano ragionevoli.\n"
        "- Non devono essere assurde o palesemente fuori tema: un'alternativa che nessuno "
        "sceglierebbe non verifica niente.\n"
        "- Devono essere di lunghezza simile fra loro, perché la risposta giusta non si "
        "riconosca dal fatto che è la più lunga.\n"
        '- Non usare "tutte le precedenti", "nessuna delle precedenti" o formule equivalenti.\n'
        "- La posizione della risposta corretta deve variare fra una domanda e l'altra.\n\n"
        "## REGOLE PER LA SPIEGAZIONE\n"
        "- Spiega perché la risposta corretta è corretta, riprendendo quello che dice il "
        "documento, in due o tre frasi.\n"
        "- Quando una delle alternative sbagliate è un errore tipico, di' perché è sbagliata.\n"
        "- La spiegazione viene letta da chi ha appena sbagliato: deve insegnare la procedura, "
        "non limitarsi a ripetere qual era la risposta.\n\n"
        "## ISTRUZIONI SUI CAMPI\n"
        f'- "options" deve contenere esattamente {SIMULATION_OPTION_COUNT} alternative, come '
        "testo, nell'ordine in cui verranno mostrate.\n"
        '- "correct_option" è la posizione della risposta corretta dentro "options", contata '
        f"da 0, quindi un numero da 0 a {SIMULATION_OPTION_COUNT - 1}.\n"
        '- "source_chunks" elenca i numeri fra parentesi quadre dei passaggi su cui la domanda '
        "si fonda.\n"
        "- Scrivi tutto in italiano.\n\n"
        "## FORMATO DELLA RISPOSTA\n"
        "Restituisci esclusivamente un JSON valido, senza testo aggiuntivo prima o dopo, con "
        "questa struttura esatta:\n"
        '{"questions": [{"text": "", "options": ["", ""], "correct_option": 0, '
        '"explanation": "", "source_chunks": [0]}]}'
    )


def _normalize_topics(raw: dict) -> list[str]:
    topics = [str(t).strip() for t in (raw.get("topics") or []) if str(t).strip()]
    if not topics:
        raise ValueError("Nessun argomento individuato nel documento.")
    return topics[:SIMULATION_QUESTION_COUNT]


def _valid_sources(raw_sources, valid_ordinals: set[int]) -> list[int]:
    """Gli ordinali citati che esistono davvero, senza ripetizioni.

    Gli ordinali inventati si scartano invece di far cadere la domanda: la
    citazione accompagna la spiegazione, non la sostiene.
    """
    sources: list[int] = []
    for value in raw_sources or []:
        try:
            ordinal = int(value)
        except (TypeError, ValueError):
            continue
        if ordinal in valid_ordinals and ordinal not in sources:
            sources.append(ordinal)
    return sources


def _normalize_questions(raw: dict, valid_ordinals: set[int], kind: str) -> list[dict]:
    """Le domande del modello, ripulite, o ValueError se non ce ne sono.

    Una domanda malformata viene scartata e non fa cadere le altre: il tetto
    vero è quante ne restano, controllato dal chiamante, perché nove domande
    buone su dieci si rimediano rigenerando, mentre buttare via tutto per una
    riga storta significa far ripartire da capo un caricamento che è già
    costato due chiamate.

    Cosa renda una domanda malformata dipende dal tipo: là quattro
    alternative e un indice dentro l'intervallo, qui una traccia della
    risposta attesa che non sia vuota. Una domanda aperta senza traccia non
    è una domanda a cui manca un pezzo, è una domanda che nessuno potrebbe
    correggere.

    Ogni domanda esce con entrambi i mazzi di campi, quello inutile vuoto,
    così chi la scrive nel database non deve sapere di che tipo era.
    """
    questions = []
    for entry in raw.get("questions") or []:
        if not isinstance(entry, dict):
            continue
        text = str(entry.get("text") or "").strip()
        if not text:
            continue
        common = {
            "text": text,
            "explanation": str(entry.get("explanation") or "").strip(),
            "source_chunks": _valid_sources(entry.get("source_chunks"), valid_ordinals),
        }

        if kind == SIMULATION_KIND_OPEN:
            expected = str(entry.get("expected_answer") or "").strip()
            if not expected:
                continue
            questions.append(
                {**common, "options": None, "correct_option": None, "expected_answer": expected}
            )
            continue

        options = [str(o).strip() for o in (entry.get("options") or []) if str(o).strip()]
        if len(options) != SIMULATION_OPTION_COUNT:
            continue
        try:
            correct = int(entry.get("correct_option"))
        except (TypeError, ValueError):
            continue
        if not 0 <= correct < SIMULATION_OPTION_COUNT:
            continue
        questions.append(
            {**common, "options": options, "correct_option": correct, "expected_answer": ""}
        )
    if not questions:
        raise ValueError("Nessuna domanda utilizzabile nella risposta del modello.")
    return questions[:SIMULATION_QUESTION_COUNT]


async def generate_questions(
    chunks: list[str],
    chunk_embeddings: list[list[float]],
    kind: str = SIMULATION_KIND_MULTIPLE,
) -> list[dict]:
    """Le domande ricavate dai passaggi del documento e dai loro vettori.

    Ogni domanda è un dizionario con text, options, correct_option,
    expected_answer, explanation e source_chunks (gli ordinali dei passaggi,
    da 1). Le chiavi ci sono tutte in entrambi i tipi, con vuoto quello che
    quel tipo non usa. Ne escono al massimo SIMULATION_QUESTION_COUNT e
    almeno una: quante siano davvero lo verifica il chiamante, che è l'unico
    a sapere se una generazione incompleta va rifiutata o mostrata al super
    admin perché la completi.

    Solleva RuntimeError se il modello non risponde, ValueError se risponde
    qualcosa di inutilizzabile.
    """
    if not chunks:
        raise ValueError("Documento vuoto: non c'è niente su cui formulare domande.")

    # Prima passata: gli argomenti, letti su un campione regolare del documento
    overview = "\n\n".join(sample_evenly(chunks, TOPICS_BUDGET_CHARS))
    topics: list[str] = await eval_json_completion(
        [
            {"role": "system", "content": _topics_prompt()},
            {"role": "user", "content": f"## DOCUMENTO\n{overview}"},
        ],
        max_completion_tokens=2048,
        normalize=_normalize_topics,
        what="individuazione degli argomenti",
    )

    # Il recupero: per ogni argomento, i passaggi che ne parlano
    topic_embeddings = await embed_texts(topics)
    candidates = list(enumerate(chunk_embeddings, start=1))
    sections = []
    cited: set[int] = set()
    for topic, embedding in zip(topics, topic_embeddings, strict=True):
        ordinals = most_similar(embedding, candidates, CHUNKS_PER_TOPIC)
        cited.update(ordinals)
        passages = "\n".join(f"[{o}] {chunks[o - 1]}" for o in sorted(ordinals))
        sections.append(f"### ARGOMENTO: {topic}\n{passages}")

    # Seconda passata: le domande, ognuna davanti ai propri passaggi
    is_open = kind == SIMULATION_KIND_OPEN
    return await eval_json_completion(
        [
            {
                "role": "system",
                "content": _open_questions_prompt() if is_open else _questions_prompt(),
            },
            {"role": "user", "content": "## ARGOMENTI E PASSAGGI\n\n" + "\n\n".join(sections)},
        ],
        # Dieci domande con quattro alternative e una spiegazione ciascuna,
        # più i token che il ragionamento spende prima di scriverne una: un
        # budget stretto qui torna indietro come JSON troncato. Le domande
        # aperte non ne chiedono meno: al posto delle alternative c'è la
        # traccia della risposta attesa, che è il pezzo più lungo di tutti.
        max_completion_tokens=8192,
        normalize=lambda raw: _normalize_questions(raw, cited, kind),
        what="generazione delle domande",
    )
