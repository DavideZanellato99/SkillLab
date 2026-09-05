"""Le letture da cui escono i rendiconti e le dashboard.

Stanno qui e non dentro il router che le mostrava per la stessa ragione per
cui ci sta ``training_progress``: sono il modo in cui si guardano le prove
svolte, non una risposta HTTP, e adesso a guardarle sono in due. Il report
attività e la dashboard dei punteggi le chiedevano da ``routers/admin``; le
dashboard dei percorsi, dei contenuti e dell'utilizzo chiedono le stesse
righe con altre domande sopra, e una seconda copia delle stesse query
sarebbe la prima cosa a divergere.

Quello che sta qui è **come si leggono le prove nello scope di chi guarda**:
il confine del tenant, il periodo, la durata di una conversazione, le
valutazioni con i loro criteri e i tentativi con il loro voto. Quello che ci
si calcola sopra sta in ``dashboard_stats``, e le risposte nei router.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import case, func
from sqlalchemy.orm import Session

import reviews
from models import (
    Avatar,
    ChatConversation,
    ChatMessage,
    ConversationEvaluation,
    ConversationReview,
    Organization,
    SimulationAttempt,
    TechnicalSimulation,
    User,
)
from schemas import (
    EvaluationReportRow,
    SimulationReportRow,
)
from simulation_scoring import attempt_score

# Quante righe al massimo una metà della dashboard si porta dietro.
#
# Il periodo di default è "Sempre", e per una ragione scritta in
# reportFormat.ts: un filtro già acceso mostrerebbe una pagina mezza vuota a
# chi non sa che esiste. Ma "sempre" su un tenant di tre anni è tutto lo
# storico a ogni apertura, e da un certo punto in poi non è più una pagina
# lenta, è una pagina che non arriva.
#
# Cinquemila è largo abbastanza da non toccare nessuno oggi e stretto
# abbastanza da tenere in piedi la pagina domani. Quando scatta si prendono le
# più recenti, che sono quelle di cui si sta parlando, e la risposta lo dice
# (`truncated`): una dashboard tagliata in silenzio mostrerebbe le medie di
# una parte dello storico spacciandole per le medie di tutto.
REPORT_ROW_CAP = 5000


def since_from_days(days: int | None):
    """L'istante da cui contare, o None per «da sempre»."""
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days) if days else None


def tenant_user_ids(db: Session, scope_org_id: UUID | None):
    """Le persone di un tenant come sottoquery, o None quando si guarda tutto.

    Il confine viaggia dentro il database e non come lista di id letta prima e
    legata a ogni interrogazione: quella lista cresce con il tenant, e a
    qualche migliaio di persone sono altrettanti parametri per query.
    """
    if scope_org_id is None:
        return None
    return db.query(User.id).filter(User.organization_id == scope_org_id).scalar_subquery()


def conversation_scope(tenant_users, since) -> list:
    """Le condizioni che dicono quali conversazioni si stanno guardando."""
    conditions = []
    if tenant_users is not None:
        conditions.append(ChatConversation.user_id.in_(tenant_users))
    if since is not None:
        conditions.append(ChatConversation.created_at >= since)
    return conditions


def message_stats(db: Session, conversation_filters: list):
    """Quanti messaggi e da quando a quando, per ogni conversazione in vista.

    I filtri delle conversazioni stanno dentro l'aggregato e non fuori.
    Stavano fuori, quindi il raggruppamento girava su tutta la tabella dei
    messaggi e si scartava dopo, anche quando a guardare era l'admin di una
    sola organizzazione o il periodo era una settimana. Qui il raggruppamento
    vede solo le conversazioni in vista, e quando si guarda una persona sola
    sono le sue.
    """
    query = (
        db.query(
            ChatMessage.conversation_id.label("conversation_id"),
            func.count(ChatMessage.id).label("message_count"),
            func.min(ChatMessage.created_at).label("first_at"),
            func.max(ChatMessage.created_at).label("last_at"),
        )
        .join(ChatConversation, ChatConversation.id == ChatMessage.conversation_id)
        .group_by(ChatMessage.conversation_id)
    )
    for condition in conversation_filters:
        query = query.filter(condition)
    return query.subquery()


def duration_seconds(stats):
    """Dal primo all'ultimo messaggio, ai secondi interi.

    Zero sotto i due messaggi: una conversazione aperta e mai iniziata non è
    durata un istante. Il troncamento è per conversazione e non sulla somma,
    perché la durata della riga e quelle delle prove che si aprono sotto
    devono tornare.
    """
    return case(
        (
            stats.c.message_count >= 2,
            func.floor(func.extract("epoch", stats.c.last_at - stats.c.first_at)),
        ),
        else_=0,
    )


def criteria_scores(result, labels: dict[str, str] | None = None) -> dict[str, float]:
    """Chiave del criterio -> punteggio, e intanto raccoglie le etichette.

    Le due cose si leggono dallo stesso posto (il risultato salvato), quindi
    si leggono insieme: scorrere una seconda volta migliaia di valutazioni per
    prendere sei parole sarebbe la stessa scansione fatta due volte.

    Una chiave vuota si scarta invece di finire nella mappa sotto la stringa
    vuota, che sarebbe una colonna senza nome nella tabella della dashboard.
    """
    scores: dict[str, float] = {}
    for criterion in (result or {}).get("criteria") or []:
        key = str(criterion.get("key", ""))
        if not key:
            continue
        scores[key] = float(criterion.get("score", 0) or 0)
        if labels is not None and key not in labels:
            labels[key] = str(criterion.get("label", "")) or key
    return scores


def evaluation_report_rows(
    db: Session, scope_org_id, since=None
) -> tuple[list[EvaluationReportRow], dict[str, str], bool]:
    """Le valutazioni in scope dalla più vecchia (l'ordine dei grafici), come
    si chiamano per esteso i loro criteri, e se il tetto ha tagliato qualcosa.

    Le etichette escono da qui insieme alle righe e non da una lista scritta a
    parte: i criteri sono quelli su cui il giudizio è stato dato, e una
    valutazione di un anno fa può averne avuti altri. Vengono dette una volta
    per risposta invece che sei volte per riga, ed è tutto quello che cambia:
    restano del server, come sono sempre state.

    Colonne e non entità: di una conversazione servono il titolo, il canale e
    due date, e caricarne l'oggetto intero significa costruire in memoria
    anche tutto quello che non si guarda, riga per riga, su migliaia di righe.

    Si legge dalla più recente per poter tagliare dalla parte giusta, e si
    rivolta prima di restituire: chi taglia deve tenere le prove di adesso,
    chi disegna le vuole in ordine di tempo.

    La correzione del docente viaggia su un outer join (la gran parte delle
    conversazioni non ne ha), quindi `overall_score` è il voto che conta e i
    grafici disegnano quello che lo studente si è visto dare.
    """
    query = (
        db.query(
            ChatConversation.id,
            ChatConversation.title,
            ChatConversation.mode,
            ChatConversation.created_at,
            ChatConversation.avatar_id,
            Avatar.name,
            User.id,
            User.email,
            User.nome,
            User.cognome,
            User.organization_id,
            Organization.name,
            ConversationEvaluation.created_at,
            ConversationEvaluation.overall_score,
            ConversationEvaluation.result,
            # La chiave della revisione e' la conversazione stessa: qui serve
            # solo a distinguere "nessuna revisione" da "una revisione che
            # non ha corretto il voto", che sono due cose diverse
            ConversationReview.conversation_id,
            ConversationReview.override_score,
        )
        .join(ChatConversation, ChatConversation.id == ConversationEvaluation.conversation_id)
        .join(User, User.id == ChatConversation.user_id)
        .join(Avatar, Avatar.id == ChatConversation.avatar_id)
        .outerjoin(Organization, Organization.id == User.organization_id)
        .outerjoin(ConversationReview, ConversationReview.conversation_id == ChatConversation.id)
    )
    if scope_org_id is not None:
        query = query.filter(User.organization_id == scope_org_id)
    if since is not None:
        query = query.filter(ChatConversation.created_at >= since)

    # Una in più del tetto: è così che si sa se ce n'erano altre
    found = query.order_by(ChatConversation.created_at.desc()).limit(REPORT_ROW_CAP + 1).all()
    truncated = len(found) > REPORT_ROW_CAP

    labels: dict[str, str] = {}
    rows = []
    for (
        conversation_id,
        title,
        mode,
        conversation_at,
        avatar_id,
        avatar_name,
        user_id,
        email,
        nome,
        cognome,
        organization_id,
        organization_name,
        evaluated_at,
        ai_score,
        result,
        review_id,
        override_score,
    ) in found[:REPORT_ROW_CAP]:
        rows.append(
            EvaluationReportRow(
                conversation_id=conversation_id,
                conversation_title=title,
                mode=mode,
                user_id=user_id,
                user_email=email,
                user_nome=nome,
                user_cognome=cognome,
                organization_id=organization_id,
                organization_name=organization_name,
                avatar_id=avatar_id,
                avatar_name=avatar_name,
                conversation_at=conversation_at,
                evaluated_at=evaluated_at,
                overall_score=reviews.grade(ai_score, override_score),
                ai_overall_score=ai_score,
                has_override=override_score is not None,
                has_review=review_id is not None,
                criteria=criteria_scores(result, labels),
            )
        )

    # Le righe si leggono dalla più recente per tagliare dalla parte giusta,
    # i grafici le vogliono in ordine di tempo
    rows.reverse()
    return rows, labels, truncated


def simulation_report_rows(
    db: Session, scope_org_id, since=None
) -> tuple[list[SimulationReportRow], bool]:
    """I test consegnati in scope, dal più vecchio, e se il tetto ha tagliato.

    Confinati dall'organizzazione di chi li ha svolti e non da quella della
    simulazione: quello che la dashboard di un tenant racconta è come vanno
    le SUE persone, e un test preso in prestito da altrove sparirebbe dai
    suoi numeri.

    Colonne e non entità, come nell'altra metà: di un tentativo servono la
    data, due conteggi e un voto, e caricarne l'oggetto intero costruirebbe
    in memoria anche le risposte date, che qui nessuno guarda.
    """
    query = (
        db.query(
            SimulationAttempt.id,
            SimulationAttempt.simulation_id,
            SimulationAttempt.created_at,
            SimulationAttempt.correct_count,
            SimulationAttempt.question_count,
            # I punti e non il voto: il voto e' una property calcolata sul
            # modello (vedi SimulationAttempt.score), quindi il database non
            # sa darlo e si ricava qui con la stessa funzione
            SimulationAttempt.earned_points,
            TechnicalSimulation.title,
            TechnicalSimulation.kind,
            TechnicalSimulation.source,
            User.id,
            User.email,
            User.nome,
            User.cognome,
            User.organization_id,
            Organization.name,
        )
        .join(TechnicalSimulation, TechnicalSimulation.id == SimulationAttempt.simulation_id)
        .join(User, User.id == SimulationAttempt.user_id)
        .outerjoin(Organization, Organization.id == User.organization_id)
    )
    if scope_org_id is not None:
        query = query.filter(User.organization_id == scope_org_id)
    if since is not None:
        query = query.filter(SimulationAttempt.created_at >= since)

    # Dalla più recente per tagliare dalla parte giusta, una in più del tetto
    # per sapere se ce n'erano altre, e poi rivoltate: i grafici disegnano in
    # ordine di tempo, come nella metà parlata.
    found = query.order_by(SimulationAttempt.created_at.desc()).limit(REPORT_ROW_CAP + 1).all()
    truncated = len(found) > REPORT_ROW_CAP
    rows = [
        SimulationReportRow(
            attempt_id=attempt_id,
            simulation_id=simulation_id,
            simulation_title=title,
            simulation_kind=kind,
            simulation_source=source,
            user_id=user_id,
            user_email=email,
            user_nome=nome,
            user_cognome=cognome,
            organization_id=organization_id,
            organization_name=organization_name,
            attempted_at=attempted_at,
            correct_count=correct_count,
            question_count=question_count,
            score=attempt_score(earned_points or 0.0, question_count),
        )
        for (
            attempt_id,
            simulation_id,
            attempted_at,
            correct_count,
            question_count,
            earned_points,
            title,
            kind,
            source,
            user_id,
            email,
            nome,
            cognome,
            organization_id,
            organization_name,
        ) in found[:REPORT_ROW_CAP]
    ]
    rows.reverse()
    return rows, truncated
