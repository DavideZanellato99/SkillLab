# Contribuire a SkillLab

## Flusso di lavoro con i branch

Il progetto usa due branch a vita lunga:

- **`stage`** è il branch di integrazione: qui avviene il lavoro attivo, con
  commit diretti. La CI gira su ogni push a `stage`.
- **`main`** è il branch stabile: ci si arriva solo quando `stage` è
  completamente verde. `main` deve restare sempre funzionante.

Il passaggio da `stage` a `main` si fa **a mano, in locale**, solo a CI verde:

```bash
# 1. Lavora su stage
git checkout stage
# ... modifiche, commit ...
git push                       # la CI parte su stage

# 2. Quando la CI su stage è verde, promuovi in main
git checkout main
git merge --ff-only stage
git push                       # una run di sicurezza parte anche su main

# 3. Torna a lavorare su stage
git checkout stage
```

Non esiste una branch protection che imponga una PR verso `main`: la
garanzia che `main` resti funzionante è procedurale (si mergia solo a
`stage` verde). Se in futuro si passa a un flusso con feature branch e PR
verso `stage`, allora ha senso proteggere `stage` con i check richiesti.

## Gate automatici prima del commit (hook pre-commit)

Il repo include un hook `pre-commit` in [.githooks/pre-commit](.githooks/pre-commit)
che, a ogni `git commit`, esegue in locale gli stessi gate della CI e **blocca
il commit se qualcosa è rosso**. Abilitalo una tantum (dopo il clone):

```bash
git config core.hooksPath .githooks
```

Cosa controlla, in ordine: `ruff check` + `ruff format --check` + `mypy`
(backend), `pytest --cov` (backend, avvia da solo il Postgres di test via
Docker se non è già su), `oxlint` + build + `vitest` (frontend), e
`gitleaks` (scan segreti, via Docker). Serve Docker attivo per i test
backend e per gitleaks. Se `ruff format --check` trova file da sistemare,
il hook li riformatta da solo: basta rifare `git add` e rilanciare il
commit.

Per forzare un commit saltando i gate (es. un commit di lavoro usa-e-getta):

```bash
git commit --no-verify
```

## Far girare i controlli a mano (gli stessi della CI)

Puoi anche eseguirli manualmente. Sono identici ai gate della pipeline e a
quelli del hook, quindi un fallimento locale è un fallimento della CI.

### Backend (dalla cartella `backend/`)

```bash
# una tantum
python -m venv venv
venv/Scripts/pip install -r requirements.txt -r requirements-dev.txt   # Windows
# source venv/bin/activate && pip install -r requirements.txt -r requirements-dev.txt  # Linux/macOS

ruff check .            # lint
ruff format --check .   # formattazione (usa `ruff format .` per applicarla)
mypy                    # type check (moduli puri, config in pyproject.toml)
pytest --cov            # test + soglia di coverage
```

I test hanno bisogno di un Postgres reale (l'app esegue SQL specifico di
Postgres all'avvio): usa il database `skilllab_test` sul Postgres di
`docker compose`. Impostalo con
`DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5433/skilllab_test`
(il `conftest.py` usa questo valore di default).

### Frontend (dalla cartella `frontend/`)

```bash
npm ci
npm run lint        # oxlint
npm run build       # tsc + vite (fa anche il type check)
npm run test        # vitest
```

### Verifica dello stack completo

```bash
cp backend/.env.example backend/.env
docker compose -f docker-compose.yml up --build
curl http://localhost:8000/     # deve rispondere {"status":"ok",...}
```

## Dipendenze

- **Backend**: le dipendenze di runtime si dichiarano in
  `backend/requirements.in` (senza versioni). Il lock pinnato con hash
  `backend/requirements.txt` si rigenera dentro l'immagine di produzione:

  ```bash
  docker run --rm -v "$PWD/backend":/w -w /w python:3.12-slim sh -c \
    "pip install pip-tools && pip-compile --generate-hashes requirements.in"
  ```

- **Frontend**: `npm install <pkg>` aggiorna `package.json` e
  `package-lock.json`; committa entrambi.

Dependabot apre PR settimanali per pip, npm, Docker e GitHub Actions.
