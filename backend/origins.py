"""Le origini da cui il browser può parlare con questa applicazione.

Un elenco solo, letto da ``ALLOWED_ORIGINS``, perché i posti che devono
sapere quali sono le origini legittime sono due e devono dire la stessa
cosa: il CORS delle chiamate HTTP (vedi ``main``) e l'handshake del
WebSocket vocale (vedi ``routers/voice``).

Nessun valore di ripiego: dove l'applicazione risponde è una decisione di
installazione, e un default nel codice la trasformerebbe in una svista che
si scopre tardi.
"""

import os

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if not ALLOWED_ORIGINS:
    raise RuntimeError("ALLOWED_ORIGINS non configurato. Aggiungilo al file .env del backend.")


def is_allowed(origin: str | None) -> bool:
    """Se una richiesta che dichiara questa origine può essere servita.

    Un'origine assente passa, ed è voluto: la manda il browser, e chi non è
    un browser (uno script, la suite, uno strumento da riga di comando) non
    la manda affatto. Rifiutarla vorrebbe dire chiudere la porta a tutto
    quello che non è una pagina, mentre la cosa da cui ci si difende qui è
    esattamente una pagina, quella di un altro sito.
    """
    return origin is None or origin in ALLOWED_ORIGINS
