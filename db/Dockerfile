# L'immagine del servizio di backup: Postgres più lo strumento che cifra.
#
# Stessa base del database, così pg_dump è della stessa versione del server
# che sta copiando, con dentro una cosa sola in più.
#
# Esiste per quella cosa sola. I dump contengono tutto quello che la
# piattaforma tratta (le trascrizioni, i punteggi, l'anagrafica di chi si
# allena) e sono il file che per definizione viene portato fuori dalla
# macchina: cifrarli va fatto qui, alla fonte, perché da qui in poi
# nessuno sa più dove finiscono. L'immagine di Postgres non porta nessuno
# strumento di cifratura (né openssl, né gpg, né age), e installarlo
# all'avvio vorrebbe dire un container che ha bisogno della rete e di un
# repository raggiungibile ogni volta che riparte.
FROM postgres:18-alpine

# age deliberatamente non fissato a una versione: alpine toglie le vecchie
# dal repository, e un pin qui romperebbe la build il giorno in cui succede.
# hadolint ignore=DL3018
RUN apk add --no-cache age
