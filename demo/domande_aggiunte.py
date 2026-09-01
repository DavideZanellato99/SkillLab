"""Le domande scritte a mano per completare i serbatoi rimasti corti.

La generazione ha consegnato meno di cinquanta domande valide su cinque
simulazioni: i controlli di validità scartano la singola domanda malformata
invece di buttare la chiamata intera, e su un abbinamento basta un elemento
di destra che vale per due voci di sinistra. Queste sono le domande che
mancano per arrivare a cinquanta, scritte sugli stessi documenti di
``demo/documenti`` e sugli argomenti che la generazione aveva lasciato
scoperti.

Ogni voce porta il testo, la chiave del tipo (le coppie per un abbinamento,
i passi in ordine per un ordinamento) e la spiegazione che legge chi
sbaglia. Le coppie stanno scritte già accoppiate e i passi già in ordine,
come le scrive il modello: a mescolarli è il server quando consegna la
domanda.

La regola che vale su ogni abbinamento è che nessun elemento di destra possa
valere per due voci di sinistra: è la stessa che il server verifica prima di
pubblicare, ed è la ragione per cui le domande scartate erano state scartate.
"""

# ── Bonifici e ordini di pagamento, abbinamento ──

BONIFICI_ABBINAMENTO = [
    {
        "text": "Abbina ogni sigla della procedura al proprio significato.",
        "pairs": [
            {"left": "SCT", "right": "Il bonifico ordinario in euro nell'area SEPA"},
            {"left": "SCT Inst", "right": "Il bonifico istantaneo, accreditato entro dieci secondi"},
            {"left": "BIR", "right": "Il bonifico di importo rilevante, oltre 250.000 euro"},
            {"left": "TRN", "right": "Il riferimento univoco assegnato dalla banca ordinante"},
            {"left": "BIC", "right": "Il codice della banca destinataria, richiesto fuori area SEPA"},
        ],
        "explanation": (
            "Le cinque sigle stanno nella tabella delle definizioni. Lo scambio tipico è fra "
            "BIC e TRN: il primo identifica la banca del beneficiario ed è obbligatorio solo "
            "fuori dall'area SEPA, il secondo identifica l'operazione ed è il dato da "
            "consegnare al cliente sulla contabile, perché è l'unico riferimento utile per "
            "ogni indagine successiva."
        ),
    },
    {
        "text": "Abbina ogni elemento del bonifico estero in divisa alla regola prevista.",
        "pairs": [
            {"left": "Cut off per l'esecuzione in giornata", "right": "Le 14:00"},
            {"left": "Accredito al beneficiario", "right": "Da uno a quattro giorni lavorativi"},
            {"left": "Commissione fino a 50.000 euro", "right": "12,00 euro"},
            {
                "left": "Commissione oltre 50.000 euro",
                "right": "Lo 0,15 per mille, con un minimo di 25 euro",
            },
            {"left": "Tetto massimo della commissione", "right": "250 euro"},
        ],
        "explanation": (
            "Il bonifico in divisa ha un cut off proprio, due ore e mezza prima di quello del "
            "bonifico in euro, e una commissione che cambia forma sopra i 50.000 euro, dove "
            "smette di essere fissa e diventa proporzionale. L'errore tipico è applicare qui "
            "il cut off delle 16:30: l'ordine slitta al giorno lavorativo successivo e il "
            "cliente lo scopre dalla valuta."
        ),
    },
]

# ── Carte di credito, abbinamento ──

CARTE_CREDITO_ABBINAMENTO = [
    {
        "text": "Abbina ogni momento del ciclo di rendicontazione alla regola prevista.",
        "pairs": [
            {"left": "Chiusura dell'estratto conto", "right": "L'ultimo giorno del mese"},
            {
                "left": "Messa a disposizione dell'estratto conto",
                "right": "Entro il quinto giorno del mese successivo",
            },
            {"left": "Addebito sul conto di appoggio", "right": "Il giorno 15"},
            {
                "left": "Addebito che cade di sabato o in un giorno festivo",
                "right": "Slitta al primo giorno lavorativo successivo",
            },
            {
                "left": "Spesa di fine mese elaborata dall'esercente il mese dopo",
                "right": "Rientra nell'estratto conto del mese di elaborazione",
            },
        ],
        "explanation": (
            "Il ciclo ha tre date distinte e vanno tenute separate: la chiusura, la messa a "
            "disposizione e l'addebito. L'errore tipico è promettere al cliente che una spesa "
            "sostenuta a fine mese comparirà in quell'estratto conto: ai fini della "
            "rendicontazione conta la data di contabilizzazione, mentre la data "
            "dell'operazione è quella che conta per i termini di una contestazione."
        ),
    },
    {
        "text": "Abbina ogni fase dell'insoluto alla data di addebito all'adempimento previsto.",
        "pairs": [
            {
                "left": "Conto di appoggio non capiente alla data di addebito",
                "right": "Il sistema riprova l'addebito dopo tre giorni lavorativi",
            },
            {"left": "Secondo tentativo di addebito fallito", "right": "Sospensione automatica della carta"},
            {"left": "Sospensione disposta dal sistema", "right": "Comunicazione al cliente"},
            {"left": "Gestione della posizione", "right": "Passa all'ufficio recupero"},
            {"left": "Revoca della sospensione", "right": "Solo dopo il rientro integrale"},
        ],
        "explanation": (
            "L'insoluto non sospende la carta al primo tentativo: il sistema ne fa un secondo "
            "dopo tre giorni lavorativi, ed è quello a decidere. L'errore tipico è promettere "
            "al cliente la riattivazione dopo un pagamento parziale, che non basta: la "
            "sospensione si revoca solo quando la posizione è rientrata per intero."
        ),
    },
    {
        "text": "Abbina ogni operazione con carta di credito al proprio limite operativo.",
        "pairs": [
            {"left": "Singolo pagamento presso un esercente fisico", "right": "3.000 euro"},
            {"left": "Singolo pagamento su internet", "right": "1.500 euro, elevabili dall'app"},
            {"left": "Prelievo di contante giornaliero", "right": "500 euro"},
            {"left": "Prelievo di contante mensile", "right": "1.000 euro"},
            {"left": "Pagamento contactless senza PIN", "right": "50 euro"},
        ],
        "explanation": (
            "Questi limiti valgono in aggiunta al plafond e non al suo posto: una carta Gold "
            "con 5.000 euro di plafond disponibile non consente comunque un pagamento da "
            "4.000 euro in un solo colpo presso un esercente. L'errore tipico è leggere il "
            "plafond come se fosse il limite della singola operazione."
        ),
    },
    {
        "text": "Abbina ogni indicatore economico o adempimento informativo alla sua definizione.",
        "pairs": [
            {"left": "TAN", "right": "Il tasso annuo nominale applicato al capitale"},
            {
                "left": "TAEG",
                "right": "Il costo totale del credito in percentuale annua, spese comprese",
            },
            {
                "left": "Passaggio da saldo a revolving",
                "right": "Una modifica contrattuale che richiede una nuova sottoscrizione",
            },
            {
                "left": "Documento da consegnare a quel passaggio",
                "right": "Il documento informativo europeo",
            },
            {
                "left": "Numero da comunicare sempre al cliente",
                "right": "Il TAEG, perché è l'unico che permette di confrontare due offerte",
            },
        ],
        "explanation": (
            "Il TAN misura solo gli interessi sul capitale, il TAEG comprende anche canone, "
            "spese di incasso rata e imposte. L'errore tipico è confrontare due offerte sul "
            "TAN: un tasso più basso accompagnato da spese più alte risulta complessivamente "
            "più oneroso, e il numero che lo mostra è il TAEG."
        ),
    },
    {
        "text": "Abbina ogni fase del rinnovo o della chiusura del rapporto alla regola prevista.",
        "pairs": [
            {
                "left": "Disdetta per impedire il rinnovo automatico",
                "right": "Almeno 30 giorni prima della scadenza",
            },
            {"left": "Spedizione della carta rinnovata", "right": "Nel mese precedente la scadenza"},
            {"left": "Recesso del cliente", "right": "In qualunque momento, senza spese né penali"},
            {
                "left": "Attesa per le operazioni ancora in transito",
                "right": "45 giorni prima del saldo finale",
            },
            {"left": "Rateo di canone non goduto", "right": "Restituito alla chiusura della posizione"},
        ],
        "explanation": (
            "Il recesso è libero e gratuito, ma non estingue il debito residuo, che resta "
            "dovuto secondo il piano in corso. È la cosa da dire per prima a chi chiude una "
            "revolving convinto di chiudere anche il finanziamento, perché è esattamente "
            "quello che non succede."
        ),
    },
    {
        "text": "Abbina ogni evento all'ufficio competente.",
        "pairs": [
            {"left": "Richiesta di una nuova carta", "right": "Ufficio crediti al consumo"},
            {"left": "Blocco per smarrimento o furto", "right": "Contact center"},
            {"left": "Contestazione di un addebito", "right": "Ufficio frodi e contestazioni"},
            {"left": "Insoluto alla data di addebito", "right": "Ufficio recupero"},
            {"left": "Richiesta di rateizzazione di un acquisto", "right": "Filiale"},
        ],
        "explanation": (
            "La tabella delle competenze divide le richieste per chi le lavora, non per chi le "
            "riceve: il blocco lo esegue il contact center in qualunque momento, mentre la "
            "rateizzazione di un acquisto resta un gesto di filiale. Indirizzare male una "
            "pratica costa al cliente i giorni che servono a rimandarla indietro."
        ),
    },
    {
        "text": "Abbina ogni adempimento della procedura al numero di giorni previsto.",
        "pairs": [
            {"left": "Delibera dell'ufficio crediti al consumo", "right": "5 giorni lavorativi"},
            {"left": "Stampa e spedizione della carta", "right": "7 giorni lavorativi"},
            {"left": "Esito del chargeback", "right": "45 giorni"},
            {
                "left": "Controdeduzioni del cliente in fase di rappresentazione",
                "right": "10 giorni",
            },
            {"left": "Risposta a un reclamo scritto sul canone", "right": "60 giorni"},
        ],
        "explanation": (
            "I termini più stretti sono quelli che dipendono dal cliente: dieci giorni per le "
            "controdeduzioni quando l'esercente replica con documentazione. Perderli chiude la "
            "pratica a suo sfavore, quindi vanno comunicati insieme alla richiesta e non "
            "dentro una lettera che il cliente leggerà con calma."
        ),
    },
    {
        "text": (
            "Abbina ogni situazione al livello di responsabilità del titolare per le "
            "operazioni non autorizzate."
        ),
        "pairs": [
            {
                "left": "Operazioni eseguite prima della comunicazione di smarrimento",
                "right": "Perdite a carico del titolare fino a 50 euro",
            },
            {
                "left": "Operazioni eseguite dopo il blocco",
                "right": "Nessuna perdita a carico del titolare",
            },
            {"left": "Dolo o colpa grave del titolare", "right": "Responsabilità integrale"},
            {"left": "Prova del dolo o della colpa grave", "right": "Spetta alla Banca"},
            {
                "left": "Pagamento su internet senza l'autenticazione forte dovuta",
                "right": "L'onere resta alla Banca che non ha applicato il presidio",
            },
        ],
        "explanation": (
            "La franchigia di 50 euro copre solo la finestra fra la sottrazione e la "
            "comunicazione, e cade quando l'operazione è stata resa possibile da una carenza "
            "dei presidi della Banca. L'errore tipico è presentarla al cliente come una quota "
            "sempre dovuta: non lo è, e la colpa grave la deve provare la Banca, non "
            "presumerla."
        ),
    },
    {
        "text": "Abbina ogni aspetto dell'anticipazione di contante alla regola prevista.",
        "pairs": [
            {"left": "Commissione applicata", "right": "Il 4 per cento dell'importo"},
            {"left": "Minimo della commissione", "right": "3 euro"},
            {"left": "Decorrenza degli interessi", "right": "Dal giorno del prelievo"},
            {
                "left": "Interessi in modalità a saldo",
                "right": "Maturano lo stesso, unica operazione della carta a farlo",
            },
            {
                "left": "Momento in cui va segnalata al cliente",
                "right": "Ogni volta che chiede il prelievo allo sportello",
            },
        ],
        "explanation": (
            "Il prelievo con carta di credito è un finanziamento e non un accesso al proprio "
            "denaro: gli interessi decorrono dal giorno del prelievo e non dalla data di "
            "addebito, anche a saldo. È l'unica operazione della carta che si comporta così, "
            "ed è il motivo per cui va detto prima, non dopo, sull'estratto conto."
        ),
    },
    {
        "text": "Abbina ogni affermazione da correggere alla precisazione da dare al cliente.",
        "pairs": [
            {
                "left": "«La revolving è solo un addebito più comodo»",
                "right": "È un contratto di credito al consumo, cioè un finanziamento",
            },
            {
                "left": "«Il plafond si ricostituisce il primo del mese»",
                "right": "Si ricostituisce alla data di addebito",
            },
            {
                "left": "«Prelevare contante non costa nulla se sono a saldo»",
                "right": "Produce interessi dal giorno del prelievo",
            },
            {
                "left": "«Chiudere la carta estingue anche il debito»",
                "right": "Il debito residuo resta dovuto secondo il piano in corso",
            },
            {
                "left": "«Il codice a tre cifre prova che ero io»",
                "right": "È un dato statico stampato sulla carta, non un fattore di autenticazione",
            },
        ],
        "explanation": (
            "Sono i cinque fraintendimenti che la procedura corregge esplicitamente, e hanno "
            "in comune di sembrare ragionevoli. Il più costoso è l'ultimo: se il codice a tre "
            "cifre bastasse a dimostrare che ha operato il titolare, ogni contestazione si "
            "chiuderebbe contro il cliente, ed è esattamente il contrario di quello che dice "
            "la procedura."
        ),
    },
    {
        "text": "Abbina ogni richiesta del cliente alla modalità di rimborso corretta.",
        "pairs": [
            {"left": "Non vuole pagare interessi", "right": "Modalità a saldo"},
            {
                "left": "Vuole diluire un singolo acquisto sopra i 250 euro",
                "right": "Rateizzazione di quell'acquisto",
            },
            {
                "left": "Vuole rimborsare a rate con il credito che si ricostituisce",
                "right": "Carta revolving",
            },
            {
                "left": "Vuole poter rateizzare una volta l'anno restando a saldo",
                "right": "Saldo con rateizzazione occasionale",
            },
            {
                "left": "Chiede a voce di passare alla revolving durante una telefonata",
                "right": "Serve una nuova sottoscrizione, non si esegue al telefono",
            },
        ],
        "explanation": (
            "La richiesta più frequente, cioè diluire un addebito pesante, non si risolve "
            "passando alla revolving ma rateizzando quel singolo acquisto. L'errore tipico è "
            "accontentare il cliente cambiandogli la modalità di rimborso: è una modifica "
            "contrattuale, richiede il documento informativo europeo e cambia il costo di "
            "tutto quello che spenderà dopo."
        ),
    },
]

# ── Carte di debito, abbinamento ──

CARTE_DEBITO_ABBINAMENTO = [
    {
        "text": "Abbina ogni prelievo alla commissione prevista.",
        "pairs": [
            {"left": "ATM della Banca", "right": "Gratuito"},
            {"left": "ATM di un'altra banca in Italia", "right": "2,00 euro"},
            {"left": "ATM fuori area euro", "right": "5,00 euro più l'1,5 per cento dell'importo"},
            {"left": "Pagamento in divisa diversa dall'euro", "right": "L'1,5 per cento dell'importo"},
            {"left": "Canone annuo della carta internazionale", "right": "12,00 euro"},
        ],
        "explanation": (
            "Il prelievo fuori area euro è l'unico che somma una quota fissa e una "
            "percentuale, ed è quello su cui il cliente si sorprende al rientro dal viaggio. "
            "Dentro l'area euro il costo è lo stesso di un prelievo presso un'altra banca "
            "italiana, quindi non c'è ragione di sconsigliare la carta all'estero."
        ),
    },
    {
        "text": "Abbina ogni servizio sulla carta al costo previsto.",
        "pairs": [
            {"left": "Sostituzione per smarrimento o furto", "right": "8,00 euro"},
            {"left": "Sostituzione per malfunzionamento", "right": "Gratuita"},
            {"left": "Duplicato del PIN", "right": "3,00 euro"},
            {"left": "Prelievo presso un ATM in area euro", "right": "2,00 euro"},
            {"left": "Pagamento presso un esercente in euro", "right": "Nessun costo"},
        ],
        "explanation": (
            "La sostituzione si paga o no a seconda del motivo, non a seconda di chi la "
            "chiede: una carta che non legge più è un difetto del supporto e la si cambia "
            "gratis. L'errore tipico è addebitare gli 8 euro anche lì, che è un reclamo "
            "fondato in arrivo."
        ),
    },
    {
        "text": "Abbina ogni scelta al terminale al proprio effetto sul cambio applicato.",
        "pairs": [
            {
                "left": "Accettare la conversione in euro proposta dal terminale",
                "right": "Il cambio lo applica l'esercente, quasi sempre a condizioni peggiori",
            },
            {
                "left": "Scegliere l'importo nella valuta locale",
                "right": "Il cambio è quello del circuito, maggiorato della commissione della Banca",
            },
            {
                "left": "Pagamento in divisa diversa dall'euro",
                "right": "Commissione dell'1,5 per cento sull'importo",
            },
            {
                "left": "Prelievo presso un ATM fuori area euro",
                "right": "Quota fissa di 5,00 euro oltre alla percentuale",
            },
            {
                "left": "Indicazione da dare al cliente prima del viaggio",
                "right": "Scegliere sempre la valuta locale al terminale",
            },
        ],
        "explanation": (
            "La conversione proposta dallo schermo sembra un servizio e invece sposta il "
            "cambio dall'esercente al circuito, cioè da chi lo decide a proprio favore a chi "
            "lo pubblica. L'errore tipico è accettarla perché mostra subito l'importo in euro: "
            "quell'importo è più alto, e la commissione della Banca resta comunque dovuta."
        ),
    },
    {
        "text": "Abbina ogni elemento del rilascio della carta alla regola prevista.",
        "pairs": [
            {
                "left": "Chi può richiederla",
                "right": "Titolare, cointestatario o delegato a operare sul rapporto",
            },
            {"left": "Numero massimo di carte per intestatario", "right": "Due"},
            {
                "left": "Consegna allo sportello",
                "right": "Solo previa identificazione con documento valido",
            },
            {
                "left": "Ritiro da parte di un familiare delegato sul conto",
                "right": "Non ammesso in nessun caso",
            },
            {
                "left": "Primo utilizzo consigliato",
                "right": "Un prelievo presso un ATM della Banca",
            },
        ],
        "explanation": (
            "La delega a operare sul conto non comprende il ritiro della carta, che è uno "
            "strumento di pagamento personale: è l'errore più frequente allo sportello, "
            "perché la delega sembra coprire tutto. Il primo prelievo presso un ATM della "
            "Banca serve anche a verificare che il PIN sia arrivato al titolare."
        ),
    },
    {
        "text": "Abbina ogni esito della verifica su una mancata erogazione alla gestione corretta.",
        "pairs": [
            {
                "left": "Addebito risultante solo come prenotato",
                "right": "Si libera da solo entro tre giorni lavorativi, nessuna pratica",
            },
            {
                "left": "Addebito risultante contabilizzato",
                "right": "Apertura della pratica di quadratura di cassa sul terminale",
            },
            {
                "left": "Eccedenza di cassa pari all'importo",
                "right": "Riaccredito con valuta pari al giorno del prelievo",
            },
            {
                "left": "Conto andato in scoperto per quell'addebito",
                "right": "Storno degli interessi passivi nella stessa operazione",
            },
            {
                "left": "Prelievo effettuato presso l'ATM di un'altra banca",
                "right": "Esito comunicato entro 15 giorni lavorativi",
            },
        ],
        "explanation": (
            "Il primo controllo è se l'addebito è contabilizzato o solo prenotato, perché nel "
            "secondo caso non c'è niente da lavorare e la pratica sarebbe tempo sprecato per "
            "tutti. Lo storno degli interessi passivi non si fa su richiesta del cliente: la "
            "valuta ripristinata li cancella, e vanno tolti nella stessa operazione."
        ),
    },
    {
        "text": "Abbina ogni situazione del pagamento contactless alla regola applicabile.",
        "pairs": [
            {"left": "Importo fino a 50 euro", "right": "Nessun PIN richiesto"},
            {
                "left": "Sesta operazione consecutiva senza PIN",
                "right": "Il terminale chiede il PIN anche per pochi euro",
            },
            {
                "left": "Cliente che segnala la richiesta di PIN come un guasto",
                "right": "È un presidio del circuito contro l'uso di una carta sottratta",
            },
            {
                "left": "Conteggio delle operazioni consecutive",
                "right": "Si azzera quando il PIN viene digitato",
            },
            {"left": "Limite mensile del contactless", "right": "Non previsto"},
        ],
        "explanation": (
            "Il contatore delle cinque operazioni è una difesa e non un malfunzionamento: chi "
            "ha sottratto una carta può spendere al massimo cinque volte sotto i 50 euro "
            "prima di doversi fermare. Spiegarlo al cliente che chiama per segnalare il "
            "problema evita una sostituzione inutile."
        ),
    },
    {
        "text": "Abbina ogni preparazione al viaggio all'indicazione corretta.",
        "pairs": [
            {
                "left": "Abilitazione della carta ai paesi di destinazione",
                "right": "Si attiva dall'app per area geografica",
            },
            {
                "left": "Numero per il blocco valido dall'estero",
                "right": "Non è un numero verde, va composto con il prefisso internazionale",
            },
            {"left": "Prelievo presso un ATM all'estero", "right": "Limite giornaliero di 250 euro"},
            {"left": "Prelievi all'estero nel mese", "right": "Limite mensile di 1.000 euro"},
            {
                "left": "Carta del solo circuito nazionale",
                "right": "Va sostituita, all'estero non funziona",
            },
        ],
        "explanation": (
            "Il limite mensile dei prelievi all'estero è più basso di quello ordinario, e il "
            "cliente che conta di prelevare 250 euro al giorno per tutta la vacanza si ferma "
            "al quarto giorno. Il numero per il blocco va annotato prima di partire, perché "
            "il numero verde stampato sui documenti non risponde dall'estero."
        ),
    },
    {
        "text": "Abbina ogni aspetto del PIN alla regola prevista.",
        "pairs": [
            {
                "left": "Consegna del PIN",
                "right": "Busta cieca, oppure lettura dall'app dopo autenticazione forte",
            },
            {
                "left": "PIN che coincide con l'anno di nascita",
                "right": "Combinazione rifiutata dal sistema alla modifica",
            },
            {"left": "Luogo in cui non va mai conservato", "right": "Il portafogli, insieme alla carta"},
            {"left": "Forma in cui non va mai salvato", "right": "Una nota in chiaro sul telefono"},
            {
                "left": "Verifica che il PIN sia arrivato correttamente",
                "right": "Il primo prelievo presso un ATM della Banca",
            },
        ],
        "explanation": (
            "Il sistema rifiuta da solo le combinazioni deboli, cioè l'anno di nascita, le "
            "sequenze consecutive e le quattro cifre uguali, ma non può niente contro un PIN "
            "forte scritto sul foglietto accanto alla carta. La custodia è la parte che "
            "dipende dal cliente, ed è anche quella che pesa nella valutazione della colpa "
            "grave."
        ),
    },
    {
        "text": "Abbina ogni limite mensile all'operazione a cui si applica.",
        "pairs": [
            {"left": "1.500 euro", "right": "Prelievi, sommando tutti gli sportelli automatici"},
            {"left": "5.000 euro", "right": "Pagamenti presso gli esercenti"},
            {"left": "3.000 euro", "right": "Pagamenti su internet"},
            {"left": "1.000 euro", "right": "Prelievi presso ATM all'estero"},
            {"left": "Nessun limite mensile", "right": "Pagamenti contactless sotto la soglia del PIN"},
        ],
        "explanation": (
            "Il limite mensile dei prelievi è unico e si consuma su qualunque sportello, della "
            "Banca o di altri: chi ha già prelevato 1.500 euro nel mese non preleva altro, "
            "anche se il limite giornaliero glielo consentirebbe. È il controllo che manca "
            "quando si guarda solo la colonna del giorno."
        ),
    },
    {
        "text": "Abbina ogni passo della pratica di mancata erogazione a chi lo compie o al suo termine.",
        "pairs": [
            {
                "left": "Verifica se l'addebito è contabilizzato o prenotato",
                "right": "L'operatore che riceve la segnalazione",
            },
            {
                "left": "Confronto fra il giornale di fondo e il contante residuo",
                "right": "Il presidio ATM, alla chiusura di cassa",
            },
            {
                "left": "Storno degli interessi passivi maturati",
                "right": "D'ufficio, senza richiesta del cliente",
            },
            {"left": "Esito su un ATM della Banca", "right": "Entro 5 giorni lavorativi"},
            {"left": "Esito su un ATM di un'altra banca", "right": "Entro 15 giorni lavorativi"},
        ],
        "explanation": (
            "La quadratura la fa il presidio ATM e non la filiale, perché l'unica prova è il "
            "confronto fra quello che il terminale ha registrato e il contante che gli è "
            "rimasto dentro. I due termini diversi dipendono da chi possiede lo sportello: su "
            "un terminale altrui la Banca deve passare dall'altro istituto."
        ),
    },
    {
        "text": "Abbina ogni evento di fine vita della carta alla gestione corretta.",
        "pairs": [
            {"left": "Carta scaduta", "right": "Nessuna azione, il rinnovo è automatico"},
            {"left": "Carta smagnetizzata che non legge", "right": "Sostituzione per malfunzionamento"},
            {"left": "Carta trattenuta dall'ATM", "right": "Blocco definitivo e sostituzione"},
            {"left": "Carta smarrita in casa, nessun sospetto", "right": "Blocco temporaneo dall'app"},
            {"left": "Carta rubata", "right": "Blocco definitivo e invito a sporgere denuncia"},
        ],
        "explanation": (
            "Le cinque situazioni sembrano la stessa cosa e chiedono cinque gesti diversi: il "
            "blocco definitivo non si revoca, quindi usarlo per una carta che è solo "
            "introvabile in casa condanna il cliente a stare senza per una settimana. Il "
            "blocco temporaneo dall'app esiste esattamente per quel caso."
        ),
    },
    {
        "text": "Abbina ogni limite giornaliero di prelievo al canale a cui si applica.",
        "pairs": [
            {"left": "500 euro", "right": "ATM della Banca"},
            {"left": "250 euro in Italia", "right": "ATM di un'altra banca"},
            {"left": "250 euro all'estero", "right": "ATM situato fuori dai confini nazionali"},
            {"left": "Il doppio dei valori standard", "right": "Il tetto oltre cui l'app non lascia salire"},
            {"left": "Effetto immediato", "right": "La modifica del massimale confermata dall'app"},
        ],
        "explanation": (
            "Il limite scende dalla metà quando lo sportello non è della Banca, in Italia come "
            "all'estero. Il cliente può alzarlo dall'app fino al doppio dei valori standard, "
            "con autenticazione forte e con effetto immediato: non serve passare dalla "
            "filiale se resta dentro quel tetto."
        ),
    },
    {
        "text": "Abbina ogni situazione davanti a uno sportello automatico al comportamento corretto.",
        "pairs": [
            {
                "left": "Fessura di inserimento con parti mobili o aggiunte",
                "right": "Non usare il terminale e segnalarlo",
            },
            {
                "left": "Sconosciuto che offre aiuto davanti al terminale",
                "right": "Rifiutare e interrompere l'operazione",
            },
            {"left": "Digitazione del PIN", "right": "Coprire la tastiera con l'altra mano"},
            {
                "left": "Scelta dello sportello da usare",
                "right": "Preferire quelli in filiale o videosorvegliati",
            },
            {
                "left": "Operazione da interrompere a metà",
                "right": "Non allontanarsi lasciando la carta inserita",
            },
        ],
        "explanation": (
            "Sono le cinque regole di prudenza da trasmettere al cliente, e riguardano tutte "
            "il momento in cui la carta e il PIN si trovano insieme nello stesso posto. "
            "L'aiuto dello sconosciuto è la più insidiosa, perché arriva quando il cliente è "
            "già in difficoltà con il terminale ed è più disposto ad accettarlo."
        ),
    },
    {
        "text": "Abbina ogni affermazione da correggere alla precisazione corretta.",
        "pairs": [
            {
                "left": "«La carta di debito ha un plafond concesso dalla Banca»",
                "right": "La disponibilità è quella del conto, fido compreso",
            },
            {
                "left": "«Il blocco si toglie se la carta ricompare»",
                "right": "Il blocco definitivo non si revoca, la carta si sostituisce",
            },
            {
                "left": "«La carta trattenuta dall'ATM si ritira allo sportello»",
                "right": "Non si restituisce in nessun caso, nemmeno su un terminale della Banca",
            },
            {
                "left": "«Il rimborso di un'operazione disconosciuta chiude la pratica»",
                "right": "È provvisorio, la Banca può riaddebitare dopo l'istruttoria",
            },
            {
                "left": "«Il PIN chiesto alla sesta operazione contactless è un guasto»",
                "right": "È un presidio del circuito, non un malfunzionamento",
            },
        ],
        "explanation": (
            "Sono i cinque fraintendimenti che la procedura corregge, e ognuno porta a un "
            "gesto sbagliato: il più costoso è promettere che il rimborso è definitivo, "
            "perché il riaddebito arriva con quindici giorni di preavviso su un cliente a cui "
            "era stato detto il contrario."
        ),
    },
    {
        "text": (
            "Abbina ogni comportamento del cliente alla ragione per cui la procedura lo "
            "qualifica come lo qualifica."
        ),
        "pairs": [
            {
                "left": "PIN custodito insieme alla carta",
                "right": "Chi trova il portafogli ha in mano tutti e due i fattori",
            },
            {
                "left": "PIN comunicato a un sedicente operatore dopo l'avviso della Banca",
                "right": "Il cliente era già stato messo in guardia",
            },
            {
                "left": "Ritardo prolungato nel comunicare lo smarrimento",
                "right": "Il tempo in cui la carta resta utilizzabile dipende dal cliente",
            },
            {
                "left": "PIN digitato presso un terminale manomesso",
                "right": "Non poteva accorgersene, quindi non è colpa grave",
            },
            {
                "left": "Comunicazione dei soli dati stampati sulla carta",
                "right": "Sono dati statici, quindi non è colpa grave",
            },
        ],
        "explanation": (
            "La colpa grave non dipende dal danno ma da quello che il cliente poteva evitare: "
            "custodire il PIN accanto alla carta lo poteva evitare, accorgersi di un terminale "
            "manomesso no. È la distinzione che decide se il rimborso resta o viene "
            "riaddebitato, e va applicata sui fatti, non sull'importo."
        ),
    },
    {
        "text": "Abbina ogni operazione al suo effetto sulla disponibilità del conto.",
        "pairs": [
            {"left": "Pagamento presso un esercente", "right": "Addebito immediato"},
            {
                "left": "Prelievo non erogato ma solo prenotato",
                "right": "Importo impegnato e liberato entro tre giorni lavorativi",
            },
            {
                "left": "Disconoscimento comunicato dal cliente",
                "right": "Rimborso entro la fine del giorno lavorativo successivo",
            },
            {
                "left": "Riaddebito dopo un'istruttoria sfavorevole",
                "right": "Preavviso di almeno 15 giorni",
            },
            {
                "left": "Prelievo che aveva portato il conto in scoperto, poi rimborsato",
                "right": "Storno degli interessi passivi maturati",
            },
        ],
        "explanation": (
            "Il rimborso su disconoscimento è dovuto entro la fine del giorno lavorativo "
            "successivo, e la Banca può rifiutarlo solo con un fondato sospetto di frode del "
            "cliente, comunicato per iscritto e motivato. L'errore tipico è tenerlo sospeso in "
            "attesa dell'istruttoria, che è esattamente quello che la norma impedisce."
        ),
    },
    {
        "text": "Abbina ogni esigenza del cliente all'impostazione da proporgli.",
        "pairs": [
            {
                "left": "Non compra mai online e teme le truffe",
                "right": "Massimale dei pagamenti su internet portato a zero",
            },
            {"left": "Parte per un viaggio", "right": "Abilitazione della carta per area geografica"},
            {
                "left": "È genitore di un quindicenne",
                "right": "Attivazione dei pagamenti su internet sulla carta del figlio",
            },
            {
                "left": "Non trova la carta ma è convinto di averla in casa",
                "right": "Blocco temporaneo, reversibile dall'app",
            },
            {
                "left": "Vuole poter spendere di più in una giornata",
                "right": "Modifica del massimale dall'app, entro il doppio dello standard",
            },
        ],
        "explanation": (
            "Il massimale a zero sui pagamenti online è la difesa più efficace per chi non "
            "compra su internet, e va proposta attivamente invece di aspettare la richiesta: "
            "toglie valore alla carta per chi la clona senza togliere niente al cliente."
        ),
    },
    {
        "text": "Abbina ogni fase del rilascio al momento in cui avviene.",
        "pairs": [
            {
                "left": "Scelta del circuito e del tipo di supporto",
                "right": "All'acquisizione della richiesta a sistema",
            },
            {
                "left": "Consegna del documento di sintesi",
                "right": "Insieme alla sottoscrizione del contratto",
            },
            {
                "left": "Consegna materiale della carta",
                "right": "Allo sportello, se disponibile a magazzino",
            },
            {
                "left": "Spedizione all'indirizzo di residenza",
                "right": "Quando la carta non è disponibile a magazzino",
            },
            {"left": "Attivazione", "right": "Al primo utilizzo da parte del cliente"},
        ],
        "explanation": (
            "La verifica sul numero di carte già attive precede l'acquisizione della "
            "richiesta, non la consegna: accorgersi del limite quando la carta è già stata "
            "prodotta significa buttare un supporto e far tornare il cliente. Il documento di "
            "sintesi si consegna con il contratto e non dopo."
        ),
    },
    {
        "text": "Abbina ogni informazione da dare prima di bloccare alla ragione per cui gliela si dice.",
        "pairs": [
            {
                "left": "Il blocco definitivo non si revoca",
                "right": "La carta andrà sostituita e per qualche giorno resterà senza",
            },
            {
                "left": "L'orario esatto del blocco",
                "right": "È il momento da cui le operazioni non sono più a suo carico",
            },
            {
                "left": "Esiste il blocco temporaneo dall'app",
                "right": "Una carta smarrita in casa può ricomparire",
            },
            {
                "left": "La denuncia non serve per bloccare",
                "right": "Il blocco non va rimandato in attesa di sporgerla",
            },
            {
                "left": "Il numero valido dall'estero non è verde",
                "right": "Va composto con il prefisso internazionale",
            },
        ],
        "explanation": (
            "Il blocco è immediato e non condizionato alla denuncia: subordinarlo a un "
            "documento che il cliente non ha ancora lascia la carta attiva nelle ore in cui "
            "serve di più fermarla. L'orario esatto va comunicato perché è la linea che "
            "separa le operazioni contestabili da quelle che non lo sono più."
        ),
    },
    {
        "text": "Abbina ogni domanda frequente del cliente alla risposta corretta.",
        "pairs": [
            {
                "left": "«Perché mi chiede il PIN per due euro?»",
                "right": "Le operazioni contactless consecutive senza PIN sono al massimo cinque",
            },
            {
                "left": "«Posso usarla su internet?»",
                "right": "Sì se è una carta internazionale, no se è del solo circuito nazionale",
            },
            {"left": "«Quanto posso prelevare in un mese?»", "right": "1.500 euro complessivi"},
            {"left": "«Prelevare in un'altra banca è gratis?»", "right": "No, costa 2,00 euro"},
            {
                "left": "«Se non riconosco un pagamento mi rimborsate?»",
                "right": "Entro la fine del giorno lavorativo successivo alla comunicazione",
            },
        ],
        "explanation": (
            "Sono le cinque domande che arrivano più spesso allo sportello e al contact "
            "center. La quinta è quella su cui si sbaglia di più per eccesso di prudenza: il "
            "rimborso è dovuto entro il giorno lavorativo successivo, e rinviarlo all'esito "
            "dell'istruttoria è una violazione, non una cautela."
        ),
    },
    {
        "text": "Abbina ogni massimale della carta di un minore alla fascia di età a cui appartiene.",
        "pairs": [
            {"left": "50 euro di prelievo al giorno", "right": "Da 12 a 14 anni"},
            {"left": "250 euro di spesa al mese", "right": "La stessa fascia da 12 a 14 anni"},
            {"left": "100 euro di prelievo al giorno", "right": "Da 15 a 17 anni"},
            {"left": "500 euro di spesa al mese", "right": "La stessa fascia da 15 a 17 anni"},
            {"left": "Massimali standard", "right": "Dal compimento dei 18 anni"},
        ],
        "explanation": (
            "I massimali del minore sono fissi e non modificabili dalla sua app, al contrario "
            "di quelli ordinari. Al diciottesimo compleanno il rapporto passa da solo alla "
            "forma ordinaria e il genitore perde ogni potere: non è una scelta della filiale e "
            "non si può rimandare."
        ),
    },
    {
        "text": "Abbina ogni elemento del disconoscimento di un pagamento al proprio obbligo o termine.",
        "pairs": [
            {
                "left": "Rimborso al cliente",
                "right": "Entro la fine del giorno lavorativo successivo alla comunicazione",
            },
            {
                "left": "Rifiuto del rimborso per fondato sospetto di frode",
                "right": "Va comunicato per iscritto",
            },
            {
                "left": "Natura del rimborso immediato",
                "right": "Provvisoria, fino all'esito dell'istruttoria",
            },
            {
                "left": "Riaddebito delle somme dopo l'istruttoria",
                "right": "Preavviso di almeno 15 giorni e motivazione",
            },
            {"left": "Prova del dolo o della colpa grave", "right": "Resta a carico della Banca"},
        ],
        "explanation": (
            "Il rimborso è dovuto subito e sospenderlo in attesa dell'istruttoria è la "
            "violazione più comune, perché sembra prudenza. La Banca può riprendersi le somme, "
            "ma solo dopo avere accertato qualcosa e con quindici giorni di preavviso: è il "
            "contrario di trattenere il rimborso finché non si è capito."
        ),
    },
]

# ── Mutui ipotecari, abbinamento ──

MUTUI_ABBINAMENTO = [
    {
        "text": "Abbina ogni tipologia di tasso al modo in cui si determina.",
        "pairs": [
            {"left": "Fisso", "right": "Indice IRS di durata pari al piano più lo spread"},
            {"left": "Variabile", "right": "Indice Euribor a tre mesi più lo spread"},
            {"left": "Variabile con CAP", "right": "Come il variabile, ma con un tetto massimo"},
            {"left": "Misto", "right": "Alternanza fra fisso e variabile a scadenze prefissate"},
            {"left": "Variabile a rata costante", "right": "La rata resta ferma e cambia la durata"},
        ],
        "explanation": (
            "Il fisso guarda l'IRS e il variabile l'Euribor: sono due indici diversi e non due "
            "letture dello stesso. Il variabile a rata costante non è un fisso travestito, "
            "perché il rischio non sparisce, si sposta sulla durata del piano."
        ),
    },
    {
        "text": "Abbina ogni tipologia di tasso al profilo di cliente a cui si propone.",
        "pairs": [
            {"left": "Fisso", "right": "Reddito stabile e avversione al rischio"},
            {"left": "Variabile", "right": "Reddito capiente e orizzonte breve"},
            {"left": "Variabile con CAP", "right": "Chi vuole il variabile senza la coda di rischio"},
            {"left": "Misto", "right": "Chi non vuole scegliere una volta per tutte"},
            {"left": "Variabile a rata costante", "right": "Chi ha un bilancio familiare rigido"},
        ],
        "explanation": (
            "La proposta si costruisce sul profilo e non sulla previsione dei tassi. Al "
            "cliente con bilancio rigido il variabile a rata costante va spiegato per intero, "
            "conguaglio finale compreso: è la caratteristica che viene scoperta dopo più "
            "spesso di ogni altra."
        ),
    },
    {
        "text": "Abbina ogni categoria di richiedente alla documentazione reddituale da acquisire.",
        "pairs": [
            {
                "left": "Lavoratore dipendente",
                "right": "Ultime tre buste paga, modello CU e attestazione di servizio",
            },
            {
                "left": "Lavoratore autonomo",
                "right": "Ultime due dichiarazioni dei redditi ed estratto conto di sei mesi",
            },
            {"left": "Pensionato", "right": "Cedolino della pensione e modello ObisM"},
            {
                "left": "Immobile in acquisto",
                "right": "Preliminare registrato, planimetria, visura e atto di provenienza",
            },
            {
                "left": "Immobile in costruzione",
                "right": "Permesso di costruire, computo metrico e capitolato",
            },
        ],
        "explanation": (
            "Il dipendente porta tre buste paga sul mutuo, non due come sulla carta di "
            "credito: la durata del finanziamento cambia la profondità della verifica. "
            "L'estratto conto di sei mesi si chiede solo all'autonomo, perché è lì che si "
            "legge la continuità di un reddito che la dichiarazione fotografa una volta "
            "l'anno."
        ),
    },
    {
        "text": "Abbina ogni situazione documentale alla regola prevista.",
        "pairs": [
            {
                "left": "Surroga di un mutuo in essere",
                "right": "Contratto, piano di ammortamento e conteggio estintivo",
            },
            {
                "left": "Mutuo per ristrutturazione",
                "right": "Preventivi dei lavori, titolo abilitativo e documentazione fotografica",
            },
            {
                "left": "Documentazione anagrafica",
                "right": "Documento, codice fiscale, stato di famiglia e atto di matrimonio",
            },
            {
                "left": "Visura ipocatastale",
                "right": "La richiede la Banca e rientra nelle spese di istruttoria",
            },
            {
                "left": "Visura procurata dal cliente per conto proprio",
                "right": "Non fa risparmiare la spesa, serve una visura aggiornata alla delibera",
            },
        ],
        "explanation": (
            "La visura la acquisisce la Banca perché deve essere aggiornata al giorno della "
            "delibera, e una procurata mesi prima dal cliente non lo è. Dirgli che gli farà "
            "risparmiare la spesa è una promessa che non si può mantenere, ed è meglio "
            "chiarirlo prima che presenti il documento."
        ),
    },
    {
        "text": "Abbina ogni esito della perizia alla conseguenza sulla pratica.",
        "pairs": [
            {"left": "Valore congruo e nessuna difformità", "right": "La pratica prosegue alla delibera"},
            {
                "left": "Valore inferiore al prezzo di acquisto",
                "right": "Ricalcolo del finanziamento massimo sul valore periziato",
            },
            {
                "left": "Difformità catastale sanabile",
                "right": "Sospensione fino alla regolarizzazione documentata",
            },
            {"left": "Abuso edilizio non sanabile", "right": "Diniego, l'immobile non è ipotecabile"},
            {
                "left": "Immobile gravato da ipoteca precedente",
                "right": "Erogazione subordinata alla cancellazione",
            },
        ],
        "explanation": (
            "La difformità sanabile sospende, quella non sanabile chiude: è la distinzione che "
            "decide se il cliente ha qualcosa da fare o se la pratica è finita. Il valore "
            "inferiore al prezzo non è un diniego, riduce il finanziamento massimo e sposta "
            "la differenza sui mezzi propri dell'acquirente."
        ),
    },
    {
        "text": "Abbina ogni aspetto della perizia alla regola prevista.",
        "pairs": [
            {"left": "Costo", "right": "Da 250 a 400 euro secondo la tipologia dell'immobile"},
            {"left": "Esito negativo", "right": "Il costo resta a carico del cliente"},
            {
                "left": "Accettazione del cliente",
                "right": "Raccolta per iscritto prima di conferire l'incarico",
            },
            {
                "left": "Scelta del professionista",
                "right": "La Banca, da un elenco di periti indipendenti",
            },
            {"left": "Metodo di stima del valore", "right": "Comparativo"},
        ],
        "explanation": (
            "Il perito non lo può indicare il cliente, nemmeno quando ha già una perizia "
            "recente: l'indipendenza rispetto alle parti è ciò che rende il valore "
            "attendibile, e una perizia pagata da chi vende non lo è. Il costo resta dovuto "
            "anche a esito negativo perché remunera un'attività svolta, e va detto prima."
        ),
    },
    {
        "text": "Abbina ogni voce di spesa al proprio importo.",
        "pairs": [
            {
                "left": "Istruttoria",
                "right": "Lo 0,5 per cento, con minimo 300 e massimo 1.500 euro",
            },
            {"left": "Imposta sostitutiva prima casa", "right": "Lo 0,25 per cento dell'importo erogato"},
            {"left": "Imposta sostitutiva altri immobili", "right": "Il 2 per cento dell'importo erogato"},
            {"left": "Incasso della rata con bollettino", "right": "2,50 euro a rata"},
            {"left": "Polizza incendio e scoppio", "right": "Da 100 a 250 euro annui"},
        ],
        "explanation": (
            "L'imposta sostitutiva cambia di otto volte fra prima casa e altri immobili, ed è "
            "la voce che più spesso manda fuori conto il preventivo di chi compra una seconda "
            "casa. Non dipende dalla Banca e non è trattabile, quindi va presentata separata "
            "dalle spese su cui invece si può discutere."
        ),
    },
    {
        "text": "Abbina ogni voce dell'indicatore sintetico di costo al suo ruolo.",
        "pairs": [
            {"left": "Interessi", "right": "Il costo del capitale prestato"},
            {"left": "Istruttoria e perizia", "right": "Le spese della pratica"},
            {
                "left": "Imposta sostitutiva",
                "right": "Il tributo che sostituisce registro, ipotecaria e catastale",
            },
            {"left": "Polizze obbligatorie", "right": "Un costo accessorio compreso nell'indicatore"},
            {
                "left": "Polizza vita facoltativa",
                "right": "Resta fuori e va preventivata a parte",
            },
        ],
        "explanation": (
            "L'indicatore serve a confrontare due offerte, e ci riesce solo se comprende tutto "
            "quello che il cliente pagherà comunque. La polizza vita ne resta fuori proprio "
            "perché è facoltativa: infilarla dentro renderebbe l'offerta peggiore di quello "
            "che è e il confronto falso."
        ),
    },
    {
        "text": "Abbina ogni aspetto delle assicurazioni collegate al mutuo alla regola prevista.",
        "pairs": [
            {"left": "Polizza incendio e scoppio", "right": "Obbligatoria per legge sul fabbricato"},
            {
                "left": "Scelta della compagnia per l'incendio",
                "right": "Libera, la Banca non può rifiutare una polizza conforme",
            },
            {
                "left": "Polizza sulla vita del mutuatario",
                "right": "Mai obbligatoria né condizione per la concessione",
            },
            {
                "left": "Preventivo della polizza vita proposta",
                "right": "Separato, con sette giorni per confrontare altre offerte",
            },
            {
                "left": "Recesso dalla polizza vita entro 60 giorni",
                "right": "Rimborso integrale del premio, mutuo invariato",
            },
        ],
        "explanation": (
            "Le due polizze stanno su piani diversi: l'incendio è obbligatorio ma la compagnia "
            "la sceglie il cliente, la vita non è obbligatoria affatto. Condizionare la "
            "delibera alla polizza vita, anche solo lasciandolo intendere, è la pratica che la "
            "procedura vieta in modo più esplicito."
        ),
    },
    {
        "text": "Abbina ogni richiesta del cliente all'operazione corretta.",
        "pairs": [
            {
                "left": "Vuole un tasso migliore restando nella stessa banca",
                "right": "Rinegoziazione",
            },
            {"left": "Vuole spostare il debito residuo a un'altra banca", "right": "Surroga"},
            {"left": "Vuole spostarlo e ottenere anche liquidità", "right": "Sostituzione"},
            {
                "left": "Vuole che il debito passi a chi compra l'immobile",
                "right": "Accollo",
            },
            {
                "left": "Vuole ridurre il capitale residuo con una somma disponibile",
                "right": "Estinzione parziale",
            },
        ],
        "explanation": (
            "La confusione più costosa è fra surroga e sostituzione: la surroga non può "
            "aumentare l'importo residuo, quindi chi vuole anche liquidità sta chiedendo una "
            "sostituzione, con tutte le spese di un mutuo nuovo. Va detto prima di avviare la "
            "pratica, non quando il preventivo arriva sul tavolo."
        ),
    },
    {
        "text": "Abbina ogni aspetto dell'estinzione anticipata alla regola prevista.",
        "pairs": [
            {
                "left": "Estinzione totale su un immobile abitativo",
                "right": "Sempre consentita e senza penale",
            },
            {"left": "Rilascio del conteggio estintivo", "right": "Entro dieci giorni lavorativi"},
            {
                "left": "Canale per chiedere il conteggio",
                "right": "La filiale oppure l'area riservata",
            },
            {
                "left": "Estinzione parziale con riduzione della rata",
                "right": "Libera reddito mensile",
            },
            {
                "left": "Estinzione parziale con riduzione della durata",
                "right": "Fa risparmiare più interessi",
            },
        ],
        "explanation": (
            "Dopo un'estinzione parziale la scelta fra ridurre la rata e accorciare la durata "
            "è del cliente, e le due cose non si equivalgono. Darla per scontata, di solito "
            "riducendo la rata, toglie al cliente il risparmio maggiore senza che nessuno "
            "glielo abbia mai posto come alternativa."
        ),
    },
    {
        "text": "Abbina ogni numero della procedura al requisito che misura.",
        "pairs": [
            {"left": "80 per cento", "right": "Rapporto massimo fra finanziamento e valore"},
            {"left": "33 per cento", "right": "Rapporto massimo fra rata e reddito netto"},
            {"left": "80 anni", "right": "Età massima alla scadenza del mutuo"},
            {"left": "30 anni", "right": "Durata massima ordinaria"},
            {"left": "30.000 euro", "right": "Importo minimo finanziabile"},
        ],
        "explanation": (
            "Sono i cinque parametri ordinari, quelli entro cui una pratica non ha bisogno di "
            "deroghe. Il rapporto fra finanziamento e valore si calcola sul minore fra prezzo "
            "e perizia, non sul prezzo: è l'errore che fa promettere al cliente un importo che "
            "la delibera poi non conferma."
        ),
    },
    {
        "text": "Abbina ogni deroga o profilo particolare al limite che gli si applica.",
        "pairs": [
            {"left": "Richiedente under 36", "right": "Durata massima di 40 anni"},
            {"left": "Lavoratore autonomo", "right": "Età massima alla scadenza di 75 anni"},
            {
                "left": "Dipendente a tempo indeterminato",
                "right": "Anzianità lavorativa minima di 6 mesi",
            },
            {"left": "Autonomo, anzianità richiesta", "right": "Due anni di attività"},
            {"left": "Redditi elevati", "right": "Rapporto rata reddito ammesso fino al 40 per cento"},
        ],
        "explanation": (
            "Le deroghe non si sommano a piacere: un under 36 autonomo resta dentro i 75 anni "
            "di età alla scadenza, che è il limite della sua categoria, anche se la durata "
            "massima per età sarebbe più lunga. È il vincolo che di fatto accorcia il piano."
        ),
    },
    {
        "text": "Abbina ogni termine dell'iter al numero di giorni previsto.",
        "pairs": [
            {"left": "Validità dell'offerta comunicata al cliente", "right": "30 giorni"},
            {"left": "Tempo massimo fra delibera definitiva e stipula", "right": "90 giorni"},
            {"left": "Rilascio del conteggio estintivo", "right": "10 giorni lavorativi"},
            {
                "left": "Tempo per confrontare altre offerte sulla polizza vita",
                "right": "7 giorni",
            },
            {"left": "Recesso dalla polizza vita con rimborso integrale", "right": "60 giorni"},
        ],
        "explanation": (
            "I 90 giorni fra delibera e stipula sono il termine che fa più danni quando si "
            "perde: la delibera decade, la pratica torna in istruttoria con una nuova "
            "interrogazione delle banche dati e, se serve, una nuova perizia da pagare."
        ),
    },
    {
        "text": "Abbina ogni affermazione da correggere alla precisazione corretta.",
        "pairs": [
            {
                "left": "«Con la surroga posso anche alzare l'importo»",
                "right": "La surroga sposta solo il debito residuo, serve una sostituzione",
            },
            {
                "left": "«Il perito lo scelgo io»",
                "right": "Lo sceglie la Banca da un elenco di professionisti indipendenti",
            },
            {
                "left": "«Senza polizza vita non me lo danno»",
                "right": "Non è obbligatoria e non può essere condizione per la concessione",
            },
            {
                "left": "«Quaranta giorni di ritardo mi mandano a sofferenza»",
                "right": "La sofferenza presuppone lo stato di insolvenza complessivo",
            },
            {
                "left": "«La mora si calcola su tutto il capitale residuo»",
                "right": "Si calcola sulla sola rata scaduta",
            },
        ],
        "explanation": (
            "Sono i cinque fraintendimenti che la procedura corregge, e tre riguardano cose "
            "che il cliente teme invece di cose che spera. Al cliente in ritardo si dice "
            "esattamente come stanno le cose, senza promettere che non ci sarà nessuna "
            "segnalazione: dopo i trenta giorni la segnalazione al sistema di informazioni "
            "creditizie esiste, ed è cosa diversa dalla sofferenza."
        ),
    },
    {
        "text": "Abbina ogni finalità del mutuo alla condizione che la caratterizza.",
        "pairs": [
            {"left": "Acquisto della prima casa", "right": "Imposta sostitutiva allo 0,25 per cento"},
            {"left": "Acquisto della seconda casa", "right": "Imposta sostitutiva al 2 per cento"},
            {"left": "Costruzione", "right": "Erogazione a stati di avanzamento lavori"},
            {
                "left": "Ristrutturazione",
                "right": "Preventivi dei lavori e titolo abilitativo fra i documenti",
            },
            {
                "left": "Liquidità garantita da immobile",
                "right": "Ipoteca su un immobile già di proprietà",
            },
        ],
        "explanation": (
            "La finalità decide l'imposta, i documenti e perfino il modo in cui il denaro "
            "esce: su un immobile in costruzione l'erogazione segue gli stati di avanzamento e "
            "non arriva in un'unica soluzione alla stipula. Va detto prima, perché cambia il "
            "piano finanziario del cliente."
        ),
    },
    {
        "text": "Abbina ogni soggetto al proprio ruolo nella pratica di mutuo.",
        "pairs": [
            {
                "left": "Perito",
                "right": "Verifica conformità e stima il valore di mercato",
            },
            {
                "left": "Notaio",
                "right": "Relazione preliminare, atto e iscrizione dell'ipoteca",
            },
            {
                "left": "Ufficio istruttoria",
                "right": "Incarico al perito e delibera fino a 300.000 euro",
            },
            {"left": "Comitato crediti", "right": "Delibera oltre 300.000 euro"},
            {
                "left": "Ufficio erogazioni",
                "right": "Preparazione dell'atto per il notaio ed erogazione delle somme",
            },
        ],
        "explanation": (
            "La soglia dei 300.000 euro sposta la delibera dall'ufficio istruttoria al "
            "comitato crediti, e con essa il tempo medio, che raddoppia da cinque a dieci "
            "giorni lavorativi. Prometterne cinque su una pratica sopra soglia significa "
            "sbagliare la data della stipula davanti al notaio."
        ),
    },
    {
        "text": "Abbina ogni situazione fuori dai parametri ordinari alla gestione prevista.",
        "pairs": [
            {
                "left": "Rapporto rata reddito al 40 per cento su reddito elevato",
                "right": "Ammesso in deroga",
            },
            {
                "left": "Finanziamento oltre l'80 per cento del valore",
                "right": "Serve la garanzia statale",
            },
            {
                "left": "Delibera più vecchia di 90 giorni",
                "right": "La pratica torna in istruttoria con nuova interrogazione delle banche dati",
            },
            {"left": "Età alla scadenza oltre gli 80 anni", "right": "Fuori dai requisiti"},
            {
                "left": "Durata superiore a 30 anni",
                "right": "Ammessa fino a 40 anni per gli under 36",
            },
        ],
        "explanation": (
            "Le deroghe hanno un presupposto ciascuna e non sono discrezionali: il 40 per "
            "cento vale sui redditi elevati, il 100 per cento del valore solo con la garanzia "
            "statale. L'età alla scadenza è l'unico limite che non ha deroga, e per questo va "
            "verificato per primo."
        ),
    },
    {
        "text": "Abbina ogni caso di calcolo al finanziamento massimo concedibile.",
        "pairs": [
            {"left": "Prezzo 200.000 euro, perizia 180.000 euro", "right": "144.000 euro"},
            {"left": "Prezzo 150.000 euro, perizia 160.000 euro", "right": "120.000 euro"},
            {"left": "Prezzo e perizia entrambi 250.000 euro", "right": "200.000 euro"},
            {
                "left": "Differenza fra prezzo e finanziamento",
                "right": "Va coperta con mezzi propri dell'acquirente",
            },
            {
                "left": "Momento in cui comunicarlo al cliente",
                "right": "Prima che sottoscriva il preliminare",
            },
        ],
        "explanation": (
            "L'80 per cento si applica sempre al minore fra prezzo e perizia: nel secondo caso "
            "la perizia è più alta del prezzo e non aumenta niente. Il conto va fatto e "
            "comunicato prima del preliminare, perché dopo la caparra è già stata versata su "
            "un piano che non regge."
        ),
    },
    {
        "text": "Abbina ogni aspetto della sospensione delle rate alla regola prevista.",
        "pairs": [
            {"left": "Durata massima complessiva", "right": "18 mesi"},
            {"left": "Quota sospesa", "right": "La sola quota capitale"},
            {
                "left": "Effetto sul piano di ammortamento",
                "right": "Si allunga per un periodo pari a quello sospeso",
            },
            {
                "left": "Presupposti previsti",
                "right": "Perdita del lavoro, morte o handicap grave, spese documentate",
            },
            {"left": "Strumento attraverso cui passa", "right": "Il fondo di solidarietà"},
        ],
        "explanation": (
            "La sospensione riguarda la sola quota capitale: gli interessi continuano a "
            "maturare, e il cliente che si aspetta di non pagare nulla per diciotto mesi va "
            "corretto subito. Il piano si allunga esattamente del periodo sospeso, quindi la "
            "sospensione sposta il debito, non lo riduce."
        ),
    },
    {
        "text": "Abbina ogni elemento del rapporto fra rata e reddito al criterio di calcolo.",
        "pairs": [
            {"left": "Base di calcolo", "right": "Il reddito netto mensile del nucleo richiedente"},
            {
                "left": "Rate da sommare alla nuova",
                "right": "Quelle di tutti i finanziamenti già in corso",
            },
            {"left": "Soglia ordinaria", "right": "Il 33 per cento"},
            {"left": "Soglia ammessa sui redditi elevati", "right": "Il 40 per cento"},
            {
                "left": "Rata di 700 euro su un reddito di 2.400 euro senza altri impegni",
                "right": "Il 29 per cento, dentro i parametri ordinari",
            },
        ],
        "explanation": (
            "Il conto si fa sul nucleo e comprende le rate già in corso: la stessa rata di 700 "
            "euro sta al 29 per cento senza altri impegni e sale al 40 per cento se il nucleo "
            "paga già 260 euro di prestito auto. Dimenticare i finanziamenti in essere è "
            "l'errore che fa passare in istruttoria una pratica fuori parametro."
        ),
    },
]

# ── Mutui ipotecari, ordinamento ──

MUTUI_ORDINAMENTO = [
    {
        "text": (
            "Rimetti in ordine i passi dell'iter di concessione che vanno dalla prima "
            "informazione al conferimento dell'incarico al perito."
        ),
        "ordered_steps": [
            "Consegnare al cliente il prospetto informativo europeo standardizzato con il piano dei costi",
            "Raccogliere la documentazione anagrafica, reddituale e dell'immobile",
            "Acquisire il consenso scritto e interrogare le banche dati creditizie",
            "Deliberare la prefattibilità sul solo merito creditizio del richiedente",
            "Conferire l'incarico al perito per il sopralluogo sull'immobile",
        ],
        "explanation": (
            "La prefattibilità guarda il richiedente e non ancora l'immobile, e viene prima "
            "dell'incarico al perito per una ragione precisa: invertirli fa pagare al cliente "
            "una perizia su una pratica che il merito creditizio non avrebbe superato. È "
            "l'inversione più frequente e la più costosa."
        ),
    },
    {
        "text": (
            "Rimetti in ordine i passi che vanno dall'istruttoria sulla perizia alla stipula "
            "davanti al notaio."
        ),
        "ordered_steps": [
            "Svolgere l'istruttoria tecnica sulla perizia e verificare la congruità del valore",
            "Deliberare in via definitiva presso l'organo competente per importo",
            "Comunicare l'esito al cliente e raccoglierne l'accettazione dell'offerta",
            "Acquisire la relazione notarile preliminare sulla provenienza dell'immobile",
            "Stipulare davanti al notaio con contestuale iscrizione dell'ipoteca",
        ],
        "explanation": (
            "La relazione notarile preliminare sta fra l'accettazione e la stipula, non dopo: "
            "serve ad accertare la provenienza e l'assenza di formalità pregiudizievoli prima "
            "che l'atto venga firmato. Scoprirle in sede di rogito significa fermare tutto con "
            "le parti già dal notaio."
        ),
    },
    {
        "text": "Rimetti in ordine le attività del perito, dal conferimento dell'incarico alla stipula.",
        "ordered_steps": [
            "Ricevere l'incarico dalla Banca ed eseguire il sopralluogo sull'immobile",
            "Verificare la conformità urbanistica e catastale e lo stato di manutenzione",
            "Stimare il valore di mercato con il metodo comparativo",
            "Segnalare le difformità, distinguendo quelle sanabili da quelle che impediscono l'erogazione",
            "Attendere che le difformità sanabili siano regolarizzate prima della stipula",
        ],
        "explanation": (
            "La conformità si verifica prima della stima, perché un abuso non sanabile rende "
            "inutile qualunque valore: l'immobile non è ipotecabile e la pratica finisce lì. "
            "Le difformità sanabili non fermano la perizia, fermano la stipula finché non sono "
            "regolarizzate."
        ),
    },
    {
        "text": (
            "La perizia rileva una difformità catastale sanabile. Rimetti in ordine i passi "
            "che riportano la pratica alla delibera."
        ),
        "ordered_steps": [
            "Registrare la segnalazione del perito nell'istruttoria tecnica",
            "Sospendere la pratica in attesa della regolarizzazione",
            "Comunicare al cliente quale difformità va sanata e con quale documento",
            "Acquisire la documentazione che attesta la regolarizzazione",
            "Riprendere l'istruttoria e portare la pratica alla delibera definitiva",
        ],
        "explanation": (
            "La sospensione non è un diniego e va detta al cliente come tale, insieme "
            "all'indicazione precisa di cosa serve: una difformità sanabile lasciata senza "
            "istruzioni diventa una pratica ferma per settimane su un adempimento che il "
            "cliente non sapeva di dover fare."
        ),
    },
    {
        "text": (
            "Fra la delibera definitiva e la stipula sono passati più di 90 giorni. Rimetti "
            "in ordine i passi per riportare la pratica alla stipula."
        ),
        "ordered_steps": [
            "Prendere atto che la delibera è decaduta per decorso del termine",
            "Riportare la pratica in istruttoria",
            "Ripetere l'interrogazione delle banche dati creditizie",
            "Rinnovare la perizia se il valore non è più attendibile",
            "Deliberare di nuovo e ricomunicare l'offerta al cliente",
        ],
        "explanation": (
            "Il termine dei 90 giorni non si proroga: la delibera decade da sola e quello che "
            "va rifatto è la verifica sul richiedente, perché in tre mesi la sua esposizione "
            "può essere cambiata. La perizia si rinnova solo se serve, ed è la sola parte "
            "discrezionale del percorso."
        ),
    },
    {
        "text": "Rimetti in ordine i passi con cui si gestisce la richiesta di estinzione totale.",
        "ordered_steps": [
            "Raccogliere la richiesta del conteggio estintivo in filiale o dall'area riservata",
            "Verificare che il mutuo rientri fra quelli senza penale di estinzione",
            "Rilasciare il conteggio entro dieci giorni lavorativi",
            "Comunicare al cliente la data entro cui il conteggio resta valido",
            "Acquisire il versamento della somma indicata ed estinguere la posizione",
        ],
        "explanation": (
            "Il conteggio si rilascia entro dieci giorni lavorativi e vale fino alla data che "
            "riporta, perché gli interessi continuano a maturare: consegnarlo senza dire fino "
            "a quando è valido produce un versamento incapiente e una posizione che resta "
            "aperta per pochi euro."
        ),
    },
    {
        "text": (
            "Un cliente dispone di una somma e vuole ridurre il debito. Rimetti in ordine i "
            "passi dell'estinzione parziale."
        ),
        "ordered_steps": [
            "Raccogliere la richiesta di estinzione parziale e l'importo che il cliente destina",
            "Verificare l'assenza di penale sulla finalità del mutuo",
            "Calcolare il capitale residuo che resterà dopo il versamento",
            "Porre al cliente la scelta fra ridurre la rata e accorciare la durata",
            "Applicare la scelta e consegnare il nuovo piano di ammortamento",
        ],
        "explanation": (
            "La scelta fra rata e durata va posta, non decisa al posto del cliente: "
            "accorciare la durata fa risparmiare più interessi, ridurre la rata libera "
            "reddito mensile, e sono due obiettivi diversi. L'errore tipico è ridurre la rata "
            "per prassi, togliendo al cliente il risparmio maggiore senza dirglielo."
        ),
    },
    {
        "text": (
            "Rimetti in ordine i passi con cui si tratta una richiesta di sospensione delle "
            "rate tramite il fondo di solidarietà."
        ),
        "ordered_steps": [
            "Raccogliere la richiesta e il motivo per cui viene presentata",
            "Verificare che il presupposto rientri fra quelli previsti dal fondo",
            "Acquisire la documentazione che prova il presupposto dichiarato",
            "Verificare che i mesi già sospesi in passato non esauriscano il tetto dei diciotto",
            "Applicare la sospensione della sola quota capitale e allungare il piano del periodo sospeso",
        ],
        "explanation": (
            "Il tetto dei diciotto mesi è complessivo e non per singola richiesta: chi ne ha "
            "già usati dodici può sospendere per sei, non per altri diciotto. La sospensione "
            "riguarda la sola quota capitale, quindi il cliente continua a pagare gli "
            "interessi e va avvisato prima."
        ),
    },
    {
        "text": (
            "Una rata è scaduta e non pagata. Rimetti in ordine le conseguenze previste dalla "
            "procedura al crescere del ritardo."
        ),
        "ordered_steps": [
            "Sollecitare il cliente in via informale, senza alcuna segnalazione",
            "Applicare gli interessi di mora sulla rata scaduta",
            "Inviare il preavviso e segnalare al sistema di informazioni creditizie",
            "Classificare la posizione fra le inadempienze probabili",
            "Dichiarare la decadenza dal beneficio del termine e chiedere l'intero residuo",
        ],
        "explanation": (
            "La segnalazione al sistema di informazioni creditizie non è mai immediata e "
            "presuppone il preavviso al cliente. La decadenza dal beneficio del termine è "
            "l'ultimo gradino e ha un presupposto suo, cioè sette rate impagate anche non "
            "consecutive, non il semplice trascorrere dei giorni."
        ),
    },
    {
        "text": (
            "Rimetti in ordine i passi con cui si calcola e si verifica la mora su una rata "
            "pagata in ritardo."
        ),
        "ordered_steps": [
            "Individuare la sola rata scaduta come base di calcolo",
            "Applicare il tasso contrattuale maggiorato di due punti",
            "Contare i giorni di ritardo dalla scadenza al pagamento",
            "Verificare che sugli interessi di mora non siano stati calcolati altri interessi",
            "Comunicare al cliente l'importo dovuto, distinto dalla rata",
        ],
        "explanation": (
            "La base di calcolo è la rata scaduta e non il capitale residuo: applicare il "
            "tasso di mora all'intero debito produce importi fuori scala che il cliente "
            "contesterà con ragione. La capitalizzazione è vietata, quindi sugli interessi di "
            "mora non ne maturano altri."
        ),
    },
]

# Il titolo della simulazione, come sta scritto sul server, e le domande da
# aggiungere in fondo al suo serbatoio.
AGGIUNTE = {
    "Bonifici e ordini di pagamento, abbinamento": BONIFICI_ABBINAMENTO,
    "Carte di credito, abbinamento": CARTE_CREDITO_ABBINAMENTO,
    "Carte di debito, abbinamento": CARTE_DEBITO_ABBINAMENTO,
    "Mutui ipotecari, abbinamento": MUTUI_ABBINAMENTO,
    "Mutui ipotecari, ordinamento": MUTUI_ORDINAMENTO,
}
