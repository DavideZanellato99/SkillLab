"""La bozza di un percorso, ricavata da un obiettivo formativo raccontato.

Il gemello di ``persona_draft`` per l'altra metà del lavoro di chi insegna.
Là si compila una scheda di settanta campi, qui si mette in fila il catalogo
del proprio tenant, e il giro è lo stesso di sempre: una fonte scritta da una
persona, una passata del modello di ragionamento, una revisione umana, e solo
dopo il salvataggio.

Il motivo per cui esiste: comporre un percorso vuol dire aprire la galleria,
ricordarsi quali avatar esistono e cosa mettono alla prova, scegliere quali
servono a questo corso, decidere in che ordine vanno affrontati e mettere sei
soglie. Le cose che contano davvero sono l'obiettivo del corso e l'ordine, e
si dicono in due righe; il resto è ricostruire a memoria un catalogo che il
server conosce già.

**Qui non si salva niente.** Entra un obiettivo, esce una proposta: chi l'ha
chiesta se la trova nel form e decide cosa tenere. Un percorso generato non
diventa mai un percorso senza che qualcuno l'abbia guardato, esattamente come
una scheda persona e come le cinquanta domande di una simulazione.

Due scelte reggono il file.

**Il modello non vede nessun UUID.** Il catalogo gli arriva numerato con
sigle corte (``A1`` per il primo avatar, ``T1`` per il primo test), e le
tappe le indica con quelle. Un id di trentasei caratteri ricopiato a mano da
un modello linguistico è un id sbagliato prima o poi, e sarebbe sbagliato in
silenzio: la tappa punterebbe a un avatar che esiste, solo non quello. Con le
sigle, una citazione storta non corrisponde a niente e cade.

**Le scadenze non le scrive il modello.** Una data sta sul calendario e
dipende da quando il corso comincia, che è la cosa che il modello non può
sapere. Le tappe nascono senza, e le mette chi compone: è anche il motivo per
cui un percorso vecchio va ridatato prima di affidarlo di nuovo (vedi
``training-e-report.md``).
"""

from dataclasses import dataclass
from uuid import UUID

from openai_service import eval_json_completion

# Quante tappe può proporre. Il tetto non è prudenza: a un modello a cui si
# chiede un percorso su un catalogo di trenta avatar, senza dire quante
# tappe, esce un percorso che li usa tutti, cioè un elenco del catalogo
# invece di una scelta. Otto tappe sono già un corso lungo settimane.
MAX_STEPS = 8

# L'obiettivo di partenza di una tappa, quando il modello non ne dà uno
# leggibile: la stessa sufficienza piena da cui parte una tappa scritta a
# mano nel form (vedi pathStepDraft.DEFAULT_TARGET).
DEFAULT_TARGET = 7.0

# Le due sigle con cui il catalogo viene numerato per il modello.
_AVATAR_PREFIX = "A"
_SIMULATION_PREFIX = "T"


@dataclass(frozen=True)
class CatalogAvatar:
    """Un avatar come il modello lo vede, cioè come lo vede uno studente.

    Sono i quattro campi della galleria e nient'altro. La scheda persona non
    è qui e non è una dimenticanza: contiene la vera causa del problema e
    l'obiettivo nascosto, cioè la soluzione dell'esercizio, e non esce mai
    dal server. Per mettere in fila delle tappe basta sapere cosa mette alla
    prova un avatar e quanto è difficile.

    È anche una dataclass e non la riga del database di proposito: il router
    restituisce la connessione al pool prima di aspettare il modello, e da
    quel momento un oggetto della sessione tornerebbe a interrogare il
    database per leggere il proprio nome.
    """

    id: UUID
    name: str
    category_name: str
    difficulty: str | None
    description: str | None


@dataclass(frozen=True)
class CatalogSimulation:
    """Un test tecnico come il modello lo vede: cosa chiede e come si risponde."""

    id: UUID
    title: str
    kind: str
    description: str | None


def build_catalog(
    avatars: list[CatalogAvatar], simulations: list[CatalogSimulation]
) -> tuple[str, dict[str, dict]]:
    """Il catalogo come lo legge il modello, e come si torna indietro.

    Torna due cose: il testo da mettere nel prompt e la mappa dalla sigla al
    bersaglio vero. La seconda esiste perché la prima non contiene id: è la
    sola traduzione fra quello che il modello scrive e quello che il database
    conosce, e sta qui e non nel router perché è la stessa decisione della
    numerazione.
    """
    righe: list[str] = []
    lookup: dict[str, dict] = {}

    if avatars:
        righe.append("### CLIENTI SIMULATI (prove parlate)")
        for index, avatar in enumerate(avatars, start=1):
            ref = f"{_AVATAR_PREFIX}{index}"
            lookup[ref] = {"avatar_id": avatar.id}
            parti = [f"{ref}: {avatar.name}", f"categoria: {avatar.category_name}"]
            if avatar.difficulty:
                parti.append(f"difficoltà: {avatar.difficulty}")
            if avatar.description:
                parti.append(f"scenario: {avatar.description.strip()}")
            righe.append("- " + ", ".join(parti))

    if simulations:
        righe.append("")
        righe.append("### TEST TECNICI (prove scritte)")
        for index, simulation in enumerate(simulations, start=1):
            ref = f"{_SIMULATION_PREFIX}{index}"
            lookup[ref] = {"simulation_id": simulation.id}
            parti = [f"{ref}: {simulation.title}", f"tipo: {simulation.kind}"]
            if simulation.description:
                parti.append(f"contenuto: {simulation.description.strip()}")
            righe.append("- " + ", ".join(parti))

    return "\n".join(righe), lookup


def _system_prompt(catalog: str) -> str:
    return (
        "Sei un formatore esperto di customer care bancario. Il tuo compito è comporre un "
        "percorso di addestramento a tappe, scegliendo dal catalogo di questa azienda.\n\n"
        "## COME FUNZIONA UN PERCORSO\n"
        "È una sequenza numerata di tappe da superare in ordine: la successiva si apre solo "
        "quando quella prima di lei è stata chiusa. Ogni tappa è una prova da svolgere e un "
        "voto minimo da raggiungere, in decimi.\n"
        "Le prove sono di due specie, e mettono alla prova due cose diverse: una "
        "conversazione con un cliente simulato dice **come una persona gestisce qualcuno**, "
        "un test tecnico dice **se conosce la procedura**.\n\n"
        "## IL CATALOGO DI QUESTA AZIENDA\n"
        "Puoi usare solo queste prove, e le indichi con la loro sigla.\n\n"
        f"{catalog}\n\n"
        "## COME SI COMPONE\n"
        "- **L'ordine è la cosa che conta di più.** Si comincia da quello che regge tutto il "
        "resto e si sale: prima la procedura e i casi facili, poi i clienti difficili, poi "
        "quello che richiede insieme il mestiere e il carattere.\n"
        "- **Sapere prima di saper fare.** Quando un test tecnico copre la procedura che "
        "serve a gestire un certo cliente, la tappa del test viene prima di quella del "
        "cliente: mandare qualcuno a parlare con un cliente su una procedura che non conosce "
        "vuol dire farlo fallire per il motivo sbagliato.\n"
        "- **La soglia cresce con il percorso, ma resta raggiungibile.** Una tappa iniziale "
        "sta attorno al 6, una finale può arrivare all'8. Non mettere 9 o 10 da nessuna "
        "parte: una tappa che quasi nessuno può chiudere ferma anche tutte quelle dopo di "
        "lei.\n"
        "- **La soglia sale anche con la difficoltà del cliente.** Chiedere 8 su un avatar da "
        "9/10 e 6 su uno da 3/10 è il modo di dire che il secondo è un riscaldamento.\n"
        f"- **Al massimo {MAX_STEPS} tappe, e usa solo quello che serve.** Un percorso non è "
        "l'elenco del catalogo: se l'obiettivo si raggiunge in quattro tappe, scrivine "
        "quattro. Non ripetere due volte la stessa prova.\n"
        "- **Se il catalogo non basta per l'obiettivo chiesto, componi il percorso più utile "
        "che ci sta dentro**, senza inventare prove che non ci sono. Puoi usare solo le "
        "sigle elencate qui sopra.\n"
        "- Non scrivere scadenze: le decide chi affida il percorso, perché dipendono da "
        "quando il corso comincia.\n"
        "- Scrivi tutto in italiano.\n\n"
        "## FORMATO DELLA RISPOSTA\n"
        "Restituisci esclusivamente un JSON valido, senza testo prima o dopo, con questa "
        "struttura esatta:\n"
        '{"title": "", "description": "", "steps": [{"ref": "", "target_score": 0, '
        '"reason": ""}]}\n'
        '- "title": come si chiama il percorso, poche parole.\n'
        '- "description": a chi è rivolto e cosa ci si aspetta alla fine, una o due frasi.\n'
        '- "ref": la sigla della prova, esattamente come compare nel catalogo.\n'
        '- "target_score": il voto minimo, da 1 a 10, con al massimo un decimale.\n'
        '- "reason": perché questa tappa e perché in questo punto della fila, una frase. La '
        "legge chi rivede il percorso prima di salvarlo, quindi spiega la scelta invece di "
        "ripetere il nome della prova.\n"
        '- "steps" è già nell\'ordine in cui le tappe vanno superate.'
    )


def _target_score(value) -> float:
    """Il voto minimo di una tappa, riportato dentro la scala.

    Fuori scala o illeggibile vale il default invece di far cadere la tappa:
    la scelta che conta è quale prova e in che posizione, e una soglia
    sbagliata è l'unica cosa di una bozza che si corregge con un clic.
    """
    try:
        score = round(float(value), 1)
    except (TypeError, ValueError):
        return DEFAULT_TARGET
    return min(10.0, max(1.0, score))


def normalize_draft(raw: dict, lookup: dict[str, dict]) -> dict:
    """La risposta del modello ridotta a una bozza di percorso.

    Una tappa per volta, come per le domande di una simulazione: quella che
    non si lascia leggere cade da sola invece di portarsi via tutto il
    percorso. Cadono la sigla che non esiste nel catalogo, che è il modo in
    cui un modello inventa una prova, e la sigla ripetuta, perché la stessa
    prova due volte in un percorso è una tappa che si supera due volte con lo
    stesso lavoro.
    """
    if not isinstance(raw, dict):
        raise ValueError("La risposta del modello non è un oggetto.")

    steps: list[dict] = []
    visti: set[str] = set()
    for entry in raw.get("steps") or []:
        if not isinstance(entry, dict):
            continue
        ref = str(entry.get("ref") or "").strip().upper()
        target = lookup.get(ref)
        if target is None or ref in visti:
            continue
        visti.add(ref)
        steps.append(
            {
                "avatar_id": target.get("avatar_id"),
                "simulation_id": target.get("simulation_id"),
                "target_score": _target_score(entry.get("target_score")),
                # Non è un campo della tappa e non verrà mai salvato: vive
                # solo finché la proposta sta nel form, che è il momento in
                # cui a qualcuno serve sapere perché quella tappa sta lì.
                "reason": str(entry.get("reason") or "").strip(),
            }
        )
        if len(steps) == MAX_STEPS:
            break

    # Senza tappe non è una bozza di percorso: vale come un JSON troncato e
    # fa ritentare sul modello di riserva. Succede quando il modello ha
    # inventato tutte le sigle, ed è esattamente il caso in cui ritentare
    # serve.
    if not steps:
        raise ValueError("Il percorso generato non ha nessuna tappa del catalogo.")

    title = str(raw.get("title") or "").strip()
    if not title:
        raise ValueError("Il percorso generato non ha un titolo.")

    return {
        "title": title[:150],
        "description": str(raw.get("description") or "").strip() or None,
        "steps": steps,
    }


async def draft_path(
    goal: str, avatars: list[CatalogAvatar], simulations: list[CatalogSimulation]
) -> dict:
    """Una bozza di percorso per l'obiettivo raccontato in ``goal``.

    Una chiamata sola, come per la scheda persona: la risposta è un titolo e
    una manciata di tappe, e ci sta comodamente nel budget di una risposta.
    Il giro sui modelli di riserva e il tempo lungo li mette
    ``eval_json_completion``.
    """
    catalog, lookup = build_catalog(avatars, simulations)
    if not lookup:
        raise ValueError("Il catalogo di questa organizzazione è vuoto.")

    return await eval_json_completion(
        [
            {"role": "system", "content": _system_prompt(catalog)},
            {"role": "user", "content": f"## OBIETTIVO DEL PERCORSO\n{goal.strip()}"},
        ],
        # Otto tappe con la loro motivazione, più il titolo e la descrizione,
        # più quello che il ragionamento spende leggendo il catalogo e
        # mettendolo in ordine prima di scrivere la prima riga.
        max_completion_tokens=4096,
        normalize=lambda raw: normalize_draft(raw, lookup),
        what="generazione del percorso",
    )
