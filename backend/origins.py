"""Le origini da cui il browser può parlare con questa applicazione.

Un elenco solo, letto da ``ALLOWED_ORIGINS``, perché i posti che devono
sapere quali sono le origini legittime sono due e devono dire la stessa
cosa: il CORS delle chiamate HTTP (vedi ``main``) e l'handshake del
WebSocket vocale (vedi ``routers/voice``).

Nessun valore di ripiego: dove l'applicazione risponde è una decisione di
installazione, e un default nel codice la trasformerebbe in una svista che
si scopre tardi.

``ALLOWED_ORIGIN_SUFFIXES`` è l'unica deroga al confronto esatto, ed esiste
per lo sviluppo. Un tunnel come quelli di Cloudflare pubblica l'applicazione
su un hostname casuale che cambia a ogni avvio, quindi non è un valore che si
possa scrivere una volta nell'elenco; e da lì l'unica cosa che non parte è la
chiamata, perché le richieste HTTP passano dal proxy del frontend come stessa
origine e non incontrano nessun controllo, mentre l'handshake del WebSocket
porta l'``Origin`` fino a qui. Un suffisso ammette ogni sottodominio di quel
dominio, cioè anche il tunnel di chiunque altro: è una porta aperta di
proposito su una macchina di sviluppo, e in produzione la variabile resta
vuota, dove l'origine è un dominio noto che sta nell'elenco esatto. Chi la
valorizza se lo sente dire nei log a ogni avvio (vedi ``main``).
"""

import os
import re

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if not ALLOWED_ORIGINS:
    raise RuntimeError("ALLOWED_ORIGINS non configurato. Aggiungilo al file .env del backend.")

# Si scrivono con o senza punto davanti, qui restano senza: il punto lo mette
# il modello qui sotto, insieme alla pretesa che davanti ci sia almeno
# un'etichetta. Senza quella pretesa un suffisso ammetterebbe anche i domini
# che finiscono per quelle lettere senza esserne sottodomini, e
# "trycloudflare.com" si porterebbe dietro "nontrycloudflare.com".
ALLOWED_ORIGIN_SUFFIXES = [
    s.strip().lower().lstrip(".")
    for s in os.getenv("ALLOWED_ORIGIN_SUFFIXES", "").split(",")
    if s.strip(" .")
]


def _suffix_regex(suffixes: list[str]) -> str | None:
    """Il modello che riconosce i sottodomini dei suffissi, None se non ce ne sono.

    Uno solo per tutti e due i posti che decidono, come l'elenco: lo usa
    ``is_allowed`` per il WebSocket, e il CORS di ``main`` lo prende così
    com'è, perché vuole un'espressione e non una funzione. La porta è ammessa
    perché fa parte dell'origine, e un tunnel provato in locale ce l'ha.
    """
    if not suffixes:
        return None
    domini = "|".join(re.escape(s) for s in suffixes)
    return rf"(?i)https?://(?:[A-Za-z0-9-]+\.)+(?:{domini})(?::\d+)?"


ALLOWED_ORIGIN_REGEX = _suffix_regex(ALLOWED_ORIGIN_SUFFIXES)
_SUFFIX_PATTERN = re.compile(ALLOWED_ORIGIN_REGEX) if ALLOWED_ORIGIN_REGEX else None


def is_allowed(origin: str | None) -> bool:
    """Se una richiesta che dichiara questa origine può essere servita.

    Un'origine assente passa, ed è voluto: la manda il browser, e chi non è
    un browser (uno script, la suite, uno strumento da riga di comando) non
    la manda affatto. Rifiutarla vorrebbe dire chiudere la porta a tutto
    quello che non è una pagina, mentre la cosa da cui ci si difende qui è
    esattamente una pagina, quella di un altro sito.

    Il confronto è esatto, salvo i suffissi di sviluppo descritti in cima al
    modulo, che ammettono un sottodominio qualunque dei domini dichiarati.
    """
    if origin is None or origin in ALLOWED_ORIGINS:
        return True
    return _SUFFIX_PATTERN is not None and _SUFFIX_PATTERN.fullmatch(origin) is not None
