"""Completa i serbatoi rimasti corti con le domande scritte a mano.

La generazione consegna cinquanta domande solo quando tutte superano i
controlli di validità, e su cinque simulazioni ne sono arrivate meno. Il
rimedio previsto è quello che il pannello di amministrazione permette a mano:
si aggiungono in fondo al serbatoio le domande che mancano e si pubblica.
Questo script fa la stessa cosa dall'API, prendendo le domande da
``demo/domande_aggiunte.py``.

Il salvataggio è in blocco, quindi le domande già presenti vanno rimandate
indietro identiche e nelle stesse posizioni: il server conserva le citazioni
al documento solo dove il testo di una posizione non è cambiato. Le domande
aggiunte non hanno citazioni, perché non nascono da un passaggio del
documento indicizzato.

Prima di scrivere, ogni domanda nuova passa dagli stessi controlli che il
server applica alla pubblicazione: il numero di elementi, nessun elemento
vuoto e nessuna ripetizione dentro una colonna. Scoprire un duplicato dopo il
salvataggio significherebbe una simulazione che non si pubblica e cinquanta
domande da rileggere per capire quale.

Uso:

    backend/venv/Scripts/python.exe demo/completa_serbatoi.py
    backend/venv/Scripts/python.exe demo/completa_serbatoi.py --prova
"""

import argparse
import sys

from domande_aggiunte import AGGIUNTE
from popola_simulazioni import (
    BASE_URL,
    EMAIL,
    PASSWORD,
    SERBATOIO_PIENO,
    Client,
    elenco,
    errore,
    scrivi,
)

# Quanti elementi ha una domanda di ordinamento o di abbinamento scritta per
# queste simulazioni: lo stesso numero che scrive il modello, così le domande
# aggiunte non si riconoscono dalla lunghezza.
ELEMENTI = 5


def _duplicati(valori: list[str]) -> bool:
    """La stessa regola del server: due elementi uguali a meno di spazi e
    maiuscole sono due risposte giuste sulla stessa domanda."""
    chiavi = [" ".join(v.split()).casefold() for v in valori]
    return len(set(chiavi)) != len(chiavi)


def controlla(titolo: str, tipo: str, domande: list[dict]) -> list[str]:
    """I difetti delle domande scritte a mano, prima di mandarle al server."""
    problemi = []
    for numero, domanda in enumerate(domande, start=1):
        dove = f"{titolo}, domanda aggiunta {numero}"
        if not domanda.get("text", "").strip():
            problemi.append(f"{dove}: manca il testo.")
        if not domanda.get("explanation", "").strip():
            problemi.append(f"{dove}: manca la spiegazione.")
        if tipo == "matching":
            coppie = domanda.get("pairs") or []
            if len(coppie) != ELEMENTI:
                problemi.append(f"{dove}: {len(coppie)} coppie invece di {ELEMENTI}.")
            if any(not c["left"].strip() or not c["right"].strip() for c in coppie):
                problemi.append(f"{dove}: una coppia ha un lato vuoto.")
            if _duplicati([c["left"] for c in coppie]):
                problemi.append(f"{dove}: due voci da abbinare uguali.")
            if _duplicati([c["right"] for c in coppie]):
                problemi.append(f"{dove}: due abbinamenti uguali.")
        elif tipo == "ordering":
            passi = domanda.get("ordered_steps") or []
            if len(passi) != ELEMENTI:
                problemi.append(f"{dove}: {len(passi)} passi invece di {ELEMENTI}.")
            if any(not p.strip() for p in passi):
                problemi.append(f"{dove}: un passo è vuoto.")
            if _duplicati(passi):
                problemi.append(f"{dove}: due passi uguali.")
        else:
            problemi.append(f"{dove}: tipo {tipo} non previsto da questo script.")
    return problemi


def payload(tipo: str, domanda: dict) -> dict:
    """Una domanda come la vuole il server, con la sola chiave del suo tipo.

    Le altre non si mandano affatto invece di mandarle vuote: una lista di
    alternative vuota su un abbinamento verrebbe rifiutata dallo schema, che
    ne pretende almeno due quando la chiave c'è.
    """
    comune = {"text": domanda["text"], "explanation": domanda.get("explanation", "")}
    if tipo == "matching":
        return {**comune, "pairs": domanda["pairs"]}
    return {**comune, "ordered_steps": domanda["ordered_steps"]}


def completa(client: Client, simulazione: dict, domande: list[dict], prova: bool) -> bool:
    titolo = simulazione["title"]
    tipo = simulazione["kind"]

    risposta = client.chiedi("GET", f"/api/admin/simulations/{simulazione['id']}")
    if not risposta.ok:
        scrivi(f"{titolo}: lettura fallita, {errore(risposta)}")
        return False
    dettaglio = risposta.json()
    esistenti = dettaglio["questions"]

    mancanti = SERBATOIO_PIENO - len(esistenti)
    if mancanti <= 0:
        scrivi(f"{titolo}: il serbatoio è già pieno.")
        return True
    if len(domande) < mancanti:
        scrivi(
            f"{titolo}: mancano {mancanti} domande ma ne ho scritte {len(domande)}. "
            "Non la tocco."
        )
        return False

    problemi = controlla(titolo, tipo, domande[:mancanti])
    if problemi:
        for problema in problemi:
            scrivi(f"  {problema}")
        return False

    if prova:
        scrivi(f"{titolo}: {len(esistenti)} domande, ne aggiungerei {mancanti}.")
        return True

    # Le domande già presenti tornano indietro identiche e nell'ordine in cui
    # stanno: è quello che permette al server di riconoscerle e di conservare
    # le citazioni al documento.
    corpo = [payload(tipo, q) for q in esistenti] + [
        payload(tipo, q) for q in domande[:mancanti]
    ]
    risposta = client.chiedi(
        "PUT",
        f"/api/admin/simulations/{simulazione['id']}/questions",
        json={"questions": corpo},
    )
    if not risposta.ok:
        scrivi(f"{titolo}: salvataggio fallito, {errore(risposta)}")
        return False
    scrivi(f"{titolo}: {len(esistenti)} domande più {mancanti} scritte a mano.")

    risposta = client.chiedi(
        "PUT",
        f"/api/admin/simulations/{simulazione['id']}/status",
        json={"status": "published"},
    )
    if not risposta.ok:
        scrivi(f"  Pubblicazione non riuscita: {errore(risposta)}")
        return False
    scrivi("  Pubblicata.")
    return True


def main() -> int:
    argomenti = argparse.ArgumentParser(description=__doc__)
    argomenti.add_argument("--base-url", default=BASE_URL)
    argomenti.add_argument(
        "--prova",
        action="store_true",
        help="Controlla le domande e dice cosa farebbe, senza scrivere niente.",
    )
    opzioni = argomenti.parse_args()

    client = Client(opzioni.base_url)
    client.accedi(EMAIL, PASSWORD)
    per_titolo = {s["title"]: s for s in elenco(client)}

    fatte = 0
    for titolo, domande in AGGIUNTE.items():
        simulazione = per_titolo.get(titolo)
        if simulazione is None:
            scrivi(f"{titolo}: non esiste sul server.")
            continue
        if completa(client, simulazione, domande, opzioni.prova):
            fatte += 1

    scrivi("")
    scrivi(f"Completate {fatte} simulazioni su {len(AGGIUNTE)}.")
    return 0 if fatte == len(AGGIUNTE) else 1


if __name__ == "__main__":
    sys.exit(main())
