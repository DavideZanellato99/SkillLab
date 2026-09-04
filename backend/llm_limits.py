"""Quante chiamate al modello può fare una persona in un'ora.

Il resto dell'applicazione si difende da chi non ha le credenziali. Questo
modulo si difende da chi ce le ha: un account normale, che ripete una
richiesta più volte di quanto abbia senso ripeterla.

Il danno di cui si parla qui non è un disservizio, è una fattura. Una
valutazione gira su un modello di ragionamento con sforzo alto e un budget
di 6144 token, si può rilanciare sulla stessa conversazione all'infinito, e
ogni rilancio sovrascrive il precedente: chi lo facesse in un ciclo non
romperebbe niente e non farebbe suonare niente, e il conto arriverebbe a fine
mese. Il vocale un tetto ce l'aveva già (``voice_capacity``), perché lì la
capienza è un problema visibile; qui il tetto mancava proprio dove il costo
per chiamata è più alto.

**Le soglie stanno nel codice**, come quelle del login e per lo stesso
motivo: non sono una scelta di installazione, sono la distanza fra un uso
intenso e un uso che non è più un uso. Sono larghe di proposito, perché il
caso normale non deve accorgersi che esistono.

Si conta ogni chiamata **iniziata**, non ogni chiamata riuscita: è quella che
si paga, e contare solo le riuscite regalerebbe tentativi infiniti proprio
quando il modello sta andando male.
"""

import asyncio
from uuid import UUID

from fastapi import HTTPException, status

from rate_limit import SlidingWindowLimiter

# Una finestra sola per tutti: un'ora è il tempo in cui una giornata di aula
# si vede per intero, e più corta trasformerebbe una pausa in un blocco.
_ORA = 60 * 60

# Una conversazione scritta arriva a una quarantina di battute, quindi qui
# ci stanno tre chat intere di fila senza mai sfiorare il limite.
CHAT = SlidingWindowLimiter(scope="llm-chat", max_events=120, window_seconds=_ORA)

# La chiamata cara. Una conversazione si valuta una volta, e un rilancio
# dopo un errore ci sta: dieci in un'ora è già molto più di quello che serve
# a chi si allena davvero.
VALUTAZIONE = SlidingWindowLimiter(scope="llm-valutazione", max_events=10, window_seconds=_ORA)

# Un test si consegna una volta sola, e le risposte aperte si correggono con
# una chiamata per consegna.
CORREZIONE = SlidingWindowLimiter(scope="llm-correzione", max_events=20, window_seconds=_ORA)

# Le tre operazioni di amministrazione sono riservate a chi è pochi e
# fidato: qui il tetto non difende da loro, difende da una pagina lasciata a
# ripetere la stessa richiesta.
#
# L'indicizzazione è la più economica delle tre (sono vettori, non risposte)
# ma è anche l'unica il cui prezzo lo decide chi carica, perché cresce con il
# documento, e un manuale da dieci megabyte ricaricato in ciclo è la stessa
# spesa di qualcosa di molto più appariscente.
# Il debriefing sta con le operazioni di amministrazione perché lo chiede
# chi amministra, ma il suo tetto è quello della valutazione, ed è per la
# stessa ragione: è una chiamata cara che si può rilanciare all'infinito
# sulla stessa persona, perché ogni rilancio sostituisce il precedente.
# Dieci in un'ora sono dieci persone diverse di cui preparare il colloquio,
# che è già più di quante se ne facciano in una giornata.
DEBRIEFING = SlidingWindowLimiter(scope="llm-debriefing", max_events=10, window_seconds=_ORA)
# Il quadro di un percorso è lo stesso gesto sul gruppo invece che sulla
# persona, e ha lo stesso tetto per la stessa ragione: chiamata cara, che su
# uno stesso percorso si può chiedere a ogni prova nuova. Dieci all'ora sono
# dieci classi diverse di cui preparare la sessione, che è più di quante se ne
# facciano in una giornata.
DEBRIEFING_PERCORSO = SlidingWindowLimiter(
    scope="llm-debriefing-percorso", max_events=10, window_seconds=_ORA
)

BOZZA_SCHEDA = SlidingWindowLimiter(scope="llm-bozza", max_events=30, window_seconds=_ORA)
# La bozza di percorso è la gemella della scheda persona, e ha lo stesso
# tetto: una chiamata sola, che non salva niente, e che si rilancia
# riscrivendo l'obiettivo finché la proposta non convince. Trenta all'ora
# sono molte più riscritture di quante ne servano a comporre un corso.
BOZZA_PERCORSO = SlidingWindowLimiter(scope="llm-percorso", max_events=30, window_seconds=_ORA)
GENERAZIONE_DOMANDE = SlidingWindowLimiter(scope="llm-domande", max_events=10, window_seconds=_ORA)
# Il controllo del serbatoio è una generazione al contrario, e costa quasi
# quanto: un'indicizzazione delle cinquanta domande più una lettura ogni sei.
# Il tetto è quello della generazione perché è lo stesso gesto ripetuto sulla
# stessa simulazione, e ogni giro sostituisce l'esito precedente.
REVISIONE_SERBATOIO = SlidingWindowLimiter(
    scope="llm-revisione", max_events=10, window_seconds=_ORA
)
INDICIZZAZIONE = SlidingWindowLimiter(
    scope="llm-indicizzazione", max_events=20, window_seconds=_ORA
)


def _messaggio(seconds: int) -> str:
    if seconds >= 60:
        minuti = (seconds + 59) // 60
        return (
            "Hai raggiunto il numero massimo di richieste per questa funzione. "
            f"Riprova tra {minuti} minut{'o' if minuti == 1 else 'i'}."
        )
    return (
        "Hai raggiunto il numero massimo di richieste per questa funzione. "
        f"Riprova tra {seconds} secondi."
    )


def _consume(limiter: SlidingWindowLimiter, key: str) -> int:
    """Registra una chiamata e torna i secondi da aspettare (0 = fatta)."""
    wait = limiter.retry_after(key)
    if wait:
        return wait
    limiter.record(key)
    return 0


async def consume(limiter: SlidingWindowLimiter, user_id: UUID) -> None:
    """Conta una chiamata al modello per questo utente, o solleva un 429.

    Le due query girano su un thread: sono brevi, ma stanno dentro endpoint
    asincroni, e l'event loop che le aspettasse fermerebbe anche le battute
    delle telefonate in corso.
    """
    wait = await asyncio.to_thread(_consume, limiter, str(user_id))
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_messaggio(wait),
            headers={"Retry-After": str(wait)},
        )
