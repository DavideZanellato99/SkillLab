#!/bin/sh
# Il rilascio in produzione, eseguito sul server e non sul runner.
#
# Lo lancia GitHub Actions (.github/workflows/deploy.yml) entrando in SSH con
# una chiave che in authorized_keys porta davanti un comando forzato: quella
# chiave non apre una shell e non sceglie cosa eseguire, esegue solo questa
# riga. Come si prepara la chiave sta in docs/messa-in-produzione.md.
#
# Si lancia anche a mano, dal server, quando serve rilasciare senza passare da
# GitHub:
#
#   sh ~/SkillLab/deploy/deploy.sh
#
# **Qui non si costruisce niente.** Le immagini le costruisce la CI una volta
# sola, e le pubblica su GHCR con lo SHA del commit come tag solo dopo che
# hanno passato lo smoke test (.github/workflows/ci.yml). Questo script
# scarica quel tag e lo mette in piedi, quindi in produzione girano
# esattamente i byte che sono stati provati, non una ricostruzione fatta più
# tardi con un'altra cache e un'altra rete. Il `--no-build` sull'up è la
# guardia che rende la frase vera anche il giorno in cui qualcuno cambia
# qualcosa qui sopra.
#
# Il repository serve lo stesso, e va aggiornato lo stesso: il compose, il
# Caddyfile e lo script dei backup non stanno dentro le immagini, li legge
# Docker da questa cartella.
#
# **Il ritorno indietro è automatico.** Se lo stack non torna sano entro
# cinque minuti, il commit e le immagini tornano quelli di prima, che sono a
# un pull di distanza perché il registry li ha ancora. È la ragione pratica
# per cui il registry esiste: prima, tornare indietro voleva dire una
# ricostruzione a mano sul server.
#
# Le graffe attorno a tutto non sono un vezzo. La shell legge il file mentre lo
# esegue, a pezzi, e questo script aggiorna il repository dentro cui il file
# sta: un rilascio che tocca proprio questo file sposterebbe il testo sotto
# l'interprete a metà esecuzione, e il risultato sarebbe un errore di sintassi
# in una riga che nessuno ha scritto. Un blocco unico viene invece letto e
# interpretato per intero prima che parta la prima riga, e l'exit finale
# garantisce che nessuno vada a leggere oltre.
{
	set -eu

	# La radice del repository ricavata da dove sta questo file, invece che
	# scritta qui: il percorso non compare da nessuna parte, quindi non c'è
	# niente da correggere il giorno in cui la cartella si sposta o il
	# rilascio parte da un altro utente.
	cd "$(dirname "$0")/.."

	# Quanto si aspetta che le repliche diventino sane prima di dichiarare
	# fallito il rilascio. Cinque minuti perché all'avvio si mettono in fila
	# su un lock per preparare lo schema, e l'ultima della coda può metterci
	# un minuto senza per questo essere malata (startup_migrations).
	ATTESA_MASSIMA=300

	compose() {
		docker compose -f docker-compose.yml "$@"
	}

	# Vero quando ogni container del servizio è in piedi e, se dichiara un
	# healthcheck, quando quello dice "healthy".
	#
	# --all e non i soli container in corsa: una replica caduta sparirebbe
	# dall'elenco, e un servizio senza container passerebbe per sano. Per la
	# stessa ragione il conto parte da zero e un servizio senza container
	# viene bocciato.
	servizio_sano() {
		compose ps --all --quiet "$1" | {
			trovati=0
			while IFS= read -r id; do
				trovati=1
				stato="$(docker inspect --format '{{.State.Status}}{{if .State.Health}}/{{.State.Health.Status}}{{end}}' "$id")"
				case "$stato" in
				running | running/healthy) ;;
				*) exit 1 ;;
				esac
			done
			[ "$trovati" -eq 1 ] || exit 1
			exit 0
		}
	}

	# I quattro servizi che servono il traffico. backend-init resta fuori
	# perché deve terminare, non restare in piedi, ed è la condizione che le
	# repliche aspettano; db-backup resta fuori perché un backup che non
	# parte è una cosa da sistemare, non una ragione per rifiutare una
	# versione dell'applicazione e riportare su quella di prima.
	stack_sano() {
		servizio_sano db || return 1
		servizio_sano backend || return 1
		servizio_sano frontend || return 1
		servizio_sano caddy || return 1
	}

	attendi_stack() {
		scade="$(($(date +%s) + ATTESA_MASSIMA))"
		while :; do
			if stack_sano; then
				return 0
			fi
			if [ "$(date +%s)" -ge "$scade" ]; then
				return 1
			fi
			sleep 5
		done
	}

	# Scarica e mette in piedi il tag chiesto. Le immagini si nominano una per
	# una invece di lasciar fare un "pull" liscio, che tirerebbe giù anche
	# Postgres e Caddy: quelli hanno un tag mobile, e un rilascio non è il
	# momento per cambiare la versione del database senza che nessuno lo abbia
	# deciso.
	rilascia() {
		IMAGE_TAG="$1"
		export IMAGE_TAG
		if ! compose pull backend frontend db-backup; then
			echo "== non riesco a scaricare le immagini $1 dal registry"
			echo "   serve 'docker login ghcr.io' su questa macchina (docs/messa-in-produzione.md)"
			return 1
		fi
		compose up -d --no-build || return 1
		attendi_stack || return 1
	}

	precedente="$(git rev-parse HEAD)"
	echo "== versione attuale: $(git rev-parse --short HEAD)"

	# --ff-only, e non un pull qualunque: se sul server ci fosse un commit che
	# su GitHub non c'è, questa riga si ferma invece di inventarsi un merge.
	# Sul server non si sviluppa, quindi quel caso vuol dire che qualcuno ha
	# modificato il repository a mano, ed è una cosa da guardare prima di
	# rilasciare, non da sistemare in automatico.
	#
	# I due file .env non sono versionati e restano dove sono: nessun passo
	# di qui li tocca, reset compreso.
	git fetch origin main
	git merge --ff-only origin/main

	nuovo="$(git rev-parse HEAD)"
	echo "== versione da rilasciare: $(git rev-parse --short HEAD)"

	# Lo schema si aggiorna da solo all'avvio delle repliche, dietro un
	# advisory lock, quindi non c'è nessun passo di migrazione da fare qui.
	if rilascia "$nuovo"; then
		echo "== in produzione c'è $(git rev-parse --short HEAD), e risponde"

		# Le versioni vecchie restano scaricate: adesso hanno un tag, quindi
		# non sono più immagini "penzolanti" e un prune liscio non le
		# toccherebbe. Una settimana è il compromesso: abbastanza da tenere a
		# portata di mano quelle di ieri, abbastanza poco da non riempire il
		# disco, e comunque nessuna perdita, perché il registry le ha tutte.
		#
		# Le immagini in uso non le tocca, nemmeno quelle di un container
		# fermo come backend-init.
		docker image prune -af --filter "until=168h"
		exit 0
	fi

	echo "== lo stack non è tornato sano: il rilascio è fallito"

	# I log restano sul server e non finiscono qui dentro di proposito:
	# l'uscita di questo script è l'output di un job pubblico, e nei log del
	# backend passano le trascrizioni di quello che dicono gli utenti.
	echo "== per capire: docker compose -f docker-compose.yml logs backend"

	if [ "$precedente" = "$nuovo" ]; then
		echo "== non c'è una versione precedente diversa da questa, resta com'è"
		exit 1
	fi

	echo "== torno a $(git rev-parse --short "$precedente")"
	git reset --hard "$precedente"
	if rilascia "$precedente"; then
		echo "== rientrato sulla versione precedente"
	else
		echo "== anche il ritorno indietro non è tornato sano: vai sulla macchina"
	fi

	# Rosso comunque. Il ritorno indietro riuscito rimette il sito in piedi,
	# non rende buono il rilascio: da qui in poi il ramo main ha un commit che
	# in produzione non c'è, e il rilascio successivo lo riproverà. Va corretto
	# in main, non sul server.
	exit 1
}
