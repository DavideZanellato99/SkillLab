# I dati e lo schema

Le tabelle, come lo schema si aggiorna da solo, e le due convenzioni che
valgono su tutte le righe. Tutto in
[backend/models.py](../backend/models.py).

## Le tabelle

**Chi usa la piattaforma**

| Tabella         | Cosa contiene                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations` | I tenant. Nome, slug, stato, motivo della sospensione                                                                                                 |
| `roles`         | I tre ruoli, creati all'avvio se mancano                                                                                                              |
| `users`         | L'account, legato all'identità Cognito da `cognito_sub`. Ultimo accesso e ultima attività sono due colonne diverse e rispondono a due domande diverse |

**Le sessioni**

| Tabella          | Cosa contiene                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token_session`  | Il contesto (IP e User-Agent) per cui un token è stato emesso                                                                                                                                  |
| `revoked_jti`    | I token uccisi prima della scadenza: logout, binding violato                                                                                                                                   |
| `login_attempts` | Gli eventi contati a finestra scorrevole: i tentativi di accesso falliti e, con uno `scope` che comincia per `llm-`, le chiamate al modello fatte da una persona. Tiene il nome con cui è nata |
| `voice_sessions` | Una chiamata autorizzata e non ancora aperta, con la sua copia della storia                                                                                                                    |

**Le conversazioni**

| Tabella                    | Cosa contiene                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `chat_conversations`       | Una conversazione, col suo canale (`voice` o `text`) fissato alla nascita                  |
| `chat_messages`            | I turni, in ordine di `created_at`                                                         |
| `conversation_recordings`  | L'audio della chiamata. La colonna del blob è `deferred`: non si legge se non la si chiede |
| `conversation_evaluations` | Il giudizio dell'AI, col JSON dei sei criteri                                              |
| `conversation_reviews`     | La revisione del docente sopra quel giudizio                                               |
| `message_annotations`      | Le note del docente appuntate su singoli messaggi                                          |

**Il resto**

| Tabella                                                                                     | Cosa contiene                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `avatars`                                                                                   | La persona simulata, con la sua scheda in `profile`                                                                                                                                                                                                        |
| `avatar_categories`                                                                         | Come un'organizzazione raggruppa i propri avatar: nome e colore. Vedi [avatar-e-persona.md](avatar-e-persona.md)                                                                                                                                           |
| `training_paths`, `training_path_steps`, `training_path_assignments`                        | I percorsi a tappe, descritti in [training-e-report.md](training-e-report.md)                                                                                                                                                                              |
| `notification_reads`                                                                        | L'unica cosa che si salva delle notifiche: cosa è già stato letto                                                                                                                                                                                          |
| `technical_simulations`, `simulation_chunks`, `simulation_questions`, `simulation_attempts` | Il simulatore tecnico, descritto in [simulatore.md](simulatore.md). Sulla prima stanno anche l'esito dell'ultimo controllo del serbatoio e l'impronta delle domande su cui è girato                                                                        |
| `user_debriefings`                                                                          | I quadri d'insieme su una persona, una riga per ogni volta che ne è stato chiesto uno, ciascuna con la fotografia delle prove che il modello aveva letto e con come si è mossa rispetto alla precedente. Vedi [training-e-report.md](training-e-report.md) |
| `audit_logs`                                                                                | Il registro delle azioni                                                                                                                                                                                                                                   |

## Due convenzioni che valgono ovunque

**Le date sono UTC senza fuso.** Ogni colonna `DateTime` è naive e ci si scrive
`datetime.now(UTC)` con il fuso tolto. Un valore che arriva da fuori con un
offset (la scadenza di un obiettivo, per dire) va convertito prima, altrimenti
ogni confronto solleva un'eccezione. Perfino il default lato database è scritto
come `(now() AT TIME ZONE 'utc')` e non `now()`: un server con un fuso diverso
scriverebbe ore che non si possono confrontare con le altre.

**Le chiavi primarie sono UUID**, generati dall'applicazione. Un id che non si
può indovinare e che non rivela quante righe esistono.

## La paternità delle righe

Sette tabelle (`users`, `organizations`, `avatars`, `avatar_categories`,
`technical_simulations`, `training_paths`, `user_debriefings`) portano sei
colonne: quando è stata creata la riga, da chi, con quale email, e le tre
gemelle della modifica.

L'ultima è l'unica in cui la paternità e il soggetto sono **due persone
diverse**: un debriefing parla di chi si allena e lo ha fatto scrivere chi
insegna, quindi verso `users` partono tre colonne e la relazione deve
dichiarare quale delle tre sia il soggetto.

A riempirle **non è l'endpoint**, ma un listener sul flush della sessione
([backend/authorship.py](../backend/authorship.py)). Qualunque strada porti
alla scrittura, l'API di amministrazione, un backfill, un lavoro periodico, la
riga esce con l'autore addosso. Un endpoint che si dimentica di valorizzarle
non può esistere, perché non c'è niente da ricordarsi di scrivere.

L'autore è l'utente autenticato della richiesta, pubblicato da
`get_current_user` e portato dentro il flush da una `ContextVar`. Fuori da una
richiesta HTTP l'autore non c'è: `created_by` resta NULL e l'email dice
`sistema`, che è la verità e si legge senza doverla indovinare da un campo
vuoto.

**Le colonne escono solo dalle risposte dell'amministrazione.** Ogni entità ha
due schemi: quello che legge chi la usa e quello che legge chi la amministra,
e la paternità sta sul secondo. `SimulationResponse` contro
`AdminSimulationResponse`, `UserResponse` contro `AdminUserResponse`: chi
svolge un test non riceve l'indirizzo di chi l'ha scritto, e chi usa un account
non riceve l'indirizzo dell'amministratore che gliel'ha aperto, che è
un'informazione su una terza persona e non serve a niente di quello che fa.
Sul frontend la stessa coppia, `AuthUser` e
[AdminUser](../frontend/src/services/admin.ts).

L'email è ridondante di proposito: gli account si cancellano davvero, la chiave
esterna diventa NULL insieme a loro, e senza quello scatto testuale una riga
perderebbe il proprio autore il giorno in cui l'autore lascia l'azienda. Su una
cancellazione l'email viene sostituita da `utente eliminato`, così la riga
continua a dire che l'ha fatta una persona e smette di dire quale.

## Come lo schema si aggiorna

Non c'è Alembic e non ci sono file di migrazione. Ci sono due meccanismi:

1. **`Base.metadata.create_all`** crea le tabelle che mancano. Non tocca quelle
   che esistono già, quindi da solo non basta.
2. **[startup_migrations.py](../backend/startup_migrations.py)** fa tutto il
   resto: colonne aggiunte dopo il primo deploy, backfill delle righe vecchie,
   vincoli stretti quando non ci sono più righe che li violano.

Gira all'import di `main`, prima che l'app serva una richiesta o che una
fixture di test tocchi una tabella.

Tre proprietà da rispettare scrivendoci dentro:

- **ogni passo è idempotente** (`ADD COLUMN IF NOT EXISTS`,
  `UPDATE ... WHERE ... IS NULL`, `SET NOT NULL` protetto da un controllo), così
  può girare a ogni avvio senza danno, su un database vuoto o su uno già al
  passo;
- **l'ordine delle tre fasi non si inverte**: prima si aggiungono le colonne,
  poi si riempiono le righe vecchie, e solo alla fine si stringono i vincoli;
- **tutto il lavoro sta dietro un advisory lock bloccante**, perché quattro
  container che partono insieme eseguirebbero lo stesso DDL nello stesso
  istante. Bloccante e non `try`, al contrario della pulizia periodica: qui chi
  arriva dopo deve aspettare, perché non può servire una richiesta finché lo
  schema non è pronto.

Il corollario pratico: **aggiornare l'applicazione non richiede nessun passo di
migrazione da ricordare**. Si ricostruisce e si riparte.

**Anche togliere una tabella passa di qui.** `user_selections` registrava quale
avatar una persona aveva scelto: c'era la tabella, l'endpoint che la scriveva e
un contatore in ogni risposta del catalogo, ma nessuna schermata chiamava
quell'endpoint, perché la galleria apre direttamente la chat. Era quindi un
dato personale conservato senza scopo, con una query aggregata pagata a ogni
caricamento e una sezione sempre vuota nell'export dell'articolo 15. Quello che
la selezione avrebbe dovuto dire lo dicono già le conversazioni, che hanno la
persona, l'avatar e la data, ed è da lì che viene lo storico mostrato sulle
tessere della galleria. Il modello è sparito, quindi su un database nuovo la
tabella non nasce, e su uno esistente la porta via `_drop_user_selections`.

## Le scelte che ricorrono

**JSON invece di tabelle figlie**, in tre punti: la scheda persona di un
avatar, il risultato di una valutazione, la fotografia delle risposte di un
tentativo. Il criterio è sempre lo stesso: quel contenuto si legge tutto
insieme o per niente, e non ci si interroga sopra.

**La fotografia invece del puntatore**, dove il dato deve restare vero anche se
la sua origine cambia. Un tentativo di simulazione porta con sé domande e
risposte come erano alla consegna; una revisione porta il voto AI che c'era
quando è stata scritta. La regola generale è che si congela quello che è
successo, non quello che è.

**Il derivato invece del salvato**, dove vale il contrario. Il completamento di
un percorso, le notifiche e il voto finale di una conversazione si ricalcolano
a ogni lettura: uno stato salvato è una copia che invecchia, e sposta un
problema di correttezza dentro un lavoro di riconciliazione che nessuno farà.

**Nessuna fiducia nelle cascade** quando si cancella una persona. Lo schema è
costruito da `create_all` senza strumento di migrazione, quindi una `ondelete`
dichiarata nel modello non è la prova che il database vero ce l'abbia: la
cancellazione svuota ogni tabella con una istruzione esplicita, elencata in
[erasure.py](../backend/erasure.py).

**Gli indici seguono la domanda, non la colonna.** Le tabelle che crescono
senza fine si leggono sempre nello stesso modo, quindi l'indice porta dentro
anche la data con cui si ordina: il registro per utente e per azione dal più
recente, le conversazioni di una persona dalla più recente, i messaggi di una
conversazione in ordine di tempo. La stessa tabella può avere due domande, e
allora ha due indici: le conversazioni si leggono per persona dall'area di
chi si allena, e per periodo dai report dell'amministrazione, che chiedono un
intervallo di tempo dell'intera organizzazione senza nominare nessuno. A
quella seconda domanda il composito `(user_id, created_at)` non risponde,
perché la data è la sua seconda colonna e senza la prima non ci si entra: fino
a `ix_chat_conversations_created` restava una scansione dell'intera tabella
a ogni apertura della dashboard. Dove nasce un composito, l'indice sulla sola
prima colonna viene tolto: è il suo prefisso, non risponde a niente di nuovo e
si farebbe pagare a ogni riga scritta. Un indice ha due posti in cui esistere,
il modello per i database nuovi e
[startup_migrations.py](../backend/startup_migrations.py) per quelli che
esistono già, e devono dire la stessa cosa: se ne accorge
[test_schema_indexes.py](../backend/tests/test_schema_indexes.py), perché
nient'altro se ne accorgerebbe finché le righe non sono tante.

## Il pool di connessioni

Configurato a mano in [database.py](../backend/database.py), perché i default
di SQLAlchemy sono pensati per un processo solo. Il conto che conta è per
installazione: `repliche * (pool_size + max_overflow)`, contro le connessioni
che Postgres accetta.

Il backend lo rifà a ogni avvio con i numeri veri chiesti al database e lo
scrive nei log, con un avviso quando le connessioni libere sono meno di quelle
che il processo può chiedere nel picco. Non ferma niente: un tetto stretto non
è un errore di configurazione, è una scelta che va vista.

Sono attivi anche `pool_pre_ping` (senza il quale la prima query dopo una notte
fallisce con la connessione chiusa dall'altra parte) e `pool_recycle` a
mezz'ora.
