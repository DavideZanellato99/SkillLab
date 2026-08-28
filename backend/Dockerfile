FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Una CA di troppo, e solo dove serve.
#
# Dietro un antivirus o un proxy che ispeziona il TLS (Avast, Zscaler) la
# catena dei certificati viene rifirmata con una radice che sta nello store
# di Windows e non in quello di questa immagine, quindi ogni chiamata HTTPS
# in uscita muore. Aggiungere quella radice fra le CA di sistema risolve, ma
# quello che risolve in locale in produzione è un indebolimento: da lì in poi
# il backend si fida di qualunque certificato firmato da quella radice, e le
# chiamate che fa sono a Cognito, a OpenAI e a ElevenLabs.
#
# Per questo non basta che il file resti fuori dal repository: finché la sua
# presenza nel contesto di build bastava a installarla, un deploy fatto
# copiando questa cartella dalla macchina di chi sviluppa se la portava
# dietro senza che nessuno lo avesse deciso. Adesso la decisione è esplicita
# e spenta di default, come DEV_ADMIN_LOGIN: il file può esserci, ma senza
# TRUST_LOCAL_CA=1 non viene installato. A chiederlo è il compose di
# sviluppo (docker-compose.override.yml), che è il solo posto dove serve.
ARG TRUST_LOCAL_CA=0
COPY avast-root.cr[t] /tmp/local-ca/avast-root.crt
# ca-certificates deliberately unpinned: apt drops old versions from the repo.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && if [ "$TRUST_LOCAL_CA" = "1" ] && [ -f /tmp/local-ca/avast-root.crt ]; then \
         cp /tmp/local-ca/avast-root.crt /usr/local/share/ca-certificates/; \
       fi \
    && update-ca-certificates \
    && rm -rf /tmp/local-ca /var/lib/apt/lists/*
ENV PIP_CERT=/etc/ssl/certs/ca-certificates.crt

# Install Python deps first so this layer is cached unless requirements change
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as a non-root user (container hardening). /app is chowned so the
# static upload dir stays writable — the named volume mounted at
# /app/static inherits this ownership when Docker first creates it.
#
# USER numerico, non "appuser": il nome esiste solo dentro l'immagine, quindi
# chi guarda il container da fuori (l'host sui file del volume, o un
# orchestratore che deve accertarsi che non giri da root) vede solo il numero
# e non saprebbe risolverlo.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER 10001

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
