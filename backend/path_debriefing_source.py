"""Cosa il modello ha davanti quando scrive il quadro d'insieme di un percorso.

Il gemello di ``debriefing_source`` con il soggetto cambiato: là le prove di
una persona, qui quelle di tutto il gruppo che sta percorrendo le stesse
tappe. Entra un percorso, esce il materiale già pronto per il prompt e i
numeri già calcolati; il prompt e la chiamata stanno in ``path_debriefing``.

Sei scelte reggono il file.

**Nessuno viene nominato.** Gli allievi entrano nel dossier siglati
(``ALLIEVO 1``, ``ALLIEVO 2``), e la sigla vale solo dentro una chiamata: al
modello serve sapere che due prove sono della stessa persona, cioè che un
errore ripetuto è un modo di lavorare e non sei persone che sbagliano una
volta ciascuna, e per questo la sigla basta. Chi è fermo dove lo dice già la
tabella delle assegnazioni, che lo deriva dalle prove e non costa niente. È
anche quello che tiene la riga salvata fuori dai dati personali (vedi
``PathDebriefing``).

**Le tappe le conta il progresso, i giudizi le prove lette.** Sono due
insiemi diversi e la distinzione è voluta. Quante persone hanno aperto una
tappa, quante l'hanno superata e quante sono ferme lì arrivano da
``training_progress``, cioè dalla stessa derivazione che disegna la tabella
delle assegnazioni: due conti diversi vorrebbero dire un quadro che dice
"sei fermi alla terza" sopra una tabella che ne mostra quattro. Le medie dei
voti e quelle per criterio invece si calcolano sulle prove che entrano nel
dossier, che sono quelle di cui il modello ha davanti il testo, ed è la
stessa regola del quadro di una persona: i numeri raccontano quello che è
stato letto.

**Contano solo le prove che contano.** Una conversazione svolta prima che la
sua tappa si aprisse non supera quella tappa (vedi ``training_progress``), e
qui non entra nemmeno nel dossier: un quadro che leggesse prove che il
percorso non guarda direbbe di un gruppo che non è quello che si sta
seguendo.

**Il budget si divide fra le tappe.** Il tetto sui caratteri è complessivo ma
si spartisce in parti uguali fra le tappe che hanno prove, invece di essere
speso in ordine: speso in ordine, la prima tappa, che è quella che tutti
hanno fatto, lo esaurirebbe da sola e delle ultime, cioè di quelle dove il
gruppo si ferma, non arriverebbe una riga. Dentro la sua parte ogni tappa
prende le prove più recenti.

**Niente trascrizioni.** Qui il valore sta nell'ampiezza e non nella
profondità: trenta trascrizioni intere non ci starebbero, e quello che
servirebbe leggerci dentro lo hanno già scritto i sei criteri della
valutazione, con voto e commento, più quello che il docente ha annotato. Il
lavoro di leggere una conversazione riga per riga è già stato fatto una volta
da chi l'ha giudicata.

**Metà di questo materiale lo hanno scritto le persone di cui parla.** Vale
il trattamento di ``untrusted_text`` come nella valutazione e nel quadro di
una persona: quello che entra perde la forma con cui una riga si dichiara, e
il dossier viaggia dentro un recinto che il prompt nomina.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session, selectinload

import untrusted_text
from debriefing_source import CriterionAverage
from models import (
    ChatConversation,
    ConversationEvaluation,
    ConversationReview,
    MessageAnnotation,
    PathDebriefing,
    SimulationAttempt,
    TrainingPath,
    TrainingPathAssignment,
    TrainingPathStep,
)
from openai_service import EVALUATION_CRITERIA, EVALUATION_SUGGESTION_THRESHOLD
from reviews import annotations_by_conversation, final_score
from schemas import ASSIGNMENT_STATUS_OVERDUE
from training_progress import (
    STEP_KIND_AVATAR,
    naive,
    progress_of,
    proofs_by_key,
    step_kind,
    step_target_id,
)

# Sotto queste tre persone un quadro di gruppo non è un quadro di gruppo: è
# la somma di due quadri individuali, e quelli esistono già e dicono di più,
# perché nominano chi riguardano.
MIN_PEOPLE = 3

# E sotto queste prove non c'è ancora niente in comune da vedere. Il numero è
# il doppio di quello del quadro di una persona per la stessa ragione per cui
# quello è tre: uno schema si vede quando si ripete, e qui deve ripetersi
# attraverso persone diverse e non solo attraverso prove diverse.
MIN_EVIDENCE = 6

# Quante prove per tappa arrivano al modello con il loro testo. È un tetto
# sul numero, non sulla spesa: quello è il budget qui sotto, e i due lavorano
# su assi diversi, uno dice quante prove si guardano e l'altro quanto se ne
# legge.
MAX_PROOFS_PER_STEP = 10

# Il tetto complessivo del dossier. Si divide in parti uguali fra le tappe
# che hanno prove, così la prima, che è quella che tutti hanno svolto, non se
# lo prende tutto lasciando muta la tappa dove il gruppo si è fermato. La
# spesa di questa chiamata cresce quindi con la lunghezza del percorso e non
# con il numero di persone, che è la cosa che varia di più.
DOSSIER_BUDGET_CHARS = 30_000

# Come si chiamano gli allievi dentro il prompt. Il numero è quello che
# permette al modello di riconoscere due prove della stessa persona; il nome
# non gli serve, e infatti non ce l'ha.
_SIGLA = "ALLIEVO {n}"


@dataclass(frozen=True)
class StepFacts:
    """Una tappa vista dal gruppo: quanti l'hanno aperta, superata, e chi è fermo lì.

    Tutti conti, e tutti dal progresso: sono gli stessi numeri della tabella
    delle assegnazioni, letti per colonna invece che per riga.
    """

    position: int
    # "avatar" o "simulation"
    kind: str
    # Il nome dell'avatar o il titolo del test: è così che la tappa si chiama
    # in ogni altra schermata.
    label: str
    target_score: float
    # A quante persone la tappa si è aperta, e quante l'hanno superata
    unlocked: int
    passed: int
    # Quante persone hanno qui la propria tappa di adesso, cioè quante il
    # percorso le ferma esattamente in questo punto
    stuck: int
    # Prove svolte sulla tappa dopo lo sblocco, sommate sul gruppo
    proofs: int
    # La media dei migliori voti, fra chi su questa tappa ha almeno una prova
    best_average: float | None


@dataclass(frozen=True)
class PathDebriefingMaterial:
    """Il materiale su cui scrivere il quadro di un percorso.

    Fatto di soli valori, come quello del quadro di una persona e per la
    stessa ragione: il chiamante restituisce la connessione al pool prima di
    mettersi ad aspettare il modello, e una riga a cui si chiedesse il nome
    dopo tornerebbe a interrogare un database che nessuno le sta tenendo.
    """

    # Come si chiama il percorso, per il modello: è l'unica cosa che dice di
    # cosa il gruppo si sta occupando
    title: str
    description: str
    dossier: str
    covered_until: datetime
    # Quante persone hanno il percorso, e come stanno messe
    people: int
    started: int
    completed: int
    overdue: int
    # Quante prove sono entrate nel dossier con il loro testo, per forma
    conversations: int
    attempts: int
    # Le medie sulle prove lette
    conversation_average: float | None
    attempt_average: float | None
    criteria_averages: list[CriterionAverage]
    steps: list[StepFacts]
    # La tappa dove il gruppo si ferma, se ce n'è una: quella dove più
    # persone hanno la propria tappa di adesso. La sceglie il backend perché
    # è un massimo, non una lettura.
    blocker_position: int | None

    @property
    def evidence_count(self) -> int:
        return self.conversations + self.attempts


def _avg(values: list[float]) -> float | None:
    """La media a una cifra, o None su lista vuota.

    Niente in, niente out, come ovunque: la media di zero prove non è zero, e
    uno zero finirebbe stampato accanto al nome di un percorso.
    """
    return round(sum(values) / len(values), 1) if values else None


def latest(db: Session, path_id: UUID) -> PathDebriefing | None:
    """Il quadro scritto su questo percorso, o None se non ce n'è.

    Uno solo, non uno storico: ogni generazione riscrive la riga (vedi
    ``PathDebriefing``).
    """
    return db.query(PathDebriefing).filter(PathDebriefing.path_id == path_id).first()


def _assignments(db: Session, path_id: UUID) -> list[TrainingPathAssignment]:
    """Chi sta percorrendo questo percorso, con dentro quello che serve al progresso.

    Le tappe si caricano in anticipo perché ``proofs_by_key`` le legge per
    ognuna delle assegnazioni: senza, un percorso affidato a trenta persone
    farebbe una query per ogni tappa di ognuna.

    Le persone non vengono lette, e non è una dimenticanza: di loro serve
    solo l'identificativo, per legare le prove alla stessa sigla.
    """
    return (
        db.query(TrainingPathAssignment)
        .options(
            selectinload(TrainingPathAssignment.path).selectinload(TrainingPath.steps),
        )
        .filter(TrainingPathAssignment.path_id == path_id)
        .order_by(TrainingPathAssignment.created_at.asc())
        .all()
    )


def _criteria_line(evaluation: ConversationEvaluation) -> tuple[str, str, dict[str, float]]:
    """I sei criteri di una valutazione: la riga dei voti, i commenti, i numeri.

    I voti stanno tutti su una riga sola perché sono sei numeri e occupano lo
    spazio di sei numeri; i commenti invece solo dove il voto è sotto la
    soglia dei suggerimenti, che è dove il valutatore ha scritto perché.
    Portarli tutti e sei per intero, moltiplicati per le prove di un gruppo,
    vorrebbe dire un dossier fatto per nove decimi di frasi su quello che è
    andato bene.
    """
    voti: list[str] = []
    perse: list[str] = []
    numeri: dict[str, float] = {}
    for criterion in (evaluation.result or {}).get("criteria") or []:
        key = criterion.get("key")
        score = criterion.get("score")
        if not key or score is None:
            continue
        label = criterion.get("label") or key
        numeri[str(key)] = float(score)
        voti.append(f"{label} {score}")
        if float(score) < EVALUATION_SUGGESTION_THRESHOLD:
            # Il commento lo ha scritto il valutatore leggendo quello che ha
            # detto una persona, quindi passa dal recinto una voce per volta:
            # neutralizzato tutto insieme, un a capo dentro un commento
            # farebbe sparire la riga della prova successiva.
            commento = untrusted_text.flatten(criterion.get("comment"))
            perse.append(f"    {label} {score}/10" + (f", {commento}" if commento else ""))
    return " | ".join(voti), "\n".join(perse), numeri


def _review_lines(review: ConversationReview | None, annotations: list[MessageAnnotation]) -> str:
    """Cosa il docente ha scritto su questa prova, se ha scritto.

    È l'unico pezzo di materiale scritto da chi il quadro lo leggerà, e su un
    gruppo conta il doppio che su una persona: se lo stesso rilievo è stato
    fatto a mano su quattro allievi diversi, quello non è un tema da
    scoprire, è una cosa che chi insegna ha già visto e che il quadro deve
    dire come tale.
    """
    righe = []
    if review is not None:
        if review.summary_note:
            righe.append(f"    nota del docente: {untrusted_text.flatten(review.summary_note)}")
        if review.override_score is not None:
            motivo = untrusted_text.flatten(review.override_reason)
            righe.append(
                f"    il docente ha corretto il voto a {review.override_score}/10"
                + (f", perché: {motivo}" if motivo else "")
            )
    for annotation in annotations:
        nota = untrusted_text.flatten(annotation.note)
        if nota:
            righe.append(f"    il docente ha appuntato, su un passaggio: {nota}")
    return "\n".join(righe)


def _conversation_block(
    sigla: str,
    conversation: ChatConversation,
    evaluation: ConversationEvaluation,
    review: ConversationReview | None,
    annotations: list[MessageAnnotation],
) -> tuple[str, float | None, dict[str, float]]:
    """Una conversazione nel dossier, con il voto e i criteri che porta.

    Torna anche i numeri perché le medie si calcolano sulle prove che
    entrano: chiederli dopo vorrebbe dire riaprire il JSON della valutazione
    una seconda volta per gli stessi sei voti.
    """
    voto = final_score(evaluation.overall_score, review)
    voti, perse, numeri = _criteria_line(evaluation)
    canale = "chat scritta" if conversation.mode == "text" else "telefonata"
    righe = [
        f"  [{sigla}] {canale} del {conversation.created_at:%d/%m/%Y}, voto {voto}/10",
    ]
    sintesi = str((evaluation.result or {}).get("summary") or "").strip()
    if sintesi:
        righe.append(f"    sintesi del valutatore: {untrusted_text.flatten(sintesi)}")
    if voti:
        righe.append(f"    criteri: {voti}")
    if perse:
        righe.append("    dove ha perso punti:")
        righe.append(perse)
    note = _review_lines(review, annotations)
    if note:
        righe.append(note)
    return "\n".join(righe), voto, numeri


def _attempt_block(sigla: str, attempt: SimulationAttempt) -> str:
    """Un test consegnato: il voto, e soprattutto cosa è stato sbagliato.

    Le risposte date non entrano, solo le domande sbagliate. Su una persona
    servivano a capire cosa avesse in testa; su un gruppo la domanda a cui si
    risponde è un'altra, cioè **quali domande sbagliano in tanti**, e a quella
    il testo della domanda risponde da solo.
    """
    righe = [
        f"  [{sigla}] consegnato il {attempt.created_at:%d/%m/%Y}, voto {attempt.score}/10, "
        f"{attempt.correct_count} risposte esatte su {attempt.question_count}"
    ]
    sbagliate = [a for a in (attempt.answers or []) if not a.get("is_correct")]
    if sbagliate:
        righe.append("    domande sbagliate:")
        righe.extend(
            f"      - {untrusted_text.flatten(str(answer.get('text') or ''))}"
            for answer in sbagliate
        )
    return "\n".join(righe)


def _conversation_rows(db: Session, user_ids: list[UUID], avatar_ids: set[UUID]) -> list[tuple]:
    """Le conversazioni valutate del gruppo sugli avatar delle tappe.

    Una query per tutto il percorso e non una per tappa, come fa
    ``proofs_by_key`` con i voti: il taglio per tappa (solo le prove
    successive al suo sblocco, e solo le più recenti) avviene in Python,
    perché lo sblocco dipende da dove è arrivata ogni persona.

    Solo quelle valutate: una conversazione senza giudizio non porta niente
    che questo quadro possa leggere, visto che le trascrizioni non entrano.
    """
    if not user_ids or not avatar_ids:
        return []
    return (
        db.query(ChatConversation, ConversationEvaluation, ConversationReview)
        .join(
            ConversationEvaluation,
            ConversationEvaluation.conversation_id == ChatConversation.id,
        )
        .outerjoin(ConversationReview, ConversationReview.conversation_id == ChatConversation.id)
        .filter(
            ChatConversation.user_id.in_(user_ids),
            ChatConversation.avatar_id.in_(avatar_ids),
        )
        .order_by(ChatConversation.created_at.desc())
        .all()
    )


def _attempt_rows(db: Session, user_ids: list[UUID], simulation_ids: set[UUID]) -> list:
    """I test consegnati dal gruppo sulle simulazioni delle tappe."""
    if not user_ids or not simulation_ids:
        return []
    return (
        db.query(SimulationAttempt)
        .filter(
            SimulationAttempt.user_id.in_(user_ids),
            SimulationAttempt.simulation_id.in_(simulation_ids),
        )
        .order_by(SimulationAttempt.created_at.desc())
        .all()
    )


def _step_header(step: TrainingPathStep, facts: StepFacts) -> str:
    forma = "conversazione" if facts.kind == STEP_KIND_AVATAR else "test tecnico"
    return f"### TAPPA {facts.position} — {facts.label} ({forma}), obiettivo {step.target_score}/10"


def collect(db: Session, path: TrainingPath) -> PathDebriefingMaterial:
    """Il materiale su cui scrivere il quadro d'insieme di questo percorso.

    Tre passate, e ognuna risponde a una domanda diversa.

    **Il progresso**, che dice dove è arrivata ogni persona e quindi da quando
    contano le sue prove su ogni tappa. È la stessa derivazione della tabella
    delle assegnazioni, chiamata qui invece di essere riscritta.

    **I conti sulle tappe**, che escono da quel progresso letti per colonna:
    quante l'hanno aperta, quante l'hanno superata, quante sono ferme lì.

    **Il dossier**, che è il testo dei giudizi delle prove più recenti di ogni
    tappa, siglato e recintato, e da cui escono anche le medie.
    """
    assignments = _assignments(db, path.id)
    by_key = proofs_by_key(db, assignments)
    progressi = [(assignment, progress_of(assignment, by_key)) for assignment in assignments]

    # La sigla è stabile dentro una chiamata e non oltre: le assegnazioni si
    # leggono nell'ordine in cui sono state fatte, quindi ALLIEVO 1 è chi ha
    # ricevuto il percorso per primo. Fuori di qui non vuol dire niente, ed è
    # esattamente quello che deve essere.
    sigle = {
        assignment.user_id: _SIGLA.format(n=index)
        for index, (assignment, _) in enumerate(progressi, start=1)
    }
    # Da quando le prove di ognuno contano, tappa per tappa. Vuoto dove la
    # tappa è ancora chiusa, e lì non entra niente.
    aperture: dict[tuple[UUID, str, UUID], datetime] = {}

    steps_facts: list[StepFacts] = []
    for index, step in enumerate(path.steps, start=1):
        aperte = superate = ferme = prove = 0
        migliori: list[float] = []
        for assignment, progress in progressi:
            avanzamento = progress.steps[index - 1]
            if avanzamento.unlocked_at is not None:
                aperte += 1
                aperture[(assignment.user_id, step_kind(step), step_target_id(step))] = (
                    avanzamento.unlocked_at
                )
            if avanzamento.achieved_at is not None:
                superate += 1
            if progress.current_index == index - 1:
                ferme += 1
            prove += avanzamento.attempts
            if avanzamento.best_score is not None:
                migliori.append(avanzamento.best_score)
        steps_facts.append(
            StepFacts(
                position=index,
                kind=step_kind(step),
                label=(step.avatar.name if step.avatar is not None else step.simulation.title),
                target_score=step.target_score,
                unlocked=aperte,
                passed=superate,
                stuck=ferme,
                proofs=prove,
                best_average=_avg(migliori),
            )
        )

    # La tappa dove il gruppo si ferma: quella con più persone ferme sopra. A
    # parità vince la prima, che è quella che le altre aspettano. None quando
    # non è ferma nessuna, cioè quando il percorso è finito per tutti, ed è un
    # esito e non un dato mancante.
    blocco = max(steps_facts, key=lambda s: s.stuck, default=None)
    blocker_position = blocco.position if blocco is not None and blocco.stuck > 0 else None

    user_ids = [assignment.user_id for assignment in assignments]
    avatar_ids = {s.avatar_id for s in path.steps if s.avatar_id is not None}
    simulation_ids = {s.simulation_id for s in path.steps if s.simulation_id is not None}
    conversation_rows = _conversation_rows(db, user_ids, avatar_ids)
    attempt_rows = _attempt_rows(db, user_ids, simulation_ids)
    annotations = annotations_by_conversation(db, [c.id for c, _, _ in conversation_rows])

    # Le prove che contano, raccolte per tappa: quelle svolte dopo che quella
    # tappa si è aperta per chi le ha svolte. Le righe arrivano già dalla più
    # recente, quindi ogni elenco è già nell'ordine in cui va speso.
    per_tappa: dict[UUID, list] = {step.id: [] for step in path.steps}
    for step in path.steps:
        chiave = (step_kind(step), step_target_id(step))
        if chiave[0] == STEP_KIND_AVATAR:
            for conversation, evaluation, review in conversation_rows:
                aperta = aperture.get((conversation.user_id, *chiave))
                if aperta is not None and naive(conversation.created_at) >= aperta:
                    per_tappa[step.id].append((conversation, evaluation, review))
        else:
            for attempt in attempt_rows:
                aperta = aperture.get((attempt.user_id, *chiave))
                if aperta is not None and naive(attempt.created_at) >= aperta:
                    per_tappa[step.id].append(attempt)

    # Il budget si divide fra le sole tappe che hanno qualcosa da mostrare:
    # dividerlo per tutte lascerebbe la sua parte a una tappa che nessuno ha
    # ancora aperto, cioè a una tappa muta.
    parlanti = sum(1 for step in path.steps if per_tappa[step.id])
    budget = DOSSIER_BUDGET_CHARS // parlanti if parlanti else 0

    blocchi: list[str] = []
    conversazioni = tentativi = 0
    voti_conversazioni: list[float] = []
    voti_tentativi: list[float] = []
    criteri: dict[str, list[float]] = {key: [] for key, _, _ in EVALUATION_CRITERIA}
    date: list[datetime] = []

    for step, facts in zip(path.steps, steps_facts, strict=True):
        righe: list[str] = []
        speso = 0
        for prova in per_tappa[step.id][:MAX_PROOFS_PER_STEP]:
            if isinstance(prova, SimulationAttempt):
                sigla = sigle[prova.user_id]
                blocco_testo = _attempt_block(sigla, prova)
                voto = prova.score
                numeri: dict[str, float] = {}
                quando = naive(prova.created_at)
            else:
                conversation, evaluation, review = prova
                blocco_testo, voto, numeri = _conversation_block(
                    sigle[conversation.user_id],
                    conversation,
                    evaluation,
                    review,
                    annotations.get(conversation.id, []),
                )
                quando = naive(conversation.created_at)
            # Intero o niente, come le trascrizioni del quadro di una persona:
            # un giudizio tagliato a metà si legge come un giudizio che si
            # ferma lì, e non è quello che è successo.
            if speso + len(blocco_testo) > budget:
                continue
            speso += len(blocco_testo)
            righe.append(blocco_testo)
            date.append(quando)
            if isinstance(prova, SimulationAttempt):
                tentativi += 1
                voti_tentativi.append(voto)
            else:
                conversazioni += 1
                if voto is not None:
                    voti_conversazioni.append(voto)
                for key, punteggio in numeri.items():
                    if key in criteri:
                        criteri[key].append(punteggio)
        if righe:
            # Dalla più vecchia alla più recente dentro la tappa: le prove di
            # una persona sono una storia anche qui, e a ritroso un
            # miglioramento si legge come un peggioramento.
            blocchi.append(_step_header(step, facts) + "\n" + "\n".join(reversed(righe)))

    return PathDebriefingMaterial(
        title=path.title,
        description=(path.description or "").strip(),
        dossier="\n\n".join(blocchi),
        # La prova più recente letta, che è quello su cui si misura se il
        # quadro è ancora buono. Senza prove non si arriva qui: il chiamante
        # si ferma prima, ma il valore deve comunque esistere.
        covered_until=max(date) if date else datetime.min,
        people=len(assignments),
        # Partita è chi ha svolto almeno una prova che conta, non chi ha
        # ricevuto il percorso: quelli sono tutti, e sarebbe un numero che
        # non dice niente.
        started=sum(1 for _, progress in progressi if any(s.attempts for s in progress.steps)),
        # Finito vuol dire che non c'è più una tappa da fare, che è
        # esattamente quello che dice ``current_index`` quando è vuoto.
        completed=sum(1 for _, progress in progressi if progress.current_index is None),
        overdue=sum(
            1
            for _, progress in progressi
            if any(s.status == ASSIGNMENT_STATUS_OVERDUE for s in progress.steps)
        ),
        conversations=conversazioni,
        attempts=tentativi,
        conversation_average=_avg(voti_conversazioni),
        attempt_average=_avg(voti_tentativi),
        criteria_averages=[
            CriterionAverage(key=key, label=label, average=_avg(criteri[key]))
            for key, label, _ in EVALUATION_CRITERIA
            if criteri[key]
        ],
        steps=steps_facts,
        blocker_position=blocker_position,
    )


def has_new_evidence(db: Session, path: TrainingPath, since: datetime) -> bool:
    """True se qualcuno del gruppo ha svolto una prova sulle tappe dopo questo momento.

    Guarda le prove sulle tappe del percorso e non tutto quello che il gruppo
    ha fatto: una conversazione con un avatar che il percorso non attraversa
    non cambia niente di quello che questo quadro racconta, e rigenerarlo per
    quella vorrebbe dire pagare una chiamata per rileggere lo stesso
    materiale.
    """
    user_ids = [
        user_id
        for (user_id,) in db.query(TrainingPathAssignment.user_id).filter(
            TrainingPathAssignment.path_id == path.id
        )
    ]
    if not user_ids:
        return False

    avatar_ids = {s.avatar_id for s in path.steps if s.avatar_id is not None}
    simulation_ids = {s.simulation_id for s in path.steps if s.simulation_id is not None}

    if avatar_ids:
        nuova = (
            db.query(ChatConversation.id)
            .join(
                ConversationEvaluation,
                ConversationEvaluation.conversation_id == ChatConversation.id,
            )
            .filter(
                ChatConversation.user_id.in_(user_ids),
                ChatConversation.avatar_id.in_(avatar_ids),
                ChatConversation.created_at > since,
            )
            .first()
        )
        if nuova is not None:
            return True

    if simulation_ids:
        return (
            db.query(SimulationAttempt.id)
            .filter(
                SimulationAttempt.user_id.in_(user_ids),
                SimulationAttempt.simulation_id.in_(simulation_ids),
                SimulationAttempt.created_at > since,
            )
            .first()
            is not None
        )
    return False


# I due modi in cui un quadro di percorso smette di valere. Sono due parole e
# non un booleano perché a schermo dicono due cose diverse: nel primo caso il
# testo è ancora vero e non ha visto le ultime prove, nel secondo parla di una
# fila di tappe che non esiste più.
STALE_PROOFS = "prove"
STALE_PATH = "percorso"


def staleness(db: Session, path: TrainingPath, debriefing: PathDebriefing) -> str | None:
    """Perché questo quadro non vale più, o None se vale ancora.

    Il percorso riscritto viene prima delle prove nuove: se le tappe sono
    cambiate, che qualcuno abbia poi svolto una conversazione è la notizia
    minore, e dirla al posto dell'altra manderebbe a rigenerare un quadro
    senza sapere che nel frattempo la fila è un'altra.

    Niente si aggiorna da solo, qui come sul quadro di una persona: si dice a
    chi legge che quello che ha davanti è vecchio, e chi rigenera è sempre
    qualcuno.

    Il confronto è con ``updated_at`` e non con ``created_at`` perché la riga
    è una sola e la generazione successiva la riscrive: la data che dice
    quando questo testo è stato scritto è quella dell'ultima scrittura, e
    l'altra è rimasta a quando il percorso ha avuto il suo primo quadro.
    """
    if naive(path.updated_at) > naive(debriefing.updated_at):
        return STALE_PATH
    if has_new_evidence(db, path, naive(debriefing.covered_until)):
        return STALE_PROOFS
    return None
