"""Il quadro d'insieme su un percorso, scritto da un modello di ragionamento.

Il quarto della famiglia di ``user_debriefing``, ``path_draft`` e
``simulation_review``: materiale scritto da qualcuno, una passata del
modello, e una persona che rilegge prima che quel testo serva a qualcosa.
Quello che cambia è il soggetto, ed è tutta la ragione per cui esiste.

**Cosa aggiunge, visto che il quadro di una persona esiste già.** Il quadro
individuale risponde a "cosa devo dirgli", una persona per volta, e su un
gruppo di dodici sono dodici chiamate e dodici letture che nessuno mette in
fila. La domanda di chi ha appena assegnato un percorso a una classe è
un'altra: **dove il percorso si inceppa**. Che sei persone su dodici si siano
fermate sulla stessa tappa, e per la stessa ragione, è un fatto che non
compare in nessuno dei dodici quadri individuali, perché lì dentro è un
episodio e non uno schema.

**Non nomina nessuno, e lo dice il prompt più volte.** Gli allievi arrivano
siglati, e la sigla serve solo a riconoscere due prove della stessa persona:
il testo che ne esce parla di tappe, di criteri e del gruppo. Chi è fermo
dove sta già nella tabella delle assegnazioni, derivata dalle prove e gratis;
quello che serve a un docente prima di una sessione d'aula è invece cosa
preparare, e quello non è di nessuno in particolare. La normalizzazione non
si fida della sola istruzione e ricontrolla (vedi ``_nomina_qualcuno``).

**Non calcola numeri.** Quante persone hanno aperto una tappa, quante l'hanno
superata, quante sono ferme lì: arrivano già fatti da
``path_debriefing_source``, e sono gli stessi che la tabella delle
assegnazioni mostra riga per riga. Un quadro che dicesse "quattro fermi alla
terza" sopra una tabella che ne mostra sei sarebbe l'ultima volta che
qualcuno lo legge.

**Il dossier è un campione, e il prompt lo dice.** Di ogni tappa entrano i
giudizi delle prove più recenti, non di tutte: i conti valgono sul gruppo
intero, il testo su quello che è stato letto, e il modello deve sapere quale
delle due cose ha davanti quando scrive.
"""

import re
from functools import partial

from openai_service import eval_json_completion
from schemas import STEP_KIND_AVATAR
from untrusted_text import fence, rule

# Quanti temi ricorrenti il quadro può contenere. Stesso tetto del quadro di
# una persona, e per la stessa ragione: senza un numero, a un modello a cui
# si chiede cosa si ripete escono otto voci in cui le ultime quattro sono le
# prime quattro riscritte più deboli. Quattro cose sono anche quante se ne
# possono preparare per una sessione d'aula.
MAX_THEMES = 4

# Le sigle con cui gli allievi entrano nel dossier, come si riconoscono se
# escono. Il numero è quello che conta: "gli allievi" al plurale è italiano
# normale e deve poter essere scritto, "ALLIEVO 3" è una persona indicata a
# dito, ed è la cosa che questo quadro non deve contenere.
_SIGLA = re.compile(r"alliev[oi]\s*\d+", re.IGNORECASE)


def _nomina_qualcuno(testo: str) -> bool:
    """Se questo pezzo di testo indica un allievo con la sua sigla."""
    return bool(_SIGLA.search(testo))


def _blocco_rules(position: int) -> str:
    """Le istruzioni che valgono solo quando il gruppo si è fermato da qualche parte.

    Stanno in una funzione a parte e non in un blocco sempre presente perché
    su un percorso che tutti hanno finito una tappa di blocco non c'è:
    chiederla lì vorrebbe dire chiederla rispetto a niente, e il modello ne
    troverebbe una per obbedienza.

    Qual è la tappa non lo cerca il modello, gliela si dice: è il massimo di
    una colonna di numeri, cioè un conto, e su un conto il modello non deve
    avere voce. Quello che gli si chiede è il perché, che è una lettura e
    nella tabella delle assegnazioni non c'è.
    """
    return (
        "\n## LA TAPPA DOVE IL GRUPPO SI FERMA\n"
        f"I conti dicono che il gruppo si ferma sulla **tappa {position}**: è quella su cui "
        "più persone hanno adesso la propria tappa da fare. Non cercarne un'altra e non "
        "discutere il numero.\n"
        f'- "blocker" sono due o tre frasi che dicono **perché** ci si ferma lì, leggendo i '
        "giudizi delle prove svolte su quella tappa: cosa non riesce, se l'obiettivo è più "
        "alto di quello che le prove mostrano, se manca qualcosa che le tappe prima non "
        "hanno allenato.\n"
        "- Se le prove su quella tappa sono poche o non dicono niente di chiaro, scrivilo: "
        '"ci si ferma qui ma le prove sono troppo poche per dire perché" è una risposta '
        "utile, una spiegazione inventata no.\n"
    )


def _system_prompt(*, blocker: int | None) -> tuple[str, str]:
    """Le istruzioni, e il marcatore con cui recintare il materiale.

    Tornano insieme perché sono la stessa decisione presa una volta: il
    recinto cambia a ogni chiamata (vedi ``untrusted_text.fence``), quindi il
    prompt che lo nomina e il messaggio che lo usa devono ricevere lo stesso.

    ``blocker`` è la tappa su cui il gruppo si ferma, e l'unica cosa che
    cambia fra le due versioni del prompt.
    """
    marker = fence()
    return (
        "Sei un formatore esperto di customer care bancario. Il tuo compito è preparare il "
        "quadro d'insieme su un percorso di formazione, per il collega che deve decidere "
        "cosa fare con il gruppo che lo sta seguendo.\n\n"
        "## CHI TI LEGGE\n"
        "Ti legge chi insegna, prima di una sessione con il gruppo. Scrivi come parleresti a "
        "un collega: diretto, concreto, senza incoraggiamenti e senza ammorbidire quello che "
        "non va. Non è una pagella e non verrà consegnata a chi si allena.\n\n"
        "## DI CHI PARLI, E DI CHI NON PARLI\n"
        "**Parli del percorso e del gruppo, mai di una persona.** Le prove ti arrivano "
        'siglate ("ALLIEVO 1", "ALLIEVO 2") e la sigla serve a te, per riconoscere che due '
        "prove sono della stessa persona e che quindi un errore ripetuto è un modo di "
        "lavorare e non due persone diverse che sbagliano una volta.\n"
        "**Nessuna di quelle sigle deve comparire in quello che scrivi.** Chi è fermo dove, e "
        "chi ha preso quanto, chi ti legge ce l'ha già davanti in una tabella. Quello che "
        "serve a lui e che quella tabella non dice è cosa succede sulle tappe. Scrivi "
        '"metà del gruppo", "in quasi tutte le prove della tappa 3", non "ALLIEVO 4".\n\n'
        "## COSA DEVI TROVARE\n"
        "Ti vengono consegnate le prove che un gruppo ha svolto sulle tappe di uno stesso "
        "percorso: conversazioni con clienti simulati, già giudicate criterio per criterio, e "
        "test tecnici consegnati. Ognuna è già stata analizzata da sola.\n"
        "Quello che nessuno ha ancora fatto, ed è l'unica ragione per cui esisti, è "
        "**guardarle insieme attraverso le persone**:\n"
        "- un errore che torna su allievi diversi non è un difetto di qualcuno, è una cosa "
        "che il percorso non sta insegnando, e va detta;\n"
        "- lo stesso errore fatto da una persona sola è un episodio, e non è un tema: quello "
        "riguarda il quadro di quella persona, non questo;\n"
        "- una tappa dove quasi tutti passano al primo colpo dice che l'obiettivo è basso, e "
        "una dove nessuno passa dice il contrario: tutte e due sono notizie;\n"
        "- una cosa che il docente ha già corretto a mano su più allievi è un tema che "
        "qualcuno ha già visto: dillo come tale, non come una scoperta.\n\n"
        "## REGOLE\n"
        f"- Al massimo {MAX_THEMES} temi. Se ne trovi meno, scrivine meno: tre cose vere "
        "valgono più di sei di cui metà riempitivo.\n"
        '- **Ogni tema deve poggiare su prove che nomini.** Nel campo "evidence" scrivi su '
        'quali tappe lo hai visto, per numero ("tappa 2 e tappa 3"), e su quante prove. Un '
        "tema senza prove nominate non è un tema, è un'impressione.\n"
        "- **Non inventare niente e non dedurre da quello che non c'è.** Se una cosa non si "
        "vede nel materiale, non è successa.\n"
        "- **Non ricalcolare i numeri.** Quante persone hanno il percorso, quante hanno "
        "aperto o superato ogni tappa, le medie: ti arrivano già calcolati, usali come sono "
        "scritti. Non farne di nuovi e non correggerli.\n"
        "- **I numeri valgono su tutto il gruppo, i giudizi qui sotto sono un campione.** Di "
        "ogni tappa ti vengono date le prove più recenti, non tutte: quindi puoi dire cosa "
        "si vede nelle prove, ma non contarle per ricavarne percentuali.\n"
        '- "next_step" è una cosa sola e concreta da fare adesso con il gruppo: su cosa '
        "tornare, con che esercizio, con che obiettivo. Non un elenco di buoni propositi.\n"
        '- "strength" resta una stringa vuota se nel materiale non si vede niente che il '
        "gruppo faccia bene. Inventarne uno per chiudere in positivo è il modo di rendere "
        "inutile anche quello vero.\n"
        "- Scrivi tutto in italiano.\n"
        + (_blocco_rules(blocker) if blocker is not None else "")
        + "\n"
        f"{rule(marker, 'il materiale delle prove del gruppo')}\n\n"
        "## FORMATO DELLA RISPOSTA\n"
        "Restituisci esclusivamente un JSON valido, senza testo prima o dopo, con questa "
        "struttura esatta:\n"
        '{"summary": "", '
        + ('"blocker": "", ' if blocker is not None else "")
        + '"themes": [{"title": "", "detail": "", "evidence": ""}], '
        '"strength": "", "next_step": ""}\n'
        '- "summary": due o tre frasi che dicono a che punto è questo gruppo su questo '
        "percorso.\n"
        + (
            '- "blocker": perché il gruppo si ferma sulla tappa indicata sopra.\n'
            if blocker is not None
            else ""
        )
        + '- "title": il tema in poche parole.\n'
        '- "detail": due o tre frasi su cosa succede e perché è un problema.\n'
        '- "evidence": su quali tappe lo hai visto.\n'
        '- "strength": cosa il gruppo fa bene, o stringa vuota.\n'
        '- "next_step": la cosa da fare adesso con il gruppo.'
    ), marker


def _step_line(step) -> str:
    """Una tappa come la legge il modello: cos'è, e come ci sta il gruppo."""
    forma = "conversazione" if step.kind == STEP_KIND_AVATAR else "test tecnico"
    riga = (
        f"  - tappa {step.position}, {step.label} ({forma}), obiettivo {step.target_score}/10: "
        f"aperta a {step.unlocked} persone, superata da {step.passed}, "
        f"ferme qui adesso {step.stuck}, {step.proofs} prove svolte"
    )
    if step.best_average is not None:
        riga += f", media dei migliori voti {step.best_average}/10"
    return riga


def _facts(material) -> str:
    """I numeri già calcolati, come fatti che il modello non deve rifare."""
    righe = [
        f"- percorso: {material.title}",
        f"- persone che hanno questo percorso: {material.people}",
        f"- hanno svolto almeno una prova: {material.started}",
        f"- hanno finito tutte le tappe: {material.completed}",
        f"- hanno almeno una tappa scaduta: {material.overdue}",
        f"- prove di cui leggi il giudizio qui sotto: {material.conversations} conversazioni "
        f"e {material.attempts} test tecnici",
    ]
    if material.description:
        righe.insert(1, f"- a cosa serve il percorso: {material.description}")
    if material.conversation_average is not None:
        righe.append(
            f"- media dei voti delle conversazioni lette: {material.conversation_average}/10"
        )
    if material.attempt_average is not None:
        righe.append(f"- media dei voti dei test letti: {material.attempt_average}/10")
    if material.criteria_averages:
        righe.append("- media per criterio, sulle conversazioni lette:")
        righe.extend(f"  - {c.label}: {c.average}/10" for c in material.criteria_averages)
    righe.append("- le tappe, nell'ordine in cui si percorrono:")
    righe.extend(_step_line(step) for step in material.steps)
    return "\n".join(righe)


def normalize_path_debriefing(raw: dict, *, blocking: bool = False) -> dict:
    """La risposta del modello ridotta a quello che viene salvato.

    Il controllo sta qui e non nel chiamante, come per il quadro di una
    persona: ``eval_json_completion`` esegue la normalizzazione dentro il giro
    sui modelli di riserva, quindi un quadro senza sintesi fa ritentare
    esattamente come farebbe un JSON troncato.

    **Le sigle degli allievi non passano.** Dove il campo è facoltativo cade
    il campo, come cade un tema senza titolo; dove è obbligatorio fa
    ritentare, perché una sintesi che indica una persona a dito non si può né
    salvare né riscrivere qui. È la stessa regola del resto della famiglia:
    del pezzo storto cade il pezzo, di quello che manca davvero si ripaga la
    chiamata.

    ``blocking`` è la stessa cosa che sa il prompt, cioè se una tappa di
    blocco esiste. Senza, la spiegazione resta None anche se il modello l'ha
    scritta lo stesso: non gli è stata chiesta, quindi non poggia su niente.
    """
    if not isinstance(raw, dict):
        raise ValueError("La risposta del modello non è un oggetto.")

    themes = []
    for entry in raw.get("themes") or []:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get("title") or "").strip()
        detail = str(entry.get("detail") or "").strip()
        evidence = str(entry.get("evidence") or "").strip()
        # Un tema senza titolo non si può nemmeno elencare, e uno che indica
        # un allievo per sigla è un tema su una persona sola, cioè proprio
        # quello che questo quadro non deve contenere: cadono loro, non tutto
        # il quadro.
        if not title or _nomina_qualcuno(f"{title} {detail} {evidence}"):
            continue
        themes.append({"title": title, "detail": detail, "evidence": evidence})
        if len(themes) == MAX_THEMES:
            break

    summary = str(raw.get("summary") or "").strip()
    next_step = str(raw.get("next_step") or "").strip()
    blocker = (str(raw.get("blocker") or "").strip() or None) if blocking else None

    if not summary:
        raise ValueError("Il quadro del percorso non ha la sintesi.")
    if not next_step:
        raise ValueError("Il quadro del percorso non dice cosa fare adesso.")
    if _nomina_qualcuno(summary) or _nomina_qualcuno(next_step) or _nomina_qualcuno(blocker or ""):
        raise ValueError("Il quadro del percorso nomina un singolo allievo.")

    strength = str(raw.get("strength") or "").strip()
    return {
        "summary": summary,
        "blocker": blocker,
        "themes": themes,
        # Vuoto è un valore e vuol dire che non si vede niente di buono da
        # segnalare: diventa None perché sia None ad arrivare all'interfaccia,
        # che quel caso lo sa già disegnare.
        "strength": strength if strength and not _nomina_qualcuno(strength) else None,
        "next_step": next_step,
    }


async def write_path_debriefing(material) -> dict:
    """Il quadro su questo percorso, come viene salvato.

    Una chiamata sola, come per il quadro di una persona: quello che torna è
    mezza pagina di testo, e ci sta nel budget di una risposta. Il giro sui
    modelli di riserva e il tempo lungo li mette ``eval_json_completion``.
    """
    blocker = material.blocker_position
    system, marker = _system_prompt(blocker=blocker)
    return await eval_json_completion(
        [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    "# QUELLO CHE È GIÀ CALCOLATO, SU TUTTO IL GRUPPO\n"
                    f"{_facts(material)}\n\n"
                    "# I GIUDIZI DELLE PROVE, TAPPA PER TAPPA\n"
                    f"{marker}\n{material.dossier}\n{marker}"
                ),
            },
        ],
        # Una sintesi, la spiegazione del blocco, quattro temi con dettaglio
        # ed evidenze, il punto di forza e il passo successivo, più quello
        # che il ragionamento spende leggendo i giudizi di trenta prove prima
        # di scrivere la prima riga. Stretto qui torna indietro come JSON
        # troncato, cioè come un quadro che si interrompe a metà di un tema.
        max_completion_tokens=6144,
        normalize=partial(normalize_path_debriefing, blocking=blocker is not None),
        what="quadro d'insieme del percorso",
    )
