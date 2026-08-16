# Documentazione di SkillLab

Come funziona l'applicazione, parte per parte. Ogni documento racconta un
pezzo per intero: cosa succede, in che ordine, e perché è fatto così invece
che in un altro modo.

L'ordine qui sotto è quello in cui conviene leggerli la prima volta: si parte
da come sta in piedi il sistema e da come le due metà si parlano, e si arriva
alle singole funzionalità.

## Le fondamenta

| Documento | Cosa ci trovi |
| --- | --- |
| [architettura.md](architettura.md) | I pezzi del sistema e chi parla con chi, cosa succede all'avvio del backend, i servizi esterni |
| [comunicazione-frontend-backend.md](comunicazione-frontend-backend.md) | Le tre forme in cui il browser parla col server (HTTP, SSE, WebSocket), i cookie, il rinnovo della sessione, la cache lato client |
| [frontend.md](frontend.md) | Com'è organizzata l'app React: rotte, ruoli, hook, componenti, il sito pubblico che si vede prima dell'accesso, e le convenzioni da rispettare |
| [dati-e-schema.md](dati-e-schema.md) | Le tabelle, come lo schema si aggiorna da solo all'avvio, la paternità delle righe |

## Chi entra e cosa può vedere

| Documento | Cosa ci trovi |
| --- | --- |
| [autenticazione.md](autenticazione.md) | Login su Cognito, cookie, session binding, logout server side, scadenza per inattività |
| [organizzazioni-e-ruoli.md](organizzazioni-e-ruoli.md) | Il multi tenant: i tre ruoli, come ogni lettura viene ristretta, sospensioni e cancellazioni |
| [sicurezza-e-privacy.md](sicurezza-e-privacy.md) | Registro delle azioni, limite ai tentativi di accesso, conservazione dei dati, export e cancellazione |

## Le funzionalità

| Documento | Cosa ci trovi |
| --- | --- |
| [avatar-e-persona.md](avatar-e-persona.md) | La scheda persona, come diventa il prompt del roleplay, le voci, l'archiviazione |
| [chiamata-vocale.md](chiamata-vocale.md) | La telefonata dal microfono all'audio di risposta: STT, LLM, TTS, turni, registrazione |
| [chat-testuale.md](chat-testuale.md) | Il canale scritto, lo streaming della risposta, la fine di una conversazione |
| [valutazione.md](valutazione.md) | Il giudizio dell'AI sui sei criteri, la revisione del docente, il voto che conta |
| [training-e-report.md](training-e-report.md) | Percorsi a tappe, notifiche, confronto fra tentativi, cruscotti, report per persona ed esportazioni |
| [simulatore.md](simulatore.md) | Il test tecnico, ricavato da un documento aziendale o scritto a mano dal docente: il serbatoio di domande, le dieci estratte a ogni tentativo, la correzione |
| [agenti.md](agenti.md) | I tre punti in cui un modello prepara del lavoro per chi insegna invece di parlare a chi si allena: cosa fanno, le regole che rispettano tutti e tre, cosa è stato scartato e perché |

## Come gira davvero

| Documento | Cosa ci trovi |
| --- | --- |
| [docker-e-ambienti.md](docker-e-ambienti.md) | Le immagini, i cinque servizi del compose, la differenza fra sviluppo e produzione, proxy, volumi, limiti, log, backup |
| [ci-cd.md](ci-cd.md) | Hook pre commit, workflow CI e Security, cosa blocca un merge e cosa no, i test |
| [messa-in-produzione.md](messa-in-produzione.md) | La prima volta: dominio, server, chiavi SSH, firewall, Docker, i due file di ambiente, il primo certificato, il collaudo |
| [deploy-e-scalabilita.md](deploy-e-scalabilita.md) | Prima installazione, aggiornamenti, come si aggiunge capacità, i tetti da tenere allineati, misura, operazioni |
| [loadtest.md](loadtest.md) | Il banco di prova della pipeline vocale: fornitori finti, la rampa a gradini, come si legge il risultato |

## Il perché, e le promesse

Questi tre non raccontano come funziona l'applicazione: raccontano i principi
che ci stanno dietro, cosa promette alle persone, e come ci si lavora.

| Documento | Cosa ci trovi |
| --- | --- |
| [infrastruttura.md](infrastruttura.md) | I principi per reggere più di un processo, e la lista di controllo da riusare sul prossimo progetto |
| [gdpr.md](gdpr.md) | Quali dati personali tratta, per quanto, a chi li invia, e cosa manca per la pubblicazione |
| [contributing.md](contributing.md) | Comandi da lanciare a mano, gate di qualità, flusso dei branch |

Gli altri documenti non li ripetono: quando serve, ci rimandano.

## Regola di manutenzione

Un documento che descrive codice che non esiste più è peggio di nessun
documento, perché sembra ancora vero. Chi cambia il codice aggiorna nello
stesso momento il documento che lo racconta, e se il cambiamento introduce un
pezzo nuovo, gli dà il suo posto in questa tabella.
