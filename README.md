# SkillLab

[![CI](https://github.com/DavideZanellato99/SkillLab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/DavideZanellato99/SkillLab/actions/workflows/ci.yml)
[![Security](https://github.com/DavideZanellato99/SkillLab/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/DavideZanellato99/SkillLab/actions/workflows/security.yml)

App di training con avatar in roleplay vocale e testuale: l'operatore parla o
scrive con una persona simulata (STT + LLM + TTS) e riceve una valutazione. Al
roleplay si affianca un simulatore tecnico, cioè un test ricavato da un
documento aziendale, a scelta multipla o a risposta aperta.

## Stack

- **Backend**: FastAPI, SQLAlchemy, Postgres, autenticazione AWS Cognito.
- **Frontend**: React 19, Vite, Tailwind, React Router, TanStack Query.
- **Voce**: ElevenLabs (STT e TTS), OpenAI (LLM e valutazione).
- **Infra**: Docker Compose, Caddy davanti a tutto, backup automatici.

## Avvio rapido (sviluppo)

```bash
docker compose up --build
```

- Applicazione: <http://localhost:3000>
- API: <http://localhost:8000>

Per provare lo stack di produzione sul proprio computer il comando è un altro,
e il `-f` non è opzionale:

```bash
docker compose -f docker-compose.yml up -d --build
```

Senza, Compose legge anche `docker-compose.override.yml` e avvia l'ambiente di
sviluppo credendo di avviare la produzione.

Sul server non si costruisce niente: le immagini le costruisce la CI una volta
sola e le pubblica su GHCR con il commit come tag, e il rilascio scarica quel
tag e torna indietro da solo se lo stack non diventa sano
([deploy-e-scalabilita.md](docs/deploy-e-scalabilita.md)).

## La documentazione

Sta tutta in **[docs/](docs/README.md)**, un documento per parte: architettura,
comunicazione fra frontend e backend, autenticazione, multi tenant, chiamata
vocale, chat, valutazione, percorsi, simulatore, dati, sicurezza e privacy,
Docker, pipeline, deploy e scalabilità.

Da lì passano anche le tre cose che prima stavano qui alla radice:
[deploy e scalabilità](docs/deploy-e-scalabilita.md), la
[protezione dei dati](docs/gdpr.md) e i
[comandi di sviluppo](docs/contributing.md).
