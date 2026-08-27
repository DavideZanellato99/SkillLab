# La chiamata vocale

La funzionalità più complessa dell'applicazione: una telefonata simulata in cui
l'avatar chiama il numero verde della banca e l'operatore in formazione
risponde. Due fornitori esterni in fila, un WebSocket, e un vincolo che governa
ogni scelta, cioè che **la latenza è la qualità del prodotto**.

## Il giro completo

```mermaid
sequenceDiagram
    participant O as Operatore
    participant B as Browser
    participant P as VoicePipeline
    participant E as ElevenLabs STT
    participant L as OpenAI
    participant C as ElevenLabs TTS

    O->>B: preme "Chiama"
    B->>P: POST /api/voice/session
    P-->>B: session_id
    B->>B: microfono, AudioContext, worklet, registratore
    B->>P: WS /api/voice/ws (id nel sottoprotocollo)
    P->>E: apre il socket STT
    P->>C: apre il socket TTS
    P-->>B: ready
    B->>B: squillo
    O->>B: risponde e si presenta
    B->>P: audio PCM16 16 kHz
    P->>E: audio
    E-->>P: parziali, poi commit (VAD)
    P-->>B: user_partial, user_final
    P->>L: turno con tutta la storia
    L-->>P: token in streaming
    P-->>B: assistant_delta (testo)
    P->>C: parole complete
    C-->>P: audio PCM16 24 kHz
    P-->>B: audio, speaking_start
    B->>O: la voce dell'avatar
```

## L'apertura in due tempi

`POST /api/voice/session` autentica, controlla e prepara; il WebSocket poi si
apre col solo `session_id`, che porta nell'handshake e non nell'indirizzo.

Perché due richieste e non una: un WebSocket non porta con sé le dipendenze di
FastAPI in modo comodo, e soprattutto la preparazione (permessi, avatar,
conversazione, storia) è lavoro da fare **prima** che il socket esista. Quello
che il POST fa, in [routers/voice.py](../backend/routers/voice.py):

1. verifica che le chiavi dei fornitori ci siano, altrimenti 503;
2. controlla che l'avatar sia visibile a chi chiama;
3. riusa la conversazione indicata o ne apre una nuova, con un titolo
   progressivo per categoria;
4. rifiuta di continuare una conversazione **di canale sbagliato** (una chat
   scritta non si prosegue al telefono) o **già chiusa** (una chiamata
   riagganciata è definitiva);
5. fotografa la scheda persona e la storia già scritta;
6. scrive la sessione e restituisce un id imprevedibile.

La sessione sta **in tabella**, non in memoria
([voice_sessions.py](../backend/voice_sessions.py)). È la conseguenza diretta
delle repliche: il POST e il WebSocket sono due richieste, e appena i processi
sono più di uno non finiscono sullo stesso. Tenendo lo stato su Postgres
qualunque replica serve qualunque chiamata, e davanti basta un bilanciamento
normale senza affinità di sessione da configurare per sempre.

La riga porta una copia della storia della conversazione, quindi ha vita
volutamente breve: si cancella a chiamata finita, e le sessioni chieste e mai
aperte scadono in un'ora e le raccoglie la pulizia periodica.

### L'id non viaggia nell'indirizzo

Il socket si apre su `/api/voice/ws` senza parametri, e l'id sta nei
**sottoprotocolli** dell'handshake: il client ne offre due, il nome
`skilllab-voice` e l'id, e il server conferma il primo. Sceglierlo nella
risposta non è formalità, se il client offre sottoprotocolli e il server non
ne conferma nessuno il browser chiude l'handshake da solo.

Il motivo è che l'id è la sola credenziale che apre la chiamata, e un indirizzo
finisce nel log degli accessi del proxy, e da lì ovunque quei log vengano
raccolti. Nell'handshake viaggia in un header, che nessuno registra.

### Lo stato dell'account si rilegge qui

Il socket è l'unica rotta che non passa da `get_current_user`, quindi è anche
l'unica che non vedrebbe una sospensione. Per questo `load_voice_session`
rilegge l'utente e chiama `access_denied_reason`
([account_status.py](../backend/account_status.py)), la stessa regola che ogni
altra richiesta applica: un account sospeso, o un'organizzazione sospesa, non
apre la chiamata nemmeno con un id ancora valido in mano. La risposta è la
stessa 4401 di un id sconosciuto.

Resta fuori la chiamata **già in corso**: chi viene sospeso mentre è al
telefono finisce la telefonata. Interromperla a metà vorrebbe dire rileggere lo
stato a ogni turno, cioè una query nel percorso caldo, e una chiamata dura
minuti, non ore.

## Il tetto alle chiamate

Prima di accettare il socket, il backend prende un posto
([voice_capacity.py](../backend/voice_capacity.py)). Se non ce ne sono, la
chiamata viene rifiutata con un messaggio leggibile ("Tutte le linee sono
occupate") e la chiusura 1013, che vuol dire "riprova più tardi". La riga della
sessione resta valida: non è stato consumato niente, quindi lo stesso id
funziona al tentativo dopo.

Il ragionamento: un event loop saturo non rifiuta, **rallenta**, e rallenta per
tutti insieme perché la coda degli eventi è una sola. La chiamata di troppo non
degrada se stessa, degrada anche le quaranta che stavano andando bene. Meglio
perderne una e dirlo.

Il conteggio è in memoria di proposito, ed è l'unica cosa in tutto il backend
che deve esserlo: a saturarsi è il core su cui gira quell'event loop, non
l'installazione. Il valore giusto lo dice il banco di prova in
[loadtest/](../loadtest/), e sta nella configurazione senza nessun ripiego nel
codice: un tetto scritto nel codice è un tetto che nessuno ha misurato.

## Il browser

[voiceCall.ts](../frontend/src/services/voiceCall.ts) è una classe che tiene
insieme microfono, grafo audio, socket e registratore.

**In salita.** Il microfono passa da un `AudioWorklet` scritto inline che
ricampiona a 16 kHz mono e produce PCM16 in blocchi da circa 40 ms. Gira fuori
dal thread principale, così l'interfaccia non fa perdere pacchetti audio.

**In discesa.** Ogni blocco che arriva diventa un `AudioBufferSourceNode`
programmato su una testina che avanza: i blocchi si concatenano senza buchi. Il
primo blocco di ogni turno ha un piccolo cuscinetto (40 ms) che assorbe il
jitter di rete, tenuto basso apposta perché si paga per intero sul ritardo che
l'operatore percepisce.

**Half duplex.** L'operatore non parla mai sopra l'avatar. Mentre l'avatar sta
elaborando o parlando, il browser manda al posto del microfono **silenzio della
stessa lunghezza**, invece di smettere di mandare: così lo stream STT resta
vivo e la sua VAD chiude pulitamente qualunque frase in sospeso.

**La registrazione.** Un `MediaStreamAudioDestinationNode` somma le due voci,
e un `MediaRecorder` scrive in Opus (webm/ogg) o in mp4 su Safari. Due
dettagli:

- l'audio dell'avatar entra nel registratore **dallo stesso nodo che lo
  suona**, quindi finisce nel file nell'istante in cui è stato sentito davvero,
  non quando il blocco è arrivato dalla rete;
- il microfono entra sempre, anche mentre il gate half duplex manda silenzio
  alla STT: il file conserva quello che l'operatore ha detto davvero, compresa
  la parte in cui ha parlato sopra.

La registrazione parte a squillo finito, non all'apertura del socket: la
suoneria non fa parte della conversazione.

## La pipeline lato server

[voice_pipeline.py](../backend/voice_pipeline.py), un'istanza per chiamata. Tre
cicli concorrenti su un `asyncio.wait` che chiude tutto appena uno finisce:

| Ciclo | Cosa fa |
| --- | --- |
| `_browser_loop` | Legge dal browser: i frame binari li inoltra alla STT, il JSON `end` chiude la chiamata |
| `_stt_loop` | Legge da ElevenLabs: parziali, commit, errori |
| `_tts_loop` | Legge dalla sintesi: blocchi audio verso il browser |
| `_keepalive_loop` | Tiene su la socket della sintesi mentre parla l'operatore |

Durante lo squillo parte anche un **prewarm**: una richiesta da un token sola a
OpenAI che paga in anticipo l'handshake e il prefill del prompt della persona,
cioè le due cose che altrimenti pagherebbe il primo turno. È best effort: nel
caso peggiore il primo turno paga quello che avrebbe pagato comunque.

Gli eventi JSON verso il browser sono: `ready`, `user_partial`, `user_final`,
`assistant_delta`, `assistant_end`, `speaking_start`, `speaking_end`,
`interrupt`, `error`.

## Il turno, e il problema dei commit spezzati

La fine del turno dell'operatore la decide la VAD di ElevenLabs, con soglia di
silenzio e sensibilità configurate. Ma ElevenLabs **spezza le frasi lunghe**:
commette un pezzo a metà discorso anche se l'operatore sta ancora parlando.
Rispondere a quel pezzo significherebbe rispondere a mezza frase e poi doversi
correggere.

Da qui l'aggregazione dei commit:

```mermaid
flowchart TD
    A[commit dalla STT] --> B{finisce come<br/>una frase finita?<br/>. ! ? …}
    B -->|sì| C[parte subito il turno]
    B -->|no| D[si tiene da parte<br/>e si aspetta VOICE_SETTLE_MS]
    D --> E{arriva altro parlato<br/>o un altro commit?}
    E -->|sì| F[si unisce e si riparte<br/>con l'attesa]
    E -->|no| C
```

Un turno normale, che finisce con un punto, non paga niente.

I pezzi si riuniscono con `_join_transcript`, che non si limita a metterci uno
spazio: ElevenLabs taglia dove arriva al proprio limite, e quel limite non
guarda dove finiscono le parole, quindi "provvediamo a bloccar" più "li, ne
riceverà nuovi" con uno spazio in mezzo darebbe al modello una parola che non
esiste. La cucitura si chiude quando il taglio sembra caduto dentro una parola,
cioè quando l'ultimo frammento è minuscolo, finisce in consonante e non è una
delle poche tronche italiane. I frammenti con l'iniziale maiuscola restano
staccati, così i cognomi non vengono saldati a quello che segue.

Il cronometro del turno resta ancorato al **primo** commit del gruppo, ma il
tempo in cui l'operatore stava ancora parlando finisce nella voce `attesa` e
non nell'attesa che gli si attribuisce: vedi [Le misure](#le-misure).

Un commit che arriva mentre un turno è già in volo è invece un **barge in**: il
turno in corso viene annullato, il contesto della sintesi chiuso, e al browser
arriva prima la battuta troncata (che resta nella storia, perché è quello che
l'operatore ha effettivamente sentito) e poi `interrupt`.

## Dentro un turno

1. si apre un **contesto di sintesi** nuovo, identificato da un id;
2. i token di OpenAI arrivano in streaming: ognuno va al browser come testo
   (`assistant_delta`) e finisce in un buffer;
3. il buffer viene mandato alla TTS **sui confini di parola**, così la sintesi
   non deve indovinare la pronuncia di mezzo token;
4. l'audio torna taggato col contesto: quello di un contesto diverso, cioè di
   un turno annullato, viene buttato;
5. alla fine si chiude il contesto, il che manda in sintesi anche il testo
   rimasto in cassa: non serve chiedere il flush a parte.

Se il modello fallisce e non è ancora uscito niente, l'avatar dice una battuta
di ripiego ("ho avuto un problema tecnico, puoi ripetere?"), che è meglio di un
silenzio che l'operatore non sa come interpretare.

Le scritture a database sono **fire and forget** su un thread: la trascrizione
non deve mai fermare l'audio. I task vengono tenuti in un insieme finché non
finiscono, perché l'event loop li tiene solo con riferimenti deboli e un task
non referenziato può essere raccolto a metà, perdendo la scrittura in silenzio.

## Le misure

[turn_metrics.py](../backend/turn_metrics.py) cronometra ogni turno per stadio,
così una risposta lenta si attribuisce invece di indovinarla:

| Segmento | Da dove a dove |
| --- | --- |
| `vad` | Ultimo parziale con parole nuove, cioè quando l'operatore ha smesso di parlare, fino al commit |
| `attesa` | Primo commit del gruppo fino all'ultimo, solo sui turni che la STT ha spezzato |
| `prep` | Ultimo commit fino alla richiesta al modello |
| `llm_ttft` | Richiesta fino al primo token. È il pezzo dominante |
| `tok2tts` | Primo token fino al primo invio alla sintesi |
| `tts` | Invio fino al primo audio ricevuto |
| `send` | Primo audio fino all'uscita verso il browser |
| `slot_tts` | Primo invio fino alla chiusura del contesto, solo nel riepilogo |

Il numero che riassume tutto è `percepita`, cioè `vad` più il tratto dall'ultimo
commit al primo audio. Non comprende il cuscinetto di riproduzione del browser,
che aggiunge un altro pezzo fisso.

Due dettagli che nascono da misure sbagliate viste sul campo, e che sono il
motivo per cui queste righe si leggono così:

- **il silenzio si conta dai parziali con parole nuove.** ElevenLabs continua a
  rimandare lo stesso parziale mentre l'operatore tace già: prendere per buono
  l'ultimo in ordine di tempo riduceva ogni silenzio misurato alla distanza fra
  due parziali gemelli, duecento millesimi contro una soglia VAD di un secondo e
  mezzo;
- **un turno spezzato ha due orologi.** `commit->audio` parte dal primo commit e
  dice quanto è costata l'aggregazione da capo a fondo; `risposta` parte
  dall'ultimo e dice quanto ha lavorato la pipeline. Senza la distinzione, un
  turno in cui l'operatore ha parlato ininterrottamente per quattordici secondi
  si presentava come diciassette secondi di ritardo che nessuno ha mai vissuto.
  `risposta` compare nella riga solo quando i due numeri differiscono.

Si accende con `VOICE_LATENCY_LOG=1` e si aggrega con
[loadtest/report.py](../loadtest/report.py), che dà mediana, p95 e massimo per
stadio. Vale anche sul traffico vero, non solo sotto prova.

C'è anche `VOICE_STT_DEBUG`, che stampa il tracciato grezzo della STT: serve a
tarare la VAD, ma scrive nei log quello che le persone dicono, quindi in
produzione va spento. Accende anche `[STT-INVIO]`, una riga ogni cinque secondi
che confronta i secondi di audio spediti a ElevenLabs con quelli trascorsi. È la
risposta a una domanda che dal solo tracciato non si può sciogliere: quando le
trascrizioni arrivano in blocco, coprendo mezzo minuto di parlato tutto insieme,
dice se l'arretrato si è formato da noi o da loro.

### Quante chiamate stanno dentro uno slot di sintesi

`slot_tts` è l'unico segmento che non misura un'attesa: misura
un'occupazione. Va dal primo pezzo di testo mandato alla sintesi alla
chiusura del contesto, cioè il tempo in cui il turno tiene occupato uno dei
pochi slot di concorrenza che il piano concede.

Non è la durata dell'audio. Il browser riproduce per quindici secondi quello
che la sintesi ha prodotto in due, quindi un piano da venti sintesi
simultanee regge molte più di venti conversazioni. Quante, lo dice la riga
finale del riepilogo:

```
slot TTS occupato il 9.4% della chiamata, cioè circa 11 chiamate per slot
```

È una media sulla singola chiamata e non tiene conto delle collisioni, quindi
è un tetto teorico e il dimensionamento vero vuole margine. Quando due turni
cadono insieme oltre il limite ElevenLabs però **accoda invece di rifiutare**,
e la coda costa una cinquantina di millisecondi: uno sforamento si paga in
latenza impercettibile, non in un turno che non viene pronunciato.

I turni interrotti da un barge in vengono conteggiati nella quota, perché lo
slot lo hanno occupato davvero, ma sono contati a parte perché una sintesi
tagliata a metà abbassa la mediana.

### Quanti slot STT stiamo occupando

All'apertura di ogni chiamata
[log_stt_concurrency](../backend/elevenlabs_service.py) scrive una riga
`[STT-CONCORRENZA] in uso N su M`, letta dagli header che ElevenLabs
restituisce nell'handshake. Non ha interruttore e non contiene niente di
personale, a differenza del tracciato della VAD, quindi resta acceso anche in
produzione.

Serve perché il tetto del piano non si traduce nel numero di chiamate
simultanee: la connessione WebSocket occupa uno slot solo mentre il modello
lavora, e quanto margine resta davvero non si deduce, si misura. Se gli header
non arrivano, la riga non esce e la chiamata prosegue.

Con la sintesi sullo stesso fornitore i due tetti restano comunque separati:
il piano conta le trascrizioni in tempo reale e le sintesi Flash su due quote
distinte, e la seconda è quella con più margine, perché una sintesi occupa lo
slot per una frazione della chiamata mentre una trascrizione lo occupa quasi
per tutta.

### La socket della sintesi va tenuta viva

ElevenLabs chiude la connessione di sintesi dopo un tempo di inattività, che
si può alzare fino a un tetto ma non togliere. È un problema specifico di
questa pipeline: su quella socket, per tutto il tempo in cui parla
l'operatore, non passa assolutamente niente, e sono i minuti in cui la
chiamata sta andando bene.

Per questo `_keepalive_loop` manda un messaggio a vuoto a intervalli regolari,
dentro un contesto aperto all'inizio della chiamata che non dice mai niente:
i keep alive vanno indirizzati a un contesto, e fra un turno e l'altro non ce
n'è nessuno aperto. Un testo vuoto il fornitore lo ignora, quindi non
sintetizza nulla e non consuma quota: conta solo che sia arrivato qualcosa.

## La registrazione, dopo

Alla chiusura il browser carica l'audio con `POST /api/voice/recording/{id}`.
Il corpo è il file grezzo e il `Content-Type` è quello che il `MediaRecorder`
ha scelto. Solo il proprietario carica, e un secondo caricamento **sostituisce**
il primo: un ritentativo dopo una POST andata male non deve lasciare due mezze
registrazioni.

I controlli: contenitore ammesso (webm, ogg, mp4), lunghezza dichiarata
rifiutata prima di leggere il corpo, e lunghezza vera controllata di nuovo
perché `Content-Length` è un'affermazione, non una garanzia.

Per rileggerla ci sono due endpoint separati, e non è pignoleria: `/info` dà i
metadati senza toccare il blob (la colonna è `deferred`), così l'interfaccia
decide se disegnare il player senza scaricare un file che potrebbe non
riprodurre mai.

Chi può ascoltare è la regola solita: il proprietario, il super admin, e
l'organization admin per le conversazioni dei propri utenti.

Una finezza che sta nel frontend: le citazioni della valutazione possono
**portare all'ascolto** del momento citato. La registrazione non ha marcatori
per messaggio, quindi il punto si stima dai tempi (la registrazione finisce
quando la riga viene scritta, e il `created_at` di un messaggio cade verso la
fine del turno parlato), con otto secondi di riavvolgimento fisso per
riportare l'inizio della frase a portata d'orecchio.

## L'avviso di registrazione

Una telefonata simulata registra la voce dell'operatore, la trascrive e la fa
valutare da un modello, col punteggio che finisce sotto gli occhi
dell'azienda. L'informativa deve arrivare **prima** che si apra il microfono.

L'avviso completo è bloccante solo la prima volta per utente
([recordingNotice.ts](../frontend/src/services/recordingNotice.ts)); poi la
trasparenza la portano l'indicatore fisso sotto il pulsante di chiamata e il
"REC" durante la conversazione, che non hanno il difetto della modale ripetuta,
cioè di venire chiusa senza leggerla.

Se il browser viene ripulito l'avviso ricompare, ed è il lato giusto in cui
sbagliare.

## Quando qualcosa non va

| Sintomo | Causa | Cosa risponde |
| --- | --- | --- |
| La chiamata non parte | Chiavi dei fornitori mancanti | 503 sul POST della sessione |
| `session_id` mancante, sconosciuto, scaduto, o account sospeso | Sessione mai creata, già consumata, o utente e organizzazione non più attivi | Chiusura 4401, uguale in tutti i casi così chi prova a indovinare non impara niente dalla differenza |
| La chiamata non parte e l'id sembra giusto | L'id è finito nella query string invece che nel sottoprotocollo | Chiusura 4401: il vecchio indirizzo non è più una strada |
| "Tutte le linee sono occupate" | Tetto del processo raggiunto | Chiusura 1013 |
| "Riconoscimento vocale non disponibile" | Errore fatale della STT (quota, autenticazione, limite di sessione) | Evento `error` e chiusura |
| Il modello non risponde | Guasto su OpenAI | Battuta di ripiego, la chiamata continua |
