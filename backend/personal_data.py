"""Right of access and portability (GDPR art. 15 and 20): the copy.

Everything the platform holds about one person, assembled into a ZIP they
download themselves: a JSON with the structured data, the audio of their
own calls as files, and a plain-Italian README explaining what is in the
archive (art. 12 asks for the copy to be intelligible, not merely complete).

JSON because art. 20 wants a structured, commonly used, machine-readable
format, with Italian keys because the person opening it is the one the
data is about, not a system integrator.

Two rules this module exists to enforce, both of them about what does NOT
go in:

- **the persona sheet never leaves the server.** ``Avatar.profile`` carries
  hidden objectives, secrets and the real cause of the scenario: an export
  that included it would hand every trainee the answer key. Only the
  avatar's name and category appear here.
- **nobody else's data goes in.** Every query is filtered by the requester,
  and the only names of other people that appear are the trainers who
  signed a verdict on this person's own conversations, which is part of
  their grade and something they are entitled to read.

What DOES go in, and is easy to forget: the audit rows about them (their
own logins and actions), and the sessions recorded against their account
with IP and User-Agent. Those are personal data held about the requester,
so art. 15 covers them, even though the audit trail is a super-admin
screen in the UI.
"""

import io
import json
import re
import zipfile
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.orm import Session

import audit
import reviews
from models import (
    AuditLog,
    Avatar,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationRecording,
    SimulationAttempt,
    TechnicalSimulation,
    TokenSession,
    TrainingAssignment,
    User,
    UserSelection,
)

_RECORDINGS_DIR = "registrazioni"

# MediaRecorder gives us webm on Chrome/Firefox and mp4 on Safari; the
# stored mime type is the only thing that knows which. It arrives with the
# codec attached ("audio/webm;codecs=opus"), so the lookup is on the base
# type: an archive full of .bin files is not a copy anybody can play.
_EXTENSIONS = {"audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg"}


def _extension(mime_type: str) -> str:
    return _EXTENSIONS.get((mime_type or "").split(";")[0].strip().lower(), "bin")


_README = """ESPORTAZIONE DEI TUOI DATI PERSONALI — SkillLab

Questo archivio contiene tutto quello che la piattaforma conserva su di te,
esportato il {data}.

  dati.json          Tutti i dati in formato strutturato: il tuo profilo, le
                     conversazioni con le trascrizioni complete, le
                     valutazioni automatiche, le revisioni dei formatori, gli
                     obiettivi assegnati, i test tecnici svolti con le tue
                     risposte, gli accessi e il registro delle tue attività.

  {cartella}/   Le registrazioni audio delle tue telefonate simulate,
                     una per conversazione. Il nome del file corrisponde al
                     campo "registrazione_audio" della conversazione dentro
                     dati.json.

Il file dati.json è in formato JSON: puoi aprirlo con un qualsiasi editor di
testo, oppure importarlo in un altro sistema.

Non sono inclusi i dati di altre persone. I nomi dei formatori che compaiono
nelle revisioni sono parte della valutazione che ti riguarda.

Se qualcosa non ti torna, o vuoi chiedere la rettifica o la cancellazione di
questi dati, scrivi a chi gestisce la piattaforma per la tua organizzazione.
"""


def _at(value: datetime | None) -> str | None:
    """A timestamp as ISO 8601, or None. The columns are naive UTC."""
    return value.replace(tzinfo=UTC).isoformat() if value else None


def _slug(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value or "").strip("-").lower()
    return cleaned or fallback


def _account(user: User) -> dict:
    return {
        "email": user.email,
        "nome": user.nome,
        "cognome": user.cognome,
        "ruolo": user.ruolo,
        "organizzazione": user.organization_name,
        "stato": user.status,
        "creato_il": _at(user.created_at),
        "ultimo_accesso": _at(user.last_login_at),
    }


def _messages(db: Session, conversation_id: UUID) -> list[dict]:
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    return [
        {
            "chi": "tu" if m.role == "user" else "avatar",
            "testo": m.content,
            "quando": _at(m.created_at),
        }
        for m in rows
    ]


def _evaluation(evaluation: ConversationEvaluation | None) -> dict | None:
    if evaluation is None:
        return None
    data = evaluation.result or {}
    return {
        "punteggio_complessivo": evaluation.overall_score,
        "sintesi": data.get("summary", ""),
        "criteri": data.get("criteria") or [],
        "valutata_il": _at(evaluation.updated_at),
    }


def _review(review) -> dict | None:
    if review is None:
        return None
    return {
        "formatore": review.reviewer_name,
        "nota": review.summary_note,
        "voto_corretto": review.override_score,
        "motivo_correzione": review.override_reason,
        "voto_ai_al_momento_della_revisione": review.ai_score_at_review,
        "scritta_il": _at(review.created_at),
        "aggiornata_il": _at(review.updated_at),
    }


def _conversations(db: Session, user: User) -> tuple[list[dict], dict[UUID, str]]:
    """The person's conversations, plus the recording filename of each.

    The second half of the pair is what the caller writes into the archive:
    conversation id -> path inside the ZIP.
    """
    rows = (
        db.query(ChatConversation)
        .filter(ChatConversation.user_id == user.id)
        .order_by(ChatConversation.created_at.asc())
        .all()
    )
    if not rows:
        return [], {}

    conversation_ids = [c.id for c in rows]
    avatars = {
        a.id: a for a in db.query(Avatar).filter(Avatar.id.in_({c.avatar_id for c in rows})).all()
    }
    evaluations = {
        e.conversation_id: e
        for e in db.query(ConversationEvaluation)
        .filter(ConversationEvaluation.conversation_id.in_(conversation_ids))
        .all()
    }
    reviews_by_id = reviews.reviews_by_conversation(db, conversation_ids)
    annotations_by_id = reviews.annotations_by_conversation(db, conversation_ids)
    # Metadata only: the blob stays deferred until the file is written.
    recordings = {
        r.conversation_id: r
        for r in db.query(ConversationRecording)
        .filter(ConversationRecording.conversation_id.in_(conversation_ids))
        .all()
    }

    exported = []
    filenames: dict[UUID, str] = {}
    for conversation in rows:
        avatar = avatars.get(conversation.avatar_id)
        recording = recordings.get(conversation.id)
        if recording is not None:
            name = f"{_slug(conversation.title, 'conversazione')}-{str(conversation.id)[:8]}"
            filenames[conversation.id] = (
                f"{_RECORDINGS_DIR}/{name}.{_extension(recording.mime_type)}"
            )

        exported.append(
            {
                "titolo": conversation.title,
                "tipo": "chiamata" if conversation.mode == "voice" else "chat",
                # Name and category only: the persona sheet stays server-side.
                "avatar": avatar.name if avatar else None,
                "categoria_avatar": avatar.category if avatar else None,
                "iniziata_il": _at(conversation.created_at),
                "terminata_il": _at(conversation.ended_at),
                "messaggi": _messages(db, conversation.id),
                "valutazione_automatica": _evaluation(evaluations.get(conversation.id)),
                "revisione_del_formatore": _review(reviews_by_id.get(conversation.id)),
                "annotazioni_del_formatore": [
                    {
                        "formatore": a.reviewer_name,
                        "nota": a.note,
                        "scritta_il": _at(a.created_at),
                    }
                    for a in annotations_by_id.get(conversation.id, [])
                ],
                "registrazione_audio": filenames.get(conversation.id),
            }
        )
    return exported, filenames


def _assignments(db: Session, user: User) -> list[dict]:
    rows = (
        db.query(TrainingAssignment, Avatar)
        .outerjoin(Avatar, Avatar.id == TrainingAssignment.avatar_id)
        .filter(TrainingAssignment.user_id == user.id)
        .order_by(TrainingAssignment.created_at.asc())
        .all()
    )
    return [
        {
            "avatar": avatar.name if avatar else None,
            "punteggio_obiettivo": assignment.target_score,
            "scadenza": _at(assignment.due_at),
            "assegnato_il": _at(assignment.created_at),
        }
        for assignment, avatar in rows
    ]


def _simulation_attempts(db: Session, user: User) -> list[dict]:
    """I test tecnici svolti, con le risposte date domanda per domanda.

    Le risposte ci sono per intero e non solo il voto: è quello che la
    persona ha scritto, ed è la parte dell'archivio da cui si può contestare
    un esito. Il titolo della simulazione viene dalla riga e non dalla
    fotografia del tentativo, così un test rinominato resta riconoscibile.
    """
    rows = (
        db.query(SimulationAttempt, TechnicalSimulation)
        .outerjoin(TechnicalSimulation, TechnicalSimulation.id == SimulationAttempt.simulation_id)
        .filter(SimulationAttempt.user_id == user.id)
        .order_by(SimulationAttempt.created_at.asc())
        .all()
    )
    return [
        {
            "simulazione": simulation.title if simulation else None,
            "svolto_il": _at(attempt.created_at),
            "risposte_corrette": attempt.correct_count,
            "domande_totali": attempt.question_count,
            "punti": attempt.earned_points,
            "punteggio": attempt.score,
            "risposte": [
                {
                    "domanda": answer.get("text"),
                    "alternative": answer.get("options"),
                    "risposta_data": answer.get("selected_option"),
                    "risposta_corretta": answer.get("correct_option"),
                    "esatta": answer.get("is_correct"),
                    # Quanto ci ha messo e quanto è valsa: fanno parte
                    # dell'esito quanto la risposta, perché sono la ragione
                    # per cui una risposta giusta ha preso meno di un punto.
                    "tempo_ms": answer.get("elapsed_ms"),
                    "punti": answer.get("points"),
                }
                for answer in (attempt.answers or [])
            ],
        }
        for attempt, simulation in rows
    ]


def _selections(db: Session, user: User) -> list[dict]:
    rows = (
        db.query(UserSelection, Avatar)
        .outerjoin(Avatar, Avatar.id == UserSelection.avatar_id)
        .filter(UserSelection.user_id == user.id)
        .order_by(UserSelection.selected_at.asc())
        .all()
    )
    return [
        {"avatar": avatar.name if avatar else None, "quando": _at(selection.selected_at)}
        for selection, avatar in rows
    ]


def _sessions(db: Session, user: User) -> list[dict]:
    """Open sessions recorded against the account.

    The jti is deliberately left out: it identifies a live token, and this
    archive is a file that gets emailed around. IP and User-Agent are the
    personal data, and those are here.
    """
    rows = (
        db.query(TokenSession)
        .filter(TokenSession.user_id == user.id)
        .order_by(TokenSession.created_at.asc())
        .all()
    )
    return [
        {
            "indirizzo_ip": s.client_ip,
            "browser": s.user_agent,
            "aperta_il": _at(s.created_at),
            "scade_il": _at(s.expires_at),
        }
        for s in rows
    ]


def _activity(db: Session, user: User) -> list[dict]:
    """The person's own rows of the audit trail.

    A super-admin screen in the UI, but that is about who may browse the
    registry, not about who may have a copy of their own entries.
    """
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == user.id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    return [
        {
            "azione": audit.action_label(row.action),
            "quando": _at(row.created_at),
            "indirizzo_ip": row.client_ip,
            "browser": row.user_agent,
        }
        for row in rows
    ]


def _payload(db: Session, user: User) -> tuple[dict, dict[UUID, str]]:
    """The contents of dati.json, plus the recordings it points at."""
    conversations, filenames = _conversations(db, user)
    return {
        "esportato_il": datetime.now(UTC).isoformat(),
        "account": _account(user),
        "conversazioni": conversations,
        "obiettivi_assegnati": _assignments(db, user),
        "simulazioni_tecniche": _simulation_attempts(db, user),
        "avatar_selezionati": _selections(db, user),
        "sessioni_di_accesso": _sessions(db, user),
        "registro_attivita": _activity(db, user),
    }, filenames


def build(db: Session, user: User) -> dict:
    """The structured half of the export, exactly as it lands in dati.json."""
    payload, _ = _payload(db, user)
    return payload


def export_zip(db: Session, user: User) -> bytes:
    """Everything held about this person: dati.json, the audio, a README."""
    payload, filenames = _payload(db, user)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "LEGGIMI.txt",
            _README.format(data=datetime.now(UTC).strftime("%d/%m/%Y"), cartella=_RECORDINGS_DIR),
        )
        archive.writestr("dati.json", json.dumps(payload, ensure_ascii=False, indent=2))
        # One query per recording, on purpose: the audio column is deferred
        # and these blobs are heavy, so they are loaded and written one at a
        # time rather than all held in memory at once.
        for conversation_id, path in filenames.items():
            recording = (
                db.query(ConversationRecording)
                .filter(ConversationRecording.conversation_id == conversation_id)
                .first()
            )
            if recording is not None and recording.audio:
                archive.writestr(path, recording.audio)

    return buffer.getvalue()
