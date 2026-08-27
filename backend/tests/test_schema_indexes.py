"""Gli indici con cui si leggono conversazioni e messaggi.

Un indice non cambia nessuna risposta, quindi nessun altro test si accorge
se sparisce: se ne accorgono solo le pagine che diventano lente mesi dopo,
quando le righe sono tante. Qui si controlla che ci siano, e che ci siano
per tutti e due i modi in cui un database può arrivarci: creato dai modelli
su un database nuovo, oppure rimesso a posto dalla migrazione di avvio su
uno che ha ancora i vecchi indici a una colonna sola.

Come test_schema_lock, questi non passano dal database di test dentro la
transazione che la suite annulla: fanno DDL vero sull'engine, esattamente
come l'avvio dell'applicazione. Va bene perché ogni passo è idempotente.
"""

from sqlalchemy import text

from database import engine
from startup_migrations import prepare_schema

# Gli indici attesi su ogni tabella, gli stessi che scrivono i modelli e la
# migrazione: se le due strade smettessero di coincidere, il database nuovo
# e quello aggiornato si ritroverebbero con indici diversi.
#
# Le conversazioni ne hanno due perché hanno due domande: per persona dalla
# più recente (l'area di chi si allena) e per periodo senza guardare di chi
# sono (i report dell'amministrazione). Alla seconda il composito non
# risponde, perché la data è la sua seconda colonna.
_ATTESI = {
    "chat_conversations": [
        "ix_chat_conversations_user_created",
        "ix_chat_conversations_created",
    ],
    "chat_messages": ["ix_chat_messages_conversation_created"],
}

# Quelli che i due sopra hanno sostituito, essendone il prefisso.
_SOSTITUITI = {
    "chat_conversations": "ix_chat_conversations_user_id",
    "chat_messages": "ix_chat_messages_conversation_id",
}


def _indici(tabella: str) -> set[str]:
    with engine.connect() as conn:
        righe = conn.execute(
            text("SELECT indexname FROM pg_indexes WHERE tablename = :t"),
            {"t": tabella},
        )
        return {riga[0] for riga in righe}


def test_conversazioni_e_messaggi_hanno_i_loro_indici():
    """Lo stato in cui l'applicazione si avvia, qualunque strada l'abbia portata lì."""
    prepare_schema()

    for tabella, attesi in _ATTESI.items():
        indici = _indici(tabella)
        for indice in attesi:
            assert indice in indici, f"manca {indice} su {tabella}"


def test_un_database_con_i_vecchi_indici_viene_aggiornato():
    """Il caso che descrive la migrazione: l'installazione che esisteva già.

    Si ricostruisce lo schema di prima (indice a una colonna, composito
    assente) e si riavvia: alla fine c'è il composito e il vecchio non è
    rimasto lì a farsi pagare a ogni riga scritta.
    """
    with engine.begin() as conn:
        for attesi in _ATTESI.values():
            for indice in attesi:
                conn.execute(text(f"DROP INDEX IF EXISTS {indice}"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_chat_conversations_user_id "
                "ON chat_conversations (user_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation_id "
                "ON chat_messages (conversation_id)"
            )
        )

    prepare_schema()

    for tabella, attesi in _ATTESI.items():
        indici = _indici(tabella)
        for indice in attesi:
            assert indice in indici, f"manca {indice} su {tabella}"
        assert _SOSTITUITI[tabella] not in indici, f"{_SOSTITUITI[tabella]} è rimasto su {tabella}"
