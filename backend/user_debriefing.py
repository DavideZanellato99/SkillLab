"""Il quadro d'insieme su una persona, scritto da un modello di ragionamento.

È il terzo giro dello stesso schema di ``persona_draft`` e
``simulation_questions``: del materiale scritto da qualcuno, una passata del
modello, e una persona che rilegge prima che quel testo serva a qualcosa. La
differenza è cosa entra e per chi esce. Là la fonte è un caso o un documento
aziendale e il destinatario è chi prepara l'esercizio; qui la fonte sono le
prove che una persona ha svolto e il destinatario è chi deve sedersi davanti
a lei.

**Cosa aggiunge, visto che la valutazione esiste già.** La valutazione
guarda una conversazione, il confronto ne affianca due, la dashboard fa
medie su un gruppo. Nessuna delle tre risponde alla domanda con cui un
docente apre il report di una persona, che è "cosa devo dirgli": quella
richiede di vedere che lo stesso errore è tornato quattro volte su quattro
scenari diversi, e non c'è nessuna schermata da cui quel fatto si legga.

**Dalla seconda volta in poi legge anche sé stesso.** Il quadro precedente
entra nel materiale insieme alle prove, e la domanda cambia: non più solo
"cosa si ripete", ma "cosa si è mosso da allora". Ne escono due campi in
più, la direzione e il racconto del cambiamento, che sul primo quadro di una
persona restano vuoti perché lì un prima non c'è. Di quanto si sono mosse le
medie non lo dice il modello: quella è una sottrazione, e la fa
``debriefing_source.deltas``.

**Cosa non fa, e sta scritto nel prompt.** Non calcola numeri: media dei
voti e medie per criterio arrivano già fatte da ``debriefing_source`` e il
prompt dice di usarle così come sono. Un debriefing che dicesse una media
diversa da quella della dashboard contraddirebbe la pagella che lo studente
ha in mano, ed è il modo più rapido perché uno strumento del genere smetta
di essere creduto.

**Chi lo legge.** Chi amministra, e non chi si allena: il prompt lo sa e
scrive a un collega, non alla persona di cui parla. È la differenza fra
"tende a chiudere prima di aver capito il caso, valeva anche per la
telefonata di marzo" e una pagella. Quello che di questo quadro va detto a
chi si allena lo decide chi insegna, che è anche l'unico a sapere come.
"""

from functools import partial

from models import DEBRIEFING_DIRECTIONS, DEBRIEFING_DOWN, DEBRIEFING_STABLE, DEBRIEFING_UP
from openai_service import eval_json_completion
from untrusted_text import fence, rule

# Quanti temi ricorrenti il debriefing può contenere. Il tetto non è
# prudenza: a un modello a cui si chiedono i temi ricorrenti di dodici prove
# senza dire quanti, escono otto voci in cui le ultime quattro sono le prime
# quattro riscritte più deboli. Tre o quattro cose sono anche quante se ne
# possono dire a una persona in un colloquio senza che si perda.
MAX_THEMES = 4

# Le parole con cui un modello dice la direzione quando non usa quelle che
# gli sono state chieste. Tradurre invece di rifiutare: la direzione giusta
# scritta in italiano è una risposta giusta con l'etichetta sbagliata, e
# buttare via un debriefing intero per quello vorrebbe dire ripagarlo per
# riottenere lo stesso contenuto.
_SINONIMI_DIREZIONE = {
    "in miglioramento": DEBRIEFING_UP,
    "miglioramento": DEBRIEFING_UP,
    "migliorato": DEBRIEFING_UP,
    "migliora": DEBRIEFING_UP,
    "stabile": DEBRIEFING_STABLE,
    "invariato": DEBRIEFING_STABLE,
    "fermo": DEBRIEFING_STABLE,
    "in peggioramento": DEBRIEFING_DOWN,
    "peggioramento": DEBRIEFING_DOWN,
    "peggiorato": DEBRIEFING_DOWN,
    "peggiora": DEBRIEFING_DOWN,
}


def _confronto_rules() -> str:
    """Le istruzioni che valgono solo dalla seconda volta in poi.

    Stanno in una funzione a parte e non in un blocco sempre presente perché
    il primo quadro di una persona non ha nessun prima: chiedere lì una
    direzione vorrebbe dire chiederla rispetto a niente, e la risposta
    sarebbe inventata al primo tentativo.
    """
    return (
        "\n## IL CONFRONTO CON IL QUADRO PRECEDENTE\n"
        "Su questa persona un quadro è già stato scritto, e ce l'hai davanti insieme alle "
        "prove. La domanda a cui questo debriefing deve rispondere, e che il precedente non "
        "poteva, è **come si è mossa questa persona da allora**.\n"
        f'- "direction" è una sola di queste tre parole, scritta esattamente così: '
        f'"{DEBRIEFING_UP}" se la persona è migliorata, "{DEBRIEFING_STABLE}" se è dove '
        f'era, "{DEBRIEFING_DOWN}" se è peggiorata.\n'
        '- "change" sono due o tre frasi su cosa è cambiato: quali temi di allora sono '
        "rientrati, quali sono rimasti, quali sono nuovi. Nomina le cose, non i voti.\n"
        "- **Stabile è una risposta legittima e spesso è quella giusta.** Fra due quadri "
        "passano poche prove, e in poche prove un modo di lavorare cambia raramente. Scrivi "
        "una direzione solo se nelle prove si vede: mezzo punto di media in più non è un "
        "miglioramento, un errore che tornava sempre e adesso non torna più lo è.\n"
        "- Le medie di allora e quelle di adesso ce le hai tutte e due, ma la differenza non "
        "la devi calcolare né scrivere: quella la mette l'applicazione accanto al tuo testo. "
        "A te si chiede di dire cosa è cambiato nel modo di lavorare.\n"
        "- Se il quadro precedente diceva una cosa che le prove nuove smentiscono, dillo: un "
        "quadro che si limita a confermare il precedente non serve a chi lo rilegge.\n"
    )


def _system_prompt(*, comparing: bool) -> tuple[str, str]:
    """Le istruzioni, e il marcatore con cui recintare il materiale.

    I due tornano insieme perché sono la stessa decisione presa una volta:
    il recinto cambia a ogni chiamata (vedi ``untrusted_text.fence``), quindi
    il prompt che lo nomina e il messaggio che lo usa devono ricevere lo
    stesso, e farseli dare separatamente vorrebbe dire due recinti diversi.

    ``comparing`` dice se un quadro precedente esiste, ed è l'unica cosa che
    cambia fra le due versioni del prompt.
    """
    marker = fence()
    return (
        "Sei un formatore esperto di customer care bancario. Il tuo compito è preparare il "
        "quadro d'insieme su una persona che si sta addestrando, per il collega che dovrà "
        "farle il colloquio.\n\n"
        "## CHI TI LEGGE\n"
        "Ti legge chi insegna, non chi si allena. Scrivi come parleresti a un collega prima "
        "di un colloquio: diretto, concreto, senza giri di parole di incoraggiamento e senza "
        "ammorbidire quello che non va. Non è una pagella e non verrà consegnata così com'è "
        "alla persona di cui parli.\n\n"
        "## COSA DEVI TROVARE\n"
        "Ti vengono consegnate più prove della stessa persona: conversazioni con clienti "
        "simulati, ciascuna già giudicata criterio per criterio da un valutatore, e test "
        "tecnici consegnati. Ognuna di queste prove è già stata analizzata da sola, e quella "
        "analisi ce l'hai davanti.\n"
        "Quello che nessuno ha ancora fatto, ed è l'unica ragione per cui esisti, è "
        "**guardarle insieme**. Ti interessa quello che si ripete attraverso prove diverse, "
        "non quello che è successo una volta:\n"
        "- un errore che torna su scenari diversi è un modo di lavorare, e va detto;\n"
        "- lo stesso errore fatto una volta sola è un episodio, e non è un tema;\n"
        "- una cosa che i primi giudizi segnalavano e gli ultimi non segnalano più è un "
        "miglioramento, ed è la notizia più utile che tu possa dare;\n"
        "- una cosa che il docente ha già corretto a mano più volte è un tema che qualcuno ha "
        "già visto: dillo come tale, non come una scoperta.\n\n"
        "## REGOLE\n"
        f"- Al massimo {MAX_THEMES} temi. Se ne trovi meno, scrivine meno: tre cose vere "
        "valgono più di sei di cui metà riempitivo.\n"
        '- **Ogni tema deve poggiare su prove che nomini.** Nel campo "evidence" scrivi su '
        "quali prove lo hai visto, richiamandole per come sono intitolate qui sopra. Un tema "
        "senza prove nominate non è un tema, è un'impressione.\n"
        "- **Non inventare niente e non dedurre da quello che non c'è.** Se una cosa non si "
        "vede nel materiale, non è successa. In particolare non attribuire alla persona "
        "informazioni che il cliente simulato non le ha mai dato.\n"
        "- **Non ricalcolare i numeri.** Medie, voti e conteggi ti arrivano già calcolati: "
        "usali come sono scritti. Non farne di nuovi e non correggerli.\n"
        "- Non ripetere i suggerimenti già dati sulla singola prova: quelli la persona li ha "
        "già letti. Serve quello che si vede solo da lontano.\n"
        '- "next_step" è una cosa sola e concreta da fare adesso, non un elenco di buoni '
        "propositi: su cosa allenarsi, contro che tipo di cliente, con che obiettivo.\n"
        '- "improving" resta una stringa vuota se nel materiale non si vede nessun '
        "miglioramento. Inventarne uno per chiudere in positivo è il modo di rendere inutile "
        "anche quello vero.\n"
        "- Scrivi tutto in italiano.\n" + (_confronto_rules() if comparing else "") + "\n"
        f"{rule(marker, 'il materiale delle prove e il quadro precedente')}\n\n"
        "## FORMATO DELLA RISPOSTA\n"
        "Restituisci esclusivamente un JSON valido, senza testo prima o dopo, con questa "
        "struttura esatta:\n"
        '{"summary": "", "themes": [{"title": "", "detail": "", "evidence": ""}], '
        '"improving": "", "next_step": ""'
        + (', "direction": "", "change": ""' if comparing else "")
        + "}\n"
        '- "summary": due o tre frasi che dicono a che punto è questa persona.\n'
        '- "title": il tema in poche parole.\n'
        '- "detail": due o tre frasi su cosa succede e perché è un problema.\n'
        '- "evidence": su quali prove lo hai visto.'
        + (
            '\n- "direction": una sola delle tre parole indicate sopra.\n'
            '- "change": cosa è cambiato rispetto al quadro precedente.'
            if comparing
            else ""
        )
    ), marker


def _facts(material) -> str:
    """I numeri già calcolati, come fatti che il modello non deve rifare."""
    righe = [
        f"- prove parlate lette: {material.conversations}",
        f"- prove scritte lette: {material.attempts}",
    ]
    if material.conversation_average is not None:
        righe.append(f"- media dei voti delle prove parlate: {material.conversation_average}/10")
    if material.attempt_average is not None:
        righe.append(f"- media dei voti dei test tecnici: {material.attempt_average}/10")
    if material.criteria_averages:
        righe.append("- media per criterio, su tutte le prove parlate lette:")
        righe.extend(f"  - {c.label}: {c.average}/10" for c in material.criteria_averages)
    return "\n".join(righe)


def normalize_direction(valore) -> str:
    """La direzione scritta dal modello, ridotta a una delle tre parole.

    Fallisce, e quindi fa ritentare, quando la parola non si riconosce: la
    direzione è l'unica cosa che un quadro aggiunge a quello prima, e metterci
    "stabile" perché il modello ha scritto qualcos'altro vorrebbe dire dire a
    un docente che qualcuno è fermo senza averlo letto da nessuna parte.

    Sta qui e la usano in due, questo quadro e quello di un percorso
    (``path_debriefing``): le tre parole sono un vocabolario solo, e due copie
    vorrebbero dire due elenchi di sinonimi che col tempo si allontanano,
    cioè la stessa risposta del modello accettata da una parte e buttata
    dall'altra.
    """
    scritto = str(valore or "").strip().lower()
    if scritto in DEBRIEFING_DIRECTIONS:
        return scritto
    tradotto = _SINONIMI_DIREZIONE.get(scritto)
    if tradotto:
        return tradotto
    raise ValueError(f"La direzione scritta dal modello non si riconosce: {scritto!r}.")


def normalize_debriefing(raw: dict, *, comparing: bool = False) -> dict:
    """La risposta del modello ridotta a quello che viene salvato.

    Il controllo sta qui e non nel chiamante di proposito, come per la
    scheda persona: ``eval_json_completion`` esegue la normalizzazione dentro
    il giro sui modelli di riserva, quindi un debriefing senza sintesi fa
    ritentare esattamente come farebbe un JSON troncato.

    ``comparing`` è la stessa cosa che sa il prompt, cioè se un quadro
    precedente esisteva. Senza, direzione e cambiamento restano None anche
    se il modello li ha scritti lo stesso: non gli sono stati chiesti,
    quindi qualunque cosa abbia scritto lì non poggia su niente.
    """
    if not isinstance(raw, dict):
        raise ValueError("La risposta del modello non è un oggetto.")

    themes = []
    for entry in raw.get("themes") or []:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get("title") or "").strip()
        if not title:
            # Un tema senza titolo non si può nemmeno elencare: cade lui,
            # non tutto il debriefing, come una domanda storta del serbatoio.
            continue
        themes.append(
            {
                "title": title,
                "detail": str(entry.get("detail") or "").strip(),
                "evidence": str(entry.get("evidence") or "").strip(),
            }
        )
        if len(themes) == MAX_THEMES:
            break

    summary = str(raw.get("summary") or "").strip()
    next_step = str(raw.get("next_step") or "").strip()
    # Senza questi due il debriefing non è un debriefing: il primo è quello
    # che si legge per primo, il secondo è l'unica parte che dice cosa fare.
    # I temi possono mancare (una persona senza schemi ricorrenti è un esito
    # legittimo, ed è una buona notizia), la sintesi no.
    if not summary:
        raise ValueError("Il debriefing generato non ha la sintesi.")
    if not next_step:
        raise ValueError("Il debriefing generato non dice cosa fare adesso.")

    return {
        "summary": summary,
        "themes": themes,
        # Vuoto è un valore, e vuol dire che non si vede nessun
        # miglioramento: diventa None perché sia None a viaggiare fino
        # all'interfaccia, che quel caso lo sa già disegnare.
        "improving": str(raw.get("improving") or "").strip() or None,
        "next_step": next_step,
        # Presenti sempre, valorizzati solo dal secondo quadro in poi: una
        # chiave che a volte c'è e a volte no costringerebbe ogni lettore a
        # chiedersi se manca perché era il primo o perché è vecchia.
        "direction": normalize_direction(raw.get("direction")) if comparing else None,
        "change": (str(raw.get("change") or "").strip() or None) if comparing else None,
    }


async def write_debriefing(material) -> dict:
    """Il debriefing su questo materiale, come viene salvato.

    Una chiamata sola, come la bozza di una scheda: qui la risposta è un
    testo di mezza pagina, non cinquanta domande, e ci sta nel budget di una
    risposta. Il giro sui modelli di riserva e il tempo lungo li mette
    ``eval_json_completion``, che è lo stesso meccanismo della valutazione.
    """
    comparing = bool(material.previous)
    system, marker = _system_prompt(comparing=comparing)
    # Il quadro precedente sta dentro lo stesso recinto delle prove, e non
    # fuori come istruzione: lo ha scritto un modello leggendo materiale di
    # qualcuno, quindi ripassa dal recinto per la stessa ragione per cui ci
    # passa il materiale, cioè che niente di quello che è arrivato da fuori
    # torna dentro come istruzione.
    precedente = (
        f"\n\n# IL QUADRO PRECEDENTE SU QUESTA PERSONA\n{material.previous}" if comparing else ""
    )
    return await eval_json_completion(
        [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    "# QUELLO CHE È GIÀ CALCOLATO\n"
                    f"{_facts(material)}\n\n"
                    "# LE PROVE, DALLA PIÙ VECCHIA ALLA PIÙ RECENTE\n"
                    f"{marker}\n{material.dossier}{precedente}\n{marker}"
                ),
            },
        ],
        # Una sintesi, quattro temi con dettaglio ed evidenze, il
        # miglioramento e il passo successivo, più quello che il
        # ragionamento spende leggendo cinque trascrizioni prima di
        # scrivere la prima riga. Stretto qui torna indietro come JSON
        # troncato, cioè come un debriefing che si interrompe a metà di un
        # tema.
        max_completion_tokens=6144,
        normalize=partial(normalize_debriefing, comparing=comparing),
        what="debriefing della persona",
    )
