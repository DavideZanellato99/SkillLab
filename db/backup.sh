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
# **I dump escono cifrati**, ed è per via di quella frase qui sopra. Dentro
# c'è tutto quello che la piattaforma tratta, trascrizioni e punteggi e
# anagrafica compresi, e sono il file che per definizione viene copiato
# altrove: appena lascia questa macchina nessuno sa più su quanti dischi
# passa. Il disco del server è cifrato, ma quella è la protezione di quando
# il server è spento, e non segue il file.
#
# La cifratura è **a chiave pubblica** (age): qui dentro c'è solo la chiave
# con cui si cifra, non quella con cui si legge. Vuol dire che chi entrasse
# in questa macchina, o nello spazio remoto dove le copie vengono
# depositate, non potrebbe leggerne nessuna. La chiave privata sta fuori di
# qui e non deve mai entrarci, ed è anche l'avvertenza vera di tutto il
# meccanismo: **perduta quella, i backup restano cifrati per sempre e per
# tutti**.
#
# BACKUP_AGE_RECIPIENT è obbligatoria e non ha un valore di ripiego. Senza,
# lo script si ferma invece di scrivere dump in chiaro: un backup non
# cifrato prodotto in silenzio è esattamente la cosa di cui nessuno si
# accorge finché non è sulla chiavetta di qualcun altro.
#
# Una nota sul primissimo dump di un'installazione nuova: parte insieme al
# resto dello stack, quindi può cogliere il database mentre il backend gli
# sta ancora creando le tabelle, e uscire senza qualcuna. Non è un problema
# che valga la pena risolvere legando i backup alla salute dell'applicazione:
# a quel punto dati da salvare non ce ne sono, e su un database già avviato
# lo schema esiste da prima che questo script parta.
#
# Per ripristinare, con lo stack fermo tranne il database, dalla macchina
# dove sta la chiave privata:
#
#   age -d -i chiave-backup.txt backups/skilllab-AAAAMMGG-HHMMSS.sql.gz.age \
#     | gunzip -c \
#     | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
#
# La coppia di chiavi si crea una volta sola, e non su questa macchina:
#
#   age-keygen -o chiave-backup.txt
#
# Stampa la chiave pubblica ("age1..."), che è quella che va nel .env come
# BACKUP_AGE_RECIPIENT. Il file con la privata si custodisce altrove.

set -eu
# pipefail perché adesso il dump passa da una pipe di tre: senza, il codice
# di uscita sarebbe quello dell'ultimo comando, e un pg_dump caduto a metà
# lascerebbe age cifrare tranquillamente il pezzo che ha ricevuto e uscire
# con zero. Il file troncato verrebbe rinominato come buono, che è
# esattamente la cosa che il commento qui sopra promette non succeda.
set -o pipefail

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-6}"
KEEP="${BACKUP_KEEP:-28}"
DIR=/backups

log() {
	echo "$(date -u '+%Y-%m-%d %H:%M:%S') [backup] $*"
}

# La chiave con cui si cifra, senza la quale non si parte. Il container
# riparte in loop e la riga qui sotto lo dice a ogni giro: rumoroso di
# proposito, perché l'alternativa (partire e scrivere dump in chiaro) è
# silenziosa e sembra funzionare benissimo.
if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
	log "BACKUP_AGE_RECIPIENT non configurata: i backup uscirebbero in chiaro, non parto."
	log "Crea la coppia con 'age-keygen -o chiave-backup.txt' su un'altra macchina,"
	log "poi metti la chiave pubblica (age1...) nel .env accanto a docker-compose.yml."
	exit 1
fi

mkdir -p "$DIR"
log "avvio: un backup ogni ${INTERVAL_HOURS}h, ne tengo ${KEEP}, cifrati per ${BACKUP_AGE_RECIPIENT}"

while true; do
	stamp="$(date -u '+%Y%m%d-%H%M%S')"
	target="$DIR/skilllab-$stamp.sql.gz.age"

	# --clean e --if-exists: il dump si può riversare su un database che ha
	# già le tabelle, che è la situazione di ogni ripristino vero.
	#
	# I tre passaggi stanno in una pipe sola e il file in chiaro non esiste
	# mai: comprimere su disco e cifrare dopo lascerebbe il dump leggibile per
	# tutto il tempo della cifratura, e per sempre se il container venisse
	# fermato proprio lì in mezzo.
	if pg_dump --clean --if-exists --no-owner --no-privileges |
		gzip |
		age -r "$BACKUP_AGE_RECIPIENT" >"$target.tmp"; then
		mv "$target.tmp" "$target"
		log "fatto: $(basename "$target") ($(du -h "$target" | cut -f1))"
	else
		rm -f "$target.tmp"
		log "FALLITO: riprovo fra ${INTERVAL_HOURS}h"
	fi

	# Ritenzione: restano i KEEP più recenti. I .tmp di un tentativo
	# interrotto non compaiono qui e vengono ripuliti dalla riga dopo.
	#
	# I due nomi insieme, non solo quello nuovo: su un'installazione che ha
	# già dei dump in chiaro da prima, contarli a parte vorrebbe dire
	# lasciarli lì per sempre, che è l'opposto di quello che questa cifratura
	# serve a ottenere. Nella stessa finestra se ne vanno da soli man mano che
	# arrivano i nuovi.
	ls -1t "$DIR"/skilllab-*.sql.gz "$DIR"/skilllab-*.sql.gz.age 2>/dev/null |
		tail -n "+$((KEEP + 1))" | while read -r vecchio; do
		rm -f "$vecchio"
		log "scaduto, eliminato: $(basename "$vecchio")"
	done
	find "$DIR" \( -name '*.sql.gz.tmp' -o -name '*.sql.gz.age.tmp' \) -mmin +60 -delete 2>/dev/null || true

	sleep "$((INTERVAL_HOURS * 3600))"
done
