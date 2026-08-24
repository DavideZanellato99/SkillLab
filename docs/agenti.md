# Gli agenti

Tre punti dell'applicazione in cui un modello di ragionamento **prepara del
lavoro per una persona** invece di produrre qualcosa che va direttamente in
mano a chi si allena. Questo documento dice cosa fanno, cosa hanno in comune,
e quali regole vale la pena rispettare se un giorno se ne aggiunge un quarto.

Il dettaglio di ciascuno sta nel documento della funzionalità a cui
appartiene, e non viene ripetuto qui: da questa pagina si capisce **perché**
esistono e cosa li tiene insieme, di là come sono fatti.

## Cosa vuol dire "agente", qui

Nessuno dei tre è un agente autonomo con strumenti e cicli. Sono **chiamate
singole a un modello di ragionamento con un contesto assemblato bene**, e va
detto perché è una scelta e non una mancanza.

Il valore di tutti e tre sta nel raccogliere e nel restringere quello che il
modello legge, non nel lasciargli decidere cosa fare. Un ciclo autonomo, in
un'applicazione senza coda e senza broker, sarebbe anche il primo pezzo a non
reggere le repliche (vedi [architettura.md](architettura.md)).

Quello che li distingue dagli altri usi del modello è **a chi consegnano**:

| | Chi legge il risultato | Cosa succede se il modello sbaglia |
| --- | --- | --- |
| Roleplay, valutazione, correzione delle risposte aperte | Chi si allena, subito | Un voto o una battuta storta, che chi insegna può correggere dopo |
| **I tre agenti** | Chi insegna, prima di decidere qualcosa | Niente, finché una persona non lo accetta |

## I tre, in breve

| | Cosa fa | Chi lo chiede | Dove è descritto |
| --- | --- | --- | --- |
| **Debriefing** | Legge le ultime prove di una persona e il quadro che gli era stato scritto prima, e dice cosa si ripete, come si è mossa da allora e cosa fare adesso | Chi amministra, dal report attività | [training-e-report.md](training-e-report.md#il-quadro-dinsieme-su-una-persona) |
| **Bozza di percorso** | Da un obiettivo raccontato a parole compone una fila di tappe scelte dal catalogo del tenant | Chi amministra, componendo un percorso nuovo | [training-e-report.md](training-e-report.md#la-bozza-scritta-dal-modello) |
| **Controllo del serbatoio** | Rilegge le cinquanta domande di un test e dice da quale conviene cominciare | Chi amministra, prima di pubblicare | [simulatore.md](simulatore.md#il-controllo-del-serbatoio) |

### Il debriefing risponde a "cosa devo dirgli"

Tutto il resto dell'applicazione ragiona su una prova per volta: la
valutazione giudica una conversazione, il confronto ne affianca due, la
dashboard fa medie su un gruppo, una tappa è una soglia superata o no.
Nessuna di queste dice che lo stesso errore è tornato quattro volte su
quattro scenari diversi, ed è la cosa che serve a chi deve sedersi davanti a
qualcuno.

Ed è l'unico che **rilegge sé stesso**: dalla seconda volta in poi ha davanti
il quadro che era stato scritto prima, e alla domanda "cosa si ripete"
aggiunge "come si è mossa questa persona da allora".

| | |
| --- | --- |
| Rotta | `POST /api/admin/users/{user_id}/debriefings` |
| File | [debriefing_source.py](../backend/debriefing_source.py), [user_debriefing.py](../backend/user_debriefing.py), [routers/admin_debriefings.py](../backend/routers/admin_debriefings.py) |
| Legge | Da 5 a 12 conversazioni valutate con trascrizione, criteri, revisioni e note, altrettanti tentativi con le sole domande sbagliate, e il quadro precedente se c'è. La finestra parte da cinque e si allarga a contenere tutte le prove svolte dopo il quadro precedente, così nessuna resta non letta da nessuno |
| Produce | Sintesi, fino a 4 temi ricorrenti con le prove su cui poggiano, il miglioramento, il passo successivo, e dal secondo in poi la direzione con il racconto di cosa è cambiato |
| Salva | Sì, una riga per generazione (`user_debriefings`): nessuna sostituisce quella prima, e la più recente invecchia |
| Tetto | 10 all'ora per persona |

### La bozza di percorso risponde a "da dove comincio"

Comporre un percorso vuol dire ricostruire a memoria un catalogo che il
server conosce già. Le cose che contano davvero sono l'obiettivo e l'ordine,
e si dicono in due righe.

| | |
| --- | --- |
| Rotta | `POST /api/training/paths/draft` |
| File | [path_draft.py](../backend/path_draft.py), l'endpoint sta in [routers/training.py](../backend/routers/training.py) |
| Legge | L'obiettivo scritto a parole, e il catalogo del tenant, cioè lo stesso di `assignable-content` |
| Produce | Titolo, descrizione e fino a 8 tappe in ordine, con soglia e con il perché di ciascuna |
| Salva | **No**, torna una proposta al form |
| Tetto | 30 all'ora per persona |

### Il controllo del serbatoio risponde a "quale delle cinquanta"

La revisione umana prima della pubblicazione è la regola del simulatore, ma
cinquanta domande sono cinquanta righe tutte uguali. A schermo il pannello si
intitola «Controllo delle Domande»: serbatoio resta il nome interno, qui e nel
codice.

| | |
| --- | --- |
| Rotta | `POST /api/admin/simulations/{id}/review` |
| File | [simulation_review.py](../backend/simulation_review.py) e [simulation_grounding.py](../backend/simulation_grounding.py) |
| Legge | Le domande con la loro chiave, e i passaggi del documento che citano |
| Produce | Segnalazioni ordinate per gravità, ognuna attaccata alle domande di cui parla |
| Salva | Sì, sulla simulazione, e invecchia con un'impronta delle domande |
| Tetto | 10 all'ora per persona |

È l'unico dei tre che ha **una metà che non costa niente**: i duplicati
semantici e le due regole sulle alternative sono conti, non giudizi, e stanno
in un file separato da quello che chiama il modello.

## Le sette regole che valgono per tutti e tre

Non sono principi astratti: sono le decisioni che hanno preso forma
scrivendoli, e che chi ne aggiunge un quarto farebbe bene a ripetere.

**1. Il modello propone, una persona rilegge.** È lo stesso patto della bozza
di scheda persona e del serbatoio di domande, e vale anche dove il risultato
sembra innocuo: nessuno dei tre produce niente che arrivi a chi si allena
senza che qualcuno ci abbia messo gli occhi.

**2. I numeri non li calcola il modello.** Medie, conteggi e voti si contano
in Python e arrivano nel prompt già fatti, con l'istruzione di non
ricalcolarli. Un debriefing che dicesse una media diversa da quella della
dashboard contraddirebbe la pagella che lo studente ha in mano, ed è il modo
più rapido perché uno strumento del genere smetta di essere creduto. Vale
anche per il confronto fra due debriefing: al modello si chiede la direzione,
che è una lettura, e non di quanto la media si è mossa, che è una
sottrazione fatta in Python.

**3. Quello che il modello legge lo decide una funzione sola.** Il catalogo
della bozza di percorso è la stessa `_assignable_catalog` del selettore, e le
domande verificabili del controllo sono lo stesso conto che poi finisce
nell'esito. Due definizioni della stessa cosa vorrebbero dire una proposta
che nomina prove che il form non offre, oppure un esito che dichiara di aver
letto cinquanta domande dopo averne lette trenta.

**4. Il testo di chi si allena resta materiale, mai istruzioni.** Dove entrano
trascrizioni o risposte aperte vale il trattamento di
[untrusted_text.py](../backend/untrusted_text.py), titoli delle conversazioni
compresi, perché quelli chi si allena li può riscrivere. Nel debriefing il
rischio è perfino più diretto che nella valutazione: là si sposta un voto,
qui si detta a chi insegna cosa pensare di una persona.

**5. Il modello non maneggia identificatori.** La bozza di percorso lo rende
esplicito: il catalogo gli arriva siglato `A1` e `T1`, e le tappe le indica
con quelle. Un id di trentasei caratteri ricopiato da un modello è un id
sbagliato prima o poi, e sarebbe sbagliato **in silenzio**. Con le sigle, una
citazione storta non corrisponde a niente e cade.

**6. Della risposta cade il pezzo storto, non tutto.** Un tema senza titolo,
una sigla inventata, una segnalazione su una domanda che non esisteva: cadono
da soli, come una domanda storta del serbatoio. Quello che manca invece
davvero, la sintesi di un debriefing o il titolo di un percorso, vale come un
JSON troncato e fa ritentare sul modello di riserva.

**7. La connessione al database torna al pool prima dell'attesa.** Per le
decine di secondi in cui si aspetta il modello il database non serve, e le
connessioni sono contate. Da qui viene una conseguenza che si vede nel
codice: quello che serve dopo il commit viene **staccato dalla sessione
prima**, dentro dataclass fatte di soli valori (`CatalogAvatar`,
`ReviewQuestion`, `DebriefingMaterial`), perché una riga a cui si chiedesse il
nome dopo tornerebbe a interrogare un database che nessuno le sta tenendo.

## Salvato o no, e come si ammette vecchi

Due dei tre salvano, e nessuno dei due si aggiorna da solo. Vale la pena
capire perché, perché il resto dell'applicazione fa il contrario: il progresso
di un percorso e le notifiche si derivano in lettura per non tenere copie che
invecchiano.

La differenza è che quelle si ricavano da righe che già le descrivono, mentre
qui il testo esiste solo perché un modello lo ha scritto una volta:
riderivarlo vuol dire ripagarlo e riscriverlo diverso.

Quindi si salva, e si tiene accanto **cosa il modello aveva davanti**. È la
stessa idea di `ai_score_at_review` sulle revisioni di una conversazione:

| Agente | Cosa conserva | Quando si dichiara vecchio |
| --- | --- | --- |
| Debriefing | La data della prova più recente letta | La persona ha svolto altre prove |
| Controllo del serbatoio | Un'impronta di testo, chiavi e citazioni | Le domande sono state riscritte |
| Bozza di percorso | Niente, non salva | Non si pone: o la si accetta subito, o non esiste |

Nessuno dei due si rigenera all'arrivo di una prova nuova o al salvataggio di
una domanda: sarebbe una chiamata a pagamento fatta da nessuno, e ne
partirebbe una a ogni virgola corretta.

I due salvano però in modi diversi, e il debriefing è l'unico che **si
accumula**: il controllo del serbatoio ha un esito per simulazione e ogni giro
sostituisce quello prima, il debriefing ha una riga per volta che è stato
chiesto. La ragione sta nella domanda a cui risponde: dove una persona è
arrivata si sa solo rispetto a dove era, quindi la versione di prima non è un
archivio, è metà del materiale della prossima.

**Non chiesto e passato senza rilievi sono due stati diversi**, e le due
schermate li dicono diversamente. Il primo è un `null`, il secondo è un esito
con la lista vuota, ed è una notizia.

## Cosa costano, e cosa li trattiene

Tutti e tre passano da `eval_json_completion`
([openai_service.py](../backend/openai_service.py)), quindi si portano dietro
i modelli di riserva, i due minuti di timeout e il JSON forzato, e tutti e tre
hanno un tetto per persona in
[llm_limits.py](../backend/llm_limits.py):

| Limitatore | Tetto | Perché quello |
| --- | --- | --- |
| `DEBRIEFING` | 10 all'ora | È il tetto della valutazione, e per la stessa ragione: chiamata cara, che su una persona si può chiedere a ogni prova nuova |
| `BOZZA_PERCORSO` | 30 all'ora | È il tetto della bozza di scheda persona: non salva niente, e si riscrive l'obiettivo finché la proposta non convince |
| `REVISIONE_SERBATOIO` | 10 all'ora | È il tetto della generazione: stesso gesto ripetuto sulla stessa simulazione, e ogni giro sostituisce l'esito |

Le tre rotte finiscono nel **registro delle azioni** (`user.debriefing`,
`training.path_draft`, `simulation.review`), anche quelle che non scrivono
niente: sono chiamate a un fornitore esterno che costano, e su chi le ha
chieste e quando il registro esiste apposta.

Verso OpenAI valgono le regole di [gdpr.md](gdpr.md), sezione 6. Vale la pena
ricordare due cose: nel debriefing viaggiano trascrizioni e giudizi **senza
l'identità** della persona, come nella valutazione, e nella bozza di percorso
del catalogo esce solo quello che uno studente vede già in galleria, perché
la scheda persona contiene la soluzione dell'esercizio.

## Cosa non è stato fatto, e perché

Le idee scartate valgono quanto quelle prese, perché sono le prime che
tornano a proporsi.

**Il suggeritore durante il roleplay.** Contraddice la cosa su cui il prompt
della persona insiste di più, cioè che l'avatar non aiuta a superare la
simulazione. Un pannello che suggerisce la prossima mossa mentre si parla
toglie all'esercizio l'unica cosa che misura.

**Il digest periodico per il docente.** Sembra il seguito naturale del
debriefing, ma va contro due scelte prese apposta: le notifiche esistono
derivate per non avere copie che invecchiano, e un digest è testo generato che
va salvato per forza. Spenderebbe token in automatico per qualcosa che nessuno
ha chiesto, dentro un'applicazione che dopo il deploy non si tocca più.

**Il tutor conversazionale sul proprio referto.** Fattibile, ma lo studente
che chiacchiera col modello attorno alla propria valutazione sta a un passo
dalla vera causa e dall'obiettivo nascosto, cioè dalla chiave di correzione
che tutto il resto dell'applicazione tiene fuori dalla sua portata.

**Il controllo del serbatoio che blocca la pubblicazione.** Scartato in
favore di un controllo che segnala: due domande simili sono un difetto
piccolo, la somiglianza fra due testi è una soglia e non una verità, e un
controllo che sbaglia e blocca è peggio di uno che sbaglia e avvisa.

## Se se ne aggiunge un quarto

La lista di controllo, ricavata dai tre:

1. **Chi lo legge, e cosa può fare quel testo.** Se il destinatario è chi si
   allena, la barra è quella della valutazione e non questa.
2. **Cosa entra nel prompt, deciso da una funzione sola** già usata da
   qualcos'altro, o destinata a diventarlo.
3. **I numeri calcolati fuori**, e nel prompt l'istruzione di non rifarli.
4. **Il testo non fidato recintato**, se ne entra.
5. **Un tetto in `llm_limits`**, scelto guardando quale dei tre esistenti
   somiglia di più a quello che si sta aggiungendo.
6. **La rotta nel registro delle azioni.**
7. **Se salva: cosa aveva davanti**, e come lo dice quando non vale più.
8. **La connessione restituita prima dell'attesa**, e i dati staccati dalla
   sessione prima del commit.
9. **Cancellazione, conservazione ed esportazione**, se quello che salva
   riguarda una persona (vedi [gdpr.md](gdpr.md) e
   [sicurezza-e-privacy.md](sicurezza-e-privacy.md)).
10. **Il documento della funzionalità aggiornato**, e una riga in questa
    tabella.

## Dove leggere il seguito

- Il debriefing e la bozza di percorso, per intero:
  [training-e-report.md](training-e-report.md).
- Il controllo del serbatoio, dentro il ciclo di vita di una simulazione:
  [simulatore.md](simulatore.md).
- Gli altri usi del modello, che agenti non sono: il roleplay in
  [avatar-e-persona.md](avatar-e-persona.md), il giudizio in
  [valutazione.md](valutazione.md), la generazione delle domande e la
  correzione delle risposte aperte in [simulatore.md](simulatore.md).
- Cosa esce verso i fornitori esterni e per quanto resta:
  [gdpr.md](gdpr.md).
