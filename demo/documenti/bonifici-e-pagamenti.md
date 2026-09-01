# Procedura operativa: bonifici e ordini di pagamento

Edizione 4, in vigore dal 1 marzo 2026. Sostituisce l'edizione 3 del
settembre 2024. Destinatari: personale di filiale, contact center, back
office pagamenti, presidio antifrode.

## 1. Ambito e definizioni

La presente procedura disciplina l'accettazione, l'esecuzione, la revoca e la
contestazione degli ordini di pagamento disposti dalla clientela su conti
correnti accesi presso la Banca. Non disciplina gli incassi commerciali, gli
addebiti diretti SDD e i pagamenti con carta, trattati in procedure separate.

| Sigla | Significato | Nota operativa |
| --- | --- | --- |
| SCT | SEPA Credit Transfer, il bonifico ordinario in euro nell'area SEPA | Regolamento in giornata contabile |
| SCT Inst | SEPA Instant Credit Transfer, il bonifico istantaneo | Accredito entro 10 secondi, 24 ore su 24 |
| BIR | Bonifico di importo rilevante, oltre 250.000 euro | Richiede autorizzazione di secondo livello |
| IBAN | Coordinata bancaria internazionale, 27 caratteri per l'Italia | I primi due sono il codice paese |
| BIC | Codice identificativo della banca destinataria, 8 o 11 caratteri | Obbligatorio solo fuori area SEPA |
| VoP | Verification of Payee, la verifica di corrispondenza fra IBAN e beneficiario | Obbligatoria dal 9 ottobre 2025 |
| TRN | Riferimento univoco dell'operazione assegnato dalla banca ordinante | Serve per ogni indagine successiva |

L'area SEPA comprende i 27 paesi dell'Unione Europea più Islanda,
Liechtenstein, Norvegia, Svizzera, Monaco, San Marino, Andorra, Città del
Vaticano e Regno Unito. Un pagamento in euro verso un paese dell'area segue
le regole SCT anche quando il conto del beneficiario è acceso presso una
banca situata fuori dall'Unione ma aderente allo schema.

## 2. Canali dispositivi e limiti operativi

Ogni canale ha un proprio limite giornaliero cumulato, calcolato sulla somma
degli ordini disposti dallo stesso codice cliente nella giornata solare, e un
proprio livello autorizzativo.

| Canale | Limite giornaliero per cliente | Autorizzazione richiesta oltre il limite |
| --- | --- | --- |
| Internet banking privati | 25.000 euro | Chiamata di conferma del contact center |
| App mobile privati | 10.000 euro | Elevazione temporanea da internet banking |
| Internet banking imprese | 150.000 euro | Doppia firma digitale di due delegati |
| Filiale, disposizione allo sportello | 250.000 euro | Visto del direttore di filiale |
| Filiale, importo rilevante | Nessun limite di canale | Visto del direttore e nulla osta del back office |
| Contact center | 5.000 euro | Non elevabile, il cliente viene indirizzato in filiale |

Il limite dell'app mobile può essere elevato dal cliente fino a 25.000 euro
per una singola giornata, agendo dall'internet banking e confermando con
autenticazione forte. L'elevazione decade automaticamente alle 24 dello
stesso giorno e non è ripetibile per più di tre giornate nello stesso mese.

I bonifici istantanei hanno un limite proprio, indipendente da quello del
canale, pari a 15.000 euro per singola operazione per i privati e 100.000
euro per le imprese. Il limite per singola operazione non è elevabile: un
importo superiore si dispone come bonifico ordinario.

## 3. Esecuzione di un bonifico allo sportello

L'operatore segue i passi nell'ordine indicato. Saltare un passo o invertirne
due è un rilievo formale in sede di controllo di secondo livello.

1. Identificare il cliente con un documento di riconoscimento in corso di
   validità e verificarne la corrispondenza con l'anagrafe presente a sistema.
2. Verificare che il disponente sia il titolare del conto o un delegato con
   poteri di firma non revocati.
3. Acquisire l'ordine sul modulo, completo di IBAN del beneficiario,
   denominazione esatta del beneficiario, importo, causale e data di
   esecuzione richiesta.
4. Eseguire il controllo di validità formale dell'IBAN, che il sistema svolge
   in automatico sul carattere di controllo, e la verifica VoP sul nome del
   beneficiario.
5. Verificare la capienza del conto, comprendendo l'eventuale fido accordato
   e le disposizioni già in coda per la stessa giornata.
6. Applicare i controlli antiriciclaggio previsti al capitolo 8, con
   particolare attenzione alle operazioni frazionate.
7. Acquisire la firma del cliente sul modulo e la conferma della lettura delle
   condizioni economiche applicate.
8. Confermare a sistema l'ordine, verificando che l'importo digitato coincida
   con quello scritto sul modulo.
9. Consegnare al cliente la contabile con il TRN, che è l'unico riferimento
   utile per ogni richiesta successiva.
10. Archiviare il modulo firmato nel fascicolo giornaliero, che il back office
    ritira entro il primo giorno lavorativo successivo.

Il controllo sul beneficiario non si esegue mai dopo la verifica di capienza:
la verifica VoP può restituire una mancata corrispondenza che chiude
l'operazione, e in quel caso il controllo di capienza sarebbe lavoro speso su
un ordine che non partirà.

## 4. La verifica del beneficiario

Dal 9 ottobre 2025 ogni bonifico in euro disposto verso un conto dell'area
SEPA passa dal servizio di verifica del beneficiario. Il sistema confronta il
nome digitato dal disponente con l'intestazione del conto di destinazione e
restituisce uno di quattro esiti.

| Esito | Significato | Comportamento dell'operatore |
| --- | --- | --- |
| Corrispondenza | Nome e IBAN coincidono | Prosegue senza avvisi |
| Corrispondenza parziale | Il nome differisce per forma ma non per sostanza | Mostra al cliente il nome corretto e chiede conferma esplicita |
| Nessuna corrispondenza | Il nome non appartiene al titolare dell'IBAN | Sospende l'operazione e avverte il cliente per iscritto |
| Verifica non disponibile | La banca destinataria non ha risposto entro il tempo massimo | Informa il cliente che la verifica non è stata possibile |

L'esito negativo non blocca in assoluto l'ordine: il cliente può chiedere di
procedere lo stesso, e in quel caso l'operatore raccoglie la sua conferma
scritta sul modulo, con la formula predisposta. La conferma sposta sul cliente
la responsabilità dell'eventuale accredito a un soggetto diverso da quello
atteso, e per questo non può essere raccolta a voce.

La verifica non si applica ai bonifici verso paesi fuori area SEPA, ai
pagamenti in divisa diversa dall'euro e ai giroconti fra rapporti dello stesso
intestatario accesi presso la Banca.

## 5. Tempi di esecuzione e valute

La data valuta di addebito è il giorno in cui le somme escono dalla
disponibilità dell'ordinante ai fini del calcolo degli interessi. La data di
esecuzione è il giorno in cui la Banca trasmette l'ordine.

| Tipologia | Cut off | Esecuzione | Valuta di addebito | Accredito al beneficiario |
| --- | --- | --- | --- | --- |
| SCT ordinario disposto entro il cut off | 16:30 | Stessa giornata lavorativa | Giorno di esecuzione | Giorno lavorativo successivo |
| SCT ordinario disposto oltre il cut off | 16:30 | Primo giorno lavorativo successivo | Giorno di esecuzione | Secondo giorno lavorativo |
| SCT Inst | Nessuno | Immediata | Momento dell'ordine | Entro 10 secondi |
| Bonifico con data futura | 16:30 del giorno indicato | Giorno indicato | Giorno indicato | Giorno lavorativo successivo |
| Bonifico estero in divisa | 14:00 | Stessa giornata | Giorno di esecuzione | Da 1 a 4 giorni lavorativi |

Sono giorni lavorativi tutti i giorni dal lunedì al venerdì con esclusione
delle festività nazionali e delle due giornate di chiusura del sistema di
regolamento, il 25 dicembre e il 1 gennaio. Il sabato non è giorno lavorativo
ai fini dell'esecuzione, mentre lo è per i bonifici istantanei, che non
conoscono calendario.

Un ordine con data futura si può revocare fino alle 16:00 del giorno
precedente quello di esecuzione, agendo dallo stesso canale da cui è stato
disposto. Oltre quel termine l'ordine entra nel ciclo di lavorazione e segue
le regole del capitolo 7.

## 6. Condizioni economiche

| Operazione | Commissione | Nota |
| --- | --- | --- |
| SCT da internet banking o app | Gratuito | Anche per i conti base |
| SCT allo sportello | 3,50 euro | Ridotta a 1,50 euro per i titolari over 75 |
| SCT Inst da qualunque canale | 0,50 euro | Non può superare quella dell'ordinario |
| Bonifico estero in euro area SEPA | Come SCT | Ripartizione spese sempre SHA |
| Bonifico estero in divisa fino a 50.000 euro | 12,00 euro | Più eventuali spese della banca corrispondente |
| Bonifico estero in divisa oltre 50.000 euro | 0,15 per mille, minimo 25 euro | Massimo 250 euro |
| Revoca di un ordine non ancora eseguito | Gratuito | |
| Richiamo di un ordine già eseguito | 15,00 euro | Addebitata anche se il richiamo non va a buon fine |
| Indagine su bonifico non pervenuto | 20,00 euro | Non dovuta se l'errore è della Banca |

La ripartizione delle spese sui bonifici diretti fuori dall'area SEPA si
indica con tre sigle. SHA significa che l'ordinante paga le spese della
propria banca e il beneficiario quelle della banca ricevente, ed è la sola
ammessa all'interno dell'area SEPA. OUR significa che tutte le spese sono a
carico dell'ordinante. BEN significa che tutte le spese sono a carico del
beneficiario e vengono trattenute dall'importo accreditato.

## 7. Revoca, richiamo e rettifica

La revoca riguarda un ordine non ancora eseguito, il richiamo un ordine già
trasmesso. Sono due strumenti diversi con esiti diversi, e la differenza va
spiegata al cliente prima di raccogliere la richiesta.

Un bonifico istantaneo non è mai revocabile. È definitivo dal momento in cui
il sistema restituisce l'esito positivo, e questo va detto al cliente prima
della conferma, non dopo la telefonata in cui si accorge dell'errore.

Il richiamo di un bonifico eseguito segue questi passi.

1. Raccogliere dal cliente la richiesta scritta di richiamo, con il TRN, la
   data dell'ordine, l'importo e il motivo, scegliendo fra errore
   dell'ordinante, duplicazione dell'ordine e sospetto di frode.
2. Aprire la pratica a sistema entro la giornata lavorativa in cui la
   richiesta è pervenuta.
3. Il back office pagamenti trasmette la richiesta di richiamo alla banca del
   beneficiario entro il giorno lavorativo successivo.
4. La banca del beneficiario contatta il proprio cliente e chiede il consenso
   alla restituzione, che non è tenuta a concedere.
5. L'esito arriva entro 15 giorni lavorativi, e il back office lo comunica al
   cliente entro due giorni dal ricevimento.
6. In caso di esito positivo le somme rientrano con valuta pari al giorno di
   riaccredito, non al giorno dell'ordine originario.
7. In caso di esito negativo, e solo se il motivo dichiarato è il sospetto di
   frode, il back office fornisce al cliente i dati del beneficiario che la
   banca ricevente ha acconsentito a comunicare, per l'eventuale azione
   legale.

La rettifica è cosa diversa da entrambe: riguarda un ordine eseguito con dati
esatti ma imputato al rapporto sbagliato per errore della Banca, e si esegue
d'ufficio, senza richiesta del cliente e senza spese, ripristinando le valute
originarie.

## 8. Presidi antiriciclaggio

L'adeguata verifica ordinaria si applica a tutti i rapporti continuativi. Sui
singoli ordini valgono in aggiunta queste soglie.

| Soglia | Adempimento |
| --- | --- |
| 5.000 euro in contanti versati e girati nella stessa giornata | Segnalazione al referente antiriciclaggio |
| 5.000 euro su cliente occasionale | Adeguata verifica completa prima dell'esecuzione |
| 15.000 euro | Acquisizione della dichiarazione sull'origine dei fondi |
| 15.000 euro cumulati in sette giorni con operazioni singolarmente inferiori | Valutazione di operazione frazionata |
| 250.000 euro | Autorizzazione di secondo livello e verifica rafforzata |
| Qualunque importo verso paesi ad alto rischio | Verifica rafforzata e nulla osta della funzione antiriciclaggio |

L'operazione frazionata è quella scomposta in più ordini di importo unitario
inferiore alla soglia allo scopo di non superarla. A rilevarla non è
l'importo del singolo ordine ma il comportamento complessivo: sette bonifici
da 2.400 euro nello stesso giorno verso beneficiari diversi ma collegati sono
un caso da valutare, tre bonifici da 2.400 euro in tre mesi verso lo stesso
fornitore non lo sono.

La segnalazione di operazione sospetta si trasmette alla funzione
antiriciclaggio senza ritardo e comunque prima dell'esecuzione, quando è
possibile sospenderla senza ostacolare le indagini. Al cliente non si
comunica mai che una segnalazione è stata inoltrata: il divieto di
comunicazione è previsto dalla norma e la sua violazione è sanzionata
personalmente.

## 9. Presidio antifrode

Il sistema antifrode assegna a ogni ordine un punteggio di rischio e può
sospendere l'esecuzione in attesa di conferma. La sospensione dura al massimo
due ore lavorative, oltre le quali l'ordine viene rilasciato o annullato.

Gli indicatori che alzano il punteggio sono il primo bonifico verso un
beneficiario mai usato, un importo superiore di cinque volte alla media del
cliente, la disposizione da un dispositivo mai censito, la modifica del
numero di telefono nelle 24 ore precedenti e la disposizione in orario
notturno su un cliente che non ha mai operato di notte.

Quando l'antifrode sospende un ordine, il contact center chiama il cliente al
numero censito in anagrafe, mai a un numero fornito nella stessa sessione, e
pone almeno due domande di controllo che non riguardino dati presenti sulla
carta o sull'estratto conto. La conferma raccolta con una richiamata a un
numero indicato dal presunto cliente non ha alcun valore.

Al cliente che dichiara di essere stato vittima di truffa si applica la
seguente sequenza.

1. Bloccare immediatamente le credenziali di accesso a tutti i canali.
2. Bloccare le carte collegate al rapporto.
3. Verificare se l'ordine contestato è ancora richiamabile e, in caso
   affermativo, avviare il richiamo nella stessa telefonata.
4. Raccogliere la contestazione scritta, che il cliente può inviare anche
   dalla propria area riservata.
5. Invitare il cliente a sporgere denuncia e a trasmetterne copia entro 30
   giorni.
6. Aprire la pratica di rimborso e trasmetterla all'ufficio frodi.

## 10. Reclami e competenze

| Casistica | Ufficio competente | Termine di risposta |
| --- | --- | --- |
| Bonifico non pervenuto al beneficiario | Back office pagamenti | 15 giorni lavorativi |
| Commissione applicata in misura errata | Ufficio condizioni | 30 giorni |
| Operazione non autorizzata dal cliente | Ufficio frodi | 15 giorni lavorativi |
| Richiamo per errore dell'ordinante | Back office pagamenti | 15 giorni lavorativi |
| Mancata esecuzione per blocco antifrode | Presidio antifrode | 2 giorni lavorativi |
| Reclamo formale scritto | Ufficio reclami | 60 giorni |
| Segnalazione di operazione sospetta | Funzione antiriciclaggio | Nessun riscontro al cliente |

Sull'operazione di pagamento non autorizzata la Banca rimborsa il cliente
entro la fine del giorno lavorativo successivo alla contestazione, salvo il
caso in cui abbia un fondato sospetto di frode del cliente stesso, che deve
comunicare per iscritto motivandolo. La franchigia di 50 euro a carico del
cliente non si applica quando l'operazione è stata resa possibile da una
carenza dei presidi della Banca, né quando il cliente non era in condizione
di accorgersi della sottrazione dello strumento.

Il cliente che non riceve risposta nei termini o non è soddisfatto può
rivolgersi all'Arbitro Bancario Finanziario entro 12 mesi dal reclamo, dopo
avere atteso i 60 giorni previsti.
