# SkillLab e il GDPR

Descrizione tecnica di come SkillLab tratta i dati personali, ricavata dal
codice e non da un questionario. Serve a tre cose:

- al legale, come base per la DPIA e per il contratto con i clienti;
- alle organizzazioni clienti, che sono titolari del trattamento e devono
  scrivere l'informativa ai propri dipendenti partendo da qui;
- a me, per non dover ricostruire ogni volta dove sta cosa.

Ogni affermazione rimanda al file che la implementa. Se il codice cambia e
questo documento no, vince il codice: va aggiornato.

Ultimo allineamento al codice: 29 luglio 2026.

---

## 1. Ruoli

SkillLab è una piattaforma multi tenant: ogni organizzazione cliente ha i
propri utenti, i propri avatar e le proprie conversazioni, isolati da quelli
di ogni altra (`models.Organization`, e il filtro per tenant in ogni
endpoint).

| Soggetto | Ruolo |
| --- | --- |
| L'organizzazione cliente | **Titolare del trattamento**: decide di far allenare i propri dipendenti e di leggerne le valutazioni |
| SkillLab | **Responsabile del trattamento** ex art. 28: tratta i dati per conto del cliente e secondo le sue istruzioni |
| OpenAI, ElevenLabs, Cartesia, AWS | **Sub responsabili** (vedi sezione 6) |
| Il dipendente che si allena | **Interessato** |

Conseguenza pratica: **l'informativa ai dipendenti la deve dare il datore di
lavoro, non SkillLab**. Il compito di SkillLab è fornirgli le informazioni di
questo documento e firmare l'accordo art. 28.

## 2. Quali dati personali tratta l'applicazione

| Categoria | Dove | Origine |
| --- | --- | --- |
| Email | `users.email` | Inserita dall'amministratore che crea l'account |
| Nome e cognome | `users.nome`, `users.cognome` | Inseriti dall'amministratore o dall'utente stesso |
| Identificativo di autenticazione | `users.cognito_sub` | Generato da AWS Cognito |
| Ruolo, stato, organizzazione, ultimo accesso | `users.*` | Generati dall'applicazione |
| **Registrazione audio della chiamata** | `conversation_recordings.audio` | Registrata dal browser durante la telefonata simulata |
| **Trascrizione della conversazione** | `chat_messages.content` | Prodotta dallo speech to text, oppure digitata in modalità chat |
| **Valutazione automatica della prestazione** | `conversation_evaluations.result`, `.overall_score` | Generata da un modello linguistico |
| Revisione umana e annotazioni del formatore | `conversation_reviews`, `message_annotations` | Scritte da un formatore |
| Obiettivi di formazione assegnati | `training_assignments` | Assegnati da un amministratore |
| Indirizzo IP e User-Agent | `token_session`, `audit_logs` | Raccolti a ogni accesso e a ogni azione |
| Registro delle azioni compiute | `audit_logs` | Scritto dal middleware a ogni richiesta che modifica qualcosa |
| Email di chi ha creato o modificato una riga | `users`, `organizations`, `avatars`: `created_by_email`, `updated_by_email` | Scritta a ogni salvataggio insieme all'id dell'autore (`backend/authorship.py`) |

Due precisazioni che contano.

**La registrazione contiene una sola persona.** Il file audio è il mix della
voce dell'operatore e della voce sintetica dell'avatar
(`frontend/src/services/voiceCall.ts`). L'avatar non è una persona: non
esiste un secondo interessato nella chiamata.

**La voce non è un dato biometrico ai sensi dell'art. 9.** Lo diventerebbe se
venisse usata per identificare univocamente qualcuno. SkillLab non lo fa e
non deve iniziare a farlo senza rifare la valutazione dei rischi: nessun
riconoscimento del parlante, nessuna impronta vocale.

## 3. Finalità e base giuridica

Unica finalità: **addestramento e valutazione delle capacità comunicative**
del personale dell'organizzazione cliente, tramite simulazioni di
conversazione con un interlocutore artificiale.

La base giuridica la individua il titolare, cioè il cliente. Per i dipendenti
**il consenso non è una base valida**: il rapporto di lavoro è per
definizione squilibrato e un consenso raccolto lì non è libero. Le strade
percorribili sono l'esecuzione del rapporto contrattuale o il legittimo
interesse del datore di lavoro, entrambe da documentare.

## 4. La valutazione automatizzata (art. 22)

È il trattamento più delicato del sistema, e va descritto con precisione
nell'informativa del cliente.

**Come funziona.** A fine conversazione la trascrizione integrale viene
inviata a un modello linguistico di OpenAI, che assegna un punteggio da 1 a
10 su sei criteri, con un peso ciascuno
(`backend/openai_service.py`, `EVALUATION_CRITERIA`):

| Criterio | Peso |
| --- | --- |
| Corretta identificazione del cliente | 22 |
| Comprensione della casistica e risposte pertinenti | 22 |
| Rispetto delle fasi della chiamata | 18 |
| Empatia e gestione dello stato d'animo del cliente | 15 |
| Sicurezza, competenza e autorevolezza | 13 |
| Appropriatezza di linguaggio, cortesia e professionalità | 10 |

Il punteggio complessivo è la media pesata. Sotto 8 il modello produce anche
suggerimenti di miglioramento, e può citare fino a tre messaggi della
trascrizione a supporto di ogni criterio.

**Cosa NON riceve il modello.** Nella richiesta non compaiono né nome né
email né alcun identificativo dell'operatore: la trascrizione è etichettata
solo come "OPERATORE" e "CLIENTE". La valutazione è quindi pseudonima verso
il fornitore, mentre in SkillLab resta associata alla persona.

**Chi la vede.** L'interessato stesso, e gli amministratori della sua
organizzazione. Un amministratore non vede mai fuori dal proprio tenant.

**Intervento umano.** Un formatore può correggere il voto assegnando un
`override_score` con la motivazione obbligatoria, e la correzione diventa il
voto ufficiale ovunque: report, obiettivi, dashboard, export
(`backend/reviews.py`, `final_score`). Viene conservato anche il punteggio
che l'AI aveva dato al momento della revisione, così una correzione resta
leggibile anche se la valutazione viene rigenerata dopo.

Il meccanismo tecnico esiste. **Perché soddisfi l'art. 22 il cliente deve
garantirlo come procedura**, non solo come possibilità offerta dal software.

## 5. Il monitoraggio dei lavoratori (Italia)

Uno strumento che registra, trascrive e valuta la prestazione di un
dipendente consente il controllo a distanza dell'attività lavorativa. In
Italia questo ricade nell'**art. 4 della legge 300/1970**: il datore di
lavoro deve avere un accordo sindacale o un'autorizzazione dell'Ispettorato
del Lavoro prima di usarlo.

È un adempimento del cliente, non di SkillLab, ma va richiamato nel contratto
perché senza di esso il cliente non può usare legittimamente la piattaforma.

Per gli stessi motivi (valutazione sistematica di aspetti personali,
monitoraggio sistematico, dati trattati su larga scala) la **DPIA ex art. 35
è obbligatoria** e va completata prima della messa in produzione.

## 6. Destinatari e trasferimenti extra UE

| Fornitore | Cosa riceve | Quando |
| --- | --- | --- |
| **ElevenLabs** | L'audio del microfono dell'operatore, in streaming | Durante ogni telefonata simulata |
| **OpenAI** | Il testo della conversazione (entrambe le parti) e la scheda dell'avatar, senza identità dell'operatore | Ad ogni battuta, e a fine chiamata per la valutazione |
| **Cartesia** | Il testo generato dell'avatar, per sintetizzarlo in voce | Durante ogni telefonata simulata |
| **AWS Cognito** | Solo l'indirizzo email, più la password gestita da Cognito | Alla creazione dell'account e a ogni accesso |

Nome e cognome non escono mai dall'infrastruttura di SkillLab: restano nella
tabella `users` (`backend/cognito_service.py`, `admin_create_user` invia solo
l'attributo `email`).

Sono tutti fornitori statunitensi. Per ciascuno vanno verificate e
documentate: adesione al Data Privacy Framework oppure clausole contrattuali
standard, e soprattutto **la non conservazione dei dati e l'esclusione
dall'addestramento dei modelli**. Un fornitore che si addestrasse sulla voce
o sulle trascrizioni dei dipendenti dei clienti renderebbe il trattamento
indifendibile.

## 7. Tempi di conservazione

Sono configurati in `backend/.env` e applicati automaticamente. **I valori
qui sotto devono coincidere con quelli dichiarati nell'informativa del
cliente**: se si cambiano lì vanno cambiati anche nell'informativa.

| Dato | Finestra attuale | Variabile |
| --- | --- | --- |
| Registrazione audio della chiamata | 90 giorni | `AUDIO_RECORDING_RETENTION_DAYS` |
| Conversazione intera: messaggi, valutazione, revisione, annotazioni | 730 giorni | `CONVERSATION_RETENTION_DAYS` |
| Registro delle azioni (con IP e User-Agent) | 180 giorni | `AUDIT_LOG_RETENTION_DAYS` |
| Sessioni di accesso (IP e User-Agent) | Alla scadenza del token: 1 ora, 30 giorni per l'ancora di sessione | non configurabile |

L'audio scade per primo di proposito: è il dato più invasivo e dopo il
debrief non aggiunge nulla alla trascrizione. La conversazione gli
sopravvive, quindi restano trascrizione, valutazione e note del formatore
mentre la voce sparisce.

**L'orologio parte dall'ultimo utilizzo, non dalla creazione**: il riaggancio
per una telefonata, l'ultima attività per una chat scritta
(`backend/retention.py`).

**Come vengono applicati.** Un ciclo interno all'applicazione
(`backend/housekeeping.py`) esegue i purge ogni 24 ore, a partire dall'avvio.
Non serve nessun cron sull'host e non serve riavviare niente: un'installazione
accesa per mesi applica comunque le finestre. La cancellazione è definitiva,
non logica.

## 8. Diritti degli interessati

| Diritto | Come è soddisfatto |
| --- | --- |
| **Accesso e portabilità** (art. 15, 20) | L'utente scarica da solo un archivio ZIP dalla pagina Profilo: JSON strutturato con profilo, trascrizioni integrali, valutazioni, revisioni, obiettivi, accessi e registro attività, più le registrazioni audio come file riproducibili (`backend/personal_data.py`) |
| **Cancellazione** (art. 17) | Un amministratore elimina l'account: spariscono conversazioni, messaggi, valutazioni, revisioni, annotazioni, registrazioni, sessioni, selezioni e obiettivi, e l'utenza viene rimossa anche da Cognito (`backend/erasure.py`) |
| **Rettifica** (art. 16) | L'utente modifica da solo nome e cognome; l'email la cambia un amministratore |
| **Intervento umano** (art. 22) | Correzione del voto da parte di un formatore, firmata e motivata (sezione 4) |
| **Opposizione, limitazione** | Da gestire contrattualmente con il titolare: non esistono nel software |

**Cosa sopravvive deliberatamente a una cancellazione**, e va dichiarato
nell'informativa:

- le righe del registro attività perdono il collegamento all'utente ma
  conservano l'email come testo, perché un registro che dimentica chi ha
  agito smette di essere un registro. Scadono comunque a 180 giorni;
- il nome del formatore sulle revisioni che ha scritto per **altre persone**
  resta, perché fa parte del voto di qualcun altro, che ha diritto di sapere
  chi lo ha firmato.

Nessuna delle due conserva voce, trascrizioni o IP della persona cancellata.

**Cosa invece non sopravvive.** La firma che l'account ha lasciato sulle
righe che ha creato o modificato (utenti, organizzazioni, avatar) viene
anonimizzata insieme all'account: l'id sparisce e l'email diventa l'etichetta
"utente eliminato". Un avatar non è un registro e non è il voto di nessuno,
quindi non c'è motivo per cui debba continuare a portare il nome di chi ha
chiesto di essere cancellato.

## 9. Trasparenza verso l'interessato

Prima che si apra il microfono, alla prima chiamata, compare un avviso
bloccante che dichiara le tre cose separatamente: la voce viene registrata,
la conversazione viene trascritta, un sistema di AI valuta la prestazione e
assegna un punteggio che i formatori leggono
(`frontend/src/components/RecordingNoticeModal.tsx`).

Non è una raccolta di consenso e il pulsante non dice "Accetto": per un
dipendente il consenso non sarebbe valido. Chi non vuole procedere annulla.

Dopo la prima volta l'avviso non si ripete, ma restano una riga fissa sotto
il pulsante di chiamata e un indicatore "Registrazione in corso" che compare
durante la telefonata, quando la registrazione sta effettivamente avvenendo.

**Cookie.** L'applicazione usa due soli cookie, entrambi tecnici di sessione,
`HttpOnly` `Secure` `SameSite=Lax`, e nessuno script di terze parti né
strumento di analisi. **Non serve il banner cookie**, basta la menzione
nell'informativa. Aggiungere analytics o widget esterni cambierebbe questa
conclusione.

## 10. Misure di sicurezza (art. 32)

**Autenticazione e sessioni**
- Identità gestite da AWS Cognito, password mai in transito verso SkillLab
  se non per l'inoltro all'autenticazione.
- Token trasportati solo in cookie `HttpOnly` `Secure` `SameSite=Lax`:
  JavaScript non può leggerli. Accesso 1 ora, aggiornamento 30 giorni, con il
  cookie di refresh limitato al percorso `/api/auth`.
- Ogni token è legato a IP e User-Agent di chi lo ha ottenuto: se il cookie
  cambia contesto la sessione viene invalidata subito
  (`backend/token_sessions.py`).
- Logout effettivo lato server tramite lista di revoca dei token
  (`backend/token_denylist.py`).
- Protezione dagli attacchi a forza bruta: 5 tentativi falliti per email e
  10 per indirizzo IP in 15 minuti.
- Un account sospeso o disabilitato, o appartenente a un'organizzazione
  sospesa, viene bloccato a ogni richiesta, non solo al login.

**Isolamento e accessi**
- Separazione rigida per organizzazione su ogni endpoint: un amministratore
  non vede mai dati di un altro tenant.
- La scheda persona degli avatar (obiettivi nascosti, segreti dello scenario)
  non è mai esposta dalle API, e c'è un test che verifica che non finisca
  nemmeno nell'export dei dati personali.
- Il registro delle azioni è leggibile solo dal super amministratore, e
  nessun endpoint può cancellarne righe: le rimuove solo la scadenza.

**Infrastruttura**
- Container applicativo eseguito da utente non privilegiato, con
  `no-new-privileges` su tutti i servizi.
- In produzione nessuna porta pubblicata oltre a quella del frontend, e solo
  su `127.0.0.1`: database e API non sono raggiungibili dall'esterno.
- Credenziali del database obbligatorie da ambiente, nessun valore di
  default nel repository.
- Segreti esclusi dall'immagine Docker (`backend/.dockerignore`).
- Scansioni automatiche settimanali su dipendenze e codice
  (`.github/workflows/security.yml`).

## 11. Cosa non fa l'applicazione

Restano a carico di chi installa, e vanno dichiarati come misure del
titolare (dettagli nella sezione Deploy del README):

- **TLS.** L'applicazione non termina HTTPS, lo deve fare un reverse proxy
  davanti. Non è facoltativo: i cookie sono `Secure`.
- **Cifratura del disco.** Le registrazioni audio stanno nel volume del
  database in chiaro. Il volume, o il disco che lo ospita, va cifrato a
  livello di sistema. Vale anche per i backup.
- **Backup.** Non ne esistono. Quando verranno fatti dovranno rispettare le
  stesse finestre di conservazione, altrimenti ricreano il problema che la
  cancellazione automatica risolve.

## 12. Adempimenti ancora aperti

**A carico di SkillLab**

- [ ] DPIA ex art. 35, prima della messa in produzione
- [ ] Registro dei trattamenti ex art. 30, come responsabile
- [ ] Accordo art. 28 da allegare al contratto con ogni organizzazione, con
      l'elenco dei sub responsabili della sezione 6
- [ ] Verifica documentale su ciascun fornitore extra UE: DPF o clausole
      standard, non conservazione, esclusione dall'addestramento
- [ ] Valutazione sulla nomina del DPO
- [ ] Pagine informativa e termini nel prodotto, con i link da landing,
      accesso e piè di pagina
- [ ] Da valutare: troncamento dell'ultimo ottetto degli IP nel registro
      attività dopo un periodo più breve dei 180 giorni

**A carico dell'organizzazione cliente**

- [ ] Informativa ai propri dipendenti, costruita su questo documento
- [ ] Individuazione e documentazione della base giuridica
- [ ] Accordo sindacale o autorizzazione dell'Ispettorato ex art. 4 legge
      300/1970
- [ ] Procedura interna che garantisca l'intervento umano sulle valutazioni
