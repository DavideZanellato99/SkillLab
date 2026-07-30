#!/bin/sh
# Copie del database, su un orologio interno al container.
#
# Come per il purge delle finestre di conservazione (vedi
# backend/housekeeping.py), il lavoro periodico vive dentro lo stack e non in
# un cron dell'host: l'installazione si fa una volta e nessuno deve tornare
# sulla macchina perché i backup ripartano.
#
# Tre proprietà, tutte per lo stesso motivo:
#
# - **Il primo backup parte subito**, non fra sei ore. Un container appena
#   riavviato ha una copia recente, non una da recuperare.
# - **Un dump interrotto non prende il posto di uno buono.** Si scrive su un
#   file temporaneo e lo si rinomina solo se pg_dump è andato a buon fine:
#   nella cartella non finisce mai un archivio troncato che sembra valido.
# - **Il ciclo non muore.** Un backup fallito (database che riparte, disco
#   pieno) viene scritto nei log e si riprova al giro dopo, perché un ciclo
#   che si spegne al primo errore smette di fare backup per sempre e nessuno
#   se ne accorge finché non servono.
#
# Restano copie sulla stessa macchina: proteggono da una cancellazione
# sbagliata e da un volume perso, non dal disco che muore. Per quello vanno
# portate via da qui (rsync verso uno Storage Box, per esempio), ed è il
# motivo per cui /backups è una cartella dell'host e non un volume di Docker.
#
# Una nota sul primissimo dump di un'installazione nuova: parte insieme al
# resto dello stack, quindi può cogliere il database mentre il backend gli
# sta ancora creando le tabelle, e uscire senza qualcuna. Non è un problema
# che valga la pena risolvere legando i backup alla salute dell'applicazione:
# a quel punto dati da salvare non ce ne sono, e su un database già avviato
# lo schema esiste da prima che questo script parta.
#
# Per ripristinare, con lo stack fermo tranne il database:
#
#   gunzip -c backups/skilllab-AAAAMMGG-HHMMSS.sql.gz \
#     | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

set -eu

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-6}"
KEEP="${BACKUP_KEEP:-28}"
DIR=/backups

log() {
	echo "$(date -u '+%Y-%m-%d %H:%M:%S') [backup] $*"
}

mkdir -p "$DIR"
log "avvio: un backup ogni ${INTERVAL_HOURS}h, ne tengo ${KEEP}"

while true; do
	stamp="$(date -u '+%Y%m%d-%H%M%S')"
	target="$DIR/skilllab-$stamp.sql.gz"

	# --clean e --if-exists: il dump si può riversare su un database che ha
	# già le tabelle, che è la situazione di ogni ripristino vero.
	if pg_dump --clean --if-exists --no-owner --no-privileges | gzip >"$target.tmp"; then
		mv "$target.tmp" "$target"
		log "fatto: $(basename "$target") ($(du -h "$target" | cut -f1))"
	else
		rm -f "$target.tmp"
		log "FALLITO: riprovo fra ${INTERVAL_HOURS}h"
	fi

	# Ritenzione: restano i KEEP più recenti. I .tmp di un tentativo
	# interrotto non compaiono qui e vengono ripuliti dalla riga dopo.
	ls -1t "$DIR"/skilllab-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r vecchio; do
		rm -f "$vecchio"
		log "scaduto, eliminato: $(basename "$vecchio")"
	done
	find "$DIR" -name '*.sql.gz.tmp' -mmin +60 -delete 2>/dev/null || true

	sleep "$((INTERVAL_HOURS * 3600))"
done
