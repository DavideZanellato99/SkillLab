"""Quanto vale una risposta: se è giusta, e quanto in fretta è arrivata.

Sapere la procedura e ricordarsela subito non sono la stessa cosa, e allo
sportello la differenza si vede: chi deve rileggere il manuale la risposta ce
l'ha, ma dopo. Il punteggio la misura facendo scendere il valore di una
risposta corretta man mano che passa il tempo della domanda.

Una risposta sbagliata, o lasciata in bianco, vale zero comunque: il tempo
scala quello che si è guadagnato, non regala niente a chi non sa.

Le tre costanti qui sotto sono l'unica cosa da toccare per cambiare la scala:
quanto dura una domanda, in quanti scalini scende e quindi quanto vale ogni
scalino. La durata è la stessa che scorre nel browser (vedi
``SimulationQuestionStep``): sono due valori scritti in due linguaggi, e questo
è il posto che comanda, perché è quello che assegna i punti.

**Una risposta aperta si conta diversamente**: là non c'è cronometro, perché
trenta secondi bastano a scegliere una lettera e non a scrivere una
procedura, e togliere punti a chi si rilegge prima di consegnare
premierebbe la fretta invece della competenza. Quindi il punto intero non si
sconta col tempo, si guadagna a pezzi: vale quanto la risposta è completa,
che è il giudizio del modello (vedi ``simulation_open_answers``). Le due
scale finiscono nello stesso intervallo, da 0 a 1 per domanda, ed è per
questo che un test dell'una forma e uno dell'altra si leggono sullo stesso
voto in decimi.

Qui non si tocca il database, non si guarda una domanda vera e non si chiama
nessun modello: entrano un esito, un tempo o un giudizio, esce un numero.
"""

import math

# I secondi che dura una domanda. Oltre non si va: il browser consegna da solo
# allo scadere, e un tempo più lungo di così è un client che dice bugie o un
# orologio che è andato avanti.
QUESTION_SECONDS = 30

# In quanti scalini scende il valore di una risposta corretta. Dieci scalini
# su trenta secondi vuol dire tre secondi ciascuno: si parte da un punto e si
# perde un decimo ogni tre secondi.
SCORE_STEPS = 10

STEP_SECONDS = QUESTION_SECONDS / SCORE_STEPS
STEP_POINTS = 1 / SCORE_STEPS

# Quanto vale una risposta corretta arrivata all'ultimo istante, che è anche
# quanto vale una arrivata senza dire quando (vedi question_points).
MIN_POINTS = round(STEP_POINTS, 1)

# Il punteggio in decimi, la stessa scala delle valutazioni del roleplay.
GRADE_SCALE = 10

# Da quanti punti in su una risposta si conta fra quelle esatte, dove i punti
# non sono zero o uno.
#
# Vale per le tre forme che ammettono una risposta giusta a metà: il giudizio
# del modello su una risposta scritta, i passi al posto giusto, le coppie
# indovinate. Accanto al voto resta scritto "quante ne sapeva", e quella è una
# conta: da qualche parte la riga va tirata. Sei decimi è la sufficienza, la
# stessa soglia con cui il voto finale si colora a schermo, quindi una domanda
# conta come saputa quando da sola varrebbe la sufficienza.
PASS_POINTS = 0.6


def question_points(is_correct: bool, elapsed_ms: int | None) -> float:
    """I punti di una domanda: da 1 a 0,1 se è giusta, 0 se non lo è.

    ``elapsed_ms`` è quanto ci ha messo chi rispondeva, misurato dal browser.
    Fuori scala viene riportato dentro invece di essere rifiutato, perché una
    consegna arrivata con un numero storto è comunque un test che qualcuno ha
    svolto.

    L'ultimo scalino vale un decimo e non zero: rispondere giusto all'ultimo
    istante è comunque saperlo, e vale più di sbagliare.

    **Un tempo assente vale come l'ultimo scalino**, non come il primo. Il
    tempo è l'unica parte del punteggio che il server non può verificare, e
    la scelta è fra due errori: chi non lo manda prende il massimo, oppure
    prende il minimo. Il primo è silenzioso, un client vecchio o modificato
    piglia dieci e nessuno se ne accorge; il secondo si vede subito nel voto,
    e un voto strano è una cosa che qualcuno viene a chiedere. Fra un difetto
    che si nota e uno che non si nota, si sceglie quello che si nota.
    """
    if not is_correct:
        return 0.0
    if elapsed_ms is None:
        return MIN_POINTS
    seconds = min(max(elapsed_ms, 0), QUESTION_SECONDS * 1000) / 1000
    # Lo scalino in cui cade il tempo, contato da 1: i tre secondi esatti
    # stanno ancora nel primo, il primo istante del quarto secondo è già nel
    # secondo scalino.
    step = max(math.ceil(seconds / STEP_SECONDS), 1)
    return round(1.0 - (step - 1) * STEP_POINTS, 1)


def open_answer_points(quality: float | None) -> float:
    """I punti di una risposta aperta: il giudizio del modello, da 0 a 1.

    ``quality`` è quanto la risposta dice di quello che doveva dire. Un
    valore fuori dall'intervallo viene riportato dentro invece di far
    fallire la consegna: arriva da un modello, e un modello che scrive 1,3
    ha comunque detto che la risposta era completa.

    Assente vale zero, e non è la stessa scelta prudenziale del tempo
    mancante: qui vuol dire che quella risposta non è stata giudicata, e una
    risposta non giudicata non può valere punti.

    L'arrotondamento a un decimale è lo stesso della scala a tempo, così i
    punti di una domanda si leggono uguali nei due tipi di test.
    """
    if quality is None:
        return 0.0
    return round(min(max(quality, 0.0), 1.0), 1)


def matched_points(matched: int, total: int) -> float:
    """I punti di una risposta indovinata a metà: la quota di elementi giusti.

    È la scala dell'ordinamento e dell'abbinamento, dove una risposta non è
    giusta o sbagliata ma giusta *in parte*: quattro passi su sei al posto
    giusto valgono 0,7 come quattro coppie su sei indovinate. Un elemento
    vale quanto un altro, ed è voluto: dire che il primo passo di una
    procedura pesa più dell'ultimo vorrebbe dire scriverlo da qualche parte,
    domanda per domanda, e nessuno lo farebbe.

    Sull'ordinamento si contano le **posizioni esatte** e non le coppie in
    ordine relativo. Un passo spostato all'inizio fa scalare tutti gli altri
    e con questa scala costa caro, il che è un difetto vero; in cambio il
    numero che finisce nell'esito è "quattro passi su sei al posto giusto",
    che chi prende un voto basso capisce e sa come rimediare, mentre "dieci
    coppie su quindici" è un numero che nessuno saprebbe leggere. Fra una
    scala più giusta e una che si spiega, per un test di formazione vale di
    più la seconda.

    L'arrotondamento a un decimale è quello delle altre due scale, così i
    punti di una domanda si leggono uguali in tutti i tipi di test.
    """
    if total <= 0:
        return 0.0
    return round(min(max(matched, 0), total) / total, 1)


def is_partially_correct(points: float) -> bool:
    """Se una risposta a punti conta fra quelle esatte: dalla sufficienza.

    Si guardano i punti già arrotondati e non il numero grezzo, perché i
    punti sono quello che si legge nell'esito: con la soglia sul numero
    nascosto, una risposta da 0,57 mostrerebbe 0,6 accanto a una crocetta
    rossa, e nessuno saprebbe spiegare perché.
    """
    return points >= PASS_POINTS


def attempt_points(points: list[float]) -> float:
    """I punti di un test, sommati e arrotondati una volta sola.

    L'arrotondamento non è cosmetico: dieci decimi sommati in virgola mobile
    fanno 6,3999999999, e questo è il numero che resta scritto nel tentativo
    e che tutte le letture successive si limitano a rileggere.
    """
    return round(sum(points), 1)


def attempt_score(earned_points: float, question_count: int) -> float:
    """Il voto in decimi di un test, dai punti raccolti sulle sue domande."""
    if not question_count:
        return 0.0
    return round(earned_points * GRADE_SCALE / question_count, 1)
