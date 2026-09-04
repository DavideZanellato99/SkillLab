# Deploy, capacità e scalabilità

Come si mette online, come si fa crescere, e cosa succede quando qualcosa non
va. I principi generali dietro queste scelte, e la lista di controllo da
riusare su un altro progetto, stanno in
[infrastruttura.md](infrastruttura.md); qui c'è il funzionamento di questa
installazione.

## La prima installazione

1. **Un server con Docker.** Per il dimensionamento vedi più sotto: processi
   circa quanti sono i core, e quante chiamate regge un processo lo dice il
   banco di prova.
2. **Il dominio** che punta all'indirizzo del server, con le porte 80 e 443
   raggiungibili. Servono entrambe: la 80 la usa Let's Encrypt per la verifica.
3. **Due file di ambiente**: `backend/.env` con le chiavi dei fornitori e la
   configurazione dell'applicazione, e un `.env` accanto al compose con le
   credenziali del database e i numeri che cambiano con la macchina.

   Non esiste un elenco delle variabili, ed è voluto: quelle obbligatorie sono
   dichiarate in modo che l'avvio fallisca dicendo cosa manca, e un messaggio
   così non può invecchiare, mentre un elenco sì. Le uniche a cui fare
   attenzione sono le tre che non fermano l'avvio: `SITE_ADDRESS`, perché ha
   un default e dimenticandola il sito parte su `localhost` mentre dal dominio
   vero non risponde niente, e `VOICE_STT_DEBUG` e `DEV_ADMIN_LOGIN`, che vanno
   spente (vedi più sotto).
4. Poi:

```bash
docker compose -f docker-compose.yml up -d --build
```

Il `-f` esplicito esclude l'override di sviluppo, che Compose caricherebbe da
solo. Vedi [docker-e-ambienti.md](docker-e-ambienti.md).

## Gli aggiornamenti

```bash
git pull
docker compose -f docker-compose.yml up -d --build
```

**Non c'è nessun passo di migrazione da ricordare**: lo schema si aggiorna da
solo all'avvio, dietro un advisory lock, e ogni passo è idempotente
([dati-e-schema.md](dati-e-schema.md)). I riempimenti delle righe vecchie non
ripartono a ogni rilascio: un database che li ha già ricevuti li salta, e a
dirlo è l'impronta del file che li contiene, quindi aggiungerne uno li rimette
in moto da sé.

**Chi sta usando l'applicazione non riscarica tutto.** Le librerie del
frontend (React, il router, la cache delle query) stanno in un file separato
dal codice dell'applicazione, e quel file cambia nome solo quando si aggiorna
una dipendenza: un rilascio che tocca una schermata costa a chi torna il solo
codice cambiato, non i 267 kB di React. Vedi
[frontend.md](frontend.md).

**Le chiamate in corso cadono.** Le repliche vengono sostituite tutte insieme,
quindi chi è al telefono viene interrotto: per ora gli aggiornamenti vanno
fatti in una finestra tranquilla. Quello che invece non si perde sono le
scritture, grazie ai trenta secondi di grazia allo spegnimento che lasciano
arrivare a destinazione le trascrizioni partite fire and forget.

## Come si aggiunge capacità

Il principio è che **la capacità si aggiunge in processi, non in macchine**. Un
processo Python usa un core solo per via del GIL: su una macchina a sedici core,
un processo ne usa uno e ne paga sedici. Dentro quel processo `asyncio` dà molta
concorrenza, ma il tetto arriva quando il core è pieno di lavoro vero, e per
un'applicazione vocale quel lavoro è concreto (codifiche, serializzazioni,
cifratura di centinaia di connessioni).

Quindi: **processi circa quanti sono i core**, e le macchine si aggiungono dopo,
quando finiscono i core o la banda.

Cambiare il numero di repliche non richiede di toccare nessun file:

```bash
docker compose -f docker-compose.yml up -d --scale backend=6
```

Funziona perché tre cose sono già state risolte:

| Cosa | Come | Dove |
| --- | --- | --- |
| Il bilanciatore scopre le repliche | Le chiede al DNS di Docker ogni cinque secondi, non le ha in un elenco | [caddy/Caddyfile](../caddy/Caddyfile) |
| Nessuna replica ha stato che serva a un'altra | Sessioni vocali, tentativi di accesso e denylist stanno in tabella | [architettura.md](architettura.md) |
| Le migrazioni all'avvio non si pestano i piedi | Advisory lock bloccante, passi idempotenti | [dati-e-schema.md](dati-e-schema.md) |

E la politica di bilanciamento è scelta apposta: `least_conn` e non round
robin, perché una chiamata vocale tiene la connessione aperta dieci minuti e
quello che conta è chi ne ha meno in corso adesso, non di chi sia il turno.

## I due tetti da tenere allineati

Aggiungere repliche muove due numeri che stanno in file diversi, e nessuno li
cambia insieme se non se lo ricorda.

**Le connessioni al database.** Il pool è per processo, il tetto è per
installazione:

```
repliche * (DB_POOL_SIZE + DB_MAX_OVERFLOW)  <=  DB_MAX_CONNECTIONS
```

Postgres di suo ne accetta 100, che a quattro repliche sono già poche. Il
sintomo di un conto sbagliato non è un errore chiaro: è qualche richiesta che
ogni tanto non trova una connessione.

Per questo il backend **rifà il conto a ogni avvio** con i numeri veri chiesti
al database e lo scrive nei log, con un avviso quando le connessioni libere
sono meno di quelle che il processo può chiedere nel picco. Non ferma niente:
un tetto stretto non è un errore di configurazione, è una scelta che va vista.

**Le chiamate contemporanee.** `MAX_CONCURRENT_CALLS` è per processo, quindi la
capacità totale è quel numero per le repliche: quattro repliche con tetto 15
fanno sessanta chiamate. Superato il tetto la chiamata viene **rifiutata con un
messaggio leggibile**, invece di essere accettata e servita male insieme a tutte
le altre ([chiamata-vocale.md](chiamata-vocale.md)).

## Misurare, invece di stimare

Quante chiamate regge un processo non si deduce, si misura. Il banco di prova
sta in [loadtest/](../loadtest/), è descritto in [loadtest.md](loadtest.md), e
usa **fornitori finti**, perché le domande sono due e vanno separate:

- *quante chiamate regge il mio processo* è una domanda sulla CPU del backend,
  e si misura gratis con dei mock;
- *quante sessioni mi concedono i fornitori* è una domanda contrattuale, che si
  legge nel piano. Provare a scoprirla saturandoli costa soldi veri e rischia
  la sospensione dell'account.

Mescolandole, un test che si ferma a trenta chiamate non dice se il limite era
il tuo codice o la quota di qualcun altro.

La prova è una rampa a gradini (1, 5, 10, 20, 30, 40, 60 chiamate, cinque
minuti ciascuno) contro **un processo solo**, ed è quello che si sta
cronometrando. Un gradino è passato se reggono tutte e quattro:

| Criterio | Soglia |
| --- | --- |
| p95 di `commit->audio` | Entro 200 o 300 ms dalla baseline. Si guarda il p95 e non la mediana, che resta bella molto oltre il punto di rottura |
| CPU del container | Sotto il **70% di un core**, non il 100%: un event loop ha una coda sola, e quando il core è davvero pieno la latenza cresce in modo non lineare |
| Turni annullati o senza risposta | Nessuno che non sia stato interrotto apposta |
| Memoria | Deve salire e assestarsi. Se cresce a ogni gradino e non torna giù, è una perdita |

Le righe `[LATENCY]` che il backend stampa a ogni turno si aggregano con
[loadtest/report.py](../loadtest/report.py), che dà mediana, p95 e massimo per
stadio della pipeline. Vale anche sul traffico vero, non solo sotto prova.

Prima di misurare: `VOICE_STT_DEBUG=0`, altrimenti a cinquanta chiamate si
misura la scrittura su console invece della pipeline, e un database di test,
perché il giro crea conversazioni e messaggi veri.

## Le operazioni di ogni giorno

**Vedere cosa succede:**

```bash
docker compose -f docker-compose.yml logs -f backend | grep LATENCY
docker compose -f docker-compose.yml logs -f caddy
docker stats
```

**Ripristinare un backup**, con lo stack fermo tranne il database:

```bash
age -d -i chiave-backup.txt backups/skilllab-AAAAMMGG-HHMMSS.sql.gz.age \
  | gunzip -c \
  | docker compose exec -T db psql -U <utente> -d <database>
```

I dump escono cifrati con age, quindi il ripristino si fa dalla macchina dove
sta la chiave privata, che non è questa. La coppia si crea una volta sola, e
altrove:

```bash
age-keygen -o chiave-backup.txt
```

La pubblica che stampa (`age1...`) va nel `.env` accanto al compose come
`BACKUP_AGE_RECIPIENT`; il file con la privata si custodisce dove si
custodiscono le password. Senza la variabile il servizio di backup non parte,
di proposito: un dump in chiaro prodotto perché mancava una riga di
configurazione è la cosa di cui nessuno si accorge. E vale anche il rovescio,
che è la ragione per cui quella chiave va custodita sul serio: **persa la
privata, i backup restano cifrati per sempre**.

Un backup non esiste finché non lo si è ripristinato almeno una volta: la prova
è riversarlo su un database vuoto e contare le righe.

**Portare i backup fuori dalla macchina.** Restano in `./backups`, che è una
cartella dell'host apposta perché un `rsync` verso uno spazio remoto possa
prenderli. Finché stanno solo lì proteggono da una cancellazione sbagliata, non
dal disco che muore. È anche il motivo per cui vengono cifrati alla fonte: da
quando lasciano questa macchina nessuno sa più su quanti dischi passano, e la
cifratura del disco del server, che protegge quando il server è spento, non li
segue. Vanno tenuti con le stesse finestre di conservazione
dell'applicazione, altrimenti ricreano il problema che la pulizia risolve
([sicurezza-e-privacy.md](sicurezza-e-privacy.md)).

**Quando qualcosa non va**, in quest'ordine:

1. `docker compose ps`: chi non è `healthy`.
2. I log di Caddy, che dicono se la richiesta è arrivata e con che esito.
3. I log del backend, dove compare anche quale replica ha risposto.
4. Se le chiamate falliscono tutte insieme ma l'applicazione risponde, il
   sospetto è sui fornitori esterni (quote esaurite), non sul codice.

## Cosa manca

### Prima di avere utenti veri

- **Le quote dei fornitori.** Quaranta persone in chiamata sono quaranta stream
  simultanei per ciascun servizio. Se il piano ne concede dieci,
  l'applicazione funziona e il servizio no. È il rischio numero uno, e si
  chiude con una email, non con del codice.
- **Il costo al minuto**, misurato sui cruscotti dei tre fornitori con qualche
  chiamata vera, moltiplicato per i minuti che si pensa di vendere.
- **Il banco di prova almeno una volta**, per sapere quante chiamate regge
  davvero un processo invece di stimarlo.
- **`VOICE_STT_DEBUG=0` sul server**, perché stampa nei log quello che gli
  utenti dicono.
- **`DEV_ADMIN_LOGIN` spenta sul server.** Accesa, la coppia `admin` / `admin`
  entra come super admin saltando Cognito. Va spenta **dopo** aver creato un
  super admin vero e averlo provato, perché è anche l'unico che nasce da solo
  ([autenticazione.md](autenticazione.md)).

### Quando i numeri cresceranno

- **Aggiornamenti senza interrompere le chiamate**: togliere una replica dal
  giro, aspettare che le sue chiamate finiscano da sole, sostituirla, passare
  alla successiva.
- **La seconda macchina**, quando finiscono i core o la banda. Con l'audio non
  compresso il primo limite è la scheda di rete, attorno alle cinquecento
  chiamate contemporanee.
- **Audio compresso** fra browser e server, che taglierebbe la banda di circa
  dieci volte e sposterebbe quel tetto molto più in là.
- **Backup fuori dalla macchina**, che è l'unico modo perché siano backup
  davvero.
- **Un controllo esterno che avvisi se il sito non risponde.** Oggi, se cade, lo
  scopre il primo utente.
