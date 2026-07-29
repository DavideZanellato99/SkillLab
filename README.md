# SkillLab

[![CI](https://github.com/DavideZanellato99/SkillLab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/DavideZanellato99/SkillLab/actions/workflows/ci.yml)
[![Security](https://github.com/DavideZanellato99/SkillLab/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/DavideZanellato99/SkillLab/actions/workflows/security.yml)

App di training con avatar in roleplay vocale e testuale: l'operatore parla o
scrive con una persona simulata (STT + LLM + TTS) e riceve una valutazione.

## Stack

- **Backend**: FastAPI, SQLAlchemy, Postgres, autenticazione AWS Cognito.
- **Frontend**: React 19, Vite, Tailwind, React Router.
- **Voce**: ElevenLabs (STT), OpenAI (LLM), Cartesia (TTS).
- **Infra**: Docker Compose (Postgres + backend + frontend).

## Avvio rapido (sviluppo)

```bash
docker compose up --build              # hot-reload (override di sviluppo)
```

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:8000>

## Deploy in produzione

```bash
docker compose -f docker-compose.yml up -d --build
```

Il `-f docker-compose.yml` non è opzionale: senza, compose legge anche
`docker-compose.override.yml` e avvia l'ambiente di sviluppo.

Quello che lo stack di produzione **non** fa, e che va completato attorno:

- **Non si affaccia su internet.** L'unica porta pubblicata è quella del
  frontend, su `127.0.0.1:3000`. Il database e l'API non ne pubblicano
  nessuna: nginx fa da proxy per `/api` sulla rete interna di compose.
  Davanti va messo un reverse proxy sull'host (nginx, Caddy, Traefik) che
  inoltra il dominio pubblico a `127.0.0.1:3000`.
- **Non termina TLS**, e HTTPS non è facoltativo: i cookie di sessione sono
  `Secure`, quindi servita in chiaro l'applicazione non riesce nemmeno a
  tenere il login. Il reverse proxy deve anche passare `X-Forwarded-For`
  intestandolo lui (non fidandosi del valore del client), altrimenti la metà
  IP del session binding diventa falsificabile (vedi `backend/token_sessions.py`).
- **Non cifra il disco.** Le registrazioni audio delle chiamate sono il dato
  più sensibile del sistema e stanno nel volume `db_data`: il volume, o il
  disco che lo ospita, va cifrato a livello di sistema (LUKS, BitLocker, o
  la cifratura del volume del provider cloud). Vale anche per i backup.
- **Non fa backup.** Il purge di retention cancella per davvero: un backup
  che non rispetta le stesse finestre di conservazione ricrea il problema
  che la retention risolve.

## Protezione dei dati

Quali dati personali tratta l'applicazione, per quanto li conserva, a chi li
invia, come sono implementati i diritti degli interessati e cosa manca ancora
per la pubblicazione: [GDPR.md](GDPR.md).

## Sviluppo e test

Comandi, gate di qualità e flusso dei branch (`stage` → `main`) sono descritti
in [CONTRIBUTING.md](CONTRIBUTING.md).

| Ambito   | Lint            | Type check     | Test          |
| -------- | --------------- | -------------- | ------------- |
| Backend  | `ruff check .`  | `mypy`         | `pytest --cov`|
| Frontend | `npm run lint`  | `npm run build`| `npm run test`|

## CI/CD

Ogni push su `stage` e `main` (e ogni PR verso di essi) fa girare
[`ci.yml`](.github/workflows/ci.yml): lint e type check backend, test backend
su un Postgres reale, lint/build/test frontend, e uno smoke test che avvia
l'intero stack di produzione e ne verifica gli endpoint. La scansione di
sicurezza ([`security.yml`](.github/workflows/security.yml): gitleaks,
pip-audit, npm audit, Trivy, CodeQL) gira sulle PR e ogni settimana. Non c'è
ancora deploy automatico: le immagini si costruiscono solo per verifica.
