"""Registro delle sessioni vocali attive, condiviso via Postgres.

Una sessione nasce da POST /api/voice/session (autenticata) e la consuma
il WebSocket vocale, raggiungibile solo con l'id imprevedibile emesso qui.

Il registro sta in tabella e non in memoria perché quelle sono **due
richieste separate**: appena il backend gira su più di un processo non
finiscono sullo stesso, e una sessione scritta nella RAM della replica 1
non esiste per la replica 3 che riceve il WebSocket un istante dopo. Il
rimedio alternativo, mandare le due richieste sulla stessa replica con
un'affinità di sessione sul proxy, funziona ma va poi configurato ovunque
e per sempre. Tenendo lo stato qui il problema non si pone: qualunque
replica serve qualunque chiamata, e davanti basta un round robin.

Postgres e non Redis perché le frequenze in gioco sono ridicole (una
scrittura e una lettura per chiamata, e una chiamata dura minuti), perché
la riga deve sopravvivere a un riavvio, e perché un componente in più
sarebbe un pezzo in più da installare, proteggere e aggiornare per sempre.

La riga porta con sé una copia della storia della conversazione, quindi ha
vita volutamente breve: viene cancellata quando la chiamata si chiude
(``close_voice_session``) e, per le chiamate mai aperte, alla scadenza
dallo sweep di ``housekeeping``.
"""

import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from account_status import access_denied_reason
from database import SessionLocal
from models import User, VoiceSessionRecord

# Quanto resta valida una sessione che nessuno apre
_SESSION_TTL = timedelta(hours=1)

# Le funzioni che aprono una sessione DB per conto proprio passano da qui,
# così la suite può legarle alla connessione della sua transazione (stesso
# meccanismo di ``audit.session_factory``).
session_factory = SessionLocal


def _utcnow() -> datetime:
    """Naive UTC, come le colonne DateTime di tutto il progetto."""
    return datetime.now(UTC).replace(tzinfo=None)


@dataclass
class VoiceSession:
    """Il contesto di una chiamata, staccato dal database.

    Quello che la pipeline riceve e tiene per tutta la durata della
    chiamata: valori puri, nessun oggetto ORM e nessuna sessione DB
    appesa. Vale la copia letta all'apertura del socket, e da lì in poi la
    pipeline non torna più a leggere.
    """

    user_id: str
    avatar_id: str
    conversation_id: str
    # Scheda persona dell'avatar, fotografata all'inizio della sessione: la
    # pipeline la legge da qui, e il percorso caldo di ogni turno resta
    # senza query sull'avatar.
    avatar_profile: dict = field(default_factory=dict)
    # Storia già scritta a database, fotografata all'inizio della sessione.
    # Durante la chiamata la pipeline tiene i turni in memoria, quindi non
    # rilegge mai il database.
    prior_history: list[dict] = field(default_factory=list)
    # Voce Cartesia dell'avatar (None -> voce di default)
    voice_id: str | None = None


def create_voice_session(
    db: Session,
    user_id: UUID,
    avatar_id: UUID,
    conversation_id: UUID,
    avatar_profile: dict,
    prior_history: list[dict],
    voice_id: str | None = None,
) -> str:
    """Registra una nuova sessione e restituisce il suo id imprevedibile.

    Usa la sessione DB di chi chiama, che a questo punto ne ha già una
    aperta per la richiesta HTTP: la scrittura fa parte di quella stessa
    transazione, quindi la sessione vocale esiste esattamente quando esiste
    la conversazione a cui si riferisce.
    """
    session_id = secrets.token_urlsafe(24)
    db.add(
        VoiceSessionRecord(
            id=session_id,
            user_id=user_id,
            avatar_id=avatar_id,
            conversation_id=conversation_id,
            avatar_profile=avatar_profile,
            prior_history=prior_history,
            voice_id=voice_id,
            expires_at=_utcnow() + _SESSION_TTL,
        )
    )
    db.commit()
    return session_id


def load_voice_session(session_id: str) -> VoiceSession | None:
    """La sessione se esiste, è ancora valida e l'account può ancora usarla.

    Apre e chiude una sessione DB tutta sua invece di riceverla da una
    dipendenza FastAPI, e il motivo è la durata: una dipendenza tiene la
    connessione impegnata per tutta la vita dell'endpoint, e l'endpoint qui
    è un WebSocket che dura quanto la telefonata. Quaranta chiamate
    terrebbero occupate quaranta connessioni del pool per dieci minuti,
    esaurendolo molto prima che la CPU dia segni di cedimento.

    Lo stato dell'account si rilegge qui perché il socket vocale è l'unica
    rotta che non passa da ``get_current_user``: senza questo controllo la
    sospensione di un utente, o di tutta la sua organizzazione, non
    arriverebbe mai fino alla chiamata, e un id già emesso resterebbe buono
    fino alla scadenza. Le altre rotte quella verifica la fanno a ogni
    richiesta (vedi ``account_status.access_denied_reason``), e questa è la
    stessa promessa mantenuta sull'unica strada che gira al largo.

    Bloccante: va chiamata via ``asyncio.to_thread``, come le altre
    scritture del percorso vocale.
    """
    with session_factory() as db:
        record = db.get(VoiceSessionRecord, session_id)
        if record is None or record.expires_at <= _utcnow():
            return None
        user = db.get(User, record.user_id)
        if user is None or access_denied_reason(user):
            return None
        return VoiceSession(
            user_id=str(record.user_id),
            avatar_id=str(record.avatar_id),
            conversation_id=str(record.conversation_id),
            avatar_profile=record.avatar_profile or {},
            prior_history=record.prior_history or [],
            voice_id=record.voice_id,
        )


def close_voice_session(session_id: str) -> None:
    """Cancella la sessione a chiamata finita.

    La riga contiene una copia della storia della conversazione, quindi non
    la si lascia in giro fino alla scadenza quando si sa già che non serve
    più. Bloccante, come ``load_voice_session``.
    """
    with session_factory() as db:
        db.query(VoiceSessionRecord).filter(VoiceSessionRecord.id == session_id).delete(
            synchronize_session=False
        )
        db.commit()


def purge_expired(conn: Connection) -> int:
    """Elimina le sessioni scadute, cioè quelle mai aperte da nessuno.

    Chiamata dallo sweep di ``housekeeping``: le chiamate che finiscono
    normalmente cancellano già la propria riga, quindi quello che resta qui
    è solo chi ha chiesto una chiamata e non l'ha mai iniziata.
    """
    return conn.execute(
        delete(VoiceSessionRecord).where(VoiceSessionRecord.expires_at < _utcnow())
    ).rowcount
