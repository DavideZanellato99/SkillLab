# Organizzazioni e ruoli

SkillLab è multi tenant: più aziende usano la stessa installazione e nessuna
vede i dati dell'altra. Questo documento spiega come quel confine è fatto, e
perché è fatto in un punto solo.

## I tre ruoli

| Ruolo | Organizzazione | Cosa può fare |
| --- | --- | --- |
| `super_admin` | Nessuna (`organization_id` NULL) | Sta sopra i tenant. Crea organizzazioni, avatar, simulazioni e utenti, e vede tutto |
| `organization_admin` | La sua | Amministra la propria: legge le conversazioni e i tentativi dei suoi utenti, assegna percorsi, corregge valutazioni |
| `user` | La sua | Si allena, e vede solo la propria roba |

Il super admin è l'unico a non avere un'organizzazione, ed è esattamente questo
che lo mette al di sopra: ogni filtro per tenant lo lascia passare per come è
scritto, senza nessun caso speciale da ricordare.

## Il confine, in un punto solo

```python
def resolve_admin_scope(admin, organization_id=None):
    if admin.ruolo == ROLE_SUPER_ADMIN:
        return organization_id   # il filtro chiesto, o None = tutte
    return admin.organization_id # sempre la propria, qualunque cosa abbia chiesto
```

[auth_dependency.py](../backend/auth_dependency.py). Da qui nascono i filtri di
riga di tutta l'API di amministrazione, e la conseguenza è quella che conta:
un organization admin che aggiunge `?organization_id=` di un altro tenant si
vede **ignorare il parametro**, non rifiutare la richiesta. Non c'è una strada
per uscire dalla propria organizzazione, perché non c'è un punto in cui la
decisione venga presa una seconda volta.

Sul lato di chi non è admin la stessa idea prende la forma di una query
condivisa per area:

| Area | Funzione | Regola |
| --- | --- | --- |
| Avatar | `_visible_avatars` in [avatars.py](../backend/routers/avatars.py) | Solo quelli della propria organizzazione, tutti per il super admin |
| Categorie degli avatar | `get_categories` in [avatars.py](../backend/routers/avatars.py) | Come sopra. Il legame con l'avatar è una chiave esterna composta che porta con sé il tenant, così cambiare categoria non può spostare l'avatar di organizzazione (vedi [avatar-e-persona.md](avatar-e-persona.md)) |
| Simulazioni | `visible_query` in [simulations.py](../backend/routers/simulations.py) | Come sopra, più le bozze escluse fuori dall'amministrazione |
| Conversazioni | `_owned_conversation_or_404` in [chat.py](../backend/routers/chat.py) | Solo le proprie, sempre |

## 404 e non 403

Quando qualcuno chiede qualcosa che non gli spetta, la risposta è **404**, non
403, in tutti i punti in cui la differenza direbbe qualcosa: un tentativo di
simulazione altrui, la conversazione di un altro utente, una simulazione di un
altro tenant.

Il motivo è che 403 conferma che quella riga esiste. Chi non ha diritto di
leggerla non ha nemmeno diritto di sapere che c'è.

Il 403 resta dove il fatto è già noto a chi chiede: un utente normale su una
rotta di amministrazione sa benissimo che quella pagina esiste, e sentirsi dire
"riservato agli amministratori" non gli rivela niente.

## Chi legge le conversazioni di chi

Questa è la regola che si ripete in tre punti diversi (il player della
registrazione, il dettaglio di un tentativo, il dettaglio di una
conversazione), sempre con la stessa forma:

```mermaid
flowchart TD
    A[Chi chiede] --> B{è il proprietario?}
    B -->|sì| OK[legge]
    B -->|no| C{super admin?}
    C -->|sì| OK
    C -->|no| D{organization admin<br/>e il proprietario è<br/>della sua organizzazione?}
    D -->|sì| OK
    D -->|no| NO[404]
```

È la stessa cosa che dire "un docente rilegge il lavoro dei propri studenti, e
di nessun altro".

## Le organizzazioni

Le gestisce il super admin da
[routers/organizations.py](../backend/routers/organizations.py) e dalla pagina
[OrganizationsPage](../frontend/src/components/OrganizationsPage.tsx).

**Creazione.** Nome e slug, quest'ultimo derivato dal nome e reso unico
aggiungendo un numero finché è libero. Il tenant nasce già con una categoria
di avatar, "Clienti": la categoria è obbligatoria su ogni avatar, quindi senza
non si potrebbe creare nemmeno il primo.

**Sospensione.** Reversibile, e ha effetto immediato su tutti gli utenti del
tenant: nessuno entra più e chi era già dentro viene rifiutato alla richiesta
successiva, perché il controllo gira a ogni richiesta e non alla scadenza del
token. Il motivo della sospensione si scrive in chiaro e lo leggono anche gli
utenti bloccati: chi si trova fuori dalla propria formazione merita di sapere
perché, invece di un muro generico. Alla riattivazione il motivo si cancella,
perché descrive la sospensione in corso e non è uno storico (per quello c'è il
registro).

**Cancellazione.** Irreversibile, e porta via tutto: gli utenti, anche da
Cognito, le loro conversazioni, gli avatar privati del tenant con le loro
categorie, i ritratti dal disco. Passa dallo stesso modulo di cancellazione di un singolo utente
([erasure.py](../backend/erasure.py)), così una tabella nuova viene coperta da
entrambe le strade insieme.

C'è anche un contatore di attività su una finestra di **trenta giorni**, e non
un totale storico: un totale non distingue un'organizzazione che ha lavorato
tanto un mese e poi ha smesso da una che sta lavorando ancora adesso.

## Gli utenti

Li gestisce il super admin da [routers/admin.py](../backend/routers/admin.py).
Creare un utente crea **due cose**: l'account su Cognito, che manda l'invito con
la password temporanea, e la riga locale che porta ruolo e organizzazione.

Due stati, e la differenza conta:

| Stato | Reversibile | Cosa significa |
| --- | --- | --- |
| `suspended` | Sì | Bloccato adesso, si riattiva |
| `disabled` | No | Chiuso: da lì si può solo cancellare |

Entrambi bloccano il login **e** uccidono le sessioni già aperte.

La cancellazione di una persona è il diritto all'oblio, ed è descritta in
[sicurezza-e-privacy.md](sicurezza-e-privacy.md): cosa sparisce, cosa resta di
proposito, e perché.

## Il lato frontend

Le rotte dichiarano il ruolo minimo con
[RequireRole](../frontend/src/components/RequireRole.tsx), e su un ruolo
insufficiente si viene rimandati alla home con `replace`.

Va letto per quello che è: **comodità di navigazione, non sicurezza**. Il
controllo vero è nelle dipendenze del backend e nei filtri di riga descritti
sopra. Se un giorno il gate del browser sparisse per un errore, chi digita
l'indirizzo a mano vedrebbe una pagina che si riempie di 403 e di elenchi
vuoti, non i dati di qualcun altro.

Una conseguenza pratica di questa impostazione: alcune pagine sono **la stessa
pagina per tutti**. Il confronto fra tentativi e il simulatore stanno su rotte
aperte a chiunque sia autenticato; è il server a decidere se chi guarda vede
soltanto i propri dati o anche il selettore delle persone del proprio tenant.
