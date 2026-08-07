# Valutazione e revisione

Finita una conversazione, l'operatore chiede il giudizio. Lo dà un modello di
ragionamento su sei criteri pesati, e sopra quel giudizio un docente può
mettere il proprio. Questo documento spiega come nasce il voto e, soprattutto,
**qual è il voto che conta**.

## Il giudizio dell'AI

`POST /api/chat/conversation/{id}/evaluate`, solo per il proprietario della
conversazione. Rifare il giudizio sostituisce quello precedente.

### Cosa legge il valutatore

Due cose, e la distinzione fra le due è il cuore del prompt
([openai_service.py](../backend/openai_service.py)):

**La trascrizione**, con ogni messaggio numerato fra parentesi quadre e
marcato `OPERATORE` o `CLIENTE`. I numeri servono perché il giudizio possa
citare i momenti su cui si fonda.

**Il contesto della simulazione**, preso dalla scheda persona: quale fosse il
caso vero, la causa reale del problema, l'obiettivo nascosto, l'emozione
iniziale, il grado di difficoltà. È la chiave di correzione, cioè l'unico modo
per distinguere una diagnosi vera da un'ipotesi plausibile. Il prompt dice
esplicitamente che **non è parte della conversazione**: nulla va attribuito
all'operatore che non abbia detto, e nulla gli va tolto per informazioni che il
cliente non gli ha mai dato.

Se la conversazione è una chat, al valutatore viene detto di leggere ogni
riferimento alla "chiamata" come riferito al contatto scritto e di non
penalizzare quello che il canale scritto non prevede, come il tono di voce. I
criteri restano gli stessi.

### I sei criteri

| Criterio | Peso |
| --- | --- |
| Corretta identificazione del cliente | 22% |
| Comprensione della casistica e risposte pertinenti | 22% |
| Rispetto delle fasi della chiamata | 18% |
| Empatia e gestione dello stato d'animo | 15% |
| Sicurezza, competenza e autorevolezza | 13% |
| Appropriatezza di linguaggio, cortesia e professionalità | 10% |

Ognuno porta con sé, dentro il prompt, cosa osservare e cosa penalizzare, in
una guida scritta caso per caso. Etichette e pesi **non sono ripetuti** nella
guida: vengono cuciti sopra quelli canonici, così prompt e calcolo del voto non
possono divergere.

La scala è da 1 a 10, con una guida esplicita su cosa vuol dire ogni fascia.
Lo zero non esiste: il fondo è una prestazione gravemente insufficiente, non
l'assenza di prestazione.

### Cosa torna, e cosa viene ricalcolato

Per ogni criterio: punteggio, commento, fino a tre **citazioni** dei messaggi
su cui il giudizio si fonda, e i suggerimenti di miglioramento, che compaiono
solo sotto 8. Sopra quella soglia i suggerimenti vengono scartati anche se il
modello li ha scritti: un consiglio su una cosa andata bene diluisce quelli che
contano.

**Il punteggio complessivo non è quello che dice il modello.** Viene
ricalcolato qui come media pesata dei sei criteri: è l'unico modo per garantire
che i pesi siano rispettati davvero, e tiene comparabili due valutazioni anche
quando il giudice è di buon umore.

Le citazioni vengono ripulite: i numeri fuori intervallo o ripetuti si buttano,
e i buoni vengono ancorati all'id del messaggio salvato, così l'interfaccia può
riportare a quel punto esatto della trascrizione, e nelle chiamate perfino a
quel punto della registrazione.

### La chiamata al modello

Passa da `eval_json_completion`, lo stesso meccanismo che genera le domande del
simulatore e che ne corregge le risposte aperte (vedi
[simulatore.md](simulatore.md)):

| Aspetto | Valore |
| --- | --- |
| Modello | `OPENAI_EVAL_MODEL`, con i modelli di riserva a seguire |
| Ragionamento | `high` sui GPT-5, altrimenti temperatura bassa |
| Formato | JSON forzato |
| Timeout | 120 secondi, con un ritentativo |
| Budget | 6144 token: sei criteri con commento e suggerimenti, più quello che il ragionamento spende prima di scriverne uno. Un budget stretto qui torna indietro come JSON troncato, non come valutazione più corta |
| Passaggio al modello di riserva | Su sovraccarico o su JSON illeggibile |

Anche qui la connessione al database viene **restituita al pool prima
dell'attesa**: sono decine di secondi in cui il database non serve, e il caso
che conta è l'aula, cioè quaranta persone che chiudono la chiamata insieme e
chiedono il giudizio nello stesso minuto.

## La revisione del docente

Un giudizio dell'AI è una **proposta**. Un docente che non è d'accordo lo
corregge, e da quel momento il numero corretto **è** il voto.

Lo scrivono entrambi i ruoli di amministrazione, perché l'organization admin è
chi insegna davvero ai propri studenti, dentro il solito confine del tenant
([routers/conversation_reviews.py](../backend/routers/conversation_reviews.py)).

Una revisione contiene:

| Campo | Significato |
| --- | --- |
| `summary_note` | La nota di sintesi del docente |
| `override_score` e `override_reason` | Il voto corretto e il perché. Vanno insieme o non vanno: un voto corretto porta sempre la sua motivazione |
| `ai_score_at_review` | Il voto dell'AI al momento della revisione |
| Annotazioni | Note appuntate su singoli messaggi della trascrizione |

Due comportamenti che meritano una riga.

**Le annotazioni possono esistere senza revisione.** Un docente può passare la
trascrizione appuntando note senza scrivere una sintesi né toccare il voto.
Quel caso viene servito sotto un'intestazione sintetica, ricavata dalle note
stesse, invece di essere lasciato cadere: altrimenti quelle note esisterebbero
nel database e da nessun'altra parte.

**Una revisione può diventare vecchia.** Se il giudizio dell'AI viene rifatto
dopo la revisione, il confronto fra il voto attuale e `ai_score_at_review` fa
comparire un segnale di `is_stale`: il docente aveva corretto un altro numero,
e ha diritto di saperlo. Il confronto usa una tolleranza minima, perché due
float che dovrebbero essere lo stesso numero non lo sono mai esattamente.

**Lo studente legge la revisione**, esattamente come la legge chi l'ha scritta.
Una correzione che lo studente non può leggere non protegge nessuno.

## Il voto che conta

Una funzione sola, `final_score` in
[backend/reviews.py](../backend/reviews.py):

```python
def final_score(ai_score, review):
    if review is not None and review.override_score is not None:
        return review.override_score
    return ai_score
```

**Tutto** quello che legge un punteggio passa di qui: il referto dello
studente, il progresso di un obiettivo assegnato, i grafici del cruscotto, il
PDF, il foglio di calcolo, il confronto fra tentativi. Qualunque cosa saltasse
questa funzione mostrerebbe un voto allo studente e ne conterebbe un altro
verso il suo obiettivo.

Due proprietà:

- **la correzione non viene mai copiata sulla riga della valutazione**: si
  risolve in lettura. Così rifare il giudizio dell'AI non può lasciare in giro
  un voto vecchio, e cancellare una revisione fa tornare da solo il verdetto
  della macchina;
- **niente in, niente out**. Una conversazione senza valutazione e senza
  correzione non ha voto, e inventarle uno zero sarebbe una bugia che il
  cruscotto poi metterebbe in media.

Il punteggio per criterio invece resta quello dell'AI: un docente corregge il
verdetto nel suo insieme, non i sei numeri che ci stanno sotto.

## Il confronto con il tentativo precedente

Ogni valutazione porta con sé il tentativo precedente sullo stesso scenario:
la conversazione con lo stesso avatar **aperta prima** di questa, che abbia una
valutazione.

Due dettagli che sembrano piccoli:

- l'ordine è per **quando la conversazione è stata aperta**, non per quando è
  stata giudicata. Valutare oggi una trascrizione di un mese fa non deve
  renderla il "tentativo precedente" di tutto quello che è successo in mezzo;
- il voto di confronto è quello **finale**, correzione del docente compresa.
  Mettere un voto corretto contro il numero grezzo dell'AI del tentativo prima
  mostrerebbe un progresso mai avvenuto.

## Come si legge, dove

| Dove | Cosa |
| --- | --- |
| [EvaluationReport](../frontend/src/components/EvaluationReport.tsx) | Il referto: voto, sintesi, i sei criteri con commenti, suggerimenti e citazioni cliccabili |
| [TrainerReviewPanel](../frontend/src/components/TrainerReviewPanel.tsx) | Il pannello con cui il docente scrive la revisione |
| [MessageAnnotationEditor](../frontend/src/components/MessageAnnotationEditor.tsx) | Le note appuntate su un messaggio della trascrizione |
| [ConversationDetailModal](../frontend/src/components/ConversationDetailModal.tsx) | Trascrizione e valutazione affiancate: la schermata da cui un docente corregge e da cui chi ha parlato rilegge |
| [MessageAnnotationNote](../frontend/src/components/MessageAnnotationNote.tsx) | Una nota del docente in sola lettura, sotto la riga di cui parla |
| [PdfDownloadButton](../frontend/src/components/PdfDownloadButton.tsx) | Il pulsante che scarica un referto in PDF, qui e nel simulatore: chi lo ospita gli passa la funzione che carica il file |
| [ModalDeleteButton](../frontend/src/components/ModalDeleteButton.tsx) | Il cestino accanto al PDF, con cui un admin butta via la prova che sta leggendo. Ha la forma del pulsante qui sopra, perché sono le due cose che si fanno a una prova chiusa, e il rosso solo al passaggio del mouse |
| PDF | Generato da [exports.py](../backend/exports.py), vestito da [pdf_kit.py](../backend/pdf_kit.py). Porta lo stesso contenuto dello schermo e, su pagine sue in fondo, la trascrizione della conversazione |

Il documento è uno solo, gli endpoint che lo servono sono due, perché sono due
le persone che possono chiederlo. `GET /api/chat/conversation/{id}/evaluation/pdf`
risponde solo al proprietario, come ogni altra lettura della conversazione;
`GET /api/admin/conversations/{id}/evaluation/pdf` risponde all'admin che apre
il dettaglio in dashboard, con le regole di scope della sua organizzazione. Il
corpo lo costruiscono con la stessa funzione, e l'operatore stampato sul foglio
è sempre chi ha tenuto la conversazione, mai chi ha premuto il pulsante.

### Come è fatto il foglio

Il referto è il design dell'applicazione portato su carta, e sta tutto in
[pdf_kit.py](../backend/pdf_kit.py): la banda in gradiente violetto-ciano in
testa alla prima pagina, i riquadri arrotondati con il filetto colorato a
sinistra, le targhette dei punteggi, le barre, il violetto per tutto quello che
scrive una persona invece della macchina. `exports.py` decide cosa dice il
documento, `pdf_kit` come si presenta, e la stessa divisione vale per l'esito di
un test nel simulatore.

Due scelte che spiegano il resto:

- **I caratteri sono quelli dell'app** (Outfit per i titoli, Inter per il testo)
  e stanno in [backend/fonts/](../backend/fonts/), sottoinsieme latino di quelli
  che il browser prende da Google Fonts, con la loro licenza OFL accanto. Il PDF
  nasce sul server, dove non c'è nessun Google Fonts da interrogare, e i
  caratteri incorporati sono anche il motivo per cui virgolette caporali, accenti
  e trattini lunghi di un testo scritto da un LLM arrivano sulla pagina come
  sono, invece di finire schiacciati sul latin-1 dei font di sistema. Quello che
  resta fuori dal sottoinsieme, un'emoji per esempio, viene tolto invece che
  disegnato come un quadratino vuoto.
- **Un blocco non si spezza a metà fra due pagine.** Ogni riquadro si misura
  prima di essere disegnato (il fondo va sotto al testo, e in un PDF sotto vuol
  dire prima), e se non ci sta nello spazio rimasto comincia dalla pagina dopo.
  Questo lascia ogni tanto del bianco in fondo a una pagina: è il prezzo di un
  criterio, o di una domanda, che si legge sempre intero.

La trascrizione ricalca la chat: chi ha parlato a destra in violetto, l'avatar a
sinistra sul grigio chiaro, con nome e ora sopra ogni bolla.

### La stessa schermata per due lettori

`ConversationDetailModal` ha una prop `scope`, e sono le sole quattro cose che
cambiano fra un docente che corregge e chi rilegge una conversazione sua:

| | `admin` | `own` |
| --- | --- | --- |
| Da dove arrivano i dati | `GET /api/admin/conversations/{id}`, che porta trascrizione, valutazione e revisione insieme | Le due letture che uno studente può fare, composte da [useOwnConversationDetail](../frontend/src/hooks/useOwnConversationDetail.ts) |
| Chi compare in testa | Il nome di chi ha parlato | Solo l'avatar: a se stessi non ci si presenta |
| La revisione | Si scrive, col pannello e le note sui messaggi | Si legge e basta |
| Il cestino | In testa accanto al PDF, se chi ha aperto la schermata passa `onDeleted` | Mai: cancellarsi lo storico non è un gesto che l'app concede |

Il resto è identico apposta, per la stessa ragione dei test consegnati: chi
corregge deve leggere esattamente quello che legge chi è stato corretto. Le due
letture stanno dietro due hook e uno dei due resta sempre spento, perché un hook
non si può chiamare a seconda dei casi.

**Il permesso di eliminare arriva da chi apre la schermata**, cioè dalla
presenza di `onDeleted`, e non da un controllo di ruolo fatto qui: la
dashboard e il report attività sono schermate di amministrazione, quindi chi
ci arriva è un super admin o l'organization admin di quella gente, e il server
rifiuta comunque una conversazione fuori dalla propria organizzazione. Quella
funzione serve anche a chiudere la schermata su una conversazione che non
esiste più: gli elenchi sotto si rileggono da soli per invalidazione, questa
no. Cosa sparisce e con quali regole sta in
[training-e-report.md](training-e-report.md), che è la pagina da cui la stessa
conferma si apre anche dalla riga.

A fine chiamata la modale resta invece
[EvaluationModal](../frontend/src/components/EvaluationModal.tsx), che è un
altro momento: lì la valutazione sta ancora nascendo, si dà il nome alla
conversazione e si può ripartire con lo stesso scenario, e la trascrizione è
tutta sullo schermo dietro. Il pulsante in testa alla chat, quello che rilegge
una conversazione già chiusa, apre il dettaglio.

**Il documento si chiude sulla conversazione.** Prima il giudizio, poi, da una
pagina nuova, la trascrizione per intero: una correzione che non si può
confrontare con quello che è stato detto è un numero da prendere per buono, e
questo è il foglio che uno studente porta a una contestazione. Le due parti non
si mescolano perché una si consegna e l'altra si consulta. Delle battute di una
chiamata resta fuori la coda fra graffe con cui Hume descrive il tono, che a
schermo diventa la riga "Tono" sotto la bolla: sulla carta sarebbero termini
inglesi grezzi in mezzo a una trascrizione italiana. Le note del docente
restano dove sono, sopra la trascrizione, ognuna col messaggio a cui era
appuntata.
