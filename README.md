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

## Avvio rapido

```bash
cp backend/.env.example backend/.env   # poi inserisci le chiavi reali
docker compose up --build              # hot-reload (override di sviluppo)
```

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:8000>

Per la build di produzione (uvicorn + nginx statico) senza hot-reload:

```bash
docker compose -f docker-compose.yml up --build
```

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
