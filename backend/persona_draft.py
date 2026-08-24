"""La bozza di una scheda persona, ricavata da un caso raccontato a parole.

È il gemello di ``simulation_questions`` per l'altra metà della piattaforma, e
segue lo stesso giro: una fonte scritta da una persona, una passata del
modello di ragionamento, una revisione umana, e solo dopo la pubblicazione.
Là la fonte è un documento aziendale e ne escono domande, qui è un caso e ne
esce un cliente.

Il motivo per cui esiste: una scheda persona sono una settantina di campi, e
compilarli a mano è mezz'ora per ogni scenario nuovo. Non è il tempo di
scrivere le cose che contano davvero, cioè lo scenario, la vera causa e
l'obiettivo nascosto: è il tempo di inventare la data di nascita, la
professione del coniuge e sette percentuali di personalità che devono stare in
piedi insieme. Quel lavoro il modello lo fa in un minuto, e la persona che
insegna resta a fare la parte che sa fare lei, cioè correggere.

**Qui non si salva niente.** Entra un testo, esce un dizionario: chi lo ha
chiesto se lo trova nel form, campo per campo, e decide cosa tenere. Una
scheda generata non diventa mai un avatar senza che qualcuno l'abbia guardata,
esattamente come le cinquanta domande di una simulazione non si pubblicano da
sole.

**Le due fonti non chiedono la stessa cosa al modello.** Da una descrizione
breve il modello inventa una persona coerente attorno al caso; da una
conversazione vera, già anonimizzata da chi la incolla, deve invece *ricavare*
quello che c'è (come parla, cosa lo ha fatto arrabbiare, cosa ha chiesto) e
inventare solo il contorno. Sono due prompt diversi perché sono due lavori
diversi: nel secondo caso inventare al posto di leggere è l'errore.

Sui campi vuoti vale la regola della scheda, ed è scritta nel prompt e
riapplicata alla risposta: **un campo che non si applica resta vuoto**, mai
"/", mai "n/d", mai 0. Un marcatore di vuoto scritto in una scheda è un valore
che il prompt del roleplay scarta (vedi ``persona_prompt.clean_value``), quindi
serve solo a far credere che la scheda sia compilata.
"""

import re

from openai_service import eval_json_completion
from persona_prompt import clean_value

# Le due fonti da cui può nascere una bozza.
SOURCE_DESCRIPTION = "descrizione"
SOURCE_CONVERSATION = "conversazione"
SOURCES = (SOURCE_DESCRIPTION, SOURCE_CONVERSATION)

# I tratti che la scheda esprime in percentuale. Il prompt del roleplay li
# legge come intensità ("0% assente, 100% estremo"), quindi qui devono uscire
# come "60%" e non come 60, né come "alto".
PERCENT_KEYS = {
    "LIVELLO_ESTROVERSIONE",
    "LIVELLO_EMPATICO",
    "LIVELLO_PAZIENZA",
    "LIVELLO_FIDUCIA",
    "PROPENSIONE_CONFLITTO",
    "PROPENSIONE_RISCHIO",
    "CAPACITA_ASCOLTO",
}

# I campi a insieme chiuso, con i valori che il form offre. Il modello viene
# istruito a usarli, e la normalizzazione ci riporta sopra quello che ci
# somiglia: "alta" diventa "Alta". Quello che non somiglia a niente resta come
# l'ha scritto il modello, perché è comunque testo che finisce nel prompt e chi
# rilegge la scheda lo vede.
CHOICE_KEYS: dict[str, tuple[str, ...]] = {
    "SESSO": ("Uomo", "Donna"),
    "LIVELLO_CONOSCENZA_BANCARIA": ("Bassa", "Media", "Alta"),
    "LIVELLO_CONOSCENZA_INVESTIMENTI": ("Bassa", "Media", "Alta"),
    "LIVELLO_CONOSCENZA_PREVIDENZA": ("Bassa", "Media", "Alta"),
    "LIVELLO_CONOSCENZA_MUTUI": ("Bassa", "Media", "Alta"),
    "INTENSITA_EMOZIONE": ("Bassa", "Media", "Alta"),
    "LUNGHEZZA_MEDIA_RISPOSTE": ("Breve", "Media", "Lunga"),
    "VELOCITA_PARLATO": ("Bassa", "Media", "Alta"),
    "USO_IRONIA": ("No", "Sì, moderato", "Sì, marcato"),
    "USO_DIALETTO": ("No", "Sì, moderato", "Sì, marcato"),
    "FORMALITA_LINGUAGGIO": ("Formale", "Informale"),
}

# La scheda come viene spiegata al modello: sezione per sezione, chiave per
# chiave, con accanto cosa ci va dentro.
#
# Questo elenco è la sola definizione di "cosa il modello può scrivere": una
# chiave che non sta qui viene buttata dalla normalizzazione. Che siano tutte
# chiavi che il prompt del roleplay legge davvero non è affidato all'attenzione
# di chi le aggiunge, lo verifica un test (vedi tests/test_persona_draft.py):
# generare un campo che il prompt ignora sarebbe lavoro buttato, e nessuno se
# ne accorgerebbe guardando la scheda.
SHEET: list[tuple[str, list[tuple[str, str]]]] = [
    (
        "ANAGRAFICA",
        [
            ("NOME", "nome di battesimo, obbligatorio"),
            ("COGNOME", "cognome, obbligatorio"),
            ("SESSO", "Uomo oppure Donna"),
            ("DATA_NASCITA", "gg/mm/aaaa, coerente con l'età che il caso suggerisce"),
            ("LUOGO_NASCITA", "città italiana"),
            ("NAZIONALITA", "es. Italiana"),
            ("LINGUA_MADRE", "es. Italiano"),
            ("CITTA_RESIDENZA", "città italiana"),
            ("INDIRIZZO_RESIDENZA", "via e numero civico"),
            ("STATO_CIVILE", "es. Coniugato, Celibe, Separata"),
            ("NOME_CONIUGE", "solo se coniugato o convivente, altrimenti vuoto"),
            ("PROFESSIONE_CONIUGE", "solo se c'è un coniuge, altrimenti vuoto"),
            ("NUMERO_FIGLI", "una cifra, vuoto se non ne ha"),
            ("ETA_FIGLIO_1", "una cifra, vuoto se non ha figli"),
            ("ETA_FIGLIO_2", "una cifra, vuoto se ha meno di due figli"),
            ("ANIMALI_DOMESTICI", "es. Un cane, vuoto se non ne ha"),
        ],
    ),
    (
        "LAVORO E FINANZE",
        [
            ("TITOLO_DI_STUDIO", "es. Diploma di ragioneria"),
            ("PROFESSIONE", "es. Impiegato amministrativo"),
            ("AZIENDA", "nome verosimile e inventato, mai un'azienda reale"),
            ("RUOLO", "il ruolo dentro l'azienda"),
            ("REDDITO_ANNUO", "importo in euro, coerente con la professione"),
            ("PATRIMONIO", "importo in euro"),
            ("LIQUIDITA", "importo in euro"),
            ("DEBITI", "es. Mutuo residuo di 80.000,00 euro, vuoto se non ne ha"),
            ("INVESTIMENTI_POSSEDUTI", "vuoto se non ne ha"),
            ("IMMOBILI_POSSEDUTI", "vuoto se non ne ha"),
            ("LIVELLO_CONOSCENZA_BANCARIA", "Bassa, Media o Alta"),
            ("LIVELLO_CONOSCENZA_INVESTIMENTI", "Bassa, Media o Alta"),
            ("LIVELLO_CONOSCENZA_PREVIDENZA", "Bassa, Media o Alta"),
            ("LIVELLO_CONOSCENZA_MUTUI", "Bassa, Media o Alta"),
        ],
    ),
    (
        "STORIA E VITA PERSONALE",
        [
            ("STORIA_PERSONALE", "due o tre righe, quel tanto che spiega chi è"),
            ("EVENTI_SIGNIFICATIVI", "i fatti che pesano sul suo rapporto con la banca"),
            ("PAURE", "cosa teme davvero, collegato al caso quando possibile"),
            ("OBIETTIVI_PERSONALI", "cosa sta cercando di ottenere nella vita"),
            ("ASPIRAZIONI", "dove vorrebbe arrivare"),
        ],
    ),
    (
        "PERSONALITÀ",
        [
            (
                "PERSONALITA_DESCRIZIONE",
                "due o tre righe su come si comporta con gli altri, non un elenco di aggettivi",
            ),
            ("LIVELLO_ESTROVERSIONE", "percentuale, es. 60%"),
            ("LIVELLO_EMPATICO", "percentuale"),
            ("LIVELLO_PAZIENZA", "percentuale"),
            ("LIVELLO_FIDUCIA", "percentuale"),
            ("PROPENSIONE_CONFLITTO", "percentuale"),
            ("PROPENSIONE_RISCHIO", "percentuale"),
            ("CAPACITA_ASCOLTO", "percentuale"),
        ],
    ),
    (
        "STATO EMOTIVO",
        [
            ("EMOZIONE_INIZIALE", "una parola o due, es. Arrabbiato, In ansia, Diffidente"),
            ("INTENSITA_EMOZIONE", "Bassa, Media o Alta"),
            ("TRIGGER_POSITIVI", "cosa lo calma, detto in modo concreto"),
            ("TRIGGER_NEGATIVI", "cosa lo fa peggiorare, detto in modo concreto"),
        ],
    ),
    (
        "STILE DI CONVERSAZIONE",
        [
            ("LUNGHEZZA_MEDIA_RISPOSTE", "Breve, Media o Lunga"),
            ("VELOCITA_PARLATO", "Bassa, Media o Alta"),
            ("USO_IRONIA", "No, Sì, moderato oppure Sì, marcato"),
            ("USO_DIALETTO", "No, Sì, moderato oppure Sì, marcato"),
            ("FORMALITA_LINGUAGGIO", "Formale oppure Informale"),
        ],
    ),
    (
        "SCENARIO",
        [
            (
                "TIPO_SCENARIO",
                "obbligatorio: perché contatta la banca, raccontato come lo racconterebbe lui, "
                "cioè con quello che ha visto e non con la spiegazione tecnica",
            ),
            (
                "DESCRIZIONE_PROBLEMATICA",
                "obbligatorio: la vera causa del problema, quella che il cliente NON conosce. "
                "È la chiave di correzione dell'esercizio: deve essere una causa precisa, "
                "non un riassunto dello scenario",
            ),
            (
                "OBIEZIONI_PREVISTE",
                "le due o tre obiezioni che solleverà se non si sente capito",
            ),
            (
                "OBIETTIVO_NASCOSTO",
                "obbligatorio: cosa questa simulazione mette alla prova nell'operatore, "
                "scritto come un obiettivo didattico e non come un desiderio del cliente",
            ),
        ],
    ),
    (
        "REGOLE E SEGRETI",
        [
            ("FATTI_IMMUTABILI", "i fatti che il personaggio non può contraddire: date, importi"),
            ("SEGRETI", "cosa non rivelerà mai, nemmeno se glielo chiedono"),
            (
                "INFORMAZIONI_DA_NON_RIVELARE_SPONTANEAMENTE",
                "cosa dirà solo se l'operatore fa la domanda giusta",
            ),
            ("ARGOMENTI_SENSIBILI", "cosa lo fa reagire male se toccato, vuoto se non ce ne sono"),
        ],
    ),
]

ALL_KEYS: list[str] = [key for _, fields in SHEET for key, _ in fields]

# Senza questi la bozza non è una bozza: sono lo scenario, la sua chiave di
# correzione, il punto da cui partire emotivamente e il senso didattico
# dell'esercizio. Se il modello ne salta uno la risposta viene considerata
# fallita e si passa al modello di riserva, come per un JSON illeggibile:
# consegnare mezza scheda vorrebbe dire farla completare a mano proprio nei
# campi che costano di più.
REQUIRED_KEYS = (
    "TIPO_SCENARIO",
    "DESCRIZIONE_PROBLEMATICA",
    "EMOZIONE_INIZIALE",
    "OBIETTIVO_NASCOSTO",
)


def _sheet_spec() -> str:
    """La scheda come elenco di chiavi, per il prompt."""
    blocks = []
    for title, fields in SHEET:
        righe = "\n".join(f'- "{key}": {hint}' for key, hint in fields)
        blocks.append(f"### {title}\n{righe}")
    return "\n\n".join(blocks)


def _system_prompt(source: str) -> str:
    """Le istruzioni, che cambiano solo nel pezzo su cosa sia la fonte."""
    if source == SOURCE_CONVERSATION:
        fonte = (
            "L'utente ti consegna la TRASCRIZIONE DI UNA CONVERSAZIONE REALE già anonimizzata, "
            "fra un cliente e un operatore. Il tuo compito è ricostruire la scheda del CLIENTE "
            "che vi compare.\n"
            "Quello che la conversazione dice va RICAVATO da lì, non inventato: come parla, quanto "
            "è formale, cosa lo ha portato a contattare la banca, cosa lo irrita, quali obiezioni "
            "solleva, quali dati anagrafici ha dichiarato. Inventa soltanto quello che serve a "
            "completare la scheda e che nella conversazione non c'è, mantenendolo coerente con "
            "quello che c'è.\n"
            "Se nella trascrizione compaiono nomi, importi o riferimenti a persone reali, "
            "sostituiscili con equivalenti verosimili: la scheda non deve riportare l'identità di "
            "nessuno."
        )
    else:
        fonte = (
            "L'utente ti consegna la DESCRIZIONE BREVE DI UN CASO. Il tuo compito è inventare "
            "attorno a quel caso un cliente completo e credibile.\n"
            "Tutto quello che aggiungi deve reggere insieme: chi guadagna quanto vive dove, chi ha "
            "quella professione ha quel titolo di studio, chi è in ansia per una rata ha una rata "
            "da pagare. Una scheda credibile non è una scheda ricca di dettagli, è una scheda in "
            "cui i dettagli non si contraddicono."
        )

    return (
        "Sei un progettista di simulazioni di formazione per operatori di un servizio clienti "
        "bancario. Costruisci le schede dei clienti simulati con cui gli operatori si allenano.\n\n"
        f"{fonte}\n\n"
        "## COSA DEVI PRODURRE\n"
        "Un oggetto JSON con una chiave per ogni campo della scheda qui sotto, e nessuna chiave "
        "in più. Ogni valore è una stringa.\n\n"
        f"{_sheet_spec()}\n\n"
        "## REGOLE\n"
        "- Scrivi tutto in italiano.\n"
        "- **Un campo che non si applica a questa persona resta una stringa vuota.** Non scrivere "
        'mai "/", "n/d", "nessuno", "non applicabile" o uno zero al posto di un valore mancante: '
        "una scheda con dei buchi è più utile di una scheda riempita di segnaposto, perché chi la "
        "rilegge vede subito cosa manca.\n"
        "- TIPO_SCENARIO e DESCRIZIONE_PROBLEMATICA raccontano due cose diverse e non vanno "
        "confuse: il primo è quello che il cliente vede e lamenta, il secondo è la causa vera, che "
        "lui non conosce e che l'operatore deve arrivare a capire. Se coincidono, l'esercizio non "
        "ha soluzione.\n"
        '- Le percentuali si scrivono con il simbolo, per esempio "70%". Non usare valori tondi '
        "per tutti i tratti: una persona non è fatta di sette volte cinquanta.\n"
        "- Niente nomi di persone o aziende reali, niente IBAN, niente numeri di carta.\n"
        "- Non scrivere note, spiegazioni o commenti fuori dal JSON."
    )


def _percent(value: str) -> str:
    """Una percentuale come la scheda la vuole, o niente.

    Il modello può rispondere "70", "70%", "circa il 70%" o "alta": le prime
    tre valgono 70, l'ultima non è una percentuale e il campo resta vuoto,
    perché inventarci un numero vorrebbe dire mettere in scheda un valore che
    nessuno ha scelto.
    """
    digits = re.sub(r"[^\d]", "", value)
    if not digits:
        return ""
    return f"{min(100, int(digits[:3]))}%"


def _choice(value: str, allowed: tuple[str, ...]) -> str:
    """Riporta sull'insieme chiuso quello che ci somiglia."""
    for option in allowed:
        if value.strip().lower() == option.lower():
            return option
    return value


def normalize_profile(raw: dict) -> dict:
    """La risposta del modello ridotta a una scheda.

    Tre cose, in quest'ordine: si tengono solo le chiavi della scheda, si dà a
    ogni valore la forma che quel campo vuole, e si controlla che ci sia quel
    minimo senza cui la bozza non serve a niente.

    Il controllo finale sta qui dentro e non nel chiamante di proposito:
    ``eval_json_completion`` esegue la normalizzazione dentro il giro sui
    modelli di riserva, quindi una scheda senza scenario fa ritentare come lo
    farebbe un JSON troncato.
    """
    if not isinstance(raw, dict):
        raise ValueError("La risposta del modello non è un oggetto.")

    # Certi modelli incartano la risposta in una chiave sola ("profile",
    # "scheda"): se dentro c'è la scheda, si prende quella invece di buttare
    # tutto e ritentare.
    if len(raw) == 1:
        solo = next(iter(raw.values()))
        if isinstance(solo, dict):
            raw = solo

    profile: dict[str, str] = {}
    for key in ALL_KEYS:
        value = str(raw.get(key, "") or "").strip()
        # I marcatori di vuoto valgono vuoto, qui come nel prompt del
        # roleplay: il modello è istruito a non scriverli, e questa è la
        # rete sotto.
        if not clean_value({key: value}, key):
            profile[key] = ""
            continue
        if key in PERCENT_KEYS:
            profile[key] = _percent(value)
        elif key in CHOICE_KEYS:
            profile[key] = _choice(value, CHOICE_KEYS[key])
        else:
            profile[key] = value

    if not profile["NOME"] and not profile["COGNOME"]:
        raise ValueError("La scheda generata non ha né nome né cognome.")
    mancanti = [key for key in REQUIRED_KEYS if not profile[key]]
    if mancanti:
        raise ValueError(f"La scheda generata non ha {', '.join(mancanti)}.")
    return profile


async def draft_persona(text: str, source: str) -> dict:
    """Una bozza di scheda dal caso raccontato in ``text``.

    Una chiamata sola, al contrario delle cinque del serbatoio di domande: qui
    la risposta è una scheda, non cinquanta domande, e ci sta nel budget di una
    risposta. Il giro sui modelli di riserva e il tempo lungo li mette
    ``eval_json_completion``, che è lo stesso meccanismo della valutazione a
    fine chiamata.
    """
    if source not in SOURCES:
        raise ValueError(f"Fonte sconosciuta: {source}")

    intestazione = (
        "## CONVERSAZIONE" if source == SOURCE_CONVERSATION else "## DESCRIZIONE DEL CASO"
    )
    return await eval_json_completion(
        [
            {"role": "system", "content": _system_prompt(source)},
            {"role": "user", "content": f"{intestazione}\n{text.strip()}"},
        ],
        # Una settantina di campi, di cui una decina sono paragrafi interi
        # (storia, personalità, scenario, vera causa), più quello che il
        # ragionamento spende prima di cominciare a scrivere. Stretto qui
        # torna indietro come JSON troncato, cioè come una scheda che si
        # interrompe a metà.
        max_completion_tokens=8192,
        normalize=normalize_profile,
        what="generazione della scheda persona",
    )
