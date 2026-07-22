<!--
Le PR non sono il flusso principale (di norma si committa su stage e si
mergia in main in locale), ma se ne apri una compila questi punti.
-->

## Cosa cambia

<!-- Descrizione breve della modifica e del perché. -->

## Come è stata verificata

- [ ] `ruff check .` e `mypy` verdi (backend)
- [ ] `pytest --cov` verde (backend)
- [ ] `npm run lint`, `npm run build`, `npm run test` verdi (frontend)
- [ ] Stack avviato con `docker compose -f docker-compose.yml up --build`

## Screenshot

<!-- Se la modifica tocca la UI, allega prima/dopo. -->
