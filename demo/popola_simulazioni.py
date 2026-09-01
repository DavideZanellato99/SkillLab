"""Popola il simulatore tecnico con i test della demo bancaria.

Prende i quattro documenti di ``demo/documenti`` e ne ricava sedici
simulazioni, una per ogni incrocio fra documento e tipo di test, seguendo la
strada normale dell'amministrazione: caricamento del documento, generazione
delle domande dal modello, controllo del serbatoio, pubblicazione. Non scrive
mai direttamente sul database, quindi quello che nasce da qui è
indistinguibile da quello che nascerebbe dal pannello.

Lo script si può interrompere e rilanciare: riconosce le simulazioni dal
titolo e riprende ognuna dal punto in cui si era fermata, cioè genera solo
dove le domande mancano e pubblica solo quello che è rimasto in bozza. Una
simulazione già pubblicata non viene toccata, e in particolare non viene
rigenerata, perché ogni generazione è una chiamata a pagamento.

Il tetto orario delle chiamate al modello (vedi ``backend/llm_limits.py``) è
di dieci generazioni all'ora per amministratore, quindi sedici simulazioni
non entrano in una sola finestra. Lo script non lo aggira: quando riceve un
429 aspetta i secondi che il server indica e riprende, e il giro completo
dura poco più di un'ora. È il motivo per cui conviene lanciarlo in
background e leggerne il registro alla fine.

Uso:

    backend/venv/Scripts/python.exe demo/popola_simulazioni.py
    backend/venv/Scripts/python.exe demo/popola_simulazioni.py --prova
"""

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

# ── Configurazione ──

BASE_URL = "http://localhost:8000"
EMAIL = "admin"
PASSWORD = "admin"  # noqa: S105
SLUG_ORGANIZZAZIONE = "med"

DOCUMENTI = Path(__file__).parent / "documenti"

# Quanto si aspetta al massimo, in totale, che il tetto orario delle chiamate
# al modello si liberi. Un giro completo da sedici simulazioni ne consuma poco
# più di un'ora, e due ore lasciano margine per il caso in cui la finestra sia
# già stata usata da qualcun altro.
ATTESA_MASSIMA_SECONDI = 2 * 60 * 60

# Il numero di domande che il server pretende per pubblicare una simulazione
# generata da un documento.
SERBATOIO_PIENO = 50

NOMI_TIPO = {
    "multiple": "scelta multipla",
    "open": "risposta aperta",
    "ordering": "ordinamento",
    "matching": "abbinamento",
}

# ── Il piano ──
#
# I sedici test, ordinati in modo che i primi quattro coprano quattro
# documenti e quattro tipi diversi, e così i quattro successivi. Serve a
# rendere utile anche un giro interrotto a metà: qualunque sia il punto in
# cui si ferma, quello che è stato pubblicato copre tutta la materia e tutte
# le forme di domanda invece di quattro test uguali sullo stesso argomento.

ARGOMENTI = {
    "bonifici": {
        "file": "bonifici-e-pagamenti.md",
        "titolo": "Bonifici e ordini di pagamento",
        "descrizioni": {
            "multiple": (
                "Limiti dei canali dispositivi, cut off, valute e commissioni "
                "della procedura sui bonifici, con una risposta sola fra quattro."
            ),
            "open": (
                "Le situazioni in cui la procedura sui bonifici chiede di "
                "spiegare una scelta al cliente: verifica del beneficiario, "
                "richiamo di un ordine eseguito, operazione frazionata."
            ),
            "ordering": (
                "Le sequenze della procedura sui bonifici: la disposizione allo "
                "sportello, il richiamo di un ordine e la gestione del cliente "
                "che dichiara una truffa."
            ),
            "matching": (
                "Le corrispondenze della procedura sui bonifici: canale e "
                "limite, casistica e ufficio competente, soglia e adempimento "
                "antiriciclaggio."
            ),
        },
    },
    "carte-credito": {
        "file": "carte-di-credito.md",
        "titolo": "Carte di credito",
        "descrizioni": {
            "multiple": (
                "Plafond, massimali, date di addebito e termini di "
                "contestazione della procedura sulle carte di credito."
            ),
            "open": (
                "Quello che va spiegato al cliente sulle carte di credito: "
                "differenza fra saldo e revolving, costo dell'anticipo di "
                "contante, effetti del recesso sul debito residuo."
            ),
            "ordering": (
                "Le sequenze della procedura sulle carte di credito: rilascio "
                "della carta, blocco per furto, chiusura del rapporto."
            ),
            "matching": (
                "Le corrispondenze della procedura sulle carte di credito: "
                "tipologia e plafond, motivo di contestazione e termine, evento "
                "e ufficio competente."
            ),
        },
    },
    "carte-debito": {
        "file": "carte-di-debito.md",
        "titolo": "Carte di debito",
        "descrizioni": {
            "multiple": (
                "Massimali, commissioni di prelievo e regole del contactless "
                "della procedura sulle carte di debito."
            ),
            "open": (
                "Quello che va spiegato al cliente sulle carte di debito: "
                "conversione di valuta al terminale, colpa grave nelle "
                "operazioni non riconosciute, blocco temporaneo e definitivo."
            ),
            "ordering": (
                "Le sequenze della procedura sulle carte di debito: rilascio e "
                "attivazione, mancata erogazione di contante da un ATM."
            ),
            "matching": (
                "Le corrispondenze della procedura sulle carte di debito: "
                "situazione e strumento corretto, operazione e limite, fascia "
                "di età e massimale del minore."
            ),
        },
    },
    "mutui": {
        "file": "mutui-ipotecari.md",
        "titolo": "Mutui ipotecari",
        "descrizioni": {
            "multiple": (
                "Requisiti di accesso, spese, imposta sostitutiva e conseguenze "
                "del ritardo nella procedura sui mutui ipotecari."
            ),
            "open": (
                "Quello che va spiegato al cliente sul mutuo: differenza fra "
                "surroga e sostituzione, calcolo del finanziamento massimo sul "
                "valore di perizia, accollo liberatorio e cumulativo."
            ),
            "ordering": (
                "La sequenza dell'iter di concessione di un mutuo, dal colloquio "
                "di prima informazione all'erogazione delle somme."
            ),
            "matching": (
                "Le corrispondenze della procedura sui mutui: tipologia di tasso "
                "e indice, esito della perizia e conseguenza, fase della pratica "
                "e ufficio competente."
            ),
        },
    },
}

PIANO = [
    ("bonifici", "multiple"),
    ("carte-credito", "ordering"),
    ("carte-debito", "matching"),
    ("mutui", "open"),
    ("bonifici", "ordering"),
    ("carte-credito", "matching"),
    ("carte-debito", "open"),
    ("mutui", "multiple"),
    ("bonifici", "matching"),
    ("carte-credito", "open"),
    ("carte-debito", "multiple"),
    ("mutui", "ordering"),
    ("bonifici", "open"),
    ("carte-credito", "multiple"),
    ("carte-debito", "ordering"),
    ("mutui", "matching"),
]

# Su quali test si lancia anche il controllo del serbatoio, che è una seconda
# chiamata a pagamento con il suo tetto orario. Uno per documento basta a
# mostrare il pannello di revisione pieno senza raddoppiare l'attesa.
CON_CONTROLLO = {
    ("bonifici", "multiple"),
    ("carte-credito", "ordering"),
    ("carte-debito", "matching"),
    ("mutui", "open"),
}


def titolo_di(argomento: str, tipo: str) -> str:
    return f"{ARGOMENTI[argomento]['titolo']}, {NOMI_TIPO[tipo]}"


# ── Il dialogo con il server ──


def scrivi(messaggio: str) -> None:
    """Una riga di registro con l'ora, perché il giro dura più di un'ora."""
    print(f"[{datetime.now():%H:%M:%S}] {messaggio}", flush=True)


class Client:
    """Le chiamate all'API di amministrazione, con l'attesa sul tetto orario.

    I token viaggiano come cookie HttpOnly marcati Secure, che un client HTTP
    non rimanda a un indirizzo in chiaro come quello dell'ambiente locale:
    dopo l'accesso il token si legge dal barattolo dei cookie e si mette
    nell'intestazione Authorization, che l'applicazione accetta come
    alternativa (vedi ``backend/auth_dependency.py``). Lo User-Agent resta lo
    stesso per tutto il giro, perché il token è legato al contesto per cui è
    stato emesso.
    """

    COOKIE_ACCESSO = "skilllab_access_token"

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.http = requests.Session()
        self.http.headers["User-Agent"] = "SkillLab popola-simulazioni"
        self.atteso = 0

    def accedi(self, email: str, password: str) -> None:
        risposta = self.http.post(
            f"{self.base_url}/api/auth/login",
            json={"email": email, "password": password},
            timeout=30,
        )
        risposta.raise_for_status()
        token = self.http.cookies.get(self.COOKIE_ACCESSO)
        if not token:
            raise RuntimeError("L'accesso non ha restituito il token di sessione.")
        self.http.headers["Authorization"] = f"Bearer {token}"
        scrivi(f"Accesso eseguito come {email}.")

    def chiedi(self, metodo: str, percorso: str, **kwargs) -> requests.Response:
        """Una chiamata, ripetuta quando il tetto orario dice di aspettare.

        Il 429 non è un errore da segnalare: è il tetto delle chiamate al
        modello che si è chiuso e riaprirà da solo. Si aspettano i secondi
        che il server indica, più qualche secondo di margine perché la
        finestra è scorrevole e un rientro al secondo esatto la trova ancora
        piena.
        """
        kwargs.setdefault("timeout", 600)
        while True:
            risposta = self.http.request(metodo, f"{self.base_url}{percorso}", **kwargs)
            if risposta.status_code != 429:
                return risposta
            attesa = int(risposta.headers.get("Retry-After", "60")) + 10
            if self.atteso + attesa > ATTESA_MASSIMA_SECONDI:
                raise RuntimeError(
                    "Il tetto orario delle chiamate al modello chiede di aspettare "
                    "oltre il limite previsto da questo script. Rilancialo più tardi: "
                    "riprende da dove si è fermato."
                )
            self.atteso += attesa
            minuti = (attesa + 59) // 60
            scrivi(f"Tetto orario raggiunto, riprendo fra {minuti} minuti.")
            time.sleep(attesa)


def errore(risposta: requests.Response) -> str:
    try:
        return risposta.json().get("detail", risposta.text)
    except ValueError:
        return risposta.text


# ── Il giro ──


def organizzazione(client: Client, slug: str) -> dict:
    risposta = client.chiedi("GET", "/api/admin/organizations")
    risposta.raise_for_status()
    for org in risposta.json():
        if org["slug"] == slug:
            return org
    raise RuntimeError(f"Nessuna organizzazione con slug '{slug}'.")


def elenco(client: Client) -> list[dict]:
    risposta = client.chiedi("GET", "/api/admin/simulations")
    risposta.raise_for_status()
    return risposta.json()


def cancella_le_prove(client: Client, esistenti: list[dict], attesi: set[str], prova: bool) -> None:
    """Toglie di mezzo le simulazioni di prova rimaste dalle verifiche.

    Sono quelle il cui titolo non compare nel piano. In una demo l'elenco
    deve contenere solo materiale presentabile, e una riga intitolata "ee"
    accanto a una procedura sui mutui è la prima cosa che si nota.
    """
    da_cancellare = [s for s in esistenti if s["title"] not in attesi]
    if not da_cancellare:
        return
    for simulazione in da_cancellare:
        etichetta = f"{simulazione['title']} ({simulazione['status']})"
        if prova:
            scrivi(f"Da cancellare: {etichetta}")
            continue
        risposta = client.chiedi("DELETE", f"/api/admin/simulations/{simulazione['id']}")
        if risposta.ok:
            scrivi(f"Cancellata la simulazione di prova {etichetta}.")
        else:
            scrivi(f"Cancellazione fallita per {etichetta}: {errore(risposta)}")


def crea(client: Client, org_id: str, argomento: str, tipo: str) -> dict:
    voce = ARGOMENTI[argomento]
    percorso = DOCUMENTI / voce["file"]
    with percorso.open("rb") as documento:
        risposta = client.chiedi(
            "POST",
            "/api/admin/simulations",
            data={
                "organization_id": org_id,
                "title": titolo_di(argomento, tipo),
                "description": voce["descrizioni"][tipo],
                "kind": tipo,
                "source": "ai",
            },
            files={"file": (percorso.name, documento, "text/markdown")},
        )
    if not risposta.ok:
        raise RuntimeError(f"Creazione fallita: {errore(risposta)}")
    return risposta.json()


def genera(client: Client, simulazione_id: str) -> dict:
    risposta = client.chiedi("POST", f"/api/admin/simulations/{simulazione_id}/generate")
    if not risposta.ok:
        raise RuntimeError(f"Generazione fallita: {errore(risposta)}")
    return risposta.json()


def controlla(client: Client, simulazione_id: str) -> None:
    risposta = client.chiedi("POST", f"/api/admin/simulations/{simulazione_id}/review")
    if not risposta.ok:
        scrivi(f"  Controllo del serbatoio non riuscito: {errore(risposta)}")
        return
    esito = risposta.json().get("review") or {}
    rilievi = esito.get("findings") or []
    scrivi(f"  Controllo del serbatoio: {len(rilievi)} segnalazioni su {esito.get('checked', 0)}.")


def pubblica(client: Client, simulazione_id: str) -> bool:
    risposta = client.chiedi(
        "PUT",
        f"/api/admin/simulations/{simulazione_id}/status",
        json={"status": "published"},
    )
    if risposta.ok:
        return True
    scrivi(f"  Pubblicazione non riuscita: {errore(risposta)}")
    return False


def lavora(client: Client, org_id: str, argomento: str, tipo: str, esistente: dict | None) -> str:
    """Porta una simulazione dal nulla alla pubblicazione, o la riprende.

    Torna una parola sola che dice com'è finita, per il riepilogo.
    """
    titolo = titolo_di(argomento, tipo)

    if esistente and esistente["status"] == "published":
        scrivi(f"{titolo}: già pubblicata, non la tocco.")
        return "saltata"

    if esistente:
        simulazione = esistente
        scrivi(f"{titolo}: ripresa dalla bozza, {simulazione['question_count']} domande.")
    else:
        scrivi(f"{titolo}: carico il documento {ARGOMENTI[argomento]['file']}.")
        simulazione = crea(client, org_id, argomento, tipo)

    if simulazione["question_count"] < SERBATOIO_PIENO:
        scrivi("  Genero le domande, può prendersi qualche minuto.")
        simulazione = genera(client, simulazione["id"])
        scrivi(f"  Generate {simulazione['question_count']} domande.")

    if simulazione["question_count"] < SERBATOIO_PIENO:
        scrivi(
            f"  Il serbatoio non è pieno ({simulazione['question_count']} domande su "
            f"{SERBATOIO_PIENO}): resta in bozza, rigenerala dal pannello."
        )
        return "incompleta"

    if (argomento, tipo) in CON_CONTROLLO:
        controlla(client, simulazione["id"])

    if pubblica(client, simulazione["id"]):
        scrivi("  Pubblicata.")
        return "pubblicata"
    return "incompleta"


def main() -> int:
    argomenti = argparse.ArgumentParser(description=__doc__)
    argomenti.add_argument("--base-url", default=BASE_URL)
    argomenti.add_argument("--organizzazione", default=SLUG_ORGANIZZAZIONE)
    argomenti.add_argument(
        "--prova",
        action="store_true",
        help="Dice cosa farebbe senza chiamare il modello e senza cancellare niente.",
    )
    opzioni = argomenti.parse_args()

    mancanti = [v["file"] for v in ARGOMENTI.values() if not (DOCUMENTI / v["file"]).exists()]
    if mancanti:
        scrivi(f"Documenti mancanti in {DOCUMENTI}: {', '.join(mancanti)}")
        return 1

    client = Client(opzioni.base_url)
    client.accedi(EMAIL, PASSWORD)
    org = organizzazione(client, opzioni.organizzazione)
    scrivi(f"Organizzazione: {org['name']}.")

    attesi = {titolo_di(a, t) for a, t in PIANO}
    esistenti = elenco(client)
    cancella_le_prove(client, esistenti, attesi, opzioni.prova)
    per_titolo = {s["title"]: s for s in esistenti if s["title"] in attesi}

    if opzioni.prova:
        for argomento, tipo in PIANO:
            titolo = titolo_di(argomento, tipo)
            stato = per_titolo.get(titolo, {}).get("status", "da creare")
            scrivi(f"{titolo}: {stato}")
        return 0

    esiti: dict[str, list[str]] = {"pubblicata": [], "saltata": [], "incompleta": [], "fallita": []}
    for argomento, tipo in PIANO:
        titolo = titolo_di(argomento, tipo)
        try:
            esito = lavora(client, org["id"], argomento, tipo, per_titolo.get(titolo))
        except Exception as e:  # noqa: BLE001
            scrivi(f"{titolo}: {e}")
            esito = "fallita"
        esiti[esito].append(titolo)

    scrivi("")
    scrivi(
        f"Fatto: {len(esiti['pubblicata'])} pubblicate, {len(esiti['saltata'])} già presenti, "
        f"{len(esiti['incompleta'])} rimaste in bozza, {len(esiti['fallita'])} fallite."
    )
    for stato in ("incompleta", "fallita"):
        for titolo in esiti[stato]:
            scrivi(f"  {stato}: {titolo}")
    return 0 if not esiti["fallita"] else 1


if __name__ == "__main__":
    sys.exit(main())
