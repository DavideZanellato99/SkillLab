"""Automatic names for conversations.

Il titolo è obbligatorio, ma una conversazione nasce quando la prova comincia,
cioè prima che esista un contenuto da cui ricavarlo: il nome si compone allora
con quello che si sa già, l'avatar con cui si parla e il giorno, e chi la
possiede resta libero di rinominarla dopo.

Era la categoria con un progressivo ("Clienti 3"), che diceva soltanto quante
conversazioni erano già state aperte in quel gruppo. Per ritrovare una prova
fra venti righe è il dato meno utile: non dice né con chi si è parlato né
quando, e due categorie sole bastavano a riempire l'elenco di titoli che si
distinguono per una cifra. "Mario Rossi, 6 mar 2026" risponde a tutte e due le
domande, e il progressivo torna solo dove serve davvero, fra due prove con lo
stesso avatar nello stesso giorno.

**La data è quella del server, in UTC come ogni colonna dello schema** (vedi
docs/dati-e-schema.md). Il titolo è testo e non un momento: una volta scritto
non si sposta più con il fuso di chi legge, quindi una prova tenuta a cavallo
della mezzanotte può portare il giorno prima rispetto alla data che la riga
accanto mostra. È l'unico punto in cui si vede, e resta rinominabile.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.orm import Session

from models import ChatConversation

MAX_TITLE_LENGTH = 120

# Quanto può crescere il progressivo prima che sia il nome a cedere spazio:
# è la coda " (99)", cioè il caso peggiore che vale la pena tenere in conto.
_COUNTER_ROOM = len(" (99)")

# I mesi in italiano stanno scritti qui: il locale del container non è una
# cosa su cui contare, e un mese in inglese in mezzo all'app sarebbe un refuso
# permanente su una riga che nessuno rilegge più.
MONTHS = ("gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic")


def date_label(when: datetime) -> str:
    """ "6 mar 2026": il giorno come si legge, senza lo zero davanti.

    Il mese abbreviato è la stessa forma che usano le righe dell'app, e
    l'anno c'è sempre: un titolo si rilegge anche a distanza di stagioni, e
    "6 mar" da solo diventa ambiguo esattamente allora.
    """
    return f"{when.day} {MONTHS[when.month - 1]} {when.year}"


def next_conversation_title(
    db: Session, user_id: UUID, avatar_name: str, when: datetime | None = None
) -> str:
    """ "Mario Rossi, 6 mar 2026", con "(2)" dalla seconda dello stesso giorno.

    `when` è il momento in cui la conversazione nasce, e si passa solo dove
    quel momento non è adesso: la ricomposizione dei titoli mancanti sulle
    conversazioni vecchie, che deve datarle come sono nate e non come sono
    state ritrovate.

    Un avatar senza nome non esiste, ma un titolo vuoto sarebbe una riga
    illeggibile per sempre: il ripiego è "Conversazione", come prima.
    """
    label = (avatar_name or "").strip() or "Conversazione"
    when = when or datetime.now(UTC)
    day = date_label(when)

    # A cedere spazio è il nome e non la data: di un avatar con un nome
    # lunghissimo mezzo nome si riconosce ancora, mentre mezza data non è
    # più una data.
    room = MAX_TITLE_LENGTH - len(f", {day}") - _COUNTER_ROOM
    base = f"{label[:room].strip()}, {day}"

    # Una lettura sola per tutta la famiglia di titoli che comincia così: il
    # confronto poi è esatto, quindi qualche riga in più raccolta da un nome
    # che contiene un carattere jolly non cambia niente.
    taken = {
        title
        for (title,) in db.query(ChatConversation.title).filter(
            ChatConversation.user_id == user_id,
            ChatConversation.title.ilike(f"{base}%"),
        )
    }
    if base not in taken:
        return base

    number = 2
    while f"{base} ({number})" in taken:
        number += 1
    return f"{base} ({number})"[:MAX_TITLE_LENGTH]
