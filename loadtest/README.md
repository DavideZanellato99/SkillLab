# Test di carico della pipeline vocale

Serve a rispondere a una domanda sola: **quante chiamate simultanee regge un
processo backend prima che la latenza diventi inaccettabile.**

Da quel numero discende tutto il resto del dimensionamento. Quanti processi
servono, quanto grossa deve essere la macchina, quando ne serve una seconda.
Finché quel numero non c'è, ogni scelta di infrastruttura è un'ipotesi.

## Perché i fornitori sono finti

Le domande sono due e vanno separate, altrimenti il risultato è ambiguo.

**Quante chiamate regge il mio processo** è una domanda sulla CPU del
backend. Si misura qui, con fornitori simulati, gratis e senza limiti
esterni.

**Quante sessioni mi concedono ElevenLabs, OpenAI e Cartesia** è una
domanda contrattuale. Non si misura con un test di carico: si legge nel
piano o si chiede al fornitore, e provare a scoprirlo saturandoli costa
soldi veri e rischia la sospensione dell'account.

Se si mescolano, un test che si ferma a trenta chiamate non dice se il
limite era il tuo codice o la quota di qualcun altro.

I tre finti fornitori riproducono quello che conta della controparte vera:

- **`mocks/stt.py`**, finto ElevenLabs Scribe. Decodifica davvero il base64
  e misura il picco dei campioni, quindi la VAD è vera e i turni li decide
  l'audio che il generatore manda. Legge `vad_silence_threshold_secs` dalla
  query string, cioè rispetta il valore che sta nel `.env` del backend.
- **`mocks/tts.py`**, finto Cartesia. Restituisce audio a tempo reale, 48000
  byte al secondo, e restituisce **rumore, non silenzio**: gli zeri li
  comprimerebbe la WebSocket e la banda misurata sarebbe dieci volte più
  bassa del vero.
- **`mocks/llm.py`**, finto OpenAI. Riproduce le due cose che contano, il
  tempo al primo token e il ritmo dei successivi, tenendo la connessione
  keep-alive come l'API vera.

## Prima di misurare

Tre preparativi, tutti obbligatori.

**Togli i print di diagnostica** in `backend/voice_pipeline.py`, la riga
`[STT-URL]` all'inizio di `run()` e il blocco `[STT-RAW]` dentro
`_stt_loop()`. Stampano su ogni evento della STT: a cinquanta chiamate
misureresti la scrittura su console. Sono marcati TEMP e vanno via comunque
prima della pubblicazione, perché stampano nei log le trascrizioni di quello
che gli utenti dicono.

**Usa un database di test.** Il giro crea conversazioni e messaggi veri.

**Lascia `VOICE_LATENCY_LOG` attivo** (è il default), perché le righe
`[LATENCY]` sono il metro di misura.

## Collegare il backend ai finti fornitori

Avvia i mock:

```bash
cd loadtest
docker compose up -d --build
```

Poi, nel `.env` del backend, punta i tre endpoint qui e riavvia:

```
ELEVENLABS_STT_WS_URL=ws://host.docker.internal:8801
CARTESIA_TTS_WS_URL=ws://host.docker.internal:8802
OPENAI_BASE_URL=http://host.docker.internal:8803/v1
```

Su Docker Desktop `host.docker.internal` funziona così com'è. Su Linux
aggiungi al servizio backend `extra_hosts: ["host.docker.internal:host-gateway"]`,
oppure metti direttamente l'indirizzo della macchina dove girano i mock.

Le chiavi API restano quelle che sono: i mock non le guardano, ma il backend
si rifiuta di partire se mancano.

**Il backend sotto misura deve girare con un processo solo.** È quello che
stai cronometrando.

## Il giro

Una rampa a gradini, sempre contro lo stesso processo:

| gradino | chiamate | durata |
|---------|----------|--------|
| baseline | 1 | 5 min |
| 1 | 5 | 5 min |
| 2 | 10 | 5 min |
| 3 | 20 | 5 min |
| 4 | 30 | 5 min |
| 5 | 40 | 5 min |
| 6 | 60 | 5 min |

Cinque minuti per gradino danno una sessantina di turni, abbastanza per una
statistica onesta. Ogni gradino in un log separato:

```bash
docker compose -f ../docker-compose.yml logs -f --no-color backend > gradino-20.log &

python generator.py \
  --base-url http://localhost:8000 \
  --email operatore@test.it --password '...' \
  --calls 20 --duration 300
```

E alla fine di ogni gradino:

```bash
python report.py gradino-20.log
```

Mentre gira, tieni aperto `docker stats` sul container del backend.

## Come si legge

Il gradino è **passato** se tutte e quattro reggono:

- **p95 di `commit->audio`** entro 200 o 300 ms dal valore della baseline.
  Guarda il p95, non la mediana: la mediana resta bella molto oltre il punto
  di rottura, è la coda che si alza per prima.
- **CPU del container sotto il 70% di un core.** La soglia non è il 100%: un
  event loop ha una coda sola, quando il core è davvero pieno gli eventi si
  accodano e la latenza cresce in modo non lineare. Il ginocchio della curva
  sta molto prima della saturazione nominale.
- **Nessun turno annullato** che non sia stato interrotto apposta, e nessun
  "nessuna risposta entro il timeout" nel riepilogo del generatore.
- **Memoria stabile.** Deve salire e assestarsi. Se cresce a ogni gradino e
  non torna giù quando le chiamate chiudono, hai trovato una perdita, che
  vale più del numero che stavi cercando.

Il **numero operativo** è l'ultimo gradino passato, meno il 30%. Il margine
non è pessimismo: in produzione le chiamate non arrivano a gradini ordinati,
arrivano a ondate quando un'aula intera comincia l'esercizio nello stesso
minuto.

Da lì è aritmetica. Trenta chiamate per processo significano dieci processi
per arrivare a trecento, più un paio di margine, che è il numero di core da
comprare.

## Se il generatore non tiene il ritmo

Il riepilogo del generatore stampa la percentuale di **frame in ritardo**.
Sopra l'uno per cento compare un avviso esplicito, e quel giro va buttato:
vuol dire che il collo di bottiglia era il generatore, non il backend.

Succede quando generatore, mock e backend girano tutti sulla stessa
macchina, che è comodo per la prova iniziale e sbagliato per la misura vera.
Cinquanta client Python che spingono audio a tempo reale costano più del
server. Con i numeri alti, generatore e mock vanno su macchine diverse dal
backend, e il generatore stesso conviene spezzarlo in più processi da venti
o trenta chiamate ciascuno.

## Il test con i fornitori veri

Molto più piccolo, e non sostituibile: tre o cinque chiamate concorrenti per
dieci minuti, contro gli endpoint veri (basta rimettere le URL originali nel
`.env`). Non serve per la capacità, serve per tre cose che i finti fornitori
non possono dire:

- **La latenza vera**, cioè il livello di qualità che stai promettendo. Il
  test coi mock dice quando peggiora, non da dove parte.
- **Il costo reale al minuto**, guardando i tre cruscotti prima e dopo.
  Moltiplicato per i minuti che prevedi di vendere, è il numero che decide
  se il servizio sta in piedi economicamente.
- **Una controprova sui volumi di dati**, per confermare che i byte al
  secondo dei mock somigliavano a quelli veri.
