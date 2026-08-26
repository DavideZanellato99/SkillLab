# Il frontend

Com'è organizzata l'app React e quali convenzioni rispettare quando ci si
aggiunge qualcosa. Come parla col server sta invece in
[comunicazione-frontend-backend.md](comunicazione-frontend-backend.md).

## I quattro strati

```mermaid
flowchart LR
    C["components/<br/>cosa si vede"] --> H["hooks/<br/>quali dati servono"]
    H --> S["services/<br/>come si chiedono"]
    S --> A["services/api.ts<br/>apiFetch"]
```

La direzione è sempre questa e non si salta un passo:

| Cartella                                   | Contiene                                       | Regola                                                       |
| ------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------ |
| [components/](../frontend/src/components/) | Pagine e pezzi di interfaccia                  | Nessun `fetch`, nessuna chiave di cache                      |
| [hooks/](../frontend/src/hooks/)           | Un hook per ogni lettura e per ogni scrittura  | Qui vivono `useQuery` e `useMutation`, e le invalidazioni    |
| [services/](../frontend/src/services/)     | I tipi e le funzioni che chiamano gli endpoint | Niente React                                                 |
| [contexts/](../frontend/src/contexts/)     | Solo `AuthProvider` e il suo context           | Lo stato dell'utente, che serve ovunque, letto con `useAuth` |

**Un componente non chiama mai un endpoint da solo.** Il motivo non è
l'eleganza: una chiamata scritta dentro un componente non ha cache, non si
invalida quando qualcos'altro la cambia, e va ripetuta in ogni altro
componente che ha bisogno dello stesso dato. Con l'hook, due schermate che
guardano la stessa cosa la guardano davvero.

## Le rotte e i ruoli

Tutte in [App.tsx](../frontend/src/App.tsx). Ogni rotta dichiara
esplicitamente il ruolo minimo, e la proprietà è obbligatoria: non si può
aggiungere una pagina senza aver deciso chi ci entra.

**L'applicazione collegata sta sotto `/app`.** Il prefisso non è decorativo:
è quello che permette a un indirizzo di significare una cosa sola. Prima
l'area pubblica e quella privata si dividevano `/` e `/simulatore`, e dove
portasse un link dipendeva da chi lo apriva.

| Rotta                                                                                        | Accesso     | Pagina                                                                                    |
| -------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `/app`                                                                                       | autenticato | Galleria degli avatar, con sopra i propri obiettivi                                       |
| `/app/chat/:avatarId`                                                                        | autenticato | Chiamata e chat con un avatar                                                             |
| `/app/percorsi`, `/app/percorsi/:assignmentId`                                               | user        | I propri percorsi di training, e il singolo come mappa                                    |
| `/app/confronto`                                                                             | autenticato | Confronto fra i propri tentativi (per un admin, quelli di una persona del proprio tenant) |
| `/app/simulatore`, `/app/simulatore/:id`                                                     | autenticato | Elenco dei test tecnici e svolgimento                                                     |
| `/app/profile`                                                                               | autenticato | Profilo, password, export dei propri dati                                                 |
| `/app/admin/dashboard`, `/app/admin/training`, `/app/admin/report`, `/app/admin/simulations` | admin       | Cruscotti, percorsi a tappe, report per utente, test tecnici                              |
| `/app/admin`, `/app/admin/organizations`, `/app/admin/avatars`, `/app/admin/logs`            | super admin | Utenti, organizzazioni, avatar, registro                                                  |

Il gate è [RequireRole](../frontend/src/components/RequireRole.tsx), che su un
ruolo che non corrisponde rimanda a `/app` con `replace`, così l'indirizzo
bloccato non lascia nemmeno una voce nella cronologia.

L'accesso non è una scala: `user` non è il gradino più basso di `admin`, è
l'altro lato. I percorsi affidati sono chiusi a chi amministra esattamente
come le pagine di amministrazione lo sono a chi si allena, e la voce in barra
sparisce insieme alla rotta.

I link che il backend mette nelle notifiche
([notifications.py](../backend/notifications.py)) sono percorsi di quest'area,
prefisso compreso: chi legge una notifica ha per forza la sessione aperta.

Quelle rotte esistono **solo a sessione aperta**. Senza, lo stesso albero monta
il sito pubblico, che è una rotta sola:

| Rotta | Pagina                                                      |
| ----- | ----------------------------------------------------------- |
| `/`   | Cosa è SkillLab e quali servizi offre, in un colpo d'occhio |

Le quattro pagine di sezione che stavano accanto alla home (`/piattaforma`,
`/roleplay`, `/simulatore`, `/valutazione`) non ci sono più. Raccontavano le
funzionalità nel dettaglio a chi non le aveva ancora viste, e quel dettaglio
serve a chi la piattaforma la sta già usando: prima dell'accesso resta la
presentazione generale, il resto si vede entrando.

Un indirizzo sconosciuto torna alla home in tutti e due i casi, che sono due
home diverse: `/app` per chi è collegato, `/` per chi no. Da questo passano
anche i due cambi di stato, senza codice apposta: chi accede mentre legge il
sito pubblico si ritrova in `/app`, chi esce da una schermata interna torna
alla home pubblica, perché nel ramo appena montato quell'indirizzo non esiste
più. Ci passa anche chi ha un segnalibro di prima del prefisso.

**Questo è solo comodità di navigazione.** Il controllo vero è nelle dipendenze
del backend (`get_current_admin`, `get_current_super_admin`) e nel filtro per
organizzazione: un utente che digita l'indirizzo a mano si prende un 403 dal
server, non una pagina vuota dal browser. Vedi
[organizzazioni-e-ruoli.md](organizzazioni-e-ruoli.md).

**Le pagine di amministrazione si scaricano solo entrandoci.** Le due righe
`admin` e `super admin` della tabella sono import dinamici (`lazy`), il resto
no: sono otto schermate dense di tabelle e modali, e con un import normale
finivano nel primo file che il browser scarica, addosso anche a chi apre
l'applicazione solo per fare una telefonata di prova. L'attesa mentre il file
arriva è quella di `LoadingState`, la stessa che le pagine mostrano già
aspettando i propri dati. Il confine è quello dei permessi, non una misura di
comodo: se una schermata admin viene usata anche altrove, quel pezzo va
estratto in un file suo (è il caso di
[AssignmentStatusBadge](../frontend/src/components/AssignmentStatusBadge.tsx),
che la home mostra sugli obiettivi), altrimenti l'import statico se la
riporta dietro tutta.

## La barra di navigazione

È montata sempre, ed è da lì che si passa da una sezione all'altra. Sta in otto
file, ognuno con un compito solo:

| File                                                                      | Cosa fa                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [navEntries.tsx](../frontend/src/components/navEntries.tsx)               | Quali voci esistono e a chi si mostrano, come dati: la fila delle sezioni e i gruppi del profilo |
| [NavbarLink.tsx](../frontend/src/components/NavbarLink.tsx)               | Una voce in fila                                                                                 |
| [navLinkStyles.ts](../frontend/src/components/navLinkStyles.ts)           | La forma di una voce, accesa o spenta, condivisa con la barra del sito pubblico                  |
| [NavbarMobileMenu.tsx](../frontend/src/components/NavbarMobileMenu.tsx)   | Le stesse sezioni dove non stanno in fila                                                        |
| [NavbarUserMenu.tsx](../frontend/src/components/NavbarUserMenu.tsx)       | Il proprio account: la scheda, le anagrafiche, i controlli, l'uscita                             |
| [NotificationsBell.tsx](../frontend/src/components/NotificationsBell.tsx) | Quante notifiche non lette ci sono e, aprendola, quali                                           |
| [Navbar.tsx](../frontend/src/components/Navbar.tsx)                       | Solo l'impaginazione: il logo, la fila al centro, le azioni a destra                             |
| [mainContent.ts](../frontend/src/components/mainContent.ts)               | L'ancora del contenuto, condivisa fra il salto della barra e i `main` delle impaginazioni        |

**Le voci sono dati, non markup.** La stessa sezione si presenta in tre posti
(la fila, il pannello compatto, e per l'amministrazione il menu del profilo), e
scritta tre volte sarebbe tre elenchi che prima o poi divergono: la voce nuova
comparirebbe in barra e non nel pannello, e chi apre l'applicazione dal
telefono non saprebbe che esiste. Aggiungere una sezione vuol dire aggiungere
una riga a `mainNavEntries` o a `profileMenuGroups`, con il predicato di ruolo
che decide a chi si mostra, come la rotta dichiara chi ci entra.

**Sotto i 1024px la fila si ritira in un pannello a comparsa.** Prima spariva e
basta: dal telefono restavano il logo e il menu del profilo, e il simulatore, i
percorsi e il confronto non si raggiungevano più, benché le pagine esistessero
e il ruolo le aprisse. Il pannello si chiude aprendo una voce, con Esc, con un
click fuori e a ogni cambio di indirizzo, perché si va altrove anche dal logo o
tornando indietro con il browser. La voce del sito pubblico resta invece sempre
in fila: è una sola, e ci sta a qualunque larghezza.

La soglia è a 1024px e non ai 768 di prima perché quattro voci con etichette
come "Simulatore Tecnico" occupano da sole più di metà barra: fra le due misure
non sparivano né stavano, si schiacciavano contro il menu del proprio account.
Le due soglie, quella della fila e quella del pulsante che apre il pannello,
sono la stessa cosa detta in due file, e cambiarne una vuol dire cambiare
l'altra.

**Il primo Tab di ogni pagina salta la barra.** In cima alla barra c'è un
collegamento invisibile finché non lo si raggiunge da tastiera, e porta il
fuoco sul contenuto della schermata. Senza, chi naviga da tastiera
riattraversa il logo, le sezioni, le notifiche e il menu del proprio account a
ogni cambio di pagina, prima di arrivare a quello per cui è entrato. Il fuoco
si sposta a mano e non con l'ancora del browser: un indirizzo con dentro il
salto è quello che poi finisce in un segnalibro. L'ancora è
`MAIN_CONTENT_ID`, e la portano i quattro `main` dell'applicazione, cioè
`PageContainer` per le pagine che ne passano, la galleria, la chat e il sito
pubblico.

**Una voce resta accesa anche nelle pagine figlie.** La mappa di un percorso è
dentro i propri percorsi, il singolo test è dentro il simulatore, e la chat di
un avatar è dentro la galleria: sono le pagine in cui si passa più tempo, e
spegnere la voce lì farebbe sembrare di essere usciti dalla sezione. Lo dice
`isActive` di ogni voce, che confronta l'indirizzo per prefisso dove il caso lo
richiede.

**Il menu del profilo è raggruppato per cosa si va a fare**, non in un elenco
di otto righe uguali: la propria scheda, le anagrafiche (persone,
organizzazioni, interlocutori), quello che si compone (i test e i percorsi),
quello che si controlla a cose fatte (il rendiconto e il registro). Un gruppo
che resta vuoto per il ruolo di chi guarda sparisce con il proprio separatore,
quindi uno studente vede due voci e nessuna riga grigia a segnare dei vuoti.

**Ne resta aperto uno solo.** Il pannello delle sezioni, il menu del profilo e
la campanella delle notifiche escono tutti dallo stesso angolo e sovrapposti
sarebbero illeggibili, quindi lo stato è uno («quale pannello è aperto») e sta
nella barra, non tre interruttori nei tre componenti: aprirne uno chiude quello
di prima. La campanella se lo teneva per sé, e finché è stato così si apriva
sopra il menu del profilo senza chiuderlo, con due riquadri nello stesso punto.
Per la stessa ragione i tre veli che intercettano il click fuori partono sotto
la barra e non da bordo a bordo: il pulsante che ha aperto un pannello deve
restare quello che lo richiude.

I tre pannelli si chiudono con Esc, dichiarano `aria-expanded` e `aria-controls`
e segnano con `aria-current` la pagina in cui si è. Esc passa da
[useCloseOnEscape](../frontend/src/hooks/useCloseOnEscape.ts), che è la stessa
cosa per tutto quello che si apre sopra la pagina senza essere una modale (le
modali ce l'hanno già dentro `ModalShell`, e fuori dalla barra ci passa anche
il riquadro della tappa sulla mappa di un percorso, che però non gli affida
nessun pulsante: il nodo da cui è stato aperto resta sulla mappa, quindi
chiudendolo il fuoco è già sulla tappa a cui si riferiva), e **riporta il fuoco
sul pulsante che aveva aperto il pannello**: senza, il fuoco finisce sul body e il Tab
successivo ricomincia dal salto al contenuto invece di riprendere da dove si
era. Solo su Esc, però: aprendo una voce si va altrove, e riportare il fuoco
sulla barra della pagina appena lasciata sarebbe un salto all'indietro.

Nessuno dei tre dichiara `aria-haspopup`: dentro ci sono collegamenti in un
riquadro, non un menu con la sua navigazione a frecce, e annunciarlo come tale
prometterebbe tasti che non ci sono.

## La galleria degli avatar

È la prima schermata di chi entra, e la sola che tutti aprono ogni volta.
[Header](../frontend/src/components/Header.tsx) presenta il catalogo e lo
conta, [AvatarGallery](../frontend/src/components/AvatarGallery.tsx) lo
mostra, [AvatarCard](../frontend/src/components/AvatarCard.tsx) è il singolo
avatar, e da lì si va in chat.

**Il catalogo si legge una volta e si filtra in casa.** La categoria era un
parametro nella query string, quindi una voce di cache per categoria e una
richiesta al server a ogni pastiglia premuta, per una lista che sta tutta in
memoria e che la testata sta già leggendo intera. Ora la lettura è una
(`useAvatars`, senza parametri), e cosa resta a schermo lo decide
[avatarFilters](../frontend/src/components/avatarFilters.ts): un modulo puro,
provato senza montare niente, che applica insieme la categoria scelta e le
parole della ricerca. Da qui vengono tre cose che prima non c'erano: il filtro
risponde nell'istante in cui si preme, si può cercare per nome, scenario o
categoria, e il numero accanto a ogni categoria si sa senza chiederlo.

**Si cerca anche nella descrizione.** Chi scrive «reclamo» sta cercando una
situazione, non un nome, e la situazione è scritta lì. Il confronto è quello
di `matchesSearch`, lo stesso delle tabelle: accenti e maiuscole non contano.

**Una griglia vuota ha tre motivi diversi e tre frasi diverse**
([AvatarGalleryEmpty](../frontend/src/components/AvatarGalleryEmpty.tsx)): la
ricerca non ha trovato niente, la categoria scelta è vuota, o il catalogo è
vuoto davvero. Le prime due chi guarda le risolve sul momento, e il riquadro
gli porge il gesto che le annulla; la terza no, e allora l'unica cosa utile è
portare chi il catalogo lo può riempire dove si riempie, cioè il super admin
alla gestione avatar. Prima era una frase sola, «Nessun avatar presente in
questa categoria», che a catalogo vuoto mandava a cercare in categorie che non
esistevano.

**Un guasto di rete si racconta in due modi**, perché sono due situazioni
diverse. Se non c'è niente a schermo è la pagina a dirlo, con il banner
d'errore e il pulsante che riprova, che resta spento mentre il tentativo è in
corso. Se invece il catalogo è già lì da una lettura precedente non si toglie
niente: basta l'avviso a scomparsa che dice che potrebbe non essere
aggiornato, e il suo tempo lo tiene `useFlashMessage`, che spegne il timer sia
alla scadenza sia quando si chiude l'avviso a mano.

**La tessera è un link**, non un riquadro reso cliccabile. Era un `div` con
`role="button"` e la gestione a mano di Invio e barra spaziatrice, cioè un link
rifatto per intero e peggio: il tasto centrale non apriva niente, «apri in una
scheda nuova» non compariva nel menu e l'indirizzo non si poteva copiare né
trascinare. Con un `Link` tutto questo torna gratis, e con lui se ne va anche
il ripple, che creava un nodo nel DOM a ogni click e lo toglieva con un timer:
la pressione ora è una classe `active:`, e il `.ripple` di `index.css` non
esiste più.

**Ogni tessera dice quello che chi guarda ci ha già fatto**: quante sessioni e
quando è stata l'ultima, e l'invito diventa «Riprova» invece di «Parla». È
l'informazione che si cerca scorrendo il catalogo, cioè da dove ricominciare e
cosa non si è ancora provato, e arriva dai due campi che il server calcola
sull'utente della richiesta (vedi
[avatar-e-persona.md](avatar-e-persona.md)). Un avatar mai affrontato non
mostra nessuno zero: una tessera nuova non ha niente da raccontare.

Due dettagli che si notano solo quando mancano: l'ingresso a cascata si ferma
dopo le prime file (era `index * 0.08s`, quindi con venti avatar l'ultimo
compariva dopo un secondo e mezzo, proprio mentre lo si cercava), e un ritratto
che non arriva lascia il posto a una sagoma invece che al testo alternativo su
fondo scuro, che sembrava una tessera rotta.

## Il sito pubblico

Sta tutto in [components/public/](../frontend/src/components/public/), l'unica
sottocartella dei componenti, e non è un dettaglio di ordine: è il confine
oltre il quale non si chiama nessun endpoint e non si legge nessun utente. Una
pagina che si apre senza essere nessuno non ha dati da chiedere, quindi lì
dentro non esistono hook di TanStack Query.

| File                                                                   | Cosa fa                                                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [PublicHome.tsx](../frontend/src/components/public/PublicHome.tsx)     | L'unica pagina: hero, i servizi in una griglia di card, i tre passaggi d'uso, la chiamata all'accesso |
| [publicUi.tsx](../frontend/src/components/public/publicUi.tsx)         | I pezzi con cui è costruita: hero, sezione, griglia asimmetrica e card, passi, chiamata all'azione    |
| [PublicNav.tsx](../frontend/src/components/public/PublicNav.tsx)       | La voce dentro la navbar, che è una sola e quindi non ha nessuna forma compatta                       |
| [PublicFooter.tsx](../frontend/src/components/public/PublicFooter.tsx) | Il fondo pagina: accesso, fornitori, conservazione dei dati                                           |
| [PublicLayout.tsx](../frontend/src/components/public/PublicLayout.tsx) | La rotta di impaginazione che la contiene, più il ritorno in cima a ogni cambio di pagina             |
| [openLogin.ts](../frontend/src/components/public/openLogin.ts)         | L'evento con cui una pagina chiede alla navbar di aprire la modale di accesso                         |
| [publicIcons.tsx](../frontend/src/components/public/publicIcons.tsx)   | Le icone che servono solo qui, sulla stessa base di [icons.tsx](../frontend/src/components/icons.tsx) |

**La pagina è corta per scelta.** Sta in tre sezioni, con le card che portano
una frase o due: chi valuta uno strumento non legge un manuale, e la
profondità sta nell'applicazione e in `docs/`. Il testo dice cosa la
piattaforma fa, mai come lo fa, e si ferma prima di numeri, condizioni e
configurazioni.

Due comportamenti che l'impaginazione porta con sé: il contenuto di ogni
sezione compare quando entra nello schermo (`Reveal`, che senza
`IntersectionObserver` mostra tutto subito, perché una pagina invisibile è un
guasto peggiore di una pagina immobile), e lo sfondo ha due macchie di luce
lentissime, la cui animazione `aurora` sta fra i token di
[index.css](../frontend/src/index.css) insieme a tutte le altre.

**Gli import dinamici vanno in tutte e due le direzioni.** Le pagine di
amministrazione non si scaricano finché non ci si entra, e per lo stesso motivo
il sito pubblico non si scarica a chi ha la sessione aperta: è una pagina di
sola presentazione che quella persona non vedrà mai più. Il confine è
sempre quello dei permessi, qui nella sua forma più semplice, cioè l'essere o
non essere collegati.

Da qui discendono due vincoli che è facile violare per distrazione, perché la
navbar è montata sempre:

- l'evento che apre la modale sta in un file suo e non dentro una pagina,
  altrimenti l'import della navbar si riporterebbe dietro tutto il sito;
- le icone del sito pubblico non si importano dalla navbar: quelle che servono
  a entrambi vivono in `icons.tsx` proprio per questo.

**Il sito pubblico è documentazione che invecchia.** Racconta i servizi
dell'applicazione a chi non li ha ancora visti, quindi un servizio nuovo che
non passa di lì lo lascia indietro senza che nessuno se ne accorga: chi lavora
all'applicazione non esce dalla propria sessione per guardare la vetrina.
Restando generale invecchia più lentamente, ma non è immune. Vale la stessa
regola dei documenti in `docs/`, e il promemoria è la prova in
[smoke.test.tsx](../frontend/tests/components/public/smoke.test.tsx), che
verifica soltanto che la pagina si apra.

## I componenti condivisi

Prima di scrivere una schermata nuova si guarda cosa c'è già. Quasi tutta
l'impaginazione dell'app è fatta di questi pezzi:

| Componente                                                                                                                                                                                                   | A cosa serve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PageLayout](../frontend/src/components/PageLayout.tsx)                                                                                                                                                      | Il `main` centrato e l'intestazione con titolo, descrizione e azione a destra. Le larghezze hanno nomi (`default`, `wide`, `split`, `form`) e non numeri, così una pagina nuova sceglie in base al proprio contenuto. È un landmark e non un contenitore qualunque: quattordici pagine ci passano, ed è dove atterra il salto al contenuto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [ModalShell](../frontend/src/components/ModalShell.tsx)                                                                                                                                                      | La scatola di ogni modale: sfondo, pannello, chiusura. Durante un'azione in corso (`locked`) non si chiude, perché una scrittura non va interrotta a metà. Esce in fondo alla pagina da un portal, come il tooltip: serve a chi si apre da dentro un'altra modale, che sfoca lo sfondo e altrimenti la confinerebbe al proprio riquadro. **Da tastiera è una finestra vera**: si dichiara `role="dialog"` con `aria-modal`, prende il nome dal titolo che il pannello disegna già (`useModalTitleId`, che `ModalHeader` e `DetailModal` chiamano da sé; le modali che si intestano a modo loro lo passano come `label`), porta il fuoco dentro all'apertura e lo riporta alla chiusura sul comando che l'aveva aperta, tiene il Tab dentro il pannello ed esce con Esc. Prima niente di tutto questo esisteva: si apriva «Elimina Utente» e il fuoco restava sulla riga dietro al velo, che non si vedeva nemmeno, e per chiudere bisognava trovare la crocetta a Tab. Esc si ferma sul pannello e non risale, così una conferma aperta sopra un'altra modale chiude se stessa e lascia aperta quella sotto; per la stessa ragione le tendine (`Select`, `SearchSelect`), il menu kebab e il campo in cui si rinomina una conversazione si prendono il proprio Esc e lo fermano lì                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [DetailModal](../frontend/src/components/DetailModal.tsx) e `DetailField`                                                                                                                                    | Il dettaglio in sola lettura di una riga di tabella, con in fondo l'azione che porta a cambiarla dove ce n'è una: dalla scheda di un utente si passa alla modifica senza chiudere, ritrovare la riga nella tabella e cercarle la matita                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [ConfirmModal](../frontend/src/components/ConfirmModal.tsx)                                                                                                                                                  | Le conferme, comprese quelle distruttive. Con `elevated` sta sopra la modale da cui l'azione è partita. `cancelLabel` cambia le parole del bottone che non fa niente, dove «Annulla» sarebbe ambiguo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [UnsavedChangesModal](../frontend/src/components/UnsavedChangesModal.tsx) e [useCloseGuard](../frontend/src/hooks/useCloseGuard.ts)                                                                           | Il presidio fra un gesto di chiusura e una finestra piena di lavoro non salvato. L'hook decide (chiude subito quando non c'è niente da perdere, chiede quando c'è), la modale dice sempre le stesse parole, e chi la apre aggiunge solo *cosa* andrebbe perso. Copre le quattro vie con cui una modale si chiude, la X, Esc, lo sfondo e i bottoni; per il ricaricare la pagina c'è [useLeaveConfirmation](../frontend/src/hooks/useLeaveConfirmation.ts), che ferma il browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [DataTable](../frontend/src/components/DataTable.tsx)                                                                                                                                                        | Tabella, intestazione, righe e ricerca. Sfogliare le righe non è affare suo, sta in `Pagination`. Le colonne stanno a misure fisse: ogni colonna dichiara la propria `width` in percentuale (obbligatoria, e le percentuali di una tabella sommano a 100), il layout è `table-fixed` e sotto `minWidth` scorre il riquadro invece di stringersi le colonne. Intestazioni e celle sono centrate nella propria colonna, e una cella che dentro si costruisce con un flex lo centra con `justify-center`. Una riga che apre qualcosa lo dichiara con `onActivate` invece di un `onClick` scritto a mano: da lì arrivano insieme il puntatore a manina, il fuoco da tastiera e Invio o Spazio per aprirla, che erano tre cose da ricordarsi ogni volta e che infatti mancavano, lasciando il dettaglio di una conversazione e di un test raggiungibili col solo mouse. La riga resta una riga e non diventa un bottone: `role="button"` le toglierebbe il posto nella griglia proprio nelle tabelle che si aprono. Le eccezioni le dichiara la cella con `align="left"`, e l'intestazione resta comunque al centro: la prima colonna della gestione utenti, degli avatar, del report attività e dei percorsi assegnati, dove un'immagine, un nome e una riga sotto si scorrono con l'occhio, e i pannelli che si aprono sotto una riga, che sono elenchi di voci e valori. `footerNote` è una fascia in fondo alla scheda, sotto la barra per sfogliare, per gli elenchi che dal server arrivano a finestre: dice quante righe sono state scaricate sul totale e offre di chiederne altre. Sta lì dentro e non sotto la tabella perché due conteggi sulle stesse righe a un centimetro di distanza si leggono come una contraddizione, e nella stessa striscia si vede che uno conta quello che si sta guardando e l'altro quello che è arrivato. `pageResetKey` è cosa rende queste righe un elenco diverso, i filtri attivi di solito: quando cambia si torna alla prima pagina |
| [Pagination](../frontend/src/components/Pagination.tsx) e [usePagination](../frontend/src/hooks/usePagination.ts)                                                                                            | Sfogliare un elenco lungo: la barra in fondo e il conto di quale fetta mostrare. Le righe per pagina sono le stesse ovunque e chi mostra l'elenco non le sceglie, `label` cambia soltanto come si chiama quello che si conta ("Percorsi per pagina" nella griglia dei percorsi). Il secondo argomento di `usePagination` è la chiave che riporta a pagina uno: restare alla terza pagina di una domanda a cui si è appena smesso di rispondere non vuol dire niente, e le righe che si vedrebbero non sono quelle che si cercava. Stava dentro `DataTable` ed è uscita quando è servita anche a un elenco che tabella non è                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [Tooltip](../frontend/src/components/Tooltip.tsx)                                                                                                                                                            | Ogni spiegazione al passaggio del mouse. Vive in un portal, quindi non lo taglia il bordo di una tabella o di una modale, e di suo non aggiunge nodi al DOM: clona il figlio e gli aggancia gli eventi. Con `truncateOnly` compare solo se quel testo è davvero tagliato, su una riga (`.truncate`) o su più righe (`line-clamp-*`): su un testo intero ripeterebbe parola per parola quello che si sta già leggendo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [IconButton](../frontend/src/components/IconButton.tsx)                                                                                                                                                      | Il bottoncino quadrato delle azioni di una riga. Il tooltip fa parte del bottone e non gli sta attorno, così un'icona senza parole non può restare senza nome; su un bottone bloccato il tooltip viene avvolto da solo, altrimenti il motivo del blocco non comparirebbe proprio a chi ne ha bisogno                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [EmptyState](../frontend/src/components/EmptyState.tsx)                                                                                                                                                      | Il riquadro al posto di un elenco che non ha niente dentro, in due righe: cosa manca, e perché manca o cosa lo riempirebbe. La seconda è facoltativa, perché dove non c'è niente da fare una frase in più sarebbe una consolazione e non un'informazione. Era ricopiato in cinque schermate, e in una si era già fatto una costante locale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [FormError](../frontend/src/components/FormError.tsx) e [FormSuccess](../frontend/src/components/FormSuccess.tsx)                                                                                            | I due esiti, in due misure: `form` dentro una modale, `page` la fascia in cima a una schermata. Cosa scrivere quando una scrittura fallisce lo dice [errorMessage](../frontend/src/services/errors.ts): l'errore di una query arriva come `unknown`, e senza quel controllo il banner mostrerebbe "[object Object]" proprio dove serve una spiegazione. Era la stessa funzione di due righe ricopiata in nove file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [Notice](../frontend/src/components/Notice.tsx)                                                                                                                                                              | Il terzo banner della famiglia, grigio: non un errore e non una conferma, ma la constatazione che non c'è niente da disegnare. Compare al posto di un grafico, così i conteggi a zero non si leggono come un caricamento andato storto. Era nato dentro la metà scritta della dashboard e ricopiato a mano due volte nell'altra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [LoadError](../frontend/src/components/LoadError.tsx)                                                                                                                                                        | Il banner di un caricamento caduto con accanto il comando per richiederlo, che è l’unico errore a cui si può rimediare restando dove si è: senza, dentro una modale l’unica via è ricaricare la pagina e riaprire quello che si stava leggendo. Non dice però "sto riprovando": premuto il bottone, TanStack Query riporta la lettura in attesa e si porta via l'errore, quindi la schermata smonta il riquadro e mette al suo posto il proprio caricamento. Un `isRetrying` che bloccava il bottone c'è stato, passato da quattro schermate, e in nessuna delle quattro poteva accendersi. Era ricopiato a mano, riquadro rosso e gradiente compresi, nel dettaglio di una conversazione e nella valutazione di una chiamata                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [Badge](../frontend/src/components/Badge.tsx), [Spinner](../frontend/src/components/Spinner.tsx), [Toast](../frontend/src/components/Toast.tsx), [LoadingState](../frontend/src/components/LoadingState.tsx) | I pezzi piccoli ricorrenti                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [Field](../frontend/src/components/Field.tsx), [Select](../frontend/src/components/Select.tsx), [SearchSelect](../frontend/src/components/SearchSelect.tsx)                                                  | I campi dei form, con le classi già decise. `SearchSelect` ha due varianti: come filtro la scelta sta in una chip accanto al campo di ricerca, come campo di un form (`variant="field"`) la chip prende il posto del campo, che torna quando si toglie la scelta. I nomi non si tagliano mai: l'elenco dei suggerimenti si allarga quanto il nome più lungo invece di stare nella larghezza del campo, e come campo di un form il nome scelto va a capo. Chi cerca sta scegliendo fra cose che si somigliano, e spesso si distinguono per l'ultima parola                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [PasswordField](../frontend/src/components/PasswordField.tsx) e [PasswordRules](../frontend/src/components/PasswordRules.tsx)                                                                                | I campi in cui si sceglie una password, e l'elenco dei requisiti che si accendono man mano. Sono i sei campi della modale di accesso e della pagina del profilo: il bottone occhio è del campo e non del modulo che lo ospita, e si richiude da solo quando il campo si svuota, altrimenti dopo un cambio password riuscito la password successiva comparirebbe in chiaro a chi non ha chiesto di vederla. Il motivo per cui due password non vanno bene sta sotto il campo, legato al campo, invece che nel banner in cima al modulo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [SearchInput](../frontend/src/components/SearchInput.tsx) e [FilterTabs](../frontend/src/components/FilterTabs.tsx)                                                                                          | La casella con cui si cerca dentro un elenco, e il gruppo di pulsanti con cui si sceglie fra poche alternative. `FilterTabs` è sempre un `radiogroup` e mai una fila di bottoni sciolti, e ha due forme: `compact`, il gruppo stretto dentro una barra di filtri, e `pills`, la fila larga e centrata della galleria, che va a capo e porta accanto a ogni voce quanti elementi contiene                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [TabBar](../frontend/src/components/TabBar.tsx)                                                                                                                                                              | Le linguette con cui si cambia l’oggetto del discorso, diverse dal segmented control di `FilterTabs`, che invece restringe quello che si sta già guardando. Da tastiera si scorrono con le frecce, con Home e Fine per le estremità, e dentro il gruppo Tab si ferma una volta sola: è quello che le rende un gruppo di alternative invece di una fila di pulsanti. Dove il contenuto porta il proprio `TabPanel`, ogni linguetta cita il pannello che comanda; senza pannello non cita niente, perché un `aria-controls` verso un id inesistente dice una cosa falsa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [NumberInput](../frontend/src/components/NumberInput.tsx)                                                                                                                                                    | Ogni campo numerico dell'app. Le frecce del browser sono spente da una regola sola in `index.css`, valida per tutti i campi numerici, e queste sono disegnate da noi: quelle di sistema sono due triangolini grigi che cambiano forma fra un browser e l'altro e in Chrome compaiono solo passandoci sopra. A muovere il valore sono `stepUp` e `stepDown` del campo stesso, le stesse funzioni che stanno dietro le frecce della tastiera, quindi `min`, `max` e `step` valgono senza rifare quel conto. La larghezza va sul riquadro (`wrapperClassName`) e non sul campo, altrimenti dentro una colonna di flex le frecce finiscono fuori dal bordo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [ResetFiltersButton](../frontend/src/components/ResetFiltersButton.tsx) e [LoadMoreButton](../frontend/src/components/LoadMoreButton.tsx) | I due comandi di un elenco filtrato che dal server arriva a finestre: quello che riporta l'elenco intero, in fondo alla barra dei filtri, e quello che chiede la finestra successiva, dentro il `footerNote` di `DataTable`. Erano ricopiati fra la gestione utenti e il registro attività, e nelle due copie la regola era già diversa: uno azzerava anche la casella di ricerca, l'altro la lasciava scritta, quindi si premeva «Azzera Filtri» e l'elenco restava filtrato. Azzerare comprende sempre la ricerca, che è un filtro anche lei benché la casella stia dentro la tabella; il pulsante della finestra si spegne mentre quella arriva, perché due clic di seguito chiederebbero due volte le stesse righe |

Questi file esistono quasi tutti perché la stessa cosa era stata ricopiata in
otto o undici posti, e nelle copie i valori avevano cominciato a divergere
senza che la differenza volesse dire niente. Quando una scelta estetica è la
stessa in tutta l'app, deve stare scritta una volta.

## Le convenzioni di scrittura

- **File piccoli.** Una schermata complessa si spezza: la pagina, la modale di
  creazione, quella di dettaglio, l'editor di un pezzo. Il simulatore è un
  esempio: sei file, ognuno con un compito. Il criterio non è la lunghezza, è
  di quante cose parla il file: la barra in cima all'app si teneva addosso
  tutto il form di accesso, cioè undici stati che con le voci di menu non
  c'entravano niente, e ora quello vive in
  [AuthModal](../frontend/src/components/AuthModal.tsx).
- **Una modale nasce quando si apre.** Renderla solo mentre serve, invece di
  tenerla montata e nascosta, fa sì che i suoi campi ripartano vuoti da soli:
  il `reset` che nessuno si ricorda di aggiornare quando si aggiunge un campo
  diventa il montaggio del componente.
- **Una pagina orchestra, non disegna.** Le tre pagine più grosse sono ridotte
  a questo: [AdminPage](../frontend/src/components/AdminPage.tsx) tiene
  l'elenco e le conferme e affida a un file per pezzo i filtri, la riga e le
  modali; [AvatarAdminPage](../frontend/src/components/AvatarAdminPage.tsx) fa
  lo stesso con la scheda persona;
  [ChatPage](../frontend/src/components/ChatPage.tsx) tiene solo ciò che
  riguarda entrambi i canali e lascia il resto alla colonna, alla barra in
  fondo e alle bolle. Il segno che un pezzo è al posto giusto è che il suo
  stato lo segue: gli undici campi di una scheda stanno dove la scheda si
  disegna, non nella pagina che la apre.
- **Un comportamento con uno stato suo diventa un hook**, non un altro gruppo
  di `useState` nella pagina: la chat scritta
  ([useTextChat](../frontend/src/hooks/useTextChat.ts)), la rinomina di una
  conversazione ([useConversationRename](../frontend/src/hooks/useConversationRename.ts)),
  le citazioni della pagella ([useCitationNavigation](../frontend/src/hooks/useCitationNavigation.ts)),
  il messaggio di conferma a tempo ([useFlashMessage](../frontend/src/hooks/useFlashMessage.ts)),
  la ricerca che aspetta la fine della digitazione prima di interrogare il
  server ([useDebouncedValue](../frontend/src/hooks/useDebouncedValue.ts), lo
  stesso ritardo in ogni casella che cerca).
  Il guadagno non è la lunghezza: è che quello stato si può provare da solo,
  come fa il test di `useTextChat` con il rientro di un messaggio che il
  server non ha mai ricevuto.
- **Chi mostra un dato lo legge da sé.** Due pezzi che mostrano la stessa cosa
  la chiedono ognuno al proprio hook: la query resta una sola nella cache di
  TanStack Query, quindi non c'è nessuna chiamata in più. La testata della
  galleria ([Header](../frontend/src/components/Header.tsx)) contava gli avatar
  ricevendoli dalla griglia sotto, che glieli rimandava in su con una callback
  dentro un `useEffect`: due render in più a ogni cambio di filtro, e la cosa
  sbagliata sotto gli occhi, perché il numero calava scegliendo una categoria
  mentre l'etichetta continuava a dire «Avatar». Una callback verso l'alto
  serve per un evento, cioè per dire che si è fatto qualcosa, non per un dato.
  Vale anche fra sezioni diverse: la striscia che dice se una prova è la tappa
  di un percorso ([PathStepNotice](../frontend/src/components/PathStepNotice.tsx))
  sta dentro la chat e dentro il simulatore, e i propri percorsi se li chiede
  da sola invece di farseli passare dalla pagina, che di percorsi non sa
  niente. Per lo stesso motivo non arriva come stato del collegamento su cui
  si è premuto: un dato passato di mano vale finché si arriva da lì, mentre
  quella tappa è la propria tappa comunque ci si sia entrati.
- **Un elenco che si filtra non sparisce mentre pensa.** Dove i filtri girano
  sul server sono parte della chiave di cache, quindi cambiarne uno è una query
  che non ha ancora dati: con `placeholderData: keepPreviousData` restano a
  video le righe di prima, attenuate e con `aria-busy`, invece del riquadro di
  caricamento al posto della tabella. Il salto della pagina a ogni tasto
  premuto nella ricerca era proprio quello. Chi azzera i filtri azzera anche la
  ricerca, benché la casella stia dentro la tabella: è un filtro come gli
  altri, e lasciarla scritta voleva dire premere «Azzera Filtri» e ritrovarsi
  davanti un elenco ancora ristretto.
- **Un form non salva quello che non è cambiato.** La modifica di un account
  con la scheda intatta ha il salvataggio spento, e sotto il bottone c'è
  scritto perché: la richiesta partirebbe lo stesso, scriverebbe chi ha toccato
  l'account e quando, e lascerebbe nel registro attività la traccia di una
  modifica che non c'è stata. Gli spazi ai bordi non contano, perché il server
  li toglie comunque.
- **Le regole di un form che il server non conosce stanno in un modulo
  puro**, non dentro il gestore del submit: le tre della scheda avatar vivono
  in [avatarForm.ts](../frontend/src/components/avatarForm.ts), dove si
  leggono in fila e si verificano senza montare niente.
- **Niente domini esterni.** Nessuno script, foglio di stile, carattere o
  immagine presi da un CDN: tutto quello che la pagina carica arriva
  dall'origine dell'applicazione, i caratteri Inter e Outfit compresi (vedi il
  commento in testa a [index.css](../frontend/src/index.css)). Non è una
  preferenza, ed è imposto dalla Content-Security-Policy: un `@import` verso
  un dominio di fuori non verrebbe caricato affatto. Il perché sta in
  [sicurezza-e-privacy.md](sicurezza-e-privacy.md) e in [gdpr.md](gdpr.md).
- **Il testo è in italiano** e senza trattini: si usano le virgole. In italiano
  anche i nomi delle schermate, dove esiste la parola: la voce in barra è
  «Galleria Avatar», non «Avatar Gallery», e i ruoli si leggono «Super Admin» e
  «Amministratore Organizzazione».
- **Gli stati vuoti non finiscono col punto.** Il punto resta negli errori e
  nelle descrizioni.
- **Il registro è professionale e impersonale.** Un'attesa si annuncia con
  quello che sta succedendo («Scrittura della scheda in corso...»), non con il
  sistema che parla di sé in prima persona; una durata si dice in modo asciutto
  («L'operazione richiede circa venti secondi»), non con un'approssimazione
  parlata. Niente emoji in nessuna scritta, neanche negli stati vuoti, dove il
  posto dell'illustrazione lo prende un'icona di
  [icons.tsx](../frontend/src/components/icons.tsx).
- **Il gergo interno non arriva a schermo.** «Tenant» è «organizzazione», il
  serbatoio delle domande di un test è «l'archivio» o semplicemente «le
  domande», e un errore del server non nomina mai una variabile d'ambiente: il
  dettaglio tecnico va nei log, all'utente arriva cosa non funziona e cosa può
  fare. I nomi interni restano validi nei commenti e in questi documenti, dove
  chi legge sono io.
- **Le etichette portano la maiuscola su ogni parola piena**: «Salva
  Modifiche», «Gestione Utenti», «Nuovo Avatar», «Crea Nuova Organizzazione».
  Restano minuscoli articoli, preposizioni e congiunzioni quando cadono in
  mezzo, perché «Torna All'Elenco» e «Valutazione E Analisi» non li scriverebbe
  nessuno: si legge «Torna all'Elenco», «Media per Criterio», «Segna Tutte come
  Lette». Vale anche fra un comando e ciò che apre, dove la stessa cosa va detta
  con le stesse maiuscole: il bottone «Nuova Simulazione» apre una modale
  intitolata «Nuova Simulazione», e se un bottone ha un'`aria-label` che ripete
  l'etichetta e la completa, quella comincia con l'etichetta identica («Apri il
  Tentativo su ...»).

  **Etichetta vuol dire comando, titolo, voce di menu, intestazione di colonna,
  linguetta, campo di un form, badge, opzione di un filtro.** Non lo sono le
  frasi, e restano quindi con la sola iniziale maiuscola: gli stati vuoti
  («Nessun dato disponibile»), i messaggi di errore e conferma, le descrizioni
  sotto i titoli, i testi di trasparenza («Questa chiamata viene registrata») e
  i titoli editoriali del sito pubblico, che sono headline e non etichette
  («Esercitazione, verifica e misurazione dei risultati»). Del sito pubblico segue la regola
  delle etichette la sola voce di navigazione, in
  [PublicNav.tsx](../frontend/src/components/public/PublicNav.tsx).

- **I tooltip sono sempre `Tooltip`, mai l'attributo `title` del browser.**
  Quello nativo compare dopo un secondo, si veste come il sistema operativo e
  non si sa dove finisce; il componente compare subito, è uguale in tutta
  l'app e non lo taglia nessun contenitore. Un `title` su un elemento HTML è
  quindi sempre un errore, mentre `title` come prop di `PageHeader`,
  `ModalHeader`, `ConfirmModal` o `Toast` è un'altra cosa e resta. Se il
  bersaglio può essere `disabled` serve `wrap`, perché un elemento disabilitato
  non emette eventi del mouse. Annidati (una targhetta dentro una riga che ha
  già il suo tooltip) vince il più interno, che spegne quello che lo contiene.
- **Le formattazioni condivise stanno in un modulo a parte** accanto ai
  componenti che le usano: [simulationFormat.ts](../frontend/src/components/simulationFormat.ts),
  [dateFormat.ts](../frontend/src/components/dateFormat.ts),
  [categoryStyles.ts](../frontend/src/components/categoryStyles.ts), che tiene
  anche le tinte selezionabili per le categorie degli avatar: sono un elenco
  chiuso di classi scritte per intero, perché una classe Tailwind composta a
  runtime non finirebbe mai nel CSS compilato.
- **Un momento che arriva dal server si legge sempre con `parseInstant`**
  ([instant.ts](../frontend/src/components/instant.ts)) e si scrive sempre con
  le quattro funzioni di [dateFormat.ts](../frontend/src/components/dateFormat.ts):
  la data, la data con l'ora, l'ora sola, e il momento al secondo
  (`formatTimestamp`, che serve al registro attività, dove due azioni possono
  cadere nello stesso minuto). Le colonne dello schema sono in UTC e senza fuso
  scritto, quindi la risposta porta `2026-08-12T17:00:00` e basta, e
  `new Date` la legge come ora locale: su una data lo scarto non si vede, su un
  orario sono due ore sbagliate. Erano quattro copie della stessa
  formattazione, due delle quali con la lettura sbagliata, e nel report
  attività si vedevano una accanto all'altra: la riga con l'ora giusta e la
  trascrizione che si apre da lì con quella spostata. Il registro attività è
  stata l'ultima a passare di qui, e fino ad allora mostrava ogni azione
  spostata del fuso di chi guardava, cioè due ore prima in estate, proprio
  nella schermata che esiste per dire quando le cose sono successe.
- **Un giorno di calendario scelto in un filtro non è una data, è un
  intervallo**, e parte come tale: `startOfDayInstant` e `endOfDayInstant`
  ([instant.ts](../frontend/src/components/instant.ts)) danno i due estremi di
  quel giorno nell'ora di chi lo ha scelto, come momenti veri con il fuso
  scritto. Mandare la data nuda (`2026-03-01T00:00:00`) chiede al server la
  giornata UTC invece della propria: in Italia sono un'ora o due di righe prese
  dal giorno sbagliato a ciascun estremo, cioè un filtro che risponde a una
  domanda diversa da quella scritta sullo schermo.

## I test

Stanno in [frontend/tests/](../frontend/tests/), fuori da `src/`, con le
stesse sottocartelle del codice (`components/`, `hooks/`, `services/`,
`contexts/`), il nome del file che provano e il suffisso `.test.ts(x)`. Girano
con Vitest. Non coprono tutto per principio: coprono quello che si rompe in
silenzio, cioè le funzioni pure di formattazione, il gate dei ruoli, e la
macchina della chiamata vocale ([voiceCall.test.ts](../frontend/tests/services/voiceCall.test.ts)),
dove uno stato sbagliato non dà errore, dà una telefonata che non funziona.

Lo stesso criterio vale per i pezzi estratti da una pagina: si prova quello
che ha una regola dentro, non quello che ha solo del markup. Le regole della
scheda avatar, il rientro di un messaggio che il server non ha ricevuto
([useTextChat.test.tsx](../frontend/tests/hooks/useTextChat.test.tsx)), i tre
stati della barra in fondo alla chat, le protezioni sull'account proprio e su
quello di sistema.

Sotto ci sono tre altri strati, che si rompono in silenzio per motivi loro.
I servizi in [services/](../frontend/src/services/) sono involucri sottili
attorno ad `apiFetch`, e quello che i loro test fissano è l'indirizzo, il
verbo e come i filtri diventano parametri: un nome di parametro che diverge
dal backend non fa rumore, restituisce semplicemente la lista sbagliata. Gli
hook in [hooks/](../frontend/src/hooks/) portano le chiavi di cache e le
invalidazioni, dove l'errore tipico è una scrittura che non fa rileggere
qualcosa e lascia a schermo dati vecchi che sembrano attuali
([queryKeys.test.ts](../frontend/tests/hooks/queryKeys.test.ts) controlla anche
che due domande diverse non finiscano nella stessa voce di cache). Le
schermate si provano da chi le usa: cosa vede un ruolo e cosa no, cosa dice
una pagina quando non c'è niente da mostrare, e cosa succede quando una
scrittura viene rifiutata.

Comandi e gate di qualità stanno in [contributing.md](contributing.md).

## Lo stato dell'utente

`AuthProvider` tiene il profilo in memoria e nient'altro: il token è in un
cookie `HttpOnly` che JavaScript non vede. Le schermate lo leggono con
[useAuth](../frontend/src/hooks/useAuth.ts).

Ci sta appeso anche l'auto logout per inattività
([useIdleLogout](../frontend/src/hooks/useIdleLogout.ts)): trenta minuti senza
attività chiudono la sessione, e le schede aperte si tengono al corrente
attraverso `localStorage`, così usarne una tiene viva la sessione in tutte. Il
dettaglio è in [autenticazione.md](autenticazione.md).
