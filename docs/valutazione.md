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
| PDF | `GET .../evaluation/pdf`, generato da [exports.py](../backend/exports.py). Solo il proprietario. Porta lo stesso contenuto dello schermo, e le note del docente col messaggio a cui erano appuntate, perché sulla carta non c'è una trascrizione accanto a cui stare |
