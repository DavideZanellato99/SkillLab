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

Qui non si tocca il database e non si guarda una domanda vera: entrano un
esito e un tempo, esce un numero.
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
