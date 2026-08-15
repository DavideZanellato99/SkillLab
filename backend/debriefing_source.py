"""Cosa il modello ha davanti quando scrive il debriefing di una persona.

Il debriefing è l'unica cosa nell'applicazione che guarda **più prove
insieme**, quindi è anche l'unica che deve decidere quali. Questo modulo
prende quella decisione e non ne prende altre: entra una persona, esce il
materiale già pronto per il prompt e i numeri già calcolati. Il prompt e la
chiamata stanno in ``user_debriefing``, come la derivazione del progresso di
un percorso sta in ``training_progress`` e non nel router che la mostra.

Tre scelte reggono il file.

**I numeri non li calcola il modello.** Media dei voti, media per criterio,
quante prove: si contano qui, in Python, e nel prompt arrivano già fatti, con
l'istruzione di non ricalcolarli. Un debriefing che dicesse una media diversa
da quella della dashboard contraddirebbe la pagella che lo studente ha in
mano, ed è esattamente il modo in cui uno strumento di questo tipo smette di
essere creduto.

**Le trascrizioni entrano intere o non entrano.** Il tetto è sui caratteri e
non sul numero di battute: una conversazione che non ci sta per intero resta
fuori invece di entrare a metà, perché una trascrizione tagliata a metà fa
credere che l'operatore non abbia chiuso la chiamata, e quella è una cosa che
il debriefing scriverebbe come un difetto.

**Metà di questo materiale lo ha scritto la persona di cui parla.** Vale la
stessa regola della valutazione (vedi ``untrusted_text``): titoli, battute e
risposte aperte perdono la forma con cui una riga si dichiara, e il tutto
viaggia dentro un recinto che il prompt nomina. Qui il rischio è perfino più
diretto che nella valutazione: là si sposta un voto, qui si detta a chi
insegna cosa pensare di una persona.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

import untrusted_text
from models import (
    Avatar,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationReview,
    MessageAnnotation,
    SimulationAttempt,
    TechnicalSimulation,
    UserDebriefing,
)
from openai_service import EVALUATION_CRITERIA
from reviews import annotations_by_conversation, final_score

# Quante prove entrano, per forma. Le più recenti: un quadro d'insieme
# risponde a "come sta andando adesso", e le prove di sei mesi fa dicono di
# una persona che non c'è più. Cinque conversazioni sono cinque scenari
# diversi, che è già abbastanza perché uno schema si veda ripetere.
MAX_CONVERSATIONS = 5
MAX_ATTEMPTS = 5

# Il tetto complessivo delle trascrizioni. Cinque conversazioni piene stanno
# comodamente dentro il contesto del modello; questo numero serve al caso
# opposto, cioè alle chiamate lunghissime, dove cinque trascrizioni intere
# costerebbero più di tutto il resto dell'applicazione messo insieme.
TRANSCRIPT_BUDGET_CHARS = 24_000

# Sotto questa soglia il debriefing non ha niente da dire che non sia già
# scritto. Con una prova sola sarebbe la valutazione riscritta con altre
# parole, con due sarebbe il confronto, che esiste già e non costa niente:
# quello che questo strumento aggiunge comincia quando le prove sono tante
# abbastanza da avere qualcosa in comune.
MIN_EVIDENCE = 3


@dataclass(frozen=True)
class CriterionAverage:
    """La media di un criterio su tutte le valutazioni lette."""

    key: str
    label: str
    average: float


@dataclass(frozen=True)
class DebriefingMaterial:
    """Il materiale del debriefing: il testo per il modello e i conti fatti.

    ``dossier`` è già neutralizzato ma non ancora recintato: a chiuderlo nel
    recinto è ``user_debriefing``, che è anche l'unico posto che conosce il
    marcatore, perché il marcatore cambia a ogni chiamata.
    """

    dossier: str
    covered_until: datetime
    conversations: int
    attempts: int
    conversation_average: float | None
    attempt_average: float | None
    criteria_averages: list[CriterionAverage]

    @property
    def evidence_count(self) -> int:
        return self.conversations + self.attempts


def _avg(values: list[float]) -> float | None:
    """La media a una cifra, o None su lista vuota.

    Niente in, niente out, come ``final_score``: una media di zero prove non
    è zero, e uno zero finirebbe stampato accanto al nome di una persona.
    """
    return round(sum(values) / len(values), 1) if values else None


def _conversation_rows(db: Session, user_id: UUID) -> list[tuple]:
    """Le conversazioni valutate della persona, dalla più recente.

    Solo quelle con una valutazione: una conversazione senza giudizio non
    porta niente che il debriefing possa leggere, e occuperebbe il budget
    delle trascrizioni al posto di una che invece parla.
    """
    return (
        db.query(ChatConversation, Avatar.name, ConversationEvaluation, ConversationReview)
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
        .join(
            ConversationEvaluation,
            ConversationEvaluation.conversation_id == ChatConversation.id,
        )
        .outerjoin(ConversationReview, ConversationReview.conversation_id == ChatConversation.id)
        .filter(ChatConversation.user_id == user_id)
        .order_by(ChatConversation.created_at.desc())
        .limit(MAX_CONVERSATIONS)
        .all()
    )


def _messages_by_conversation(
    db: Session, conversation_ids: list[UUID]
) -> dict[UUID, list[ChatMessage]]:
    """Le battute di tutte le conversazioni lette, in una query sola."""
    if not conversation_ids:
        return {}
    by_conversation: dict[UUID, list[ChatMessage]] = {cid: [] for cid in conversation_ids}
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id.in_(conversation_ids))
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    for message in rows:
        by_conversation[message.conversation_id].append(message)
    return by_conversation


def _transcript(messages: list[ChatMessage]) -> str:
    """La trascrizione come la legge il giudice, numerata e neutralizzata.

    Stessa forma della valutazione, di proposito: il debriefing rilegge le
    stesse conversazioni con gli stessi giudizi accanto, e due forme diverse
    per la stessa cosa sarebbero due cose da tenere allineate.
    """
    return "\n".join(
        f"[{i}] {'OPERATORE' if m.role == 'user' else 'CLIENTE'}: "
        f"{untrusted_text.flatten(m.content)}"
        for i, m in enumerate(
            (m for m in messages if str(m.content or "").strip()),
            start=1,
        )
    )


def _criteria_lines(evaluation: ConversationEvaluation) -> str:
    """I sei criteri di una valutazione, con voto, commento e suggerimenti.

    È la parte più densa del dossier, ed è anche la ragione per cui il
    debriefing costa poco rispetto a quello che restituisce: il lavoro di
    leggere la conversazione criterio per criterio lo ha già fatto il
    valutatore, e qui si rilegge invece di rifarlo.
    """
    righe = []
    for criterion in (evaluation.result or {}).get("criteria") or []:
        voce = f"  - {criterion.get('label')}: {criterion.get('score')}/10"
        commento = str(criterion.get("comment") or "").strip()
        if commento:
            voce += f"\n    commento del valutatore: {commento}"
        suggerimenti = str(criterion.get("suggestions") or "").strip()
        if suggerimenti:
            voce += f"\n    suggerimenti già dati: {suggerimenti}"
        righe.append(voce)
    return "\n".join(righe)


def _review_lines(review: ConversationReview | None, annotations: list[MessageAnnotation]) -> str:
    """Cosa il docente ha scritto su questa conversazione, se ha scritto.

    Va nel dossier per una ragione precisa: è l'unico pezzo di materiale
    scritto da chi il debriefing lo leggerà. Un quadro d'insieme che ripete
    a un docente una cosa che quel docente aveva già corretto a mano tre
    volte è un quadro che non ha letto niente.

    Le note appuntate sui singoli messaggi contano quanto la sintesi, e per
    lo stesso motivo per cui esistono senza revisione: un docente che passa
    una trascrizione segnando cinque punti sta dicendo cosa non va, anche
    se poi non ha scritto nessun riepilogo.
    """
    righe = []
    if review is not None:
        if review.summary_note:
            righe.append(f"  nota del docente: {review.summary_note.strip()}")
        if review.override_score is not None:
            motivo = (review.override_reason or "").strip()
            righe.append(
                f"  il docente ha corretto il voto a {review.override_score}/10"
                + (f", perché: {motivo}" if motivo else "")
            )
    for annotation in annotations:
        nota = (annotation.note or "").strip()
        if nota:
            righe.append(f"  il docente ha appuntato, su un passaggio: {nota}")
    return "\n".join(righe)


def _conversation_block(
    index: int,
    conversation: ChatConversation,
    avatar_name: str,
    evaluation: ConversationEvaluation,
    review: ConversationReview | None,
    annotations: list[MessageAnnotation],
    transcript: str,
) -> str:
    """Una conversazione nel dossier: cosa era, come è andata, cosa si è detto."""
    canale = "chat scritta" if conversation.mode == "text" else "telefonata"
    voto = final_score(evaluation.overall_score, review)
    testa = (
        f"### PROVA PARLATA {index} — {canale} con {avatar_name}\n"
        f"  quando: {conversation.created_at:%d/%m/%Y}\n"
        f"  titolo dato dall'operatore: {untrusted_text.flatten(conversation.title)}\n"
        f"  voto finale: {voto}/10"
    )
    sintesi = str((evaluation.result or {}).get("summary") or "").strip()
    parti = [testa]
    if sintesi:
        parti.append(f"  sintesi del valutatore: {sintesi}")
    parti.append(_criteria_lines(evaluation))
    note = _review_lines(review, annotations)
    if note:
        parti.append(note)
    if transcript:
        parti.append(f"  trascrizione:\n{transcript}")
    return "\n".join(p for p in parti if p)


def _attempt_block(index: int, attempt: SimulationAttempt, title: str, kind: str) -> str:
    """Un test consegnato: il voto, e soprattutto cosa è stato sbagliato.

    Le risposte giuste non entrano. Occuperebbero la maggior parte dello
    spazio per dire una cosa che il voto dice già, mentre gli sbagli sono
    l'unica parte da cui si capisce **cosa** una persona non sa: è la stessa
    ragione per cui il confronto fra due tentativi mette in cima le domande
    il cui esito è cambiato.
    """
    righe = [
        f"### PROVA SCRITTA {index} — {title} ({kind})",
        f"  quando: {attempt.created_at:%d/%m/%Y}",
        f"  voto: {attempt.score}/10, {attempt.correct_count} risposte esatte "
        f"su {attempt.question_count}",
    ]
    sbagliate = [a for a in (attempt.answers or []) if not a.get("is_correct")]
    if sbagliate:
        righe.append("  domande sbagliate:")
        for answer in sbagliate:
            righe.append(f"    - {untrusted_text.flatten(str(answer.get('text') or ''))}")
            # Su un test aperto la risposta la scrive la persona, quindi è
            # materiale non fidato come una battuta di trascrizione.
            data = str(answer.get("written_answer") or answer.get("selected_option") or "").strip()
            if data:
                righe.append(f"      ha risposto: {untrusted_text.flatten(data)}")
    return "\n".join(righe)


def collect(db: Session, user_id: UUID) -> DebriefingMaterial:
    """Il materiale su cui scrivere il debriefing di questa persona.

    Le due forme di prova si leggono con due query separate, come ovunque
    nell'applicazione: non hanno niente in comune se non chi le ha svolte, e
    chi non usa il simulatore non deve pagarne la scansione.
    """
    conversation_rows = _conversation_rows(db, user_id)
    conversation_ids = [c.id for c, *_ in conversation_rows]
    messages = _messages_by_conversation(db, conversation_ids)
    annotations = annotations_by_conversation(db, conversation_ids)

    conversation_blocks: list[str] = []
    conversation_scores: list[float] = []
    criteria_scores: dict[str, list[float]] = {key: [] for key, _, _ in EVALUATION_CRITERIA}
    dates: list[datetime] = []
    budget = TRANSCRIPT_BUDGET_CHARS

    # Dalla più recente, che è anche l'ordine in cui il budget va speso: se
    # le trascrizioni non ci stanno tutte, quelle che restano fuori devono
    # essere le vecchie.
    for conversation, avatar_name, evaluation, review in conversation_rows:
        transcript = _transcript(messages.get(conversation.id, []))
        # Intera o niente: una trascrizione tagliata a metà racconta una
        # chiamata che finisce a metà, e il modello la giudicherebbe così.
        if len(transcript) > budget:
            transcript = ""
        else:
            budget -= len(transcript)

        conversation_blocks.append(
            _conversation_block(
                len(conversation_blocks) + 1,
                conversation,
                avatar_name,
                evaluation,
                review,
                annotations.get(conversation.id, []),
                transcript,
            )
        )
        voto = final_score(evaluation.overall_score, review)
        if voto is not None:
            conversation_scores.append(voto)
        for criterion in (evaluation.result or {}).get("criteria") or []:
            key = criterion.get("key")
            if key in criteria_scores and criterion.get("score") is not None:
                criteria_scores[key].append(float(criterion["score"]))
        dates.append(conversation.created_at)

    attempt_rows = (
        db.query(SimulationAttempt, TechnicalSimulation.title, TechnicalSimulation.kind)
        .join(TechnicalSimulation, TechnicalSimulation.id == SimulationAttempt.simulation_id)
        .filter(SimulationAttempt.user_id == user_id)
        .order_by(SimulationAttempt.created_at.desc())
        .limit(MAX_ATTEMPTS)
        .all()
    )
    attempt_blocks = []
    attempt_scores = []
    for attempt, title, kind in attempt_rows:
        attempt_blocks.append(_attempt_block(len(attempt_blocks) + 1, attempt, title, kind))
        attempt_scores.append(attempt.score)
        dates.append(attempt.created_at)

    # I blocchi vanno dal più vecchio al più recente, al contrario di come
    # sono stati letti: un quadro d'insieme parla di come una persona è
    # cambiata, e il modello deve leggere la storia nel verso in cui è
    # successa, non a ritroso.
    dossier = "\n\n".join(
        ["## PROVE PARLATE\n" + "\n\n".join(reversed(conversation_blocks))]
        if conversation_blocks
        else []
    )
    if attempt_blocks:
        blocco = "## PROVE SCRITTE\n" + "\n\n".join(reversed(attempt_blocks))
        dossier = f"{dossier}\n\n{blocco}" if dossier else blocco

    return DebriefingMaterial(
        dossier=dossier,
        # La prova più recente, che è quello su cui si misura se il quadro è
        # ancora buono. Su nessuna prova non si arriva qui: il chiamante si
        # ferma prima, ma il valore deve comunque esistere.
        covered_until=max(dates) if dates else datetime.min,
        conversations=len(conversation_blocks),
        attempts=len(attempt_blocks),
        conversation_average=_avg(conversation_scores),
        attempt_average=_avg(attempt_scores),
        criteria_averages=[
            CriterionAverage(key=key, label=label, average=_avg(criteria_scores[key]))
            for key, label, _ in EVALUATION_CRITERIA
            if criteria_scores[key]
        ],
    )


def is_stale(db: Session, debriefing: UserDebriefing) -> bool:
    """True quando la persona ha fatto qualcosa dopo che il quadro è stato scritto.

    È lo stesso gesto di ``reviews.is_stale``: non si aggiorna niente da
    soli, si dice a chi legge che quello che ha davanti non ha visto le
    ultime prove. Un debriefing che si rigenerasse da sé all'arrivo di una
    conversazione sarebbe una chiamata a pagamento fatta da nessuno.

    Guarda le **prove** e non le revisioni: una nota scritta dal docente
    dopo il debriefing non lo invecchia, perché è già il giudizio di chi lo
    sta leggendo, e vedersi dire che il proprio quadro è vecchio per una
    riga scritta da sé sarebbe un segnale che nessuno guarderebbe più.
    """
    since = debriefing.covered_until
    nuove = (
        db.query(ChatConversation.id)
        .join(
            ConversationEvaluation,
            ConversationEvaluation.conversation_id == ChatConversation.id,
        )
        .filter(
            ChatConversation.user_id == debriefing.user_id,
            ChatConversation.created_at > since,
        )
        .first()
    )
    if nuove is not None:
        return True
    return (
        db.query(SimulationAttempt.id)
        .filter(
            SimulationAttempt.user_id == debriefing.user_id,
            SimulationAttempt.created_at > since,
        )
        .first()
        is not None
    )
