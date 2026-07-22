FROM node:22-alpine AS build

WORKDIR /app

# Trust an extra local root CA if present (see backend/Dockerfile for why).
# apk has to fetch the ca-certificates package itself before any cert is
# trusted, so that one fetch goes over http (apk verifies package
# signatures independently of TLS); everything after uses https again.
COPY avast-root.cr[t] /usr/local/share/ca-certificates/avast-root.crt
RUN sed -i 's/https:/http:/' /etc/apk/repositories \
    && apk add --no-cache ca-certificates \
    && sed -i 's/http:/https:/' /etc/apk/repositories \
    && update-ca-certificates
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
USER root
RUN apk upgrade --no-cache
USER nginx

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# Base image already switches to this user; stated explicitly so it is
# visible here and satisfies the image/Dockerfile scanners.
USER nginx

CMD ["nginx", "-g", "daemon off;"]
