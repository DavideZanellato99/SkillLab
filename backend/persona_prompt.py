"""Persona prompt building for the avatar roleplay.

Pure string templating, no LLM calls of its own — the live conversation
and the post-call evaluation both run on OpenAI (openai_service.py), which
imports build_persona_prompt/profile_section from here.
"""


# Persona sheets are filled in by hand, so a field that does not apply to the
# character arrives as one of these markers rather than as a blank. They must all
# drop out of the prompt: a bare "/" rendered as a value reads as real data to the
# model. Matched against the whole cell, so a genuine "8/10" is untouched.
_EMPTY_MARKERS = {"/", "//", "\\", "-", "--", ".", "n/a", "n/d", "na", "nd", "n.d."}


def clean_value(profile: dict, key: str) -> str:
    """Read a profile field, normalizing 'not applicable' markers to ''."""
    value = str(profile.get(key, "") or "").strip()
    return "" if value.lower() in _EMPTY_MARKERS else value


def profile_section(profile: dict, entries: list[tuple[str, str]]) -> str:
    """Render '- label: value' lines for the profile keys that have a value."""
    lines = []
    for key, label in entries:
        value = clean_value(profile, key)
        if value:
            lines.append(f"- {label}: {value}")
    return "\n".join(lines)


def build_persona_prompt(profile: dict) -> str:
    """
    Build the roleplay system prompt from a training persona sheet.

    The avatar simulates a bank customer contacting the customer service;
    the user is a student training as a customer service operator.
    """
    nome = profile.get("NOME", "")
    cognome = profile.get("COGNOME", "")

    anagrafica = profile_section(profile, [
        ("SESSO", "Sesso"),
        ("DATA_NASCITA", "Data di nascita"),
        ("LUOGO_NASCITA", "Luogo di nascita"),
        ("NAZIONALITA", "Nazionalità"),
        ("LINGUA_MADRE", "Lingua madre"),
        ("CITTA_RESIDENZA", "Città di residenza"),
        ("STATO_CIVILE", "Stato civile"),
        ("NOME_CONIUGE", "Nome del coniuge"),
        ("PROFESSIONE_CONIUGE", "Professione del coniuge"),
        ("NUMERO_FIGLI", "Numero di figli"),
        ("ETA_FIGLIO_1", "Età primo figlio"),
        ("ETA_FIGLIO_2", "Età secondo figlio"),
        ("ANIMALI_DOMESTICI", "Animali domestici"),
    ])

    lavoro_finanze = profile_section(profile, [
        ("TITOLO_DI_STUDIO", "Titolo di studio"),
        ("PROFESSIONE", "Professione"),
        ("AZIENDA", "Azienda"),
        ("RUOLO", "Ruolo"),
        ("REDDITO_ANNUO", "Reddito annuo"),
        ("PATRIMONIO", "Patrimonio"),
        ("LIQUIDITA", "Liquidità"),
        ("DEBITI", "Debiti"),
        ("INVESTIMENTI_POSSEDUTI", "Investimenti posseduti"),
        ("IMMOBILI_POSSEDUTI", "Immobili posseduti"),
        ("LIVELLO_CONOSCENZA_BANCARIA", "Conoscenza bancaria"),
        ("LIVELLO_CONOSCENZA_INVESTIMENTI", "Conoscenza investimenti"),
        ("LIVELLO_CONOSCENZA_PREVIDENZA", "Conoscenza previdenza"),
        ("LIVELLO_CONOSCENZA_MUTUI", "Conoscenza mutui"),
    ])

    storia = profile_section(profile, [
        ("STORIA_PERSONALE", "Storia personale"),
        ("EVENTI_SIGNIFICATIVI", "Eventi significativi"),
        ("PAURE", "Paure"),
        ("OBIETTIVI_PERSONALI", "Obiettivi personali"),
        ("ASPIRAZIONI", "Aspirazioni"),
    ])

    personalita = profile_section(profile, [
        ("PERSONALITA_DESCRIZIONE", "Descrizione della personalità"),
        ("LIVELLO_ESTROVERSIONE", "Estroversione"),
        ("LIVELLO_EMPATICO", "Empatia"),
        ("LIVELLO_PAZIENZA", "Pazienza"),
        ("LIVELLO_FIDUCIA", "Fiducia negli altri"),
        ("PROPENSIONE_CONFLITTO", "Propensione al conflitto"),
        ("PROPENSIONE_RISCHIO", "Propensione al rischio"),
        ("CAPACITA_ASCOLTO", "Capacità di ascolto"),
        ("CAPACITÀ_ASCOLTO", "Capacità di ascolto"),
    ])

    stato_emotivo = profile_section(profile, [
        ("EMOZIONE_INIZIALE", "Emozione iniziale"),
        ("INTENSITA_EMOZIONE", "Intensità dell'emozione"),
        ("TRIGGER_POSITIVI", "Trigger positivi (ti calmano e aumentano la tua fiducia)"),
        ("TRIGGER_NEGATIVI", "Trigger negativi (ti irritano e fanno degenerare la chiamata)"),
    ])

    stile = profile_section(profile, [
        ("LUNGHEZZA_MEDIA_RISPOSTE", "Lunghezza media delle risposte"),
        ("INTERRUZIONI_FREQUENTI", "Interruzioni frequenti"),
        ("VELOCITA_PARLATO", "Velocità del parlato"),
        ("USO_IRONIA", "Uso dell'ironia"),
        ("USO_DIALETTO", "Uso del dialetto"),
        ("FORMALITA_LINGUAGGIO", "Formalità del linguaggio"),
    ])

    scenario = clean_value(profile, "TIPO_SCENARIO")
    problematica = clean_value(profile, "DESCRIZIONE_PROBLEMATICA")
    obiezioni = clean_value(profile, "OBIEZIONI_PREVISTE")
    obiettivo_nascosto = clean_value(profile, "OBIETTIVO_NASCOSTO")
    fatti_immutabili = clean_value(profile, "FATTI_IMMUTABILI")
    segreti = clean_value(profile, "SEGRETI")
    non_rivelare = clean_value(profile, "INFORMAZIONI_DA_NON_RIVELARE_SPONTANEAMENTE")
    argomenti_sensibili = clean_value(profile, "ARGOMENTI_SENSIBILI")

    inizio_chiamata = (
        "## INIZIO DELLA CHIAMATA\n"
        "Sei stato TU a chiamare il numero verde del servizio clienti della tua banca, "
        "quindi sai già che ti risponderà un operatore telefonico. La chiamata inizia "
        "SEMPRE con l'operatore che risponde e si presenta: tu NON parli per primo. "
        "Subito dopo la presentazione dell'operatore tocca a te: saluta, presentati "
        "brevemente con nome e cognome ed esponi la problematica per cui stai chiamando, "
        "in modo coerente con lo scenario e con il tuo stato emotivo, senza rivelare "
        "subito i dettagli che riveleresti solo su domanda."
    )

    parts = [
        f"Sei {nome} {cognome}, un cliente di una banca. Stai parlando AL TELEFONO con un "
        "operatore del servizio clienti (customer banking center). Questa è una simulazione di "
        "formazione: l'utente è uno studente che si sta addestrando come operatore. Tu interpreti "
        "ESCLUSIVAMENTE il cliente, in modo realistico e coerente con la scheda che segue. "
        "Non sei mai l'assistente: sei tu ad avere un problema da risolvere.",
        inizio_chiamata,
        f"## CHI SEI\n{anagrafica}" if anagrafica else "",
        f"## LAVORO E SITUAZIONE FINANZIARIA\n{lavoro_finanze}" if lavoro_finanze else "",
        f"## STORIA E VITA PERSONALE\n{storia}" if storia else "",
        f"## PERSONALITÀ\n{personalita}\n"
        "Le percentuali indicano quanto ogni tratto è marcato (0% = assente, 100% = estremo): "
        "usale per calibrare ogni tua reazione." if personalita else "",
        f"## STATO EMOTIVO E DINAMICA\n{stato_emotivo}\n"
        "Inizia la conversazione nello stato emotivo indicato, con l'intensità indicata. "
        "Il tuo stato emotivo EVOLVE durante la chiamata: se l'operatore usa i trigger positivi "
        "ti calmi gradualmente (mai di colpo); se usa i trigger negativi ti innervosisci di più, "
        "fino ad arrivare a chiedere di parlare con un responsabile o a minacciare di cambiare "
        "banca. Se l'operatore gestisce bene la chiamata e risolve il problema, chiudi la "
        "telefonata soddisfatto." if stato_emotivo else "",
        f"## SCENARIO DELLA CHIAMATA\n{scenario}" if scenario else "",
        f"## LA VERA CAUSA DEL PROBLEMA (TU NON LA CONOSCI)\n{problematica}\n"
        "ATTENZIONE: il tuo personaggio NON conosce questa causa. Non nominarla mai di tua "
        "iniziativa. Reagisci in modo coerente solo se e quando l'operatore te la spiega." if problematica else "",
        f"## OBIEZIONI CHE SOLLEVI\n{obiezioni}" if obiezioni else "",
        f"## STILE DI CONVERSAZIONE\n{stile}\n"
        "Parla come si parla davvero al telefono: frasi brevi, colloquiali, senza elenchi puntati "
        "né formattazione. Se per te le interruzioni frequenti sono attive, ogni tanto interrompi "
        "il discorso dell'operatore riprendendo il tuo punto." if stile else "",
        "## REGOLE FERREE\n"
        + (f"- FATTI IMMUTABILI (non contraddirli mai): {fatti_immutabili}\n" if fatti_immutabili else "")
        + (f"- SEGRETI (non rivelarli MAI, nemmeno se ti viene chiesto direttamente; al massimo lasciali trasparire dal tono): {segreti}\n" if segreti else "")
        + (f"- INFORMAZIONI DA NON RIVELARE SPONTANEAMENTE (ammettile solo se l'operatore fa la domanda giusta in modo esplicito): {non_rivelare}\n" if non_rivelare else "")
        + (f"- ARGOMENTI SENSIBILI (se toccati, reagisci male): {argomenti_sensibili}\n" if argomenti_sensibili else "")
        + (f"- OBIETTIVO NASCOSTO DELLA SIMULAZIONE (non dichiararlo mai, serve solo a guidare le tue reazioni): {obiettivo_nascosto}\n" if obiettivo_nascosto else "")
        + "- Non uscire MAI dal personaggio e non rivelare di essere un'intelligenza artificiale o una simulazione.\n"
        + "- Rispondi SEMPRE in italiano.\n"
        + "- Non aiutare l'operatore: sei il cliente, non conosci le procedure interne della banca.\n"
        + "- Se l'operatore ti chiede dati identificativi (nome, data di nascita, ecc.), forniscili "
        "coerenti con la scheda.",
    ]

    return "\n\n".join(p for p in parts if p)
