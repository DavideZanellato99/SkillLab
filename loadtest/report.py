"""Aggrega le righe [LATENCY] che il backend stampa durante il test.

turn_metrics.py stampa una riga per turno e un riepilogo per chiamata, il
che va benissimo per una chiamata sola e diventa illeggibile a cinquanta.
Questo le rilegge tutte insieme e ne tira fuori i numeri che decidono se il
gradino è passato o no.

Il numero da guardare è **il p95, non la mediana**. Sotto carico la mediana
resta bella parecchio oltre il punto di rottura: è la coda che si alza per
prima, ed è quella che gli utenti chiamano "ogni tanto si impalla".

  docker compose logs --no-color backend | python report.py
  python report.py gradino-30.log
"""

import re
import statistics
import sys

# "risposta" compare solo sui turni che la STT ha spezzato in più commit, dove
# il totale comprende anche i secondi in cui l'operatore stava ancora parlando.
# Va tenuto opzionale: darlo per presente scarterebbe i turni normali, darlo per
# assente scarterebbe proprio quelli lunghi, cioè i più interessanti.
RIGA = re.compile(r"commit->audio=(\d+)ms (?:risposta=(\d+)ms )?percepita=(\d+)ms")
SEGMENTO = re.compile(r"\b(attesa|prep|llm_ttft|tok2tts|tts|send)=(\d+)")
ANNULLATO = "ANNULLATO prima dell'audio"


def _p(valori: list[float], quantile: float) -> float:
    ordinati = sorted(valori)
    return ordinati[min(len(ordinati) - 1, int(len(ordinati) * quantile))]


def _riga(etichetta: str, valori: list[float]) -> str:
    return (
        f"  {etichetta:<16}"
        f"n={len(valori):<6}"
        f"mediana {statistics.median(valori):>6.0f}ms   "
        f"p95 {_p(valori, 0.95):>6.0f}ms   "
        f"max {max(valori):>6.0f}ms"
    )


def main() -> None:
    if len(sys.argv) > 1:
        sorgente = open(sys.argv[1], encoding="utf-8", errors="replace")
    else:
        sorgente = sys.stdin

    totali: list[float] = []
    risposte: list[float] = []
    percepite: list[float] = []
    segmenti: dict[str, list[float]] = {}
    annullati = 0

    with sorgente as f:
        for testo in f:
            if "[LATENCY]" not in testo:
                continue
            if ANNULLATO in testo:
                annullati += 1
                continue
            match = RIGA.search(testo)
            if not match:
                continue
            totale, risposta, percepita = match.groups()
            totali.append(float(totale))
            # Sui turni non spezzati le due misure coincidono, ed è giusto che
            # entrino entrambe: la mediana della risposta deve restare quella
            # di tutti i turni, non dei soli turni lunghi.
            risposte.append(float(risposta if risposta else totale))
            percepite.append(float(percepita))
            for nome, valore in SEGMENTO.findall(testo):
                segmenti.setdefault(nome, []).append(float(valore))

    if not totali:
        print("Nessun turno trovato. Il backend ha VOICE_LATENCY_LOG attivo?")
        return

    print(f"\nTurni completati: {len(totali)}   annullati: {annullati}\n")
    print("Per stadio della pipeline:")
    for nome in ("attesa", "prep", "llm_ttft", "tok2tts", "tts", "send"):
        if nome in segmenti:
            print(_riga(nome, segmenti[nome]))
    print("\nQuello che conta:")
    print(_riga("commit->audio", totali))
    # Solo se qualche turno è stato spezzato: altrove ripeterebbe la riga sopra
    if "attesa" in segmenti:
        print(_riga("risposta", risposte))
    print(_riga("PERCEPITA", percepite))
    print()


if __name__ == "__main__":
    main()
