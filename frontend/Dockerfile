FROM node:22-alpine AS build

WORKDIR /app

# La CA locale, spenta di default (il perché per esteso sta in
# backend/Dockerfile). Qui la radice resterebbe in questo stage e non
# nell'immagine finale, che riparte da nginx, ma la regola è la stessa: si
# installa solo se qualcuno lo chiede, e a chiederlo è il compose di
# sviluppo.
#
# Dentro il ramo c'è anche il giro su http: apk deve scaricare il pacchetto
# delle CA prima che una CA qualunque sia affidabile, e quel primo scarico
# non può verificare niente (le firme dei pacchetti apk le verifica per conto
# suo, a prescindere dal TLS). Serve solo lì: senza una CA locale da
# installare, quel giro non ha motivo di esistere e i repository restano su
# https.
ARG TRUST_LOCAL_CA=0
COPY avast-root.cr[t] /tmp/local-ca/avast-root.crt
# ca-certificates deliberately unpinned: apk drops old versions from the repo.
# hadolint ignore=DL3018
RUN if [ "$TRUST_LOCAL_CA" = "1" ] && [ -f /tmp/local-ca/avast-root.crt ]; then \
      sed -i 's/https:/http:/' /etc/apk/repositories \
      && apk add --no-cache ca-certificates \
      && sed -i 's/http:/https:/' /etc/apk/repositories \
      && cp /tmp/local-ca/avast-root.crt /usr/local/share/ca-certificates/ \
      && update-ca-certificates; \
    else \
      apk add --no-cache ca-certificates; \
    fi \
    && rm -rf /tmp/local-ca
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# Install deps first so this layer is cached unless package*.json changes
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Unprivileged nginx: runs as the non-root "nginx" user (uid 101) and
# listens on 8080 out of the box, so no root and no cap_net_bind needed.
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

# Patch OS packages whose fixes are newer than the base image snapshot
# (curl, openssl, libxml2, ... CVEs). apk needs root, so switch up and drop
# back to the unprivileged user afterwards.
#
# UID numerici e non "root"/"nginx": i nomi esistono solo dentro l'immagine,
# fuori si vede il numero. 0 è root, 101 è l'utente nginx del base image
# unprivileged (verificato con "id" dentro il container).
USER 0
RUN apk upgrade --no-cache
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# Base image already switches to this user; stated explicitly so it is
# visible here and satisfies the image/Dockerfile scanners.
USER 101

CMD ["nginx", "-g", "daemon off;"]
