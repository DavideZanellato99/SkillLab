"""Le chiamate finte scritte per intero: trascrizione, giudizio e docente.

Servono a chi apre una conversazione dal report attività o dal confronto: un
elenco di "battuta finta numero 3" sotto una "sintesi finta" dice che la
pagina funziona, non fa capire cosa mostra. Qui ogni avatar ha delle
chiamate scritte per intero, con l'operatore che apre come nell'applicazione
e il cliente che risponde secondo la sua scheda, e ogni chiamata porta con
sé tre cose che nell'applicazione nascono in tre momenti diversi:

- la **valutazione** che il modello avrebbe dato, con i sei criteri
  canonici, il commento su ciascuno, i suggerimenti dove il punteggio è
  basso e le citazioni alle battute che lo giustificano (numerate da 1 come
  nella trascrizione che il giudice legge);
- la **nota del docente** e, dove il modello ha sbagliato, la correzione del
  voto con la sua motivazione;
- le **note sulle singole battute** dell'operatore, che sono la metà
  puntuale del debriefing.

Le chiamate sono legate al voto: una valutazione alta accompagna una
chiamata condotta bene, una bassa accompagna gli errori che i criteri
penalizzano (presentazione mancante, cliente non identificato, nessun
rilancio finale, tono freddo). Una trascrizione da 9 sotto un voto da 4
racconterebbe una valutazione sbagliata, e la pagina del confronto esiste
proprio per leggere la differenza fra le due.

I punteggi per criterio sono il profilo della chiamata, non il voto finale:
chi li usa li sposta attorno al voto della persona tenendo la forma (vedi
``dati_mock._valutazione``), così due persone diverse che hanno fatto la
stessa chiamata non prendono lo stesso identico numero.

``{operatore}`` è il nome di chi tiene la chiamata, messo al momento.
"""

import random

# Sotto questo voto la chiamata è quella condotta male
SOGLIA_BUONA = 7.0

# Chiavi dei sei criteri, le stesse di ``openai_service.EVALUATION_CRITERIA``
FASI = "rispetto_fasi_chiamata"
EMPATIA = "empatia"
SICUREZZA = "sicurezza_competenza"
LINGUAGGIO = "appropriatezza_linguaggio"
IDENTIFICAZIONE = "identificazione_cliente"
CASISTICA = "comprensione_casistica"


def _criterio(
    punteggio: float,
    commento: str,
    citazioni: list[int],
    suggerimenti: str | None = None,
) -> dict:
    return {
        "score": punteggio,
        "comment": commento,
        "suggestions": suggerimenti,
        "citations": citazioni,
    }


# Per ogni avatar, riconosciuto dal nome: le chiamate buone e quelle deboli.
# Ogni chiamata è un dizionario con:
#   battute        (ruolo, testo), con l'operatore che apre
#   sintesi        il giudizio complessivo del modello
#   criteri        chiave del criterio -> punteggio, commento, suggerimenti, citazioni
#   nota_docente   la nota di sintesi del docente
#   correzione     (scarto sul voto, motivazione) oppure None se il docente conferma
#   note_battute   numero di battuta -> nota del docente su quella battuta
TRASCRIZIONI: dict[str, dict[str, list[dict]]] = {
    "Giovanni Salemmi": {
        "buone": [
            {
                "battute": [
                    (
                        "user",
                        "Banca Mediolanum, buongiorno, sono {operatore}, come posso esserle utile?",
                    ),
                    (
                        "assistant",
                        "Buongiorno, senta, sono Giovanni Salemmi. Ero al supermercato sotto casa e la carta di credito non è andata, l'ho provata tre volte. Ho fatto una figuraccia alla cassa, mi spiega cosa succede?",
                    ),
                    (
                        "user",
                        "Capisco, signor Salemmi, trovarsi la carta rifiutata alla cassa è una situazione spiacevole. Vediamo subito insieme cosa è successo. Per accedere alla sua posizione le chiedo prima qualche dato: mi conferma nome e cognome completi e la sua data di nascita?",
                    ),
                    ("assistant", "Giovanni Salemmi, nato il 9 dicembre 1999."),
                    (
                        "user",
                        "Grazie. Mi dice anche il suo indirizzo di residenza e le ultime quattro cifre della carta?",
                    ),
                    (
                        "assistant",
                        "Abito a Milano, la carta finisce con 4471. Ma guardi che il massimale non l'ho finito, ne sono sicuro.",
                    ),
                    (
                        "user",
                        "Perfetto, ho la sua posizione davanti e le confermo che il plafond non c'entra: ha ancora disponibilità. La carta risulta bloccata perché sono stati inseriti tre PIN errati di seguito, ed è una protezione automatica contro un uso non autorizzato.",
                    ),
                    (
                        "assistant",
                        "Tre PIN sbagliati? Io il PIN lo so a memoria. Boh, ieri l'ha usata mia moglie per la spesa, magari ha sbagliato lei.",
                    ),
                    (
                        "user",
                        "Può essere successo proprio così, capita. La buona notizia è che la carta non è stata clonata e che posso sbloccarla adesso, dalla nostra conversazione. Le chiedo solo di confermarmi che è lei ad avere la carta con sé.",
                    ),
                    ("assistant", "Sì, ce l'ho qui in mano."),
                    (
                        "user",
                        "Bene. Ho inserito la richiesta di sblocco: entro pochi minuti la carta torna operativa. Se vuole, tra un'ora può fare un piccolo acquisto di prova. Le consiglio anche di ricordare a sua moglie il PIN corretto, così evitiamo un nuovo blocco.",
                    ),
                    ("assistant", "Va bene, glielo dico. Quindi non devo fare altro?"),
                    (
                        "user",
                        "Nient'altro, ci ho pensato io. Posso esserle utile in qualcos'altro?",
                    ),
                    ("assistant", "No, no, grazie. Scusi se ero un po' nervoso prima."),
                    (
                        "user",
                        "Ci mancherebbe, è comprensibile. Grazie a lei per la chiamata, signor Salemmi, buona giornata.",
                    ),
                    ("assistant", "Buona giornata."),
                ],
                "sintesi": "Chiamata gestita con ordine e sicurezza. L'operatore si presenta per intero, identifica il cliente con tre dati prima di aprire la posizione, spiega la causa del blocco in termini semplici e risolve il problema nella stessa telefonata, chiudendo con il rilancio e un saluto cordiale. Il cliente arriva arrabbiato e se ne va scusandosi del nervosismo, che è la misura migliore di come è andata.",
                "criteri": {
                    FASI: _criterio(
                        9.0,
                        "Presentazione completa in apertura, sequenza ordinata (identificazione, diagnosi, soluzione), rilancio esplicito e chiusura cordiale.",
                        [1, 13, 15],
                    ),
                    EMPATIA: _criterio(
                        8.5,
                        "Riconosce subito il disagio della figuraccia alla cassa e non lo minimizza; alla fine accoglie le scuse del cliente senza farlo sentire in colpa.",
                        [3, 9, 15],
                    ),
                    SICUREZZA: _criterio(
                        9.0,
                        "Spiega il blocco per PIN errati con precisione e senza esitazioni, e dice con chiarezza cosa succede e quando.",
                        [7, 11],
                    ),
                    LINGUAGGIO: _criterio(
                        9.0,
                        "Registro professionale ma caldo, nessun tecnicismo lasciato senza spiegazione.",
                        [3, 7],
                    ),
                    IDENTIFICAZIONE: _criterio(
                        9.5,
                        "Nome completo, data di nascita, residenza e ultime cifre della carta, tutto prima di leggere la posizione.",
                        [3, 5],
                    ),
                    CASISTICA: _criterio(
                        9.0,
                        "Esclude subito l'ipotesi del cliente sul massimale, individua la causa vera e la risolve, aggiungendo il consiglio preventivo sul PIN.",
                        [7, 11],
                    ),
                },
                "nota_docente": "Chiamata da usare come esempio in aula: la sequenza è quella giusta e il tono regge anche quando il cliente è nervoso. Da notare il consiglio sul PIN alla moglie, che previene una seconda chiamata.",
                "correzione": (
                    0.3,
                    "La valutazione non dà peso al consiglio preventivo sul PIN, che evita un nuovo blocco e una nuova chiamata: è esattamente il comportamento che chiediamo.",
                ),
                "note_battute": {
                    11: "Ottimo il consiglio preventivo sul PIN: risolve il problema di oggi ed evita quello di domani.",
                },
            },
            {
                "battute": [
                    (
                        "user",
                        "Buongiorno, servizio clienti Banca Mediolanum, sono {operatore}. Come posso aiutarla?",
                    ),
                    (
                        "assistant",
                        "Buongiorno. Allora, sono Salemmi Giovanni. La mia carta di credito mi è stata rifiutata alla cassa, davanti a tutti, e non capisco perché. È un disservizio, io i soldi ce li ho.",
                    ),
                    (
                        "user",
                        "Mi dispiace per l'inconveniente, signor Salemmi, immagino sia stato fastidioso. Verifico subito. Per identificarla le chiedo nome e cognome completi, data di nascita e città di residenza.",
                    ),
                    ("assistant", "Giovanni Salemmi, 9 dicembre 1999, Milano."),
                    (
                        "user",
                        "Grazie. Un ultimo dato: il codice cliente oppure le ultime quattro cifre della carta.",
                    ),
                    ("assistant", "4471."),
                    (
                        "user",
                        "Perfetto, la posizione è aperta. Le confermo subito che il massimale non è esaurito. Il motivo è un altro: la carta si è bloccata per tre inserimenti errati del PIN, che è una tutela automatica.",
                    ),
                    (
                        "assistant",
                        "Io non ho sbagliato nessun PIN. Cioè, non credo. L'ho prestata a mia moglie l'altro giorno, magari lei.",
                    ),
                    (
                        "user",
                        "È una spiegazione plausibile, succede spesso in famiglia. In ogni caso non risultano operazioni sospette e posso procedere allo sblocco immediato.",
                    ),
                    ("assistant", "Sì, sblocchi, per favore."),
                    (
                        "user",
                        "Fatto. Da questo momento la carta è di nuovo utilizzabile, il sistema impiega qualche minuto ad aggiornarsi. Vuole che le legga il PIN a lei intestato per sicurezza, o preferisce riceverlo per posta?",
                    ),
                    ("assistant", "No, lo so, lo so. Va bene così."),
                    ("user", "Benissimo. C'è altro in cui posso esserle utile oggi?"),
                    ("assistant", "No, mi ha già risolto. Grazie."),
                    (
                        "user",
                        "Grazie a lei, signor Salemmi. Le auguro una buona giornata.",
                    ),
                ],
                "sintesi": "Chiamata efficace e ben strutturata: identificazione completa, causa del blocco individuata e spiegata, sblocco eseguito con conferma dei tempi, rilancio e chiusura. L'empatia è presente in apertura ma resta formale, e il riferimento all'imbarazzo davanti agli altri, che il cliente mette in primo piano, non viene ripreso.",
                "criteri": {
                    FASI: _criterio(
                        8.5,
                        "Tutte le fasi ci sono e nell'ordine giusto, con un rilancio esplicito e una chiusura cordiale.",
                        [1, 13, 15],
                    ),
                    EMPATIA: _criterio(
                        7.5,
                        "Il dispiacere iniziale è sincero ma generico: il cliente ha detto 'davanti a tutti' e quel dettaglio meritava una parola in più.",
                        [3],
                        "Quando il cliente nomina un'emozione precisa (l'imbarazzo davanti agli altri), riprenderla con le sue parole: 'capisco, davanti alla fila non è piacevole'.",
                    ),
                    SICUREZZA: _criterio(
                        9.0,
                        "Esclude il massimale, nomina la causa e i tempi dello sblocco senza incertezze.",
                        [7, 9, 11],
                    ),
                    LINGUAGGIO: _criterio(
                        8.5,
                        "Cortese e professionale dall'inizio alla fine, frasi brevi e chiare.",
                        [3, 7],
                    ),
                    IDENTIFICAZIONE: _criterio(
                        9.0,
                        "Quattro dati richiesti in due passaggi prima di aprire la posizione.",
                        [3, 5],
                    ),
                    CASISTICA: _criterio(
                        8.5,
                        "Diagnosi corretta e soluzione immediata; l'ipotesi della moglie viene accolta senza colpevolizzare.",
                        [7, 9],
                    ),
                },
                "nota_docente": "Buona chiamata, ordinata e risolutiva. Attenzione però alla battuta sul PIN: proporre di leggerlo al telefono è contro procedura, e il modello non l'ha rilevato.",
                "correzione": (
                    -0.4,
                    "Alla battuta 11 l'operatore si offre di leggere il PIN al telefono. La procedura prevede solo il reinvio per posta: è un errore di competenza che la valutazione automatica non ha colto.",
                ),
                "note_battute": {
                    11: "Il PIN non si legge mai al telefono, in nessun caso: la procedura prevede solo il reinvio per posta.",
                },
            },
        ],
        "deboli": [
            {
                "battute": [
                    ("user", "Pronto, buongiorno."),
                    (
                        "assistant",
                        "Buongiorno, sono Giovanni Salemmi. La mia carta non funziona, ero al supermercato e me l'hanno rifiutata tre volte. Che cavolo succede?",
                    ),
                    ("user", "Eh, può essere che abbia finito il massimale."),
                    (
                        "assistant",
                        "Ma quale massimale, io ho speso pochissimo questo mese. Mi vuole dire che la colpa è mia?",
                    ),
                    (
                        "user",
                        "No, dico che è una delle cause possibili. Mi dà il numero della carta che controllo?",
                    ),
                    (
                        "assistant",
                        "Finisce con 4471. Ma senta, prima mi dice con chi parlo?",
                    ),
                    (
                        "user",
                        "Sono del servizio clienti. Allora, vedo che la carta è bloccata.",
                    ),
                    ("assistant", "E perché?"),
                    (
                        "user",
                        "Ci sono stati dei PIN errati. Deve fare la richiesta di sblocco.",
                    ),
                    ("assistant", "E come la faccio? Non la può fare lei adesso?"),
                    (
                        "user",
                        "Sì, la posso fare io. Ok, fatto, dovrebbe funzionare tra un po'.",
                    ),
                    ("assistant", "Tra un po' quando? E se non funziona?"),
                    ("user", "Riprova più tardi. Arrivederci."),
                ],
                "sintesi": "Chiamata che arriva alla soluzione quasi per caso. L'operatore non si presenta, non identifica il cliente e apre la posizione con il solo numero di carta, avanza un'ipotesi a vuoto sul massimale che fa salire la tensione, e chiude senza rilancio con un 'riprova più tardi' che non dice né quando né cosa fare se non funziona. Il cliente resta con più domande di quante ne aveva.",
                "criteri": {
                    FASI: _criterio(
                        3.0,
                        "Nessuna presentazione, nessun rilancio, chiusura brusca: delle fasi della chiamata resta solo la parte centrale.",
                        [1, 13],
                        "Aprire sempre con nome, cognome e servizio; chiudere con 'posso esserle utile in altro?' e un saluto.",
                    ),
                    EMPATIA: _criterio(
                        3.0,
                        "Il nervosismo del cliente non viene mai riconosciuto, e l'ipotesi del massimale suona come un'accusa.",
                        [3, 5],
                        "Prima di ogni ipotesi, riconoscere il disagio: 'capisco, è spiacevole. Vediamo subito.'",
                    ),
                    SICUREZZA: _criterio(
                        4.0,
                        "Un'ipotesi sbagliata in apertura, poi 'dovrebbe funzionare tra un po'': il cliente non sa cosa aspettarsi.",
                        [3, 11],
                        "Non tirare a indovinare prima di leggere la posizione, e dare tempi certi quando si conferma uno sblocco.",
                    ),
                    LINGUAGGIO: _criterio(
                        4.5,
                        "Tono trascurato ('Eh', 'Ok, fatto') e chiusura senza cortesia.",
                        [3, 13],
                        "Frasi complete e cortesi, soprattutto in chiusura.",
                    ),
                    IDENTIFICAZIONE: _criterio(
                        2.0,
                        "La posizione viene aperta con il solo numero di carta, senza nome, data di nascita o altro dato di riscontro.",
                        [5, 7],
                        "Chiedere almeno tre dati anagrafici prima di leggere qualsiasi informazione sul conto.",
                    ),
                    CASISTICA: _criterio(
                        5.0,
                        "La causa viene individuata e lo sblocco eseguito, ma senza spiegare il perché del blocco né cosa fare per evitarlo.",
                        [9, 11],
                        "Spiegare che il blocco è una tutela e da cosa è nato, così il cliente capisce e non si ripete.",
                    ),
                },
                "nota_docente": "Il problema tecnico è stato risolto, ma la chiamata è da rifare: manca la presentazione, manca l'identificazione, manca la chiusura. Il cliente ha chiesto due volte con chi stava parlando.",
                "correzione": (
                    -0.5,
                    "Il cliente ha chiesto esplicitamente con chi parlava e non ha ricevuto una risposta: il 4 sulla sicurezza e autorevolezza è generoso, e la posizione è stata aperta senza alcuna identificazione.",
                ),
                "note_battute": {
                    1: "Manca la presentazione: nome, cognome e servizio prima di tutto.",
                    7: "Il cliente ha chiesto con chi parla: si risponde con nome e cognome, e si identifica lui prima di aprire la posizione.",
                    13: "Nessun rilancio e chiusura brusca: 'riprova più tardi' non dice né quando né cosa fare se non funziona.",
                },
            },
            {
                "battute": [
                    ("user", "Buongiorno, sono {operatore}."),
                    (
                        "assistant",
                        "Buongiorno. Senta, ho la carta di credito bloccata, alla cassa non è passata, ho provato più volte. Sono arrabbiato, è la seconda volta che mi succede una cosa del genere con voi.",
                    ),
                    ("user", "Va bene, ma non si arrabbi con me. Mi dica il nome."),
                    (
                        "assistant",
                        "Giovanni Salemmi. E non è che mi arrabbio con lei, mi arrabbio con la banca.",
                    ),
                    (
                        "user",
                        "Ok, allora vedo la carta. Risulta bloccata per PIN errato.",
                    ),
                    ("assistant", "Io il PIN non l'ho sbagliato."),
                    ("user", "Il sistema dice di sì. Tre volte."),
                    (
                        "assistant",
                        "Boh, ieri l'aveva mia moglie. Comunque adesso come faccio?",
                    ),
                    ("user", "Le faccio lo sblocco. Ecco. Fatto."),
                    ("assistant", "E funziona subito?"),
                    ("user", "Sì, credo di sì. Altro?"),
                    ("assistant", "No. Arrivederci."),
                    ("user", "Arrivederci."),
                ],
                "sintesi": "La causa viene letta correttamente e lo sblocco eseguito, ma tutto il resto manca. La presentazione è incompleta, il cliente viene identificato con il solo nome, e la frase 'non si arrabbi con me' mette l'operatore in contrapposizione con lui. Il 'credo di sì' finale toglie ogni sicurezza a una soluzione che era giusta.",
                "criteri": {
                    FASI: _criterio(
                        4.0,
                        "Presentazione a metà (manca il servizio), rilancio ridotto a un 'Altro?', chiusura senza saluto cordiale.",
                        [1, 11, 13],
                        "Presentarsi per intero e chiudere con un rilancio formulato e un saluto.",
                    ),
                    EMPATIA: _criterio(
                        2.5,
                        "'Non si arrabbi con me' respinge l'emozione invece di accoglierla, e il cliente deve difendersi.",
                        [3],
                        "Accogliere il disappunto senza prenderlo sul personale: 'capisco la rabbia, vediamo subito di risolvere'.",
                    ),
                    SICUREZZA: _criterio(
                        4.5,
                        "Il blocco viene letto con sicurezza, ma 'credo di sì' sulla riattivazione annulla tutto.",
                        [7, 11],
                        "Confermare con certezza quando la carta sarà attiva, o dire che si verifica.",
                    ),
                    LINGUAGGIO: _criterio(
                        4.0,
                        "Registro sbrigativo ('Ok', 'Ecco. Fatto.', 'Altro?').",
                        [3, 9, 11],
                        "Frasi complete e cortesi, anche quando la soluzione è rapida.",
                    ),
                    IDENTIFICAZIONE: _criterio(
                        2.5,
                        "Il solo nome, senza altro dato di riscontro, prima di aprire la posizione.",
                        [3, 5],
                        "Almeno tre dati anagrafici prima di leggere la carta.",
                    ),
                    CASISTICA: _criterio(
                        5.5,
                        "Causa corretta e sblocco eseguito, ma il cliente non riceve nessuna spiegazione del perché e nessun consiglio.",
                        [5, 9],
                        "Spiegare che il blocco è una tutela dopo tre PIN errati e suggerire come evitarlo.",
                    ),
                },
                "nota_docente": "La chiamata risolve il problema ma non lo spiega e non rassicura. Lavorare sulle prime due battute: come si accoglie un cliente arrabbiato decide il resto della telefonata.",
                "correzione": (
                    0.6,
                    "Lo sblocco è stato eseguito e la causa letta correttamente al primo colpo: la comprensione della casistica c'è, e un 5,5 su quel criterio è basso rispetto a quello che è stato fatto.",
                ),
                "note_battute": {
                    3: "'Non si arrabbi con me' mette l'operatore contro il cliente. Meglio: 'capisco il disappunto, vediamo subito'.",
                    11: "'Credo di sì' toglie ogni sicurezza: si conferma quando la carta sarà attiva, o si verifica prima di rispondere.",
                },
            },
        ],
    },
    "Elena Rodriguez": {
        "buone": [
            {
                "battute": [
                    (
                        "user",
                        "Banca Mediolanum, buongiorno, sono {operatore}, come posso esserle utile?",
                    ),
                    (
                        "assistant",
                        "Buongiorno, sono Elena Rodriguez, mi hanno rubato la borsa, adesso, poco fa. Dentro c'era il portafoglio con un foglietto con i codici della banca, tutti e due. Forse stanno già entrando nel conto, la prego, mi aiuti.",
                    ),
                    (
                        "user",
                        "Signora Rodriguez, mi ascolti: è nel posto giusto e adesso mettiamo tutto in sicurezza insieme, un passo alla volta. Per prima cosa devo accedere alla sua posizione. Mi conferma nome e cognome completi e la data di nascita?",
                    ),
                    (
                        "assistant",
                        "Elena Rodriguez, 14 marzo 1985. Ma faccia in fretta, per favore, c'erano anche i documenti, la carta d'identità, tutto.",
                    ),
                    (
                        "user",
                        "Ci sto già lavorando. Mi dice l'indirizzo di residenza? Mi serve per completare l'identificazione.",
                    ),
                    (
                        "assistant",
                        "Via Garibaldi 22, Livorno. Nel portafoglio c'erano anche i contanti, non so quanti, e le tessere, e l'agenda con... non mi ricordo cos'altro.",
                    ),
                    (
                        "user",
                        "Va bene, adesso non serve ricordare tutto. Le cose davvero urgenti sono due: i codici di accesso e i movimenti sul conto. Del resto ci occupiamo dopo. Ho la sua posizione davanti: le confermo che dall'ultimo accesso, che è di ieri sera alle 21, non risultano altri accessi né operazioni.",
                    ),
                    ("assistant", "Davvero? Quindi non è entrato nessuno?"),
                    (
                        "user",
                        "Nessuno. E per fare in modo che resti così, ora blocco entrambi i codici: quello di accesso e quello dispositivo. Da questo momento chi ha il foglietto non può usarlo. Sta succedendo adesso, mentre le parlo.",
                    ),
                    (
                        "assistant",
                        "Grazie, grazie. E le carte? Le carte le ho a casa, non erano nella borsa.",
                    ),
                    (
                        "user",
                        "Allora le carte restano attive, non c'è motivo di bloccarle. Il telefono ce l'ha con sé?",
                    ),
                    ("assistant", "Sì, era nella tasca del cappotto."),
                    (
                        "user",
                        "Bene, così può ricevere i nuovi codici: tra pochi minuti le arriva un SMS con la procedura per rigenerarli dall'app, ci vogliono due minuti. Le consiglio anche di fare denuncia in questura per i documenti, e con quella potrà chiedere il duplicato della carta d'identità.",
                    ),
                    (
                        "assistant",
                        "Ok, la faccio oggi. Scusi se prima parlavo sopra di lei, ero nel panico.",
                    ),
                    (
                        "user",
                        "È comprensibile, si è comportata bene a chiamare subito. Ricapitolo: nessun accesso, codici bloccati, nuovi codici in arrivo via SMS, denuncia per i documenti. Posso esserle utile in qualcos'altro?",
                    ),
                    ("assistant", "No, ora sto molto meglio. Grazie davvero."),
                    (
                        "user",
                        "Grazie a lei, signora Rodriguez. Buona giornata e stia tranquilla.",
                    ),
                ],
                "sintesi": "Chiamata esemplare nella gestione di una cliente in panico. L'operatore prende in mano la conversazione senza sovrastarla, identifica la cliente mentre la rassicura, separa esplicitamente l'urgente dal rinviabile, verifica gli accessi, blocca i codici spiegando cosa sta facendo e perché, e chiude con un riepilogo che restituisce alla cliente il controllo della situazione.",
                "criteri": {
                    FASI: _criterio(
                        9.5,
                        "Presentazione completa, identificazione, verifica, blocco, istruzioni, riepilogo, rilancio e saluto: la sequenza intera, nell'ordine giusto.",
                        [1, 15, 17],
                    ),
                    EMPATIA: _criterio(
                        9.5,
                        "Riconosce il panico senza assecondarlo, dà una struttura ('un passo alla volta'), accoglie le scuse e le trasforma in un merito.",
                        [3, 7, 15],
                    ),
                    SICUREZZA: _criterio(
                        9.0,
                        "Ogni azione è annunciata, eseguita e confermata, con orari precisi e un riepilogo finale.",
                        [9, 13, 15],
                    ),
                    LINGUAGGIO: _criterio(
                        9.0,
                        "Frasi brevi, tono fermo e caldo, nessun tecnicismo che una persona agitata non possa seguire.",
                        [3, 9],
                    ),
                    IDENTIFICAZIONE: _criterio(
                        9.0,
                        "Nome, data di nascita e residenza prima di aprire la posizione, senza interrompere la rassicurazione.",
                        [3, 5],
                    ),
                    CASISTICA: _criterio(
                        9.5,
                        "Distingue codici, carte e telefono, verifica gli accessi, blocca solo quello che va bloccato e indica denuncia e rigenerazione.",
                        [7, 9, 13],
                    ),
                },
                "nota_docente": "Da portare in aula. La battuta in cui separa l'urgente dal rinviabile è quella che cambia la chiamata: la cliente smette di elencare e comincia ad ascoltare.",
                "correzione": None,
                "note_battute": {
                    7: "Questa è la battuta che fa la differenza: separa l'urgente dal rinviabile e dà subito la notizia buona.",
                },
            },
            {
                "battute": [
                    (
                        "user",
                        "Buongiorno, servizio clienti Banca Mediolanum, sono {operatore}. Come posso aiutarla?",
                    ),
                    (
                        "assistant",
                        "Buongiorno, ho bisogno di aiuto subito. Mi hanno rubato la borsa e dentro c'era un foglio con i codici del conto. Ho paura che facciano dei bonifici, che vedano tutto.",
                    ),
                    (
                        "user",
                        "La capisco, e facciamo subito le cose nell'ordine giusto. Prima la identifico, poi controllo il conto e blocco i codici. Mi dice nome, cognome e data di nascita?",
                    ),
                    ("assistant", "Elena Rodriguez, 14 marzo 1985."),
                    ("user", "E l'indirizzo di residenza, per completare?"),
                    (
                        "assistant",
                        "Via Garibaldi 22, Livorno. C'erano anche i documenti nel portafoglio, con quelli e i codici possono fare di tutto, vero?",
                    ),
                    (
                        "user",
                        "Con i codici bloccati non possono fare niente, ed è quello che sto facendo adesso. Intanto le confermo che sul conto non ci sono accessi né operazioni dopo il furto: l'ultimo accesso è il suo di stamattina alle 8.",
                    ),
                    (
                        "assistant",
                        "Sì, ero io, ho controllato lo stipendio. Quindi è tutto fermo?",
                    ),
                    (
                        "user",
                        "Tutto fermo. Il codice di accesso e il codice dispositivo sono ora bloccati, chiunque abbia quel foglietto non può usarlo. Le carte erano nella borsa?",
                    ),
                    (
                        "assistant",
                        "No, per fortuna le avevo lasciate a casa. Il telefono ce l'ho.",
                    ),
                    (
                        "user",
                        "Allora le carte restano attive. Sul telefono le arriverà tra poco un SMS per rigenerare i codici dall'app: le consiglio di farlo appena riattacchiamo e di non scriverli più su carta. Per i documenti serve la denuncia, che le servirà anche per il duplicato.",
                    ),
                    ("assistant", "Va bene, vado in questura oggi pomeriggio."),
                    (
                        "user",
                        "Perfetto. Ha domande su qualcosa di quello che abbiamo fatto, o posso esserle utile in altro?",
                    ),
                    (
                        "assistant",
                        "No, mi ha spiegato tutto. Grazie, ero terrorizzata.",
                    ),
                    (
                        "user",
                        "Ha fatto la cosa giusta chiamando subito. Grazie a lei, signora Rodriguez, buona giornata.",
                    ),
                ],
                "sintesi": "Chiamata solida e completa: l'operatore annuncia il piano in tre passi, lo esegue nell'ordine, verifica gli accessi, blocca i codici e dà istruzioni chiare su rigenerazione e denuncia. La rassicurazione è presente ma più procedurale che personale, e il consiglio di non scrivere più i codici su carta, pur giusto, arriva in un momento in cui la cliente è ancora scossa.",
                "criteri": {
                    FASI: _criterio(
                        8.5,
                        "Presentazione completa, piano dichiarato e rispettato, rilancio e chiusura cordiale.",
                        [1, 3, 13, 15],
                    ),
                    EMPATIA: _criterio(
                        8.0,
                        "'La capisco' in apertura e un riconoscimento sincero in chiusura; nel mezzo prevale la procedura.",
                        [3, 15],
                    ),
                    SICUREZZA: _criterio(
                        9.0,
                        "Ogni passo viene annunciato e poi confermato con un orario preciso.",
                        [7, 9],
                    ),
                    LINGUAGGIO: _criterio(
                        8.5,
                        "Chiaro e professionale; il consiglio sul foglietto è corretto ma detto un po' presto.",
                        [3, 11],
                    ),
                    IDENTIFICAZIONE: _criterio(
                        9.0,
                        "Tre dati anagrafici prima di leggere la posizione.",
                        [3, 5],
                    ),
                    CASISTICA: _criterio(
                        9.0,
                        "Codici, carte e telefono distinti correttamente, verifica degli accessi, denuncia e duplicato indicati.",
                        [7, 9, 11],
                    ),
                },
                "nota_docente": "Buona chiamata, il piano in tre passi annunciato subito è una tecnica da riprendere. Una sola osservazione sui tempi: alla cliente serve sentire 'fatto' prima di 'sto facendo'.",
                "correzione": (
                    -0.3,
                    "Il blocco dei codici viene annunciato come in corso alla battuta 7 e confermato solo alla 9: con una cliente in panico l'ordine giusto è bloccare, confermare, poi spiegare. La valutazione non lo rileva.",
                ),
                "note_battute": {
                    7: "Prima blocca, poi racconta: alla cliente serve sentire 'fatto' prima di 'sto facendo'.",
                    11: "Il consiglio di non scrivere più i codici è giusto, ma va dato in chiusura, quando la cliente è tranquilla.",
                },
            },
        ],
        "deboli": [
            {
                "battute": [
                    ("user", "Buongiorno."),
                    (
                        "assistant",
                        "Buongiorno, sono Elena Rodriguez, mi hanno rubato la borsa con dentro i codici della banca, la prego, forse stanno già entrando nel conto!",
                    ),
                    ("user", "Va bene, si calmi. Cosa c'era nella borsa esattamente?"),
                    (
                        "assistant",
                        "Il portafoglio, i documenti, un foglietto con i due codici, l'agenda, le chiavi dell'ufficio, i trucchi, non lo so, tutto.",
                    ),
                    ("user", "Ok. E le carte?"),
                    (
                        "assistant",
                        "Le carte no, le ho a casa. Ma i codici sì! Cosa devo fare?",
                    ),
                    ("user", "Devo bloccare i codici. Mi dà il nome?"),
                    (
                        "assistant",
                        "Elena Rodriguez. Ma controlla se è entrato qualcuno?",
                    ),
                    ("user", "Sì, adesso guardo. Non vedo niente."),
                    ("assistant", "Niente cosa? Non è entrato nessuno?"),
                    (
                        "user",
                        "No. Ho bloccato i codici. Poi ne chiede di nuovi in filiale.",
                    ),
                    ("assistant", "In filiale? E la denuncia la devo fare?"),
                    ("user", "Se vuole. Arrivederci."),
                ],
                "sintesi": "Chiamata che lascia la cliente più confusa di prima. Nessuna presentazione, un 'si calmi' che non calma, la posizione aperta con il solo nome, un 'non vedo niente' che la cliente deve farsi spiegare, un'indicazione errata sui nuovi codici e una denuncia lasciata al 'se vuole'. I codici vengono bloccati, ed è l'unica cosa che va a posto.",
                "criteri": {
                    FASI: _criterio(
                        3.0,
                        "Nessuna presentazione, nessun riepilogo, nessun rilancio, chiusura in due parole.",
                        [1, 13],
                        "Presentarsi, e chiudere con un riepilogo di cosa è stato fatto e un rilancio: con una cliente agitata il riepilogo è la parte più importante.",
                    ),
                    EMPATIA: _criterio(
                        3.5,
                        "'Si calmi' respinge l'emozione, e la cliente resta sola a gestire il panico mentre elenca il contenuto della borsa.",
                        [3, 9],
                        "Nominare l'emozione e dare una struttura: 'capisco la paura, adesso facciamo tre cose insieme'.",
                    ),
                    SICUREZZA: _criterio(
                        4.0,
                        "'Non vedo niente' è ambiguo al punto che la cliente deve chiedere cosa significhi.",
                        [9, 11],
                        "Dire cosa si è verificato e con quale esito: 'ho controllato gli accessi, nessuno è entrato'.",
                    ),
                    LINGUAGGIO: _criterio(
                        5.0,
                        "Frasi mozze e un registro sbrigativo, con una chiusura senza saluto.",
                        [3, 5, 13],
                        "Frasi complete, soprattutto quando si comunica un esito.",
                    ),
                    IDENTIFICAZIONE: _criterio(
                        1.5,
                        "La posizione viene aperta e gli accessi letti con il solo nome, dopo aver già discusso il contenuto della borsa.",
                        [7, 9],
                        "Identificare con almeno tre dati prima di qualsiasi lettura, e farlo subito, non a metà chiamata.",
                    ),
                    CASISTICA: _criterio(
                        5.0,
                        "I codici vengono bloccati, ma i nuovi codici si rigenerano dall'app e non in filiale, e la denuncia per i documenti non è facoltativa.",
                        [11, 13],
                        "Rivedere la procedura di rigenerazione dei codici e le indicazioni sulla denuncia in caso di furto di documenti.",
                    ),
                },
                "nota_docente": "L'unica cosa fatta è il blocco dei codici, e la cliente non ha capito nemmeno quello. Da rivedere la procedura sui nuovi codici, che ha dato in modo errato, e tutto l'approccio con una persona in panico.",
                "correzione": None,
                "note_battute": {
                    3: "'Si calmi' non calma nessuno. Si nomina l'emozione e si dice cosa si sta per fare.",
                    7: "La posizione va aperta solo dopo l'identificazione completa, e il nome da solo non basta.",
                    11: "I nuovi codici si rigenerano dall'app, non in filiale: informazione errata data a una cliente in difficoltà.",
                    13: "La denuncia per i documenti rubati non è facoltativa: va consigliata con chiarezza.",
                },
            },
            {
                "battute": [
                    ("user", "Buongiorno, sono {operatore}, mi dica."),
                    (
                        "assistant",
                        "Buongiorno, mi hanno rubato la borsa, con dentro il foglietto dei codici del conto e i documenti. Sono nel panico, ho paura che dispongano bonifici.",
                    ),
                    (
                        "user",
                        "Signora, se scrive i codici su un foglietto poi succede questo. Comunque, il nome?",
                    ),
                    (
                        "assistant",
                        "Elena Rodriguez. Lo so che ho sbagliato, ma adesso mi aiuti.",
                    ),
                    ("user", "Sto guardando. Non ci sono operazioni strane."),
                    ("assistant", "E gli accessi? Qualcuno è entrato?"),
                    ("user", "No. Blocco i codici. Fatto."),
                    ("assistant", "E adesso come faccio ad entrare? E le carte?"),
                    ("user", "Le carte erano nella borsa?"),
                    ("assistant", "No, le avevo a casa."),
                    (
                        "user",
                        "Allora quelle vanno bene. Per i codici nuovi guardi nell'app, c'è la procedura.",
                    ),
                    ("assistant", "Ok. Devo fare la denuncia?"),
                    ("user", "Per i documenti sì. Arrivederci."),
                ],
                "sintesi": "Le cose giuste vengono fatte (verifica, blocco, carte lasciate attive, denuncia) ma il modo le annulla: la cliente viene rimproverata per il foglietto prima ancora di essere identificata, la posizione si apre con il solo nome, e ogni risposta arriva solo perché la cliente la chiede. Chiusura senza riepilogo né saluto.",
                "criteri": {
                    FASI: _criterio(
                        4.0,
                        "Presentazione a metà, nessun riepilogo, nessun rilancio, chiusura brusca.",
                        [1, 13],
                        "Completare la presentazione e chiudere con riepilogo e rilancio.",
                    ),
                    EMPATIA: _criterio(
                        2.0,
                        "Rimprovera una cliente appena derubata, che infatti si sente in dovere di scusarsi.",
                        [3],
                        "Mai colpevolizzare il cliente per l'accaduto. Il consiglio sul foglietto si dà in chiusura, con tatto, se si dà.",
                    ),
                    SICUREZZA: _criterio(
                        5.0,
                        "Le verifiche vengono fatte e comunicate, ma solo su richiesta della cliente e in poche parole.",
                        [5, 7],
                        "Anticipare le domande: dire cosa si sta verificando prima che la cliente lo chieda.",
                    ),
                    LINGUAGGIO: _criterio(
                        3.5,
                        "'Comunque, il nome?' e 'Sto guardando' sono un registro inadatto a una persona in panico.",
                        [3, 5],
                        "Frasi complete e cortesi; il tono in questa casistica è parte della soluzione.",
                    ),
                    IDENTIFICAZIONE: _criterio(
                        2.0,
                        "Il solo nome, chiesto di sfuggita dopo il rimprovero, prima di leggere accessi e operazioni.",
                        [3, 5],
                        "Almeno tre dati prima di qualsiasi lettura sulla posizione.",
                    ),
                    CASISTICA: _criterio(
                        6.0,
                        "Verifica accessi e operazioni, blocca i codici, lascia attive le carte, indica correttamente app e denuncia: la sostanza c'è.",
                        [7, 11, 13],
                    ),
                },
                "nota_docente": "Sa cosa fare e lo fa, ma il rimprovero in apertura è inaccettabile con una persona appena derubata. La parte procedurale è corretta: è il rapporto con la cliente che va rifatto da capo.",
                "correzione": (
                    -0.5,
                    "Colpevolizzare una cliente derubata alla seconda battuta è un errore che pesa più della media numerica dei criteri: il voto va abbassato.",
                ),
                "note_battute": {
                    3: "Mai rimproverare il cliente per l'accaduto. La lezione sul foglietto si dà a fine chiamata, con tatto, se si dà.",
                    5: "'Sto guardando' non dice cosa: 'controllo gli accessi e i movimenti da stamattina' fa tutta la differenza.",
                },
            },
        ],
    },
}


def trascrizione(
    rng: random.Random, avatar: str, voto: float, operatore: str
) -> dict | None:
    """La chiamata da mettere sotto questo voto, o None se l'avatar non ne ha.

    None lascia al chiamante le battute segnaposto: gli avatar dei tenant
    finti hanno una scheda generica e non hanno una chiamata scritta.
    """
    chiamate = TRASCRIZIONI.get(avatar)
    if chiamate is None:
        return None
    scelta = rng.choice(chiamate["buone" if voto >= SOGLIA_BUONA else "deboli"])
    return {
        **scelta,
        "battute": [
            (ruolo, testo.format(operatore=operatore))
            for ruolo, testo in scelta["battute"]
        ],
    }
