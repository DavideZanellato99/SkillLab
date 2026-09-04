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

	echo "== versione attuale: $(git rev-parse --short HEAD)"

	# --ff-only, e non un pull qualunque: se sul server ci fosse un commit che
	# su GitHub non c'è, questa riga si ferma invece di inventarsi un merge.
	# Sul server non si sviluppa, quindi quel caso vuol dire che qualcuno ha
	# modificato il repository a mano, ed è una cosa da guardare prima di
	# rilasciare, non da sistemare in automatico.
	#
	# I due file .env non sono versionati e restano dove sono: nessun passo
	# di qui li tocca.
	git fetch origin main
	git merge --ff-only origin/main

	echo "== versione rilasciata: $(git rev-parse --short HEAD)"

	# Lo stesso identico comando del rilascio a mano
	# (docs/deploy-e-scalabilita.md), -f compreso: senza, Compose leggerebbe
	# anche l'override di sviluppo e la produzione diventerebbe una replica
	# sola col database affacciato su internet. Le migrazioni dello schema
	# girano da sole all'avvio, dietro un advisory lock, quindi non c'è nessun
	# altro passo da ricordare qui.
	docker compose -f docker-compose.yml up -d --build

	# Le immagini della versione precedente restano lì senza nome a ogni
	# ricostruzione: senza questa riga il disco si riempie di rilasci vecchi,
	# e quando si riempie non cade solo chi stava scrivendo, si ferma anche
	# Postgres. Tocca solo le immagini rimaste senza tag, quindi la cache di
	# costruzione resta al suo posto e il rilascio successivo è veloce lo
	# stesso.
	docker image prune -f

	exit 0
}
