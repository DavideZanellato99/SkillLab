"""Riempie il database di sviluppo con dati finti, tutti riconoscibili.

Serve a guardare le dashboard piene: su un database appena avviato i grafici
sono vuoti e non si vede se dicono la cosa giusta. Quello che nasce da qui è
identico per forma a quello che nascerebbe usando l'applicazione, ma è
riconoscibile a colpo d'occhio e si toglie con un comando.

**Come si riconosce.** Tutto quello che questo script scrive vive dentro
organizzazioni finte, e ogni riga che finisce sotto gli occhi di qualcuno
porta il marcatore:

- le organizzazioni si chiamano ``[MOCK] ...`` e il loro slug comincia per
  ``mock-``;
- gli account hanno l'email su ``@mock.invalid``, che è un dominio che non
  esiste per definizione (RFC 2606), quindi nessuna mail può partire davvero;
- avatar, test, percorsi e conversazioni hanno il titolo che comincia per
  ``[MOCK]``.

**Come si toglie.** ``--rimuovi`` cancella le organizzazioni finte con tutto
quello che contengono, riusando la stessa cancellazione del tenant che usa il
pannello di amministrazione (``erasure``), così nessuna tabella viene
dimenticata. Niente fuori dalle organizzazioni finte viene toccato: i dati
veri non sono nemmeno raggiungibili da qui.

Uso:

    backend/venv/Scripts/python.exe demo/dati_mock.py            # crea
    backend/venv/Scripts/python.exe demo/dati_mock.py --stato    # cosa c'è
    backend/venv/Scripts/python.exe demo/dati_mock.py --rimuovi  # toglie
    backend/venv/Scripts/python.exe demo/dati_mock.py --rifai    # rifà da capo

La pagina dei propri progressi si apre solo con il ruolo ``user``, e gli
account finti non esistono sull'identity provider, quindi con loro non ci si
può entrare. Per vedere piena anche quella, le prove finte si danno a un
account vero:

    backend/venv/Scripts/python.exe demo/dati_mock.py --anche-per tizio@esempio.it

Sono le uniche righe finte che vivono fuori da una organizzazione finta, e
``--rimuovi`` le toglie lo stesso: le riconosce dal marcatore nel titolo.

I dati sono **deterministici**: il generatore casuale parte da un seme
fisso, quindi due esecuzioni scrivono gli stessi voti e le stesse date
relative a oggi. Rifarli non cambia quello che si stava guardando.
"""

import argparse
import os
import random
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

# Il file di configurazione del backend, indicato per nome: lanciando lo
# script dalla radice del progetto, `load_dotenv()` da solo troverebbe quello
# del compose, che non porta DATABASE_URL.
load_dotenv(BACKEND / ".env")

from avatar_images import generate_avatar_image  # noqa: E402
from database import SessionLocal  # noqa: E402
from erasure import erase_conversations, erase_users  # noqa: E402
from models import (  # noqa: E402
    ORG_STATUS_ACTIVE,
    ROLE_ORGANIZATION_ADMIN,
    ROLE_USER,
    SIMULATION_KIND_MULTIPLE,
    SIMULATION_SOURCE_MANUAL,
    SIMULATION_STATUS_PUBLISHED,
    USER_STATUS_ACTIVE,
    Avatar,
    AvatarCategory,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationReview,
    Organization,
    Role,
    SimulationAttempt,
    SimulationQuestion,
    TechnicalSimulation,
    TrainingPath,
    TrainingPathAssignment,
    TrainingPathStep,
    User,
)
from openai_service import EVALUATION_CRITERIA  # noqa: E402
from simulation_scoring import attempt_points, question_points  # noqa: E402

# ── Come si riconosce quello che nasce da qui ──

MARCATORE = "[MOCK]"
SLUG_PREFISSO = "mock-"
DOMINIO_EMAIL = "mock.invalid"
SUB_PREFISSO = "mock-sub-"

# Il seme del generatore: i dati devono essere gli stessi a ogni esecuzione,
# altrimenti rifarli sposterebbe tutti i numeri che si stavano guardando.
SEME = 20260905

# Su quanti giorni indietro si distribuiscono le prove. Due mesi coprono
# tutti i periodi che i filtri offrono (7, 30, 90 giorni e "sempre"), quindi
# ogni scelta mostra qualcosa di diverso invece della stessa pagina.
GIORNI_DI_STORIA = 60


def adesso() -> datetime:
    """Naive UTC, la convenzione di ogni colonna temporale dello schema."""
    return datetime.now(UTC).replace(tzinfo=None)


def giorni_fa(giorni: float) -> datetime:
    return adesso() - timedelta(days=giorni)


# ── Il catalogo di quello che viene scritto ──

# I nomi da cui escono le persone finte. Una organizzazione vera ne ha
# venticinque o trenta, e a quella misura le dashboard sono un'altra cosa: il
# confronto fra utenti diventa una colonna da scorrere, la media di gruppo
# smette di essere la media di quattro persone, e una tappa su cui si ferma il
# venti per cento sono cinque persone da richiamare. Ottanta nomi scritti a
# mano sarebbero un elenco da mantenere, quindi si combinano.
NOMI = [
    "Anna",
    "Marco",
    "Giulia",
    "Luca",
    "Sara",
    "Paolo",
    "Chiara",
    "Davide",
    "Ilaria",
    "Simone",
    "Federica",
    "Nicola",
    "Elisa",
    "Andrea",
    "Martina",
    "Stefano",
    "Valentina",
    "Alessio",
    "Francesca",
    "Matteo",
    "Silvia",
    "Riccardo",
    "Laura",
    "Giorgio",
    "Beatrice",
    "Tommaso",
    "Camilla",
    "Emanuele",
    "Roberta",
    "Fabio",
]
COGNOMI = [
    "Ferrari",
    "Bianchi",
    "Conti",
    "Moretti",
    "Greco",
    "Rizzo",
    "Esposito",
    "Lombardi",
    "Marchetti",
    "Fabbri",
    "Costa",
    "Serra",
    "Barbieri",
    "Galli",
    "Rinaldi",
    "Caruso",
    "Ferrara",
    "Gatti",
    "Testa",
    "Longo",
    "Marino",
    "Sanna",
    "Vitale",
    "Palmieri",
    "Basile",
    "Sorrentino",
    "Farina",
    "Battaglia",
    "Piras",
    "Guerra",
]


def _persone_finte(rng: random.Random, quante: int, gia_usate: set[str]) -> list[tuple]:
    """`quante` persone con nome, cognome e bravura, tutte diverse fra loro.

    La bravura scende lungo la fila invece di essere estratta a caso: su
    venticinque estrazioni casuali escono venticinque medie che si somigliano,
    e il confronto fra utenti smetterebbe di dire qualcosa. Così invece c'è
    chi va bene, chi arranca e una maggioranza in mezzo, che è la forma che
    quella pagina deve saper mostrare.

    `gia_usate` sono le combinazioni già assegnate negli altri tenant:
    l'email di un account è unica su tutta la piattaforma, e due "Anna
    Ferrari" in due organizzazioni diverse la farebbero collidere.
    """
    persone = []
    while len(persone) < quante:
        nome = rng.choice(NOMI)
        cognome = rng.choice(COGNOMI)
        if f"{nome} {cognome}" in gia_usate:
            continue
        gia_usate.add(f"{nome} {cognome}")
        quota = len(persone) / max(1, quante - 1)
        persone.append(
            (nome, cognome, round(9.0 - 5.0 * quota + rng.uniform(-0.4, 0.4), 1))
        )
    return persone


# Le tre organizzazioni raccontano tre situazioni diverse, ed è voluto: la
# dashboard dell'utilizzo esiste per distinguerle, e con tre tenant tutti
# attivi non si vedrebbe la differenza fra chi si allena e chi no.
TENANT = [
    {
        "nome": f"{MARCATORE} Nordvend Formazione",
        "slug": f"{SLUG_PREFISSO}nordvend",
        "descrizione": "il tenant pieno: si allena tutti i giorni",
        "persone": 28,
        "avatar": [
            (
                "Elena",
                "Rossi",
                "Clienti",
                "cyan",
                0.6,
                "Cliente esigente ma collaborativa",
            ),
            (
                "Giovanni",
                "De Santis",
                "Reclami",
                "orange",
                -1.4,
                "Reclamo su un addebito non riconosciuto",
            ),
            (
                "Marta",
                "Villa",
                "Clienti",
                "cyan",
                1.1,
                "Prima chiamata, chiede informazioni",
            ),
            (
                "Roberto",
                "Pini",
                "Reclami",
                "orange",
                -0.6,
                "Cliente che minaccia di chiudere il conto",
            ),
            (
                "Silvia",
                "Manzoni",
                "Clienti",
                "sky",
                0.3,
                "Cliente storica che chiede una consulenza",
            ),
            (
                "Antonio",
                "Guerrini",
                "Reclami",
                "rose",
                -1.9,
                "Reclamo già escalato una volta",
            ),
        ],
        "test": [
            ("Procedure di cassa", 0.75),
            ("Bonifici e pagamenti", 0.55),
            ("Carte di debito", 0.85),
            ("Antiriciclaggio", 0.65),
        ],
        # Una ventina di prove a testa in due mesi: è l'ordine di grandezza di
        # un gruppo che si allena davvero, e resta sotto il tetto che il
        # server mette alle sue letture (`REPORT_ROW_CAP`), così le medie che
        # si leggono sono quelle di tutto e non delle prove più recenti.
        "conversazioni": 620,
        "tentativi": 240,
    },
    {
        "nome": f"{MARCATORE} Sudbanca Academy",
        "slug": f"{SLUG_PREFISSO}sudbanca",
        "descrizione": "il tenant tiepido: undici persone su ventisei si allenano",
        "persone": 26,
        "avatar": [
            (
                "Paola",
                "Neri",
                "Clienti",
                "emerald",
                0.2,
                "Cliente che chiede un preventivo",
            ),
            (
                "Alberto",
                "Fontana",
                "Reclami",
                "rose",
                -1.0,
                "Contestazione su una commissione",
            ),
            (
                "Debora",
                "Salvi",
                "Clienti",
                "amber",
                0.8,
                "Cliente giovane al primo conto",
            ),
        ],
        "test": [("Mutui ipotecari", 0.6), ("Carte di credito", 0.7)],
        "conversazioni": 150,
        "tentativi": 60,
        # Undici su ventisei: è il rapporto che la dashboard dell'utilizzo
        # mette accanto al totale degli account, ed è la differenza fra una
        # licenza usata e una licenza soltanto pagata.
        "persone_attive": 11,
    },
    {
        "nome": f"{MARCATORE} Ovest Retail",
        "slug": f"{SLUG_PREFISSO}ovest",
        "descrizione": "il tenant fermo: account aperti e mai usati",
        "persone": 25,
        "avatar": [],
        "test": [],
        "conversazioni": 0,
        "tentativi": 0,
        "persone_attive": 0,
    },
]

# I titoli delle conversazioni, presi a giro: sono quelli che si leggono
# nella tabella della dashboard, e "Conversazione 12" non racconta niente.
ARGOMENTI = [
    "Reclamo carta bloccata",
    "Richiesta di rimborso",
    "Bonifico non arrivato",
    "Apertura conto",
    "Contestazione commissioni",
    "Assistenza home banking",
    "Rinnovo carta in scadenza",
    "Informazioni sul mutuo",
]

# Le domande dei test finti. La seconda di ogni serbatoio è quella scritta
# male: quasi nessuno la indovina, ed è il caso che la vista dei contenuti
# esiste per far vedere, perché dentro la media di dieci domande non si vede.
DOMANDE = [
    (
        "Entro quanti giorni va gestito un reclamo scritto?",
        ["15 giorni", "30 giorni", "60 giorni", "90 giorni"],
        1,
    ),
    (
        "Quale documento NON è mai sufficiente da solo per l'identificazione?",
        ["Passaporto", "Patente", "Tessera sanitaria", "Carta d'identità"],
        2,
    ),
    (
        "Quando si può disporre lo storno immediato di un addebito?",
        ["Sempre", "Entro 8 settimane", "Mai", "Solo con delega"],
        1,
    ),
    (
        "Chi autorizza un'operazione sopra la soglia di allerta?",
        ["L'operatore", "Il responsabile di filiale", "Il cliente", "Nessuno"],
        1,
    ),
    (
        "Cosa si verifica prima di sbloccare una carta?",
        ["Il saldo", "L'identità del titolare", "L'IBAN", "Il PIN"],
        1,
    ),
    (
        "Quale canale va usato per una segnalazione di frode?",
        ["Email ordinaria", "Canale antifrode dedicato", "Chat pubblica", "Nessuno"],
        1,
    ),
    (
        "Ogni quanto va aggiornata l'adeguata verifica della clientela?",
        ["Mai", "A ogni contatto", "Secondo il profilo di rischio", "Ogni dieci anni"],
        2,
    ),
    (
        "Cosa comporta il blocco preventivo di una carta?",
        [
            "Chiusura del conto",
            "Sospensione delle operazioni con quella carta",
            "Perdita del saldo",
            "Nulla",
        ],
        1,
    ),
    (
        "Chi può richiedere la copia di una contabile?",
        [
            "Chiunque",
            "Il titolare o un delegato",
            "Solo la filiale",
            "Solo il call center",
        ],
        1,
    ),
    (
        "Quale dato non va mai chiesto al telefono?",
        ["Il nome", "Il PIN", "L'indirizzo", "La data di nascita"],
        1,
    ),
    (
        "Cosa si fa se il cliente non supera l'identificazione?",
        [
            "Si prosegue comunque",
            "Si interrompe e si annota",
            "Si chiede il PIN",
            "Si chiude il conto",
        ],
        1,
    ),
    (
        "Quando la pratica va inoltrata all'ufficio reclami?",
        [
            "Sempre",
            "Quando il cliente lo chiede per iscritto",
            "Mai",
            "Solo di persona",
        ],
        1,
    ),
]

# I percorsi finti, uno per tenant che si allena. Le tappe puntano agli
# avatar e ai test dello stesso tenant, per posizione nei propri elenchi.
PERCORSI = {
    f"{SLUG_PREFISSO}nordvend": [
        {
            "titolo": f"{MARCATORE} Onboarding vendite",
            "affidato_a": 14,
            "tappe": [
                # `scadenza` sono i giorni da oggi: negativa è una data
                # passata, positiva una che deve ancora arrivare, assente
                # una tappa che non scade
                {"avatar": 2, "obiettivo": 6.5, "scadenza": 12},
                {"test": 0, "obiettivo": 6.0, "scadenza": 25},
                {"avatar": 0, "obiettivo": 7.0},
            ],
        },
        {
            "titolo": f"{MARCATORE} Gestione dei reclami",
            "affidato_a": 10,
            "tappe": [
                # Le due date sono già passate: è il percorso che porta gli
                # ultimi due stati che le altre non producono, cioè chi è
                # rimasto indietro (scaduto) e chi ha chiuso comunque, ma
                # dopo il termine
                {"avatar": 1, "obiettivo": 7.0, "scadenza": -25},
                {"avatar": 3, "obiettivo": 7.5, "scadenza": -3},
            ],
        },
    ],
    f"{SLUG_PREFISSO}sudbanca": [
        {
            "titolo": f"{MARCATORE} Avvio in filiale",
            "affidato_a": 8,
            "tappe": [
                {"avatar": 0, "obiettivo": 6.5},
                {"test": 0, "obiettivo": 6.0, "scadenza": 5},
            ],
        },
    ],
}

# Come finisce ogni assegnazione. Sono gli esiti che la dashboard dei
# percorsi deve saper distinguere, e ci sono tutti apposta: senza uno
# scaduto e senza uno fermo a metà, le barre direbbero che tutto funziona.
ESITI = ["completato", "completato_in_ritardo", "a_meta", "scaduto", "appena_affidato"]


# ── La scrittura ──


def _persona_finta(nome: str, cognome: str, descrizione: str) -> dict:
    """La scheda persona di un avatar finto, nella forma che il prompt legge."""
    return {
        "NOME": nome,
        "COGNOME": cognome,
        "ETA": "45",
        "PROFESSIONE": "Cliente",
        "PERSONALITA": "Diretto, poco paziente se non si va al punto",
        "SCENARIO": descrizione,
        "OBIETTIVO_NASCOSTO": "Capire se l'operatore conosce la procedura",
        "CAUSA_REALE": "Un addebito non riconosciuto sul conto",
        "NOTE": f"Scheda finta scritta da demo/dati_mock.py ({MARCATORE})",
    }


def _voto(rng: random.Random, base: float, scarto: float = 0.0) -> float:
    """Un voto in decimi attorno alla bravura di chi parla.

    La bravura della persona e la durezza dell'avatar si sommano, perché è
    quello che la dashboard dei contenuti deve poter distinguere: lo stesso
    gruppo va peggio con l'interlocutore difficile.
    """
    valore = base + scarto + rng.uniform(-0.9, 0.9)
    return round(min(10.0, max(1.0, valore)), 1)


def _valutazione(rng: random.Random, voto: float) -> dict:
    """Il JSON di una valutazione, con i sei criteri canonici.

    I criteri sono quelli veri (``EVALUATION_CRITERIA``) e non un elenco
    scritto qui: le etichette che la dashboard mostra devono essere le stesse
    su cui il giudizio vero verrebbe dato.
    """
    criteri = []
    for key, label, _peso in EVALUATION_CRITERIA:
        # L'identificazione del cliente è il criterio su cui questo gruppo
        # inciampa: serve a far vedere che la dashboard lo sa dire
        penalita = 1.6 if key == "identificazione_cliente" else 0.0
        punteggio = round(
            min(10.0, max(1.0, voto - penalita + rng.uniform(-0.7, 0.7))), 1
        )
        criteri.append(
            {
                "key": key,
                "label": label,
                "score": punteggio,
                "comment": f"{MARCATORE} commento finto per {label.lower()}.",
                "suggestions": (
                    f"{MARCATORE} suggerimento finto." if punteggio < 8 else None
                ),
                "citations": [],
            }
        )
    return {
        "summary": f"{MARCATORE} sintesi finta della conversazione.",
        "criteria": criteri,
    }


def _conversazione(
    db,
    rng: random.Random,
    utente: User,
    avatar: Avatar,
    quando: datetime,
    voto: float,
    *,
    canale: str,
    revisione: bool = False,
) -> ChatConversation:
    """Una conversazione finta, già valutata, con la sua trascrizione.

    I messaggi non sono decorazione: la durata che il report attività e la
    dashboard dell'utilizzo mostrano si ricava dal primo e dall'ultimo, e
    senza di loro ogni chiamata durerebbe zero.
    """
    conversazione = ChatConversation(
        user_id=utente.id,
        avatar_id=avatar.id,
        title=f"{MARCATORE} {rng.choice(ARGOMENTI)}",
        mode=canale,
        created_at=quando,
        ended_at=quando + timedelta(minutes=rng.randint(4, 18)),
    )
    db.add(conversazione)
    db.flush()

    battute = rng.randint(6, 14)
    passo = timedelta(seconds=rng.randint(40, 90))
    for indice in range(battute):
        db.add(
            ChatMessage(
                conversation_id=conversazione.id,
                role="user" if indice % 2 == 0 else "assistant",
                content=f"{MARCATORE} battuta finta numero {indice + 1}.",
                created_at=quando + passo * indice,
            )
        )

    db.add(
        ConversationEvaluation(
            conversation_id=conversazione.id,
            overall_score=voto,
            result=_valutazione(rng, voto),
            created_at=quando + timedelta(minutes=20),
        )
    )

    if revisione:
        # Una correzione del docente ogni tanto: è quello che fa comparire
        # l'etichetta "corretto" accanto al voto, e la dashboard deve
        # mostrare il voto finale e non quello della macchina.
        db.add(
            ConversationReview(
                conversation_id=conversazione.id,
                reviewer_id=None,
                reviewer_name=f"{MARCATORE} Docente",
                summary_note=f"{MARCATORE} nota finta del docente.",
                override_score=round(min(10.0, voto + 1.5), 1),
                override_reason=f"{MARCATORE} motivazione finta della correzione.",
                ai_score_at_review=voto,
                created_at=quando + timedelta(days=1),
            )
        )
    db.flush()
    return conversazione


def _tentativo(
    db,
    rng: random.Random,
    utente: User,
    simulazione: TechnicalSimulation,
    domande: list[SimulationQuestion],
    quando: datetime,
    bravura: float,
) -> SimulationAttempt:
    """Un test consegnato, con la fotografia delle risposte date.

    Le risposte servono per intero: la vista dei contenuti apre una riga e
    conta quante volte ogni domanda è stata data giusta, e senza la
    fotografia non ci sarebbe niente da contare.
    """
    scelte = rng.sample(domande, k=min(10, len(domande)))
    risposte = []
    for posizione, domanda in enumerate(
        sorted(scelte, key=lambda d: d.position), start=1
    ):
        # La seconda domanda del serbatoio è quella scritta male, e la nona
        # è quella che la gente lascia in bianco: sono i due casi che la
        # tabella delle domande deve far notare.
        if domanda.position == 2:
            giusta = rng.random() < 0.1
            in_bianco = False
        elif domanda.position == 9:
            in_bianco = rng.random() < 0.5
            giusta = False if in_bianco else rng.random() < bravura
        else:
            in_bianco = False
            giusta = rng.random() < bravura

        opzioni = domanda.options or []
        if in_bianco:
            scelta = None
        elif giusta:
            scelta = domanda.correct_option
        else:
            sbagliate = [i for i in range(len(opzioni)) if i != domanda.correct_option]
            scelta = rng.choice(sbagliate) if sbagliate else None
        millisecondi = None if in_bianco else rng.randint(6000, 240000)
        risposte.append(
            {
                "question_id": str(domanda.id),
                "position": posizione,
                "text": domanda.text,
                "options": opzioni,
                "selected_option": scelta,
                "correct_option": domanda.correct_option,
                "is_correct": giusta,
                "elapsed_ms": millisecondi,
                "points": question_points(giusta, millisecondi),
                "explanation": f"{MARCATORE} spiegazione finta.",
            }
        )

    punti = attempt_points([r["points"] for r in risposte])
    tentativo = SimulationAttempt(
        simulation_id=simulazione.id,
        user_id=utente.id,
        correct_count=sum(1 for r in risposte if r["is_correct"]),
        question_count=len(risposte),
        earned_points=punti,
        answers=risposte,
        created_at=quando,
    )
    db.add(tentativo)
    db.flush()
    return tentativo


def _ruoli(db) -> dict[str, Role]:
    """I ruoli di sistema, per nome.

    Letti e non creati: esistono da quando l'applicazione è partita la prima
    volta, e uno script che li scrivesse da sé metterebbe una seconda mano
    su una tabella che il backend costruisce all'avvio.
    """
    righe = {riga.name: riga for riga in db.query(Role).all()}
    mancanti = {ROLE_USER, ROLE_ORGANIZATION_ADMIN} - righe.keys()
    if mancanti:
        raise SystemExit(
            f"Ruoli non trovati nel database: {', '.join(sorted(mancanti))}. "
            "Avvia il backend almeno una volta prima di riempire il database."
        )
    return righe


def _crea_tenant(
    db, rng: random.Random, definizione: dict, nomi_usati: set[str]
) -> dict:
    """Una organizzazione finta con la sua gente, i suoi avatar e i suoi test."""
    ruoli = _ruoli(db)

    org = Organization(
        name=definizione["nome"],
        slug=definizione["slug"],
        status=ORG_STATUS_ACTIVE,
    )
    db.add(org)
    db.flush()

    # Un amministratore per tenant: serve per entrare e guardare le
    # dashboard dalla parte di chi ne amministra una sola. Non conta fra le
    # persone che si allenano, come nell'applicazione vera.
    admin = User(
        cognito_sub=f"{SUB_PREFISSO}{uuid.uuid4()}",
        email=f"admin.{definizione['slug']}@{DOMINIO_EMAIL}",
        nome="Admin",
        cognome=definizione["nome"].replace(f"{MARCATORE} ", ""),
        role_id=ruoli[ROLE_ORGANIZATION_ADMIN].id,
        organization_id=org.id,
        status=USER_STATUS_ACTIVE,
        last_login_at=giorni_fa(1),
        last_activity_at=giorni_fa(1),
    )
    db.add(admin)

    persone = []
    elenco = _persone_finte(rng, definizione["persone"], nomi_usati)
    for indice, (nome, cognome, bravura) in enumerate(elenco):
        attive = definizione.get("persone_attive")
        si_allena = attive is None or indice < attive
        utente = User(
            cognito_sub=f"{SUB_PREFISSO}{uuid.uuid4()}",
            email=f"{nome.lower()}.{cognome.lower()}@{DOMINIO_EMAIL}",
            nome=nome,
            cognome=cognome,
            role_id=ruoli[ROLE_USER].id,
            organization_id=org.id,
            status=USER_STATUS_ACTIVE,
            last_login_at=giorni_fa(rng.uniform(0, 20)) if si_allena else None,
            last_activity_at=giorni_fa(rng.uniform(0, 5)) if si_allena else None,
        )
        db.add(utente)
        db.flush()
        persone.append({"utente": utente, "bravura": bravura, "si_allena": si_allena})

    categorie: dict[str, AvatarCategory] = {}
    avatar = []
    for nome, cognome, categoria, colore, durezza, descrizione in definizione["avatar"]:
        if categoria not in categorie:
            riga = AvatarCategory(organization_id=org.id, name=categoria, color=colore)
            db.add(riga)
            db.flush()
            categorie[categoria] = riga
        identificativo = uuid.uuid4()
        nome_completo = f"{MARCATORE} {nome} {cognome}"
        riga = Avatar(
            id=identificativo,
            name=nome_completo,
            # Lo stesso segnaposto che l'applicazione genera quando un avatar
            # nasce senza ritratto: il file finisce accanto agli altri e se ne
            # va con la rimozione
            image_url=generate_avatar_image(f"{nome} {cognome}", identificativo),
            category_id=categorie[categoria].id,
            organization_id=org.id,
            description=f"{MARCATORE} {descrizione}",
            profile=_persona_finta(nome, cognome, descrizione),
        )
        db.add(riga)
        db.flush()
        avatar.append({"riga": riga, "durezza": durezza})

    test = []
    for titolo, facilita in definizione["test"]:
        simulazione = TechnicalSimulation(
            organization_id=org.id,
            title=f"{MARCATORE} {titolo}",
            description=f"{MARCATORE} test finto per riempire le dashboard.",
            status=SIMULATION_STATUS_PUBLISHED,
            kind=SIMULATION_KIND_MULTIPLE,
            source=SIMULATION_SOURCE_MANUAL,
        )
        db.add(simulazione)
        db.flush()
        domande = []
        for posizione, (testo, opzioni, corretta) in enumerate(DOMANDE, start=1):
            domanda = SimulationQuestion(
                simulation_id=simulazione.id,
                position=posizione,
                text=f"{MARCATORE} {testo}",
                options=opzioni,
                correct_option=corretta,
                expected_answer="",
                explanation=f"{MARCATORE} spiegazione finta.",
            )
            db.add(domanda)
            domande.append(domanda)
        db.flush()
        test.append({"riga": simulazione, "domande": domande, "facilita": facilita})

    return {"org": org, "persone": persone, "avatar": avatar, "test": test}


def _prove_libere(db, rng: random.Random, tenant: dict, definizione: dict) -> None:
    """Le prove sparse che riempiono i punteggi e i contenuti.

    Sono l'allenamento normale, quello che non appartiene a nessun percorso:
    la maggior parte di quello che una dashboard mostra è questo.
    """
    attive = [p for p in tenant["persone"] if p["si_allena"]]
    if not attive or not tenant["avatar"]:
        return

    for _ in range(definizione["conversazioni"]):
        persona = rng.choice(attive)
        interlocutore = rng.choice(tenant["avatar"])
        quando = giorni_fa(rng.uniform(0.2, GIORNI_DI_STORIA))
        _conversazione(
            db,
            rng,
            persona["utente"],
            interlocutore["riga"],
            quando,
            _voto(rng, persona["bravura"], interlocutore["durezza"]),
            canale="voice" if rng.random() < 0.65 else "text",
            # Una conversazione su otto passa dal docente: abbastanza da
            # vedere l'etichetta, non tanto da sembrare la regola
            revisione=rng.random() < 0.12,
        )

    for _ in range(definizione["tentativi"]):
        persona = rng.choice(attive)
        prova = rng.choice(tenant["test"]) if tenant["test"] else None
        if prova is None:
            break
        _tentativo(
            db,
            rng,
            persona["utente"],
            prova["riga"],
            prova["domande"],
            giorni_fa(rng.uniform(0.2, GIORNI_DI_STORIA)),
            prova["facilita"],
        )


def _crea_percorsi(
    db, rng: random.Random, tenant: dict, definizioni: list[dict]
) -> None:
    """I percorsi affidati, con prove costruite per l'esito che devono avere.

    Il progresso non è salvato da nessuna parte: si ricava dalle prove svolte
    dopo lo sblocco di ogni tappa (vedi ``training_progress``). Quindi qui non
    si scrive uno stato, si scrivono **le prove che lo producono**, una dopo
    l'altra nel tempo, ed è l'unico modo di avere un percorso completato o
    scaduto che risulti tale anche a chi lo legge.
    """
    attive = [p for p in tenant["persone"] if p["si_allena"]]
    if not attive:
        return

    for definizione in definizioni:
        percorso = TrainingPath(
            organization_id=tenant["org"].id,
            title=definizione["titolo"],
            description=f"{MARCATORE} percorso finto per riempire le dashboard.",
        )
        tappe = []
        for posizione, tappa in enumerate(definizione["tappe"], start=1):
            avatar_id = None
            simulazione_id = None
            if "avatar" in tappa:
                avatar_id = tenant["avatar"][tappa["avatar"]]["riga"].id
            else:
                simulazione_id = tenant["test"][tappa["test"]]["riga"].id
            riga = TrainingPathStep(
                position=posizione,
                avatar_id=avatar_id,
                simulation_id=simulazione_id,
                target_score=tappa["obiettivo"],
                # La scadenza è una data a calendario, uguale per chiunque
                # percorra quel percorso: qui la scrive il catalogo, così
                # alcune sono già passate e altre no
                due_at=(
                    giorni_fa(-tappa["scadenza"])
                    if tappa.get("scadenza") is not None
                    else None
                ),
            )
            percorso.steps.append(riga)
            tappe.append(riga)
        db.add(percorso)
        db.flush()

        # Un percorso si affida a un gruppo, non a tutta l'organizzazione:
        # chi compone sceglie i nuovi arrivati o chi va richiamato su un
        # tema, e affidarlo a tutti e ventotto darebbe una pagina in cui
        # ogni percorso somiglia a ogni altro.
        gruppo = attive[: definizione.get("affidato_a", 12)]
        for indice, persona in enumerate(gruppo):
            esito = ESITI[indice % len(ESITI)]
            affidato = giorni_fa(rng.uniform(20, 45))
            if esito == "appena_affidato":
                affidato = giorni_fa(rng.uniform(1, 3))
            db.add(
                TrainingPathAssignment(
                    path_id=percorso.id,
                    user_id=persona["utente"].id,
                    created_at=affidato,
                )
            )
            db.flush()
            _prove_del_percorso(db, rng, persona, tappe, tenant, affidato, esito)


def _prove_del_percorso(
    db,
    rng: random.Random,
    persona: dict,
    tappe: list[TrainingPathStep],
    tenant: dict,
    affidato: datetime,
    esito: str,
) -> None:
    """Le prove che portano una assegnazione all'esito voluto.

    Una tappa si sblocca quando quella prima di lei è stata superata, quindi
    le prove si scrivono in fila e ognuna dopo la precedente: una prova
    datata prima dello sblocco non conta, ed è la regola che rende questo
    codice l'unico modo onesto di seminare un percorso a metà.
    """
    if esito == "appena_affidato":
        return

    da_superare = {
        "completato": len(tappe),
        "completato_in_ritardo": len(tappe),
        "a_meta": max(1, len(tappe) - 1),
        "scaduto": 0,
    }[esito]

    momento = affidato + timedelta(days=rng.uniform(0.5, 2))
    for indice, tappa in enumerate(tappe):
        superata = indice < da_superare
        # Sul percorso chiuso in ritardo l'ultima tappa arriva dopo la
        # propria data: è l'unica differenza con quello chiuso in tempo.
        # Solo dove quella data è già passata, però: una prova datata domani
        # non è una prova in ritardo, è una riga sbagliata che finirebbe in
        # fondo a ogni grafico dell'applicazione.
        if (
            esito == "completato_in_ritardo"
            and indice == len(tappe) - 1
            and tappa.due_at is not None
            and tappa.due_at < adesso()
        ):
            momento = tappa.due_at + timedelta(hours=6)

        # Una prova sotto l'obiettivo prima di quella buona: è così che
        # nasce la media di tentativi per tappa che la dashboard mostra
        tentativi = [False, True] if superata and rng.random() < 0.6 else [superata]
        for riuscita in tentativi:
            voto = (
                round(min(10.0, tappa.target_score + rng.uniform(0.1, 1.2)), 1)
                if riuscita
                else round(max(1.0, tappa.target_score - rng.uniform(0.8, 2.5)), 1)
            )
            if tappa.avatar_id is not None:
                interlocutore = next(
                    a for a in tenant["avatar"] if a["riga"].id == tappa.avatar_id
                )
                _conversazione(
                    db,
                    rng,
                    persona["utente"],
                    interlocutore["riga"],
                    momento,
                    voto,
                    canale="voice" if rng.random() < 0.7 else "text",
                )
            else:
                prova = next(
                    t for t in tenant["test"] if t["riga"].id == tappa.simulation_id
                )
                # Il voto di un test esce dai punti sulle domande, quindi qui
                # si sceglie quante ne indovina invece del voto: è la stessa
                # scala, presa dal verso in cui il simulatore la produce
                _tentativo(
                    db,
                    rng,
                    persona["utente"],
                    prova["riga"],
                    prova["domande"],
                    momento,
                    0.95 if riuscita else 0.35,
                )
            # Mai oltre oggi: le prove di un percorso si succedono nel
            # tempo, e su un percorso lungo affidato di recente la somma
            # degli intervalli arriverebbe a scavalcare la giornata di oggi
            momento = min(momento + timedelta(days=rng.uniform(0.5, 3)), adesso())

        if not superata:
            break


def crea(db) -> None:
    """Scrive tutto, tenant per tenant."""
    rng = random.Random(SEME)
    # Le combinazioni di nome e cognome già assegnate: l'email di un account è
    # unica su tutta la piattaforma, quindi non si ripetono da un tenant
    # all'altro.
    nomi_usati: set[str] = set()
    for definizione in TENANT:
        tenant = _crea_tenant(db, rng, definizione, nomi_usati)
        _prove_libere(db, rng, tenant, definizione)
        _crea_percorsi(db, rng, tenant, PERCORSI.get(definizione["slug"], []))
        db.commit()
        print(  # noqa: T201
            f"  {definizione['nome']}: {len(tenant['persone'])} persone, "
            f"{len(tenant['avatar'])} avatar, {len(tenant['test'])} test "
            f"({definizione['descrizione']})"
        )


# ── La rimozione ──


def _organizzazioni_finte(db) -> list[Organization]:
    """Le organizzazioni scritte da qui, riconosciute dallo slug.

    Dallo slug e non dal nome: il nome si può cambiare dal pannello, lo slug
    no, ed è l'unica cosa che dice con certezza che quel tenant è finto.
    """
    return (
        db.query(Organization)
        .filter(Organization.slug.like(f"{SLUG_PREFISSO}%"))
        .order_by(Organization.name)
        .all()
    )


def rimuovi(db) -> None:
    """Cancella le organizzazioni finte con tutto quello che contengono.

    Passa dalla stessa cancellazione del tenant che usa il pannello di
    amministrazione (``erasure``), invece di scrivere qui una seconda lista di
    tabelle: quella lista si dimenticherebbe di una tabella il giorno in cui
    ne nasce una nuova, e lascerebbe in giro righe finte senza più niente a
    cui appartenere.
    """
    organizzazioni = _organizzazioni_finte(db)

    # Prima le prove finte messe addosso a un account vero (`--anche-per`):
    # stanno fuori da ogni organizzazione finta, quindi la cancellazione dei
    # tenant non le prenderebbe, e a riconoscerle è il marcatore nel titolo.
    fuori = [
        row[0]
        for row in db.query(ChatConversation.id)
        .join(User, User.id == ChatConversation.user_id)
        .filter(ChatConversation.title.like(f"{MARCATORE}%"))
        .filter(User.organization_id.notin_([o.id for o in organizzazioni]))
        .all()
    ]
    if fuori:
        erase_conversations(db, fuori)
        db.commit()
        print(f"  tolte {len(fuori)} conversazioni finte da account veri")  # noqa: T201

    if not organizzazioni:
        _ritratti_orfani(db)
        if not fuori:
            print("Non c'è niente da togliere: nessun dato finto.")  # noqa: T201
        return

    for org in organizzazioni:
        utenti = db.query(User).filter(User.organization_id == org.id).all()
        avatar = db.query(Avatar).filter(Avatar.organization_id == org.id).all()

        # Le conversazioni tenute contro gli avatar di questo tenant da
        # qualcuno di fuori: non ce ne sono, ma il pannello le toglie e qui
        # si fa lo stesso, così i due percorsi non divergono
        if avatar:
            erase_conversations(
                db,
                [
                    row[0]
                    for row in db.query(ChatConversation.id)
                    .filter(ChatConversation.avatar_id.in_([a.id for a in avatar]))
                    .all()
                ],
            )

        erase_users(db, [u.id for u in utenti])

        for percorso in (
            db.query(TrainingPath).filter(TrainingPath.organization_id == org.id).all()
        ):
            db.delete(percorso)
        for simulazione in (
            db.query(TechnicalSimulation)
            .filter(TechnicalSimulation.organization_id == org.id)
            .all()
        ):
            db.delete(simulazione)

        # I ritratti segnaposto scritti su disco se ne vanno con le righe che
        # li nominavano: restare sarebbero file orfani in una cartella dove
        # nessuno andrà mai a cercarli
        for riga in avatar:
            percorso_file = BACKEND / riga.image_url.lstrip("/")
            if percorso_file.is_file():
                os.remove(percorso_file)

        # Gli avatar prima delle loro categorie, e con una DELETE sola come
        # nel pannello: cancellandoli riga per riga la sessione le manda al
        # database dopo, e la categoria se ne andrebbe mentre un avatar la
        # indica ancora
        if avatar:
            db.query(Avatar).filter(Avatar.id.in_([a.id for a in avatar])).delete(
                synchronize_session=False
            )
        db.query(AvatarCategory).filter(
            AvatarCategory.organization_id == org.id
        ).delete(synchronize_session=False)
        nome = org.name
        db.delete(org)
        db.commit()
        print(f"  tolta {nome} ({len(utenti)} account, {len(avatar)} avatar)")  # noqa: T201

    _ritratti_orfani(db)


def _ritratti_orfani(db) -> None:
    """Cancella i segnaposto che non appartengono più a nessun avatar.

    I file se ne vanno insieme alla riga che li nominava, ma una rimozione
    interrotta a metà può lasciarne indietro qualcuno, e da lì non se ne
    andrebbero più: nessuna schermata li mostra e nessuno andrebbe a cercarli
    in quella cartella. Si riconoscono da soli, perché il criterio è non
    essere nominati da nessuna riga: un ritratto vero non ci finisce mai.
    """
    cartella = BACKEND / "static" / "avatars"
    if not cartella.is_dir():
        return
    nominati = {row[0].split("/")[-1] for row in db.query(Avatar.image_url).all()}
    tolti = 0
    for file in cartella.glob("avatar_*.svg"):
        if file.name not in nominati:
            os.remove(file)
            tolti += 1
    if tolti:
        print(f"  tolti {tolti} ritratti segnaposto senza più un avatar")  # noqa: T201


def prove_per_un_account_vero(db, email: str) -> None:
    """Dà qualche prova finta a un account che esiste davvero.

    Serve a una pagina sola, i propri progressi: quella si apre solo con il
    ruolo `user`, e gli account finti non esistono sull'identity provider,
    quindi con loro non ci si può nemmeno entrare. Con questo, chi ha già un
    account vero se la trova piena.

    Le conversazioni portano il marcatore nel titolo come tutte le altre, ed
    è da lì che ``--rimuovi`` le riconosce: sono le uniche righe finte che
    vivono fuori da una organizzazione finta, e senza marcatore resterebbero
    addosso a una persona vera per sempre.

    I voti salgono nel tempo di proposito: quella pagina risponde a "sto
    migliorando", e su voti sparsi a caso non risponderebbe niente.
    """
    rng = random.Random(SEME + 1)
    utente = db.query(User).filter(User.email == email).first()
    if utente is None:
        raise SystemExit(f"Nessun account con l'email {email}.")
    if utente.ruolo != ROLE_USER:
        raise SystemExit(
            f"{email} amministra: la pagina dei progressi è di chi si allena, "
            "quindi le prove finte lì non si vedrebbero."
        )

    avatar = (
        db.query(Avatar).filter(Avatar.organization_id == utente.organization_id).all()
    )
    if not avatar:
        raise SystemExit(
            f"L'organizzazione di {email} non ha avatar: senza interlocutori non "
            "si possono scrivere conversazioni."
        )

    quante = 14
    for indice in range(quante):
        _conversazione(
            db,
            rng,
            utente,
            rng.choice(avatar),
            giorni_fa(GIORNI_DI_STORIA * (1 - indice / quante) + rng.uniform(0, 1)),
            _voto(rng, 5.2 + 2.6 * indice / quante),
            canale="voice" if rng.random() < 0.6 else "text",
            # Una sola corretta dal docente: basta a far comparire
            # l'etichetta accanto al voto senza farla sembrare la regola
            revisione=indice == quante - 2,
        )

    simulazioni = (
        db.query(TechnicalSimulation)
        .filter(TechnicalSimulation.organization_id == utente.organization_id)
        .all()
    )
    for simulazione in simulazioni[:2]:
        domande = (
            db.query(SimulationQuestion)
            .filter(SimulationQuestion.simulation_id == simulazione.id)
            .all()
        )
        if len(domande) < 3:
            continue
        for indice in range(4):
            _tentativo(
                db,
                rng,
                utente,
                simulazione,
                domande,
                giorni_fa(40 - 9 * indice),
                0.45 + 0.12 * indice,
            )
    db.commit()
    print(f"  prove finte addosso a {email}: {quante} conversazioni e i suoi test")  # noqa: T201


def stato(db) -> None:
    """Dice cosa c'è di finto nel database, senza toccare niente."""
    organizzazioni = _organizzazioni_finte(db)
    if not organizzazioni:
        print("Nessun dato finto: il database contiene solo dati veri.")  # noqa: T201
        return

    for org in organizzazioni:
        utenti = db.query(User).filter(User.organization_id == org.id).count()
        avatar = db.query(Avatar).filter(Avatar.organization_id == org.id).count()
        test = (
            db.query(TechnicalSimulation)
            .filter(TechnicalSimulation.organization_id == org.id)
            .count()
        )
        conversazioni = (
            db.query(ChatConversation)
            .join(User, User.id == ChatConversation.user_id)
            .filter(User.organization_id == org.id)
            .count()
        )
        tentativi = (
            db.query(SimulationAttempt)
            .join(User, User.id == SimulationAttempt.user_id)
            .filter(User.organization_id == org.id)
            .count()
        )
        percorsi = (
            db.query(TrainingPath)
            .filter(TrainingPath.organization_id == org.id)
            .count()
        )
        print(  # noqa: T201
            f"  {org.name} ({org.slug}): {utenti} account, {avatar} avatar, {test} test, "
            f"{conversazioni} conversazioni, {tentativi} tentativi, {percorsi} percorsi"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    gruppo = parser.add_mutually_exclusive_group()
    gruppo.add_argument(
        "--rimuovi", action="store_true", help="toglie tutto quello che è finto"
    )
    gruppo.add_argument("--stato", action="store_true", help="dice cosa c'è di finto")
    gruppo.add_argument(
        "--rifai", action="store_true", help="toglie e riscrive da capo"
    )
    parser.add_argument(
        "--anche-per",
        metavar="EMAIL",
        help=(
            "dà qualche prova finta a un account vero, che è l'unico modo di "
            "guardare piena la pagina dei propri progressi"
        ),
    )
    argomenti = parser.parse_args()

    db = SessionLocal()
    try:
        if argomenti.stato:
            stato(db)
            return
        if argomenti.rimuovi:
            print("Rimozione dei dati finti:")  # noqa: T201
            rimuovi(db)
            return
        if argomenti.rifai:
            print("Rimozione dei dati finti:")  # noqa: T201
            rimuovi(db)
        elif _organizzazioni_finte(db):
            # I tenant finti ci sono già. Se la richiesta era solo di dare
            # delle prove a un account vero, quella si fa lo stesso: è una
            # cosa a parte, e chiedere di rifare tutto per averla sarebbe
            # rifare anche quello che si stava guardando.
            if argomenti.anche_per:
                print(f"Prove finte per un account vero (marcate {MARCATORE}):")  # noqa: T201
                prove_per_un_account_vero(db, argomenti.anche_per)
                return
            print(  # noqa: T201
                "Ci sono già dei dati finti nel database. Usa --rifai per riscriverli "
                "da capo, o --rimuovi per toglierli."
            )
            return

        print(f"Scrittura dei dati finti (tutti marcati {MARCATORE}):")  # noqa: T201
        crea(db)
        if argomenti.anche_per:
            prove_per_un_account_vero(db, argomenti.anche_per)
        print(  # noqa: T201
            "\nFatto. Si tolgono con:\n"
            "  backend/venv/Scripts/python.exe demo/dati_mock.py --rimuovi"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
