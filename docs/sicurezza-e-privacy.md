# Sicurezza e privacy

Cosa viene registrato, cosa viene difeso, per quanto restano i dati e come si
portano via. Quali dati personali tratta l'applicazione e su quale base
giuridica sta invece in [gdpr.md](gdpr.md): qui c'è come funziona il
meccanismo.

## Il registro delle azioni

Un middleware solo scrive tutto il registro
([backend/audit.py](../backend/audit.py)). Gira **dopo** che la risposta è
stata prodotta, e registra la richiesta solo se la rotta che ha corrisposto è
in una tabella dichiarata nel modulo.

Questa è la scelta di fondo: il registro è guidato da **una tabella**, non da
chiamate sparse dentro i router. Un endpoint che cambia qualcosa è coperto il
giorno in cui viene aggiunto a quella tabella, e non c'è nessuna riga da
ricordarsi di scrivere dentro la funzione.

La chiave è il percorso **templato** che FastAPI ha riconosciuto
(`/api/admin/users/{user_id}`), non quello concreto: una rotta si dichiara una
volta e vale per ogni id.

| Cosa entra | Cosa resta fuori |
| --- | --- |
| Tutto quello che cambia qualcosa, di qualunque ruolo | Le GET, che sarebbero rumore di navigazione |
| Login, login fallito, logout, prima password (registrati esplicitamente, perché lì un utente autenticato non c'è ancora) | Il corpo delle richieste, sempre |
| L'export dei propri dati personali, unica GET nel registro | |

L'export è nel registro perché una richiesta di accesso ai propri dati non è
navigazione: è esattamente la cosa di cui serve poter dimostrare di aver dato
seguito.

Due garanzie su cui il resto del codice conta:

- **scrivere una riga di registro non può far cadere la richiesta che
  descrive.** La scrittura gira su una sessione tutta sua, dentro un
  try/except: un guasto viene stampato e la risposta esce intatta;
- **niente qui legge il corpo della richiesta.** Nel campo dei dettagli
  finiscono solo gli extra che un endpoint ha attaccato esplicitamente con
  `describe()`, quindi password, token e contenuto delle conversazioni restano
  fuori per costruzione.

Una regola su quegli extra: **quando la riga descrive qualcosa che sparisce,
nei dettagli ci vanno i nomi e non i soli identificativi**. Un percorso
eliminato o ritirato non si può più andare a rileggere, quindi un `target_id`
da solo è un fatto che nessuno può ricostruire; il ritiro di un percorso
scrive il titolo, la persona e l'organizzazione, l'eliminazione scrive il
titolo e quante persone lo stavano percorrendo. Vanno letti **prima** della
cancellazione e prima del commit, finché gli oggetti sono ancora caricati:
dopo, ogni campo sarebbe una query su righe che non ci sono più.

L'attore viene da `request.state.audit_user`, pubblicato da `get_current_user`.
Le righe portano anche email, ruolo e organizzazione **fotografati**: il
registro deve restare leggibile dopo che l'account è stato cancellato, o smette
di essere un registro.

Il super admin lo legge da `/app/admin/logs`
([routers/audit_logs.py](../backend/routers/audit_logs.py)), con i filtri per
azione, utente e periodo.

## Le difese sugli accessi

Descritte per esteso in [autenticazione.md](autenticazione.md), in sintesi:

| Difesa | Contro cosa | Dove |
| --- | --- | --- |
| Cookie `HttpOnly` | Furto del token via XSS | [routers/auth.py](../backend/routers/auth.py) |
| Limite a finestra scorrevole, su database | Tentativi di password a raffica, anche distribuiti | [rate_limit.py](../backend/rate_limit.py) |
| Messaggio di errore unico | Scoprire quali email esistono | [routers/auth.py](../backend/routers/auth.py) |
| Denylist dei token | Il logout che altrimenti non varrebbe fino alla scadenza | [token_denylist.py](../backend/token_denylist.py) |
| Session binding a IP e User-Agent | Un cookie portato via dal browser del proprietario | [token_sessions.py](../backend/token_sessions.py) |
| Stato di account e organizzazione a ogni richiesta | Sospensioni che varrebbero solo al login successivo | [auth_dependency.py](../backend/auth_dependency.py) |

## Le difese sulla pagina

Le difese di sopra proteggono la sessione da chi la vuole rubare da fuori.
Questa protegge dal caso opposto, cioè da codice che gira **dentro** la pagina,
e nasce da una constatazione: il cookie `HttpOnly` protegge il token, non la
sessione. Uno script iniettato non può portarsi via il cookie, ma non ne ha
bisogno: gira nella pagina, e ogni `fetch` che scrive parte col cookie
attaccato dal browser. Potrebbe leggere le trascrizioni e mandarle altrove, e
il session binding non se ne accorgerebbe, perché è lo stesso browser dallo
stesso indirizzo.

Gli header stanno tutti in [caddy/Caddyfile](../caddy/Caddyfile), in un blocco
solo, perché di lì passa tutto: la React servita da nginx, l'API, e i ritratti
degli avatar sotto `/static`.

| Header | Contro cosa |
| --- | --- |
| `Content-Security-Policy` | Codice caricato da fuori, e dati mandati fuori. `script-src 'self'` toglie il primo, `connect-src 'self'` toglie l'uscita ai secondi |
| `X-Content-Type-Options: nosniff` | Che il browser decida da sé che un file caricato da un utente è qualcosa di diverso da come è dichiarato |
| `Referrer-Policy` | Che gli indirizzi, che contengono id di conversazioni e percorsi, finiscano su un sito esterno |
| `Permissions-Policy` | Che qualcosa di diverso dall'applicazione chieda il microfono |
| `frame-ancestors 'none'` (dentro la CSP) | Il clickjacking sui gesti distruttivi dell'area di amministrazione |
| `Strict-Transport-Security` | Il primo collegamento in chiaro, su cui i cookie `Secure` non viaggerebbero |

**Oggi non stanno tappando un buco, ed è giusto dirlo.** Nel frontend non c'è
nessun `dangerouslySetInnerHTML`, non c'è un renderer di markdown e non c'è
nessuno script di terze parti, quindi il testo che scrivono le persone e quello
che scrive il modello passano tutti dall'escaping di React. La CSP serve a
rendere **non sfruttabile** la falla che nascerebbe il giorno in cui qualcuno,
per mostrare in grassetto una parola di una valutazione, aggiunge un renderer
che accetta HTML.

Le quattro deroghe alla policy sono tutte pezzi di questa applicazione, e vanno
sapute prima di stringerla ancora:

| Deroga | Perché |
| --- | --- |
| `script-src blob:` | Il worklet che ricampiona il microfono è scritto inline e caricato da un `blob:` ([voiceCall.ts](../frontend/src/services/voiceCall.ts)). Senza, non parte la chiamata vocale |
| `media-src blob:` | La registrazione di una chiamata e l'anteprima di una voce si ascoltano da un `blob:` |
| `style-src 'unsafe-inline'` | Ci sono attributi `style` calcolati (l'anello di avanzamento, la mappa dei percorsi). `style-src-elem` resta chiuso su `'self'`, quindi i fogli di stile veri possono arrivare solo da qui |
| `img-src data:` | Icone inline |

La riga da guardare per prima toccando la policy è `connect-src 'self'`, perché
copre anche il **WebSocket** della chiamata, che sta sulla stessa origine: a
romperla si rompe la telefonata e non la pagina, che è il modo in cui un guasto
si scopre tardi. Il modo prudente di cambiarla è
`Content-Security-Policy-Report-Only`, che fa scrivere al browser quello che
avrebbe bloccato senza bloccarlo.

**HSTS solo su un dominio vero.** Su `localhost` il browser si ricorderebbe per
un anno di forzare HTTPS su tutto quello che gira lì, compresi gli altri
progetti sulla stessa macchina di chi prova lo stack in locale.

**I caratteri sono serviti dall'applicazione**, non presi da Google a ogni
pagina ([index.css](../frontend/src/index.css)). Era l'unica richiesta a un
dominio di terzi rimasta, e ne toglie tre problemi in uno: l'indirizzo IP di
chi si allena non arriva più a un fornitore che nessuno ha dichiarato (vedi
[gdpr.md](gdpr.md)), la CSP resta chiusa su `'self'` per stili e caratteri, e
un CDN irraggiungibile non può più cambiare l'aspetto dell'applicazione.

Che gli header ci siano davvero, su tutte e due le strade, lo verifica lo smoke
test della CI a ogni giro: uno che sparisce non fa rumore, perché la pagina
continua a funzionare esattamente come prima.

## Le difese attorno al modello

Le difese di sopra riguardano chi arriva da fuori. Queste riguardano il posto
in cui il testo di un utente entra in una richiesta a OpenAI, e sono due
perché i modi di approfittarne sono due: **spostare un voto** e **far pagare
delle chiamate**.

**Chi viene valutato scrive metà del materiale su cui il voto si decide.** Sia
la trascrizione di una conversazione sia la risposta aperta di un test
viaggiano nella stessa richiesta delle istruzioni che dicono come giudicarle,
quindi una riga scritta nella forma giusta poteva presentarsi al modello come
istruzione invece che come materiale. Il rimedio sta in
[untrusted_text.py](../backend/untrusted_text.py) e vale nei due punti in cui
serve, cioè la valutazione della conversazione e la correzione delle risposte
aperte: al testo si toglie la forma (il numero di riga, l'etichetta a inizio
riga, i titoli di sezione), il blocco viene racchiuso in un recinto che cambia
a ogni chiamata, e il prompt dichiara che quel recinto contiene materiale da
valutare e mai istruzioni da eseguire. Il ragionamento per esteso, con il
motivo per cui il roleplay è escluso, sta in
[valutazione.md](valutazione.md).

**Le chiamate al modello hanno un tetto per persona**
([llm_limits.py](../backend/llm_limits.py)). Vale per tutte e cinque quelle
che partono da una richiesta HTTP: chat testuale, valutazione, correzione
delle risposte aperte, bozza di scheda persona, generazione delle domande. Ogni
funzione ha il suo secchiello, così finire una chat non lascia senza
valutazione, e si conta ogni chiamata **iniziata**, perché è quella che si
paga. Le soglie stanno nel codice come quelle del login, e per lo stesso
motivo: non sono una scelta di installazione, sono la distanza fra un uso
intenso e un uso che non è più un uso.

Il vocale un tetto ce l'aveva già, `MAX_CONCURRENT_CALLS`, perché lì la
capienza è un problema visibile: si vede il giorno stesso, in aula. Quello di
qui protegge dal guasto opposto, cioè quello che non si vede fino alla
fattura.

## Altre due difese lontane dal login

Due altre difese stanno lontano dal login e vale la pena nominarle:

- **i ritratti degli avatar** vengono riconosciuti dai **byte iniziali** del
  file, non dal nome né dal tipo dichiarato dal browser: quei file finiscono
  serviti da `/static`, quindi va escluso tutto quello che un browser potrebbe
  eseguire, e SVG e HTML sono proprio quello. Passano solo PNG, JPEG e WebP, e
  l'estensione salvata è quella che la firma dimostra;
- **la scheda persona non esce mai dal server** verso chi si allena. È l'API di
  amministrazione a esporla, e l'export dei dati personali la esclude
  esplicitamente: contiene l'obiettivo nascosto e la vera causa del problema,
  cioè la soluzione dell'esercizio.

## La conservazione

Ogni finestra è configurata, e **nessuna ha un valore di ripiego nel codice**:
per quanto si tengono dei dati personali è una decisione che deve stare nella
configurazione, dove si vede, non in un default che nessuno legge. In
produzione i valori sono quelli elencati in [gdpr.md](gdpr.md):

| Dato | Finestra | Variabile |
| --- | --- | --- |
| Registrazione audio della chiamata | 90 giorni | `AUDIO_RECORDING_RETENTION_DAYS` |
| Conversazione intera con valutazione e revisione | 730 giorni | `CONVERSATION_RETENTION_DAYS` |
| Tentativi delle simulazioni tecniche | 730 giorni | `SIMULATION_ATTEMPT_RETENTION_DAYS` |
| Quadro d'insieme su una persona | La finestra delle conversazioni, misurata sulla prova più recente che aveva letto | `CONVERSATION_RETENTION_DAYS` |
| Registro delle azioni | 180 giorni | `AUDIT_LOG_RETENTION_DAYS` |

L'audio ha la finestra più corta perché è il dato più sensibile del sistema: la
voce di una persona. La conversazione più lunga, perché è il percorso
formativo. Un tentativo di simulazione se ne va intero, fotografia delle
risposte compresa, mentre la simulazione con le sue domande non riguarda
nessuno in particolare e resta.

Il quadro d'insieme è l'unico senza un orologio proprio, e non per
dimenticanza: è una sintesi delle conversazioni, quindi non può
sopravvivere a quello che riassume. Si misura sulla data della prova più
recente che aveva letto, così quando quella è oltre la finestra tutto il
materiale su cui il testo si fonda è appena stato cancellato, e quello che
resterebbe è un giudizio su una persona senza più niente dietro. Di quadri
una persona ne ha uno per ogni volta che gliene è stato fatto scrivere uno, e
la regola si applica a ciascuno per conto suo: lo storico si accorcia dal
fondo, che è esattamente quello che deve succedere.

## Il ciclo di pulizia

Le finestre le applica un ciclo che gira **dentro l'applicazione**
([housekeeping.py](../backend/housekeeping.py)), non un cron dell'host e non un
comando manuale.

Il motivo: una promessa mantenuta solo al riavvio non è mantenuta. Un container
acceso da otto mesi starebbe seduto su otto mesi di dati scaduti ed è, sulla
carta, conforme esattamente quanto uno che pulisce ogni notte.

Tre proprietà, tutte per la stessa ragione ("installato una volta e mai più
toccato"):

- **gira una volta all'avvio**, poi ogni `HOUSEKEEPING_INTERVAL_HOURS`, così
  sia un riavvio sia una lunga permanenza in piedi finiscono puliti;
- **non può morire**. Un giro fallito viene registrato e dimenticato, il ciclo
  resta vivo e riprova. Un'eccezione che scappasse da lì spegnerebbe la
  conservazione per tutta la vita del processo, che è l'unico guasto che
  nessuno noterebbe;
- **non può portarsi giù l'applicazione**: il lavoro è sincrono e va su un
  thread, quindi l'event loop continua a servire le chiamate mentre una DELETE
  grossa gira.

Il ciclo vive in **ogni** replica, quindi parte più volte insieme. Lo risolve un
advisory lock **non bloccante**: una replica pulisce, le altre saltano il giro.
Non bloccante e non in coda, al contrario del lock sullo schema: qui il lavoro
lo sta già facendo qualcun altro, e la risposta onesta è saltare.

Un giro applica tutte le finestre insieme, e pulisce anche le cose che scadono
da sole: sessioni di token, token revocati, tentativi di accesso, sessioni
vocali chieste e mai aperte.

## I diritti delle persone

**Accesso e portabilità (art. 15 e 20).** `GET /api/auth/me/export` produce uno
ZIP che l'utente scarica da solo dalla propria pagina di profilo
([personal_data.py](../backend/personal_data.py)): un JSON con i dati
strutturati e le chiavi in italiano, l'audio delle proprie chiamate come file,
e un README in italiano che spiega cosa c'è nell'archivio. La copia deve essere
intelligibile, non solo completa.

Due regole su cosa **non** entra:

- **la scheda persona di un avatar**, come detto sopra;
- **i dati di chiunque altro**. Ogni query è filtrata sul richiedente, e gli
  unici nomi di altre persone che compaiono sono quelli dei docenti che hanno
  firmato un giudizio sulle sue conversazioni, che fa parte del suo voto e che
  ha diritto di leggere.

E due cose che entrano ed è facile dimenticare, per lo stesso motivo. Le
righe di registro che lo riguardano e le sessioni registrate sul suo account
con IP e User-Agent, e **i quadri d'insieme** che un formatore ha fatto
scrivere su di lui, che nell'interfaccia lui non vede. Ci sono tutti e non
solo l'ultimo, con la direzione che ciascuno indicava: l'archivio deve dire
quello che la piattaforma tiene, non quello che mostra. Sono dati personali
tenuti su di lui, quindi l'art. 15 li copre: chi può sfogliarli in una
schermata e chi ha diritto a una copia di quello che la piattaforma tiene su
di sé sono due domande diverse. Dei quadri resta fuori solo il nome di chi li
ha fatti scrivere, che è un'altra persona e che, a differenza della firma su
una revisione, non è parte di un voto contestabile.

**Cancellazione (art. 17).** La sa fare un modulo solo,
[erasure.py](../backend/erasure.py), usato sia dalla cancellazione di un
singolo utente sia da quella di un'organizzazione intera. Prima esistevano due
idee diverse di cosa sia fatta una persona, ed entrambe si dimenticavano la
stessa tabella: è così che la cancellazione va storta, non con un errore
visibile ma con una riga che nessuno ha ricordato.

Cosa **sopravvive di proposito**:

| Cosa | Perché |
| --- | --- |
| Le righe di registro (chiave esterna azzerata, email e ruolo fotografati) | Un registro deve restare leggibile dopo che l'account è sparito, e scade sul proprio orologio |
| Il nome del docente sulle revisioni scritte per altre persone | Fa parte del voto di qualcun altro, e chi contesta un punteggio ha diritto di sapere chi l'ha firmato |

Cosa **non** sopravvive: il nome nelle colonne di paternità delle righe che ha
creato, sostituito da `utente eliminato`. Un'organizzazione o un avatar non
sono un registro e non sono il voto di nessuno: la riga continua a dire che
l'ha fatta una persona e smette di dire quale.

Nessuna delle due eccezioni conserva IP, voce o trascrizioni di chi è stato
cancellato, che è quello di cui la cancellazione parla davvero.

Il modulo **non fa commit**: la transazione è di chi chiama, così la rimozione
dei dati locali e il resto di quello che l'endpoint sta facendo (per esempio
cancellare l'account da Cognito) riescono o falliscono insieme.

## Quello che l'applicazione non fa da sola

Tre cose stanno fuori dal codice e sono elencate in
[deploy-e-scalabilita.md](deploy-e-scalabilita.md) e
[infrastruttura.md](infrastruttura.md), ma vanno ripetute perché senza di esse
la parte fatta qui non basta:

- **la cifratura del disco**, che protegge le registrazioni audio nel volume
  del database, e vale anche per i backup;
- **HTTPS e l'header di provenienza sovrascritto** dal proxy, senza cui i
  cookie `Secure` non funzionano e la metà IP del binding si può falsificare;
- **il tenere i backup fuori dalla macchina**, e con le stesse finestre di
  conservazione, altrimenti ricreano il problema che la pulizia risolve.

C'è infine un interruttore da tenere d'occhio sul server: `VOICE_STT_DEBUG`
stampa nei log le trascrizioni grezze di quello che gli utenti dicono. In
locale serve a tarare la VAD, in produzione va spento.
