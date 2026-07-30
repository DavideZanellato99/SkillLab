"""Quante chiamate insieme questo processo accetta di reggere.

Un event loop saturo non rifiuta niente, rallenta. E rallenta per tutti
insieme, perché la coda degli eventi è una sola: la chiamata di troppo non
degrada se stessa, degrada anche tutte quelle che stavano andando bene. Su
un prodotto dove la latenza *è* la qualità, un picco senza tetto trasforma
un singolo momento di traffico in un'esperienza pessima per chiunque sia
collegato in quel momento.

Meglio perderne una e dirlo, che rovinarne quaranta in silenzio.

**Il conteggio sta in memoria, ed è giusto così.** È l'unica cosa in tutto
il backend che deve restare per processo: a saturarsi è il core su cui gira
questo event loop, non l'installazione. Quattro repliche con tetto 15 fanno
sessanta chiamate in tutto senza doversi coordinare, e ognuna sa contare
esattamente quello che le serve, cioè quante ne sta servendo lei.

Il valore giusto lo dice il test di carico (vedi ``loadtest/``), che è
l'unico modo di sapere quante ne regge davvero un processo. Il default è
prudente: meglio rifiutare qualche chiamata di troppo che scoprire il tetto
vero mentre quaranta persone sono in linea.
"""

import logging
import os

logger = logging.getLogger(__name__)

_DEFAULT_MAX_CONCURRENT_CALLS = 20


def _max_calls() -> int:
    raw = (os.getenv("MAX_CONCURRENT_CALLS") or "").strip()
    if not raw:
        return _DEFAULT_MAX_CONCURRENT_CALLS
    try:
        limite = int(raw)
    except ValueError:
        raise RuntimeError(
            "MAX_CONCURRENT_CALLS non valido (numero di chiamate contemporanee "
            "che un processo accetta, intero > 0). Correggilo nel file .env del "
            "backend."
        ) from None
    if limite <= 0:
        raise RuntimeError("MAX_CONCURRENT_CALLS deve essere maggiore di zero.")
    return limite


MAX_CONCURRENT_CALLS = _max_calls()

# Chiamate in corso su questo processo. Nessun lock: si tocca solo dal
# percorso del WebSocket, che gira nell'event loop, e fra il confronto e
# l'incremento qui sotto non c'è nessun await su cui un'altra chiamata
# possa infilarsi.
_active = 0


def take_slot() -> bool:
    """Prende un posto se c'è, altrimenti dice di no."""
    global _active
    if _active >= MAX_CONCURRENT_CALLS:
        # Vale un warning: è il segnale che questo processo ha finito la
        # capacità, cioè che servono più repliche o una macchina più grande.
        logger.warning(
            "Chiamata rifiutata: il processo è già a %d chiamate contemporanee (tetto).",
            _active,
        )
        return False
    _active += 1
    return True


def release_slot() -> None:
    """Restituisce il posto a chiamata finita, comunque sia finita."""
    global _active
    # Mai sotto zero: un rilascio di troppo (una via d'uscita imprevista del
    # percorso del socket) regalerebbe capacità che non esiste.
    _active = max(0, _active - 1)


def active_calls() -> int:
    return _active
