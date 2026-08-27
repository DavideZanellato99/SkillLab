"""Pydantic schemas for request/response validation."""

import re
from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from models import (
    ALL_SIMULATION_STATUSES,
    AVATAR_CATEGORY_COLORS,
    CONVERSATION_MODE_VOICE,
    DEFAULT_AVATAR_CATEGORY_COLOR,
    SIMULATION_KIND_MULTIPLE,
    SIMULATION_MAX_ITEMS,
    SIMULATION_MAX_OPTIONS,
    SIMULATION_MIN_ITEMS,
    SIMULATION_MIN_OPTIONS,
    SIMULATION_POOL_COUNT,
    SIMULATION_SOURCE_AI,
)
from openai_service import EVALUATION_CRITERIA, EVALUATION_MAX_SCORE, EVALUATION_MIN_SCORE
from persona_draft import SOURCE_CONVERSATION, SOURCE_DESCRIPTION, SOURCES
from persona_prompt import CHANNEL_TEXT, CHANNEL_VOICE


class AuthorshipResponse(BaseModel):
    """When a row was created and modified, and by whom.

    The four columns every administered entity carries (see `authorship`),
    in one schema so users, organizations, avatars and simulations answer
    with the same field names and the admin pages can show them with one
    component.

    The author is the email and not the id: the id is only useful to look up
    a row the reader cannot see anyway, and the email keeps meaning something
    after the account is gone ("sistema", "utente eliminato").
    """

    created_at: datetime
    created_by_email: str
    updated_at: datetime
    updated_by_email: str

    model_config = {"from_attributes": True}


# --- Avatar Schemas ---


class AvatarBase(BaseModel):
    """Base schema for avatar data."""

    name: str
    image_url: str
    # Il nome della categoria, non il suo id: qui serve solo da mostrare.
    # Chi deve filtrare o salvare usa category_id.
    category: str
    category_id: UUID
    # Tinta della pastiglia, scelta dall'amministratore fra quelle di
    # AVATAR_CATEGORY_COLORS.
    category_color: str
    description: str | None = None


class AvatarResponse(AvatarBase):
    """Schema for avatar API responses.

    Note: the persona sheet (Avatar.profile) is intentionally NOT exposed —
    students must not see secrets, hidden objectives or the real cause of
    the problem.
    """

    id: UUID
    created_at: datetime
    # Il proprio storico con questo interlocutore: quante sessioni ci ha già
    # fatto chi sta guardando, e quando è stata l'ultima. Sono per definizione
    # le proprie, contate sull'utente della richiesta (vedi routers/avatars),
    # perché la galleria dice a ognuno cosa ha fatto lui e non quanto un
    # avatar è frequentato dagli altri.
    own_sessions: int = 0
    last_session_at: datetime | None = None

    model_config = {"from_attributes": True}


class AvatarCategoryResponse(BaseModel):
    """Una categoria del catalogo, come la vede chi si allena."""

    id: UUID
    name: str
    color: str

    model_config = {"from_attributes": True}


# --- Chat Schemas (voice conversation transcripts) ---


class ChatMessageResponse(BaseModel):
    """Schema for a single chat message in API responses."""

    id: UUID
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageAnnotationResponse(BaseModel):
    """A trainer's note pinned to one message of the transcript."""

    id: UUID
    message_id: UUID
    note: str
    # Who wrote it, as it read at write time (see MessageAnnotation)
    reviewer_name: str
    created_at: datetime
    updated_at: datetime


class ConversationReviewResponse(BaseModel):
    """The trainer's review of a conversation, AI evaluation aside.

    Read by the trainer who wrote it and by the student it is about: the
    whole point of a human correction is that the person graded can read it,
    so nothing here is admin-only.
    """

    conversation_id: UUID
    reviewer_name: str
    summary_note: str | None = None
    # Present together or not at all: a corrected grade always carries its
    # reason (see ConversationReviewRequest)
    override_score: float | None = None
    override_reason: str | None = None
    # What the AI said when the review was written, and whether it has
    # changed since: a re-run judgement can leave a correction talking about
    # a score that no longer exists, and the UI says so rather than passing
    # it off as current.
    ai_score_at_review: float | None = None
    is_stale: bool = False
    annotations: list[MessageAnnotationResponse] = []
    created_at: datetime
    updated_at: datetime


class ChatConversationResponse(BaseModel):
    """Schema for conversation API responses."""

    id: UUID
    avatar_id: UUID
    title: str
    # Channel the conversation runs on: "voice" (call) or "text" (chat)
    mode: str = CONVERSATION_MODE_VOICE
    # When set, the conversation is over: the transcript is read-only
    ended_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageResponse] = []
    # The trainer's review, so the student reads the notes pinned to their
    # own lines while re-reading the transcript, which is where a debrief
    # actually lands
    review: ConversationReviewResponse | None = None

    model_config = {"from_attributes": True}


class ConversationRenameRequest(BaseModel):
    """Schema for renaming a conversation.

    The title is mandatory: a blank one is rejected, so a conversation is
    never left without a name.
    """

    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Il titolo non può essere vuoto.")
        return v


class ChatMessageRequest(BaseModel):
    """Schema for one operator message sent to the avatar in text chat.

    Without a conversation_id a new text conversation is opened; the
    operator always writes first, exactly as they speak first on a call.
    """

    avatar_id: UUID
    conversation_id: UUID | None = None
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Il messaggio non può essere vuoto.")
        return v


class ChatMessageExchange(BaseModel):
    """One completed chat round trip: the operator's message and the reply."""

    conversation_id: UUID
    title: str
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse


class EvaluationCitation(BaseModel):
    """One transcript message cited by the AI judge as evidence for a criterion.

    `index` is the 1-based position in the evaluated transcript;
    `message_id` anchors it to the stored message when one exists (live
    voice bubbles cited before the DB sync may only have the index).
    """

    index: int
    message_id: UUID | None = None


class EvaluationCriterionResponse(BaseModel):
    """Score and feedback for a single evaluation criterion."""

    key: str
    label: str
    score: float
    comment: str
    # Improvement suggestions, present only when score < 8
    suggestions: str | None = None
    # Transcript messages the judgment rests on (empty for evaluations
    # stored before citations existed)
    citations: list[EvaluationCitation] = []


class PreviousAttempt(BaseModel):
    """The user's previous evaluated attempt at the same scenario.

    Same user, same avatar, closest earlier conversation that has an
    evaluation: the baseline the current one is compared against, so the
    operator sees progress per criterion instead of an isolated verdict.
    """

    conversation_id: UUID
    title: str
    mode: str
    conversation_at: datetime
    # The grade that counted for that attempt, trainer's correction included:
    # comparing today's corrected score against yesterday's raw AI one would
    # invent a progress (or a regression) nobody made.
    overall_score: float
    # Criterion key -> score of the previous attempt (the UI computes deltas)
    criteria_scores: dict[str, float]


class ConversationReviewRequest(BaseModel):
    """Trainer's request: write (or rewrite) the review of a conversation.

    A blank field means "not set": the note and the correction are
    independent, a review can be either or both, but not neither — an empty
    review is a delete, and deleting has its own endpoint.
    """

    summary_note: str | None = None
    override_score: float | None = Field(default=None, ge=1, le=10)
    override_reason: str | None = None

    @field_validator("summary_note", "override_reason")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None

    @model_validator(mode="after")
    def coherent(self) -> "ConversationReviewRequest":
        """A corrected grade needs its reason, and a reason needs a grade.

        Correcting the machine without saying why is exactly the black box
        this feature exists to open, so the pair is enforced here rather
        than left to the goodwill of whoever calls the API.
        """
        if self.override_score is not None and not self.override_reason:
            raise ValueError("Motiva la correzione del punteggio.")
        if self.override_reason and self.override_score is None:
            raise ValueError("Indica il punteggio corretto insieme alla motivazione.")
        if self.summary_note is None and self.override_score is None:
            raise ValueError("Scrivi una nota o correggi il punteggio.")
        return self


class MessageAnnotationRequest(BaseModel):
    """Trainer's request: pin a note to one message of the transcript.

    Re-annotating a message rewrites the note that is already there: there
    is at most one per message (see MessageAnnotation).
    """

    message_id: UUID
    note: str

    @field_validator("note")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("L'annotazione non può essere vuota.")
        return v


class ConversationEvaluationResponse(BaseModel):
    """AI evaluation of the operator's performance in a conversation."""

    id: UUID
    conversation_id: UUID
    # What the AI judged. `final_score` is what the grade actually IS: the
    # two differ exactly when a trainer corrected the machine, and both are
    # sent so the report can show the correction instead of hiding it.
    overall_score: float
    final_score: float
    summary: str
    criteria: list[EvaluationCriterionResponse]
    # None on the first evaluated attempt at this scenario
    previous: PreviousAttempt | None = None
    # The trainer's review, when one has been written
    review: ConversationReviewResponse | None = None
    created_at: datetime
    updated_at: datetime


# Stato ricavato di una tappa e del percorso che la contiene (vedi
# ``training_progress``). "locked" è solo di una tappa: un percorso è aperto
# finché ha una tappa da fare, quale sia lo dice la tappa stessa.
ASSIGNMENT_STATUS_LOCKED = "locked"
ASSIGNMENT_STATUS_ACTIVE = "active"
ASSIGNMENT_STATUS_OVERDUE = "overdue"
ASSIGNMENT_STATUS_COMPLETED = "completed"
ASSIGNMENT_STATUS_COMPLETED_LATE = "completed_late"

# Le due forme di tappa, ripetute qui perché sono anche un valore che esce
# dall'API: ``training_progress`` le usa per attaccare una prova alla tappa,
# il frontend per sapere se una tappa apre una chat o un test.
STEP_KIND_AVATAR = "avatar"
STEP_KIND_SIMULATION = "simulation"

# I criteri su cui una tappa di conversazione può porre una soglia: quelli
# della valutazione e nessun altro, letti dalla lista canonica invece di
# essere riscritti qui. Una tappa che chiedesse un criterio che il giudice non
# assegna sarebbe una tappa impossibile da superare, e nessuno vedrebbe
# perché.
EVALUATION_CRITERION_KEYS = frozenset(key for key, _, _ in EVALUATION_CRITERIA)


class TrainingPathStepInput(BaseModel):
    """Una tappa come la compone chi scrive il percorso.

    Uno dei due bersagli e uno solo: la stessa regola che il vincolo scrive
    sulla tabella, ripetuta qui perché una richiesta malformata deve
    fermarsi al confine con un messaggio leggibile, non a metà transazione
    con un errore del database.
    """

    avatar_id: UUID | None = None
    simulation_id: UUID | None = None
    target_score: float = Field(ge=1, le=10)
    # Le soglie sui singoli criteri, ``{chiave: voto}``, vuote quando la
    # tappa chiede solo il voto complessivo. Si scrivono uno per uno e
    # valgono in aggiunta a ``target_score``, sulla stessa prova (vedi
    # ``TrainingPathStep.criteria_targets``).
    criteria_targets: dict[str, float] = Field(default_factory=dict)
    # Data e ora entro cui la tappa va chiusa, facoltativa: senza, la tappa
    # non scade mai. Vedi ``TrainingPathStep``.
    due_at: datetime | None = None

    @field_validator("due_at")
    @classmethod
    def _naive_utc(cls, value: datetime | None) -> datetime | None:
        """Il fuso del browser via, come su ogni colonna temporale dello schema.

        Chi compone il percorso sceglie un'ora nel proprio fuso e il browser
        la manda con il suo scarto: senza questo passaggio finirebbe nella
        colonna così com'è, e il confronto con un momento senza fuso
        solleverebbe al primo percorso letto.
        """
        if value is None or value.tzinfo is None:
            return value
        return value.astimezone(UTC).replace(tzinfo=None)

    @field_validator("criteria_targets")
    @classmethod
    def _known_criteria(cls, value: dict[str, float]) -> dict[str, float]:
        """Chiavi note e voti nella scala della valutazione, arrotondati.

        L'arrotondamento è lo stesso che il router fa sul voto complessivo:
        la soglia si confronta con un punteggio a una cifra decimale, e una
        con tre cifre sarebbe una tappa che non si supera per un millesimo.
        """
        sconosciute = sorted(set(value) - EVALUATION_CRITERION_KEYS)
        if sconosciute:
            raise ValueError(f"Criteri non riconosciuti: {', '.join(sconosciute)}.")
        for chiave, voto in value.items():
            if not EVALUATION_MIN_SCORE <= voto <= EVALUATION_MAX_SCORE:
                raise ValueError(
                    f"L'obiettivo del criterio '{chiave}' deve stare "
                    f"fra {EVALUATION_MIN_SCORE:.0f} e {EVALUATION_MAX_SCORE:.0f}."
                )
        return {chiave: round(voto, 1) for chiave, voto in value.items()}

    @model_validator(mode="after")
    def _exactly_one_target(self) -> "TrainingPathStepInput":
        if (self.avatar_id is None) == (self.simulation_id is None):
            raise ValueError("Una tappa punta a un avatar oppure a una simulazione.")
        # I criteri sono quelli della valutazione di una conversazione: un
        # test consegnato non ne ha, e accettarli qui vorrebbe dire salvare
        # una condizione che poi non verrebbe mai verificata da niente.
        if self.simulation_id is not None and self.criteria_targets:
            raise ValueError("Un test tecnico non si valuta per criteri.")
        return self


class StepCriterionTarget(BaseModel):
    """Una soglia su un criterio, come la legge chi la deve rispettare.

    Porta l'etichetta accanto alla chiave, e non è ridondanza: la chiave è
    ``empatia``, e chi si allena deve leggere "Empatia e gestione dello stato
    d'animo del cliente", cioè lo stesso nome che vedrà nel referto. Il
    contrario vorrebbe dire una copia della lista dei criteri nel frontend,
    che col tempo racconterebbe criteri diversi da quelli su cui il giudizio
    viene dato.
    """

    key: str
    label: str
    target: float


class TrainingPathWrite(BaseModel):
    """Il percorso come si crea e come si riscrive.

    Le tappe arrivano tutte insieme e nell'ordine in cui devono stare: sono
    la forma del percorso, non una collezione da modificare una alla volta,
    e mandarle intere è anche quello che permette di riordinarle senza un
    endpoint apposta.

    ``organization_id`` lo nomina solo il super admin; all'organization
    admin il server impone il proprio tenant e ignora quello che chiede.
    """

    title: str = Field(min_length=1, max_length=150)
    description: str | None = None
    organization_id: UUID | None = None
    steps: list[TrainingPathStepInput] = Field(min_length=1)


class TrainingPathStepResponse(BaseModel):
    """Una tappa con il nome del suo bersaglio, per chi la legge.

    Il percorso porta gli id, ma un elenco di id non si legge: il nome
    dell'avatar o il titolo del test viaggia con la tappa così nessuna
    schermata deve andarseli a cercare con una seconda chiamata.
    """

    id: UUID
    # Posto nella fila, da 1 e senza buchi: è la numerazione dell'elenco
    # ordinato, non la colonna ``position`` (vedi ``TrainingPathStep``)
    position: int
    # "avatar" o "simulation"
    kind: str
    target_score: float
    # Le soglie sui singoli criteri, nell'ordine in cui i criteri stanno nel
    # referto. Vuote quando la tappa chiede solo il voto complessivo, e
    # sempre vuote su un test.
    criteria_targets: list[StepCriterionTarget] = Field(default_factory=list)
    # Entro quando va chiusa, o assente se la tappa non scade
    due_at: datetime | None = None
    # Il bersaglio: uno dei due gruppi è pieno, l'altro resta vuoto
    avatar_id: UUID | None = None
    avatar_name: str | None = None
    avatar_category: str | None = None
    # La tinta della categoria, così la targhetta è dello stesso colore che
    # ha nel catalogo invece di uno indovinato dal nome.
    avatar_category_color: str = DEFAULT_AVATAR_CATEGORY_COLOR
    simulation_id: UUID | None = None
    simulation_title: str | None = None
    # Come si risponde al test: "multiple", "open", "ordering", "matching"
    simulation_kind: str | None = None


class TrainingPathResponse(BaseModel):
    """Un percorso nell'elenco di chi lo governa: le tappe e quanti lo hanno."""

    id: UUID
    organization_id: UUID
    organization_name: str
    title: str
    description: str | None = None
    steps: list[TrainingPathStepResponse]
    # Quante persone lo stanno percorrendo, per sapere cosa si tocca
    # modificandolo
    assigned_count: int = 0
    created_at: datetime
    updated_at: datetime


class TrainingPathAssignmentCreate(BaseModel):
    """Affida un percorso a una o più persone."""

    path_id: UUID
    user_ids: list[UUID] = Field(min_length=1)


class TrainingStepProgressResponse(TrainingPathStepResponse):
    """Una tappa vista da chi la sta percorrendo, con il suo stato.

    status: "locked" (la tappa prima non è ancora superata), "active",
    "overdue" (la data è passata), "completed" o "completed_late". Contano
    solo le prove svolte dopo lo sblocco, e ``attempts``, ``best_score`` e
    ``achieved_at`` seguono tutti quella regola.

    Lo stato dice se la tappa è in tempo, non se si può cominciare: una
    tappa ancora chiusa la cui data è passata risponde "overdue", e a dire
    che non è aperta resta ``unlocked_at`` vuoto.
    """

    status: str
    # Da quando la tappa conta, assente finché è chiusa. La scadenza invece
    # la porta già ``TrainingPathStepResponse``: è scritta sulla tappa e non
    # dipende dallo sblocco.
    unlocked_at: datetime | None = None
    attempts: int = 0
    best_score: float | None = None
    # Il meglio fatto su ognuno dei criteri che la tappa richiede, ``{chiave:
    # voto}``, sulle prove svolte dopo lo sblocco. Sta accanto alle soglie
    # invece che dentro, perché sono due cose diverse: la soglia è della
    # tappa e vale per chiunque, questo è di chi la sta percorrendo. Serve a
    # rispondere alla domanda che una tappa con soglie sui criteri pone e che
    # il solo voto complessivo non spiega, cioè quale delle condizioni non è
    # ancora arrivata. Una chiave assente vuol dire che su quel criterio non
    # c'è ancora nessun voto.
    best_criteria_scores: dict[str, float] = Field(default_factory=dict)
    achieved_at: datetime | None = None


class TrainingPathAssignmentResponse(BaseModel):
    """Un percorso affidato a una persona, con il progresso di ogni tappa.

    Una sola risposta per le due schermate che la leggono, quella
    dell'amministratore e la home di chi si allena: è lo stesso fatto, e due
    schemi finirebbero per raccontarlo in modo diverso.
    """

    id: UUID
    path_id: UUID
    path_title: str
    path_description: str | None = None
    user_id: UUID
    user_name: str
    user_email: str
    organization_id: UUID | None = None
    organization_name: str | None = None
    created_at: datetime
    # Chi l'ha affidato, assente quando quell'account non c'è più: nome e
    # cognome già composti, perché è una firma da leggere e non un'anagrafica
    assigned_by_name: str | None = None
    # Lo stato del percorso intero: "active", "overdue", "completed" o
    # "completed_late"
    status: str
    steps: list[TrainingStepProgressResponse]
    completed_steps: int = 0
    # La posizione (da 1) della tappa da fare adesso, assente a percorso finito
    current_position: int | None = None


class TrainingPathDraftRequest(BaseModel):
    """L'obiettivo formativo da cui far comporre una bozza di percorso.

    ``organization_id`` lo nomina solo il super admin, come per il percorso
    vero: il catalogo da cui si sceglie è di un tenant solo.

    Il minimo sull'obiettivo non è una formalità. Da tre parole il modello si
    inventa un corso suo e mette in fila mezzo catalogo, che è esattamente
    quello che chi chiede una bozza non vuole: lo stesso minimo, e per lo
    stesso motivo, del caso raccontato da cui nasce una scheda persona.
    """

    goal: str = Field(min_length=30, max_length=2000)
    organization_id: UUID | None = None


class TrainingPathDraftStep(BaseModel):
    """Una tappa proposta: il bersaglio, la soglia, e perché sta lì."""

    avatar_id: UUID | None = None
    simulation_id: UUID | None = None
    target_score: float
    # Perché questa tappa e perché in questo punto della fila. Non è un campo
    # della tappa e non viene mai salvato: esiste finché la proposta sta nel
    # form, che è il solo momento in cui a qualcuno serve saperlo.
    reason: str = ""


class TrainingPathDraftResponse(BaseModel):
    """Un percorso proposto dal modello, che nessuno ha ancora salvato."""

    title: str
    description: str | None = None
    steps: list[TrainingPathDraftStep]


class AssignableAvatar(BaseModel):
    """Un avatar che può diventare una tappa."""

    id: UUID
    name: str
    category: str
    category_color: str = DEFAULT_AVATAR_CATEGORY_COLOR


class AssignableSimulation(BaseModel):
    """Un test tecnico che può diventare una tappa."""

    id: UUID
    title: str
    # Come si risponde: "multiple", "open", "ordering", "matching"
    kind: str


class AssignableCriterion(BaseModel):
    """Un criterio su cui una tappa di conversazione può porre una soglia.

    Etichetta e peso arrivano dalla lista canonica invece di essere riscritti
    nel frontend: chi compone il percorso deve leggere gli stessi nomi che
    leggerà nel referto, e un peso ricopiato a mano è un peso che prima o poi
    racconta una media diversa da quella che il server calcola.
    """

    key: str
    label: str
    # Quanto pesa nella media pesata che fa il voto complessivo, in percento
    weight: int


class AssignableContentResponse(BaseModel):
    """Di cosa può essere fatta una tappa, in un'organizzazione sola.

    Le due liste arrivano insieme perché insieme si scelgono: chi compone un
    percorso decide tappa per tappa se la prossima è una conversazione o un
    test, e due chiamate separate vorrebbero dire due momenti in cui
    l'elenco può essere di un tenant diverso da quello che si sta guardando.

    Ci sono solo avatar attivi e simulazioni pubblicate: una tappa su una
    bozza, o su un avatar archiviato, sarebbe una tappa che nessuno potrebbe
    mai superare, e siccome le tappe dopo di lei si sbloccano solo quando è
    chiusa, bloccherebbe il percorso intero.
    """

    avatars: list[AssignableAvatar]
    simulations: list[AssignableSimulation]
    # I criteri su cui una tappa di conversazione può porre una soglia: non
    # dipendono dall'organizzazione, ma viaggiano di qui perché è la
    # chiamata che il form fa per sapere di cosa può essere fatta una tappa
    criteria: list[AssignableCriterion] = Field(default_factory=list)


class ChatConversationSummary(BaseModel):
    """Lightweight schema for listing conversations (without full messages)."""

    id: UUID
    avatar_id: UUID
    title: str
    # Channel the conversation runs on: "voice" (call) or "text" (chat)
    mode: str = CONVERSATION_MODE_VOICE
    # When set, the conversation is over: the transcript is read-only
    ended_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message_preview: str | None = None

    model_config = {"from_attributes": True}


# --- Voice Schemas ---


class VoiceSessionRequest(BaseModel):
    """Schema for starting a voice session with an avatar.

    The session simulates the avatar phoning the bank's toll-free number:
    the operator (the user) answers and speaks first, then the avatar
    states its problem.
    """

    avatar_id: UUID
    conversation_id: UUID | None = None


class VoiceSessionResponse(BaseModel):
    """Schema returned to the client to open the voice WebSocket."""

    session_id: str
    conversation_id: UUID


class VoiceRecordingInfo(BaseModel):
    """Metadata of a stored call recording, without the audio itself.

    Lets the UI decide whether to show a player without pulling megabytes
    of audio it may never play.
    """

    conversation_id: UUID
    mime_type: str
    duration_ms: int | None
    size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Auth Schemas ---


class LoginRequest(BaseModel):
    """Schema for login request."""

    email: str
    password: str


class LoginResponse(BaseModel):
    """Schema for successful login response.

    The tokens are NOT in the body: they travel only as HttpOnly cookies
    set by the auth endpoints (XSS mitigation).
    """

    user: "UserResponse"


class NewPasswordRequiredResponse(BaseModel):
    """Schema returned when Cognito requires a new password."""

    challenge: str = "NEW_PASSWORD_REQUIRED"
    session: str
    message: str = "È necessario impostare una nuova password."


class NewPasswordRequest(BaseModel):
    """Schema for completing the new password challenge."""

    email: str
    new_password: str
    session: str


class UserResponse(BaseModel):
    """Schema for user profile response.

    Senza la paternità: questa risposta esce anche dall'accesso e da
    ``/api/auth/me``, quindi la riceve l'utente stesso, e l'indirizzo
    dell'amministratore che ha aperto l'account non è qualcosa che serva a chi
    quell'account lo usa. Chi ha creato e chi ha modificato stanno su
    ``AdminUserResponse``, che esce solo dalle rotte di amministrazione.
    """

    id: UUID
    cognito_sub: str
    email: str
    nome: str
    cognome: str
    role_id: UUID
    ruolo: str  # role name, resolved from the roles table
    status: str  # "active" | "suspended" | "disabled"
    # Tenant the user belongs to; both null for the super admin
    organization_id: UUID | None = None
    organization_name: str | None = None
    # Last successful authentication; null means the account has never been
    # used (an invitation that was never accepted).
    last_login_at: datetime | None = None
    # Last authenticated request, written at intervals (see `activity`): the
    # account was in use up to this moment, which on a long-lived session is
    # a very different date from the one above. Null under the same
    # condition, an account that has never been used.
    last_activity_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminUserResponse(UserResponse, AuthorshipResponse):
    """La stessa riga dell'elenco utenti, con in più chi ha aperto l'account e
    chi l'ha toccato per ultimo: è quello che mostra la scheda utente della
    pagina di amministrazione, che vede solo il super admin.
    """


class UpdateProfileRequest(BaseModel):
    """Schema for the authenticated user updating their own profile
    (self-service). Email and role are not editable here."""

    nome: str | None = None
    cognome: str | None = None


class ChangePasswordRequest(BaseModel):
    """Schema for the authenticated user changing their own password
    (self-service): Cognito verifies current_password server-side."""

    current_password: str
    new_password: str


# --- Organization Schemas (super admin only) ---


class OrganizationResponse(AuthorshipResponse):
    """An organization/tenant with its aggregate counters."""

    id: UUID
    name: str
    slug: str
    status: str  # "active" | "suspended"
    # Only set while the organization is suspended: the admin's own wording
    # of why, shown in the admin table and to the locked-out users.
    suspension_reason: str | None = None
    user_count: int = 0
    avatar_count: int = 0


class OrganizationDetailResponse(OrganizationResponse):
    """One organization plus how much its users actually train.

    Read when the detail modal opens, not with the list: these figures cost
    a scan of the tenant's conversations and nobody needs them to pick a
    name out of a dropdown.
    """

    # Conversations opened by the tenant's users in the last 30 days: the
    # counter that says whether the platform is being used *now*, which the
    # lifetime total cannot.
    conversations_last_30_days: int = 0
    conversations_total: int = 0
    # Average of the evaluated conversations' overall scores, over the
    # tenant's whole history. None when nothing has been evaluated yet: a
    # zero would read as "they score terribly" instead of "no data".
    average_score: float | None = None
    evaluated_count: int = 0
    # Most recent successful login among the tenant's users. None means
    # nobody has ever signed in: invitations sent and never accepted.
    last_login_at: datetime | None = None


class CreateOrganizationRequest(BaseModel):
    """Schema for the super admin creating a new organization.

    The slug is optional: when omitted it is derived from the name.
    """

    name: str = Field(min_length=1, max_length=150)
    slug: str | None = Field(default=None, max_length=80)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Il nome dell'organizzazione non può essere vuoto.")
        return v


class UpdateOrganizationRequest(BaseModel):
    """Schema for renaming an organization; omitted fields stay unchanged."""

    name: str | None = Field(default=None, min_length=1, max_length=150)
    slug: str | None = Field(default=None, max_length=80)


class UpdateOrganizationStatusRequest(BaseModel):
    """Schema for suspending or reactivating an organization.

    `reason` is what the locked-out users will read, so it travels with the
    suspension itself rather than living only in the audit trail. Ignored
    when reactivating: the reason describes a suspension that is over.
    """

    status: str  # "active" | "suspended"
    reason: str | None = Field(default=None, max_length=500)


# --- Admin Schemas ---


class CreateUserRequest(BaseModel):
    """Schema for admin creating a new user."""

    email: str
    nome: str
    cognome: str
    ruolo: str = "user"  # "super_admin" | "organization_admin" | "user"
    # Required for organization_admin/user, must be null for super_admin
    # (validated server-side).
    organization_id: UUID | None = None


class UpdateUserRequest(BaseModel):
    """Schema for admin updating a user; omitted fields are left unchanged."""

    nome: str | None = None
    cognome: str | None = None
    ruolo: str | None = None
    organization_id: UUID | None = None


class UpdateUserStatusRequest(BaseModel):
    """Schema for admin changing an account's state."""

    status: str  # "active" | "suspended" | "disabled"


class UserPage(BaseModel):
    """A window over the users: the rows plus how many matched in all.

    `total` counts every user the filters select, not the ones in `items`:
    it is what tells the client how much is still behind the window.
    """

    total: int
    items: list[AdminUserResponse]


class AdminAvatarPayload(BaseModel):
    """Schema for creating/updating an avatar (training persona) from the
    admin page. The avatar name is derived from profile NOME + COGNOME."""

    # Una categoria dell'anagrafica, e della stessa organizzazione
    # dell'avatar: il router rifiuta le altre.
    category_id: UUID
    description: str | None = None
    # Empty → the backend generates an initials placeholder image
    image_url: str | None = None
    voice_id: str | None = None
    # Owning tenant: every avatar belongs to exactly one organization.
    # Required — only the super admin sets this.
    organization_id: UUID
    profile: dict

    @field_validator("image_url")
    @classmethod
    def _ritratto_sulla_propria_origine(cls, value: str | None) -> str | None:
        """In questo campo va un percorso di qui, non un indirizzo.

        Un ritratto ospitato altrove non si vedrebbe nemmeno, perché la
        Content-Security-Policy ammette immagini solo dalla propria origine
        (vedi ``caddy/Caddyfile``), e soprattutto sarebbe una richiesta a un
        dominio di terzi fatta dal browser di ogni persona che apre la
        galleria: il suo indirizzo IP consegnato a qualcuno che non compare
        in nessuna informativa.

        Fuori resta anche un'immagine incollata dentro l'indirizzo stesso, che
        la policy mostrerebbe: questa è una colonna di testo, e un ritratto ci
        starebbe dentro per intero.

        Il form lo dice già a chi compila; qui la regola vale anche per una
        richiesta che il form non l'ha attraversato.
        """
        if value and re.match(r"^[a-z][a-z0-9+.\-]*:", value.strip(), re.IGNORECASE):
            raise ValueError(
                "Il ritratto deve stare sull'applicazione: carica il file invece di "
                "incollare un indirizzo."
            )
        return value


class AdminAvatarResponse(AuthorshipResponse):
    """Avatar including the full persona sheet — super admin only."""

    id: UUID
    name: str
    image_url: str
    category: str
    category_id: UUID
    category_color: str
    description: str | None = None
    voice_id: str | None = None
    organization_id: UUID
    organization_name: str
    profile: dict
    # When the avatar was archived (logical deletion); None while active.
    deleted_at: datetime | None = None
    conversation_count: int = 0


class AdminAvatarCategoryPayload(BaseModel):
    """Creazione e modifica di una categoria dalla pagina di amministrazione."""

    name: str
    color: str = DEFAULT_AVATAR_CATEGORY_COLOR
    # Il tenant proprietario. Obbligatorio in creazione e immutabile dopo:
    # spostare una categoria di organizzazione porterebbe con sé gli avatar
    # che la usano.
    organization_id: UUID | None = None

    @field_validator("color")
    @classmethod
    def _known_color(cls, v: str) -> str:
        if v not in AVATAR_CATEGORY_COLORS:
            raise ValueError(f"Colore non valido: scegli fra {', '.join(AVATAR_CATEGORY_COLORS)}.")
        return v


class AdminAvatarCategoryResponse(AuthorshipResponse):
    """Una categoria come la vede chi la amministra."""

    id: UUID
    name: str
    color: str
    organization_id: UUID
    organization_name: str
    # Quanti avatar la usano, archiviati compresi: è il numero che dice se
    # la categoria si può cancellare.
    avatar_count: int = 0


class AvatarImageResponse(BaseModel):
    """Public URL of an image just uploaded for an avatar."""

    image_url: str


class AvatarDraftRequest(BaseModel):
    """Il caso da cui ricavare una bozza di scheda persona.

    Il minimo di quaranta caratteri non è burocrazia: da tre parole il modello
    inventa uno scenario suo, che è esattamente quello che chi genera una
    scheda non vuole. Il massimo tiene dentro una trascrizione lunga senza
    lasciar passare un manuale intero incollato per sbaglio.
    """

    text: str = Field(min_length=40, max_length=20_000)
    # "descrizione" (un caso raccontato) o "conversazione" (una trascrizione
    # vera, già anonimizzata da chi la incolla): due lavori diversi per il
    # modello, vedi persona_draft.
    source: str = SOURCE_DESCRIPTION

    @field_validator("source")
    @classmethod
    def _known_source(cls, value: str) -> str:
        if value not in SOURCES:
            raise ValueError(
                f"Fonte non valida: usa '{SOURCE_DESCRIPTION}' o '{SOURCE_CONVERSATION}'."
            )
        return value


class AvatarDraftResponse(BaseModel):
    """La bozza, che è una scheda come un'altra e non è ancora un avatar.

    Torna al form e nient'altro: nessuno l'ha salvata, e a decidere cosa
    tenerne è la persona che l'ha chiesta.
    """

    profile: dict


class AvatarPromptPreviewRequest(BaseModel):
    """Render the roleplay prompt of a sheet that may not be saved yet."""

    profile: dict
    # "voice" (call) or "text" (chat): the same persona, a different medium
    channel: str = CHANNEL_VOICE

    @field_validator("channel")
    @classmethod
    def _known_channel(cls, value: str) -> str:
        if value not in (CHANNEL_VOICE, CHANNEL_TEXT):
            raise ValueError(f"Canale non valido: usa '{CHANNEL_VOICE}' o '{CHANNEL_TEXT}'.")
        return value


class AvatarPromptPreviewResponse(BaseModel):
    """The system prompt a sheet produces, plus what it left out.

    `ignored_fields` are the sheet keys that carry a value the prompt builder
    drops (the "not applicable" markers), which is exactly what an author
    needs to see: a field they believe they filled in and the avatar will
    never know about.
    """

    prompt: str
    channel: str
    ignored_fields: list[str] = []


class VoiceOption(BaseModel):
    """One selectable ElevenLabs voice."""

    id: str
    name: str
    language: str = ""
    description: str | None = None


class VoicePreviewRequest(BaseModel):
    """Ask for one spoken line, to compare voices before saving."""

    voice_id: str = Field(min_length=1)
    text: str | None = None


class ConversationReport(BaseModel):
    """Read-only recap of a single conversation for the activity report."""

    id: UUID
    title: str
    # Channel it ran on: "voice" (call) or "text" (chat)
    mode: str = CONVERSATION_MODE_VOICE
    avatar_id: UUID
    avatar_name: str
    avatar_category: str
    avatar_category_color: str = DEFAULT_AVATAR_CATEGORY_COLOR
    created_at: datetime
    message_count: int
    # First-to-last message span; 0 when the conversation has < 2 messages
    duration_seconds: int
    # Il voto finale, correzione del docente compresa. None finché la
    # conversazione non è stata valutata: il report elenca anche quelle, e uno
    # zero al posto di "non ancora" sarebbe una bocciatura inventata
    score: float | None = None


class SimulationAttemptReport(BaseModel):
    """Un test tecnico consegnato, per il report attività.

    Il gemello scritto di `ConversationReport`: la stessa riga (cosa, quando,
    com'è andata) sotto un'altra linguetta della stessa persona.
    """

    id: UUID
    simulation_id: UUID
    simulation_title: str
    # "multiple" o "open": come si rispondeva, che il voto da solo non dice
    simulation_kind: str
    # "ai" o "manual": chi aveva scritto le domande
    simulation_source: str
    created_at: datetime
    correct_count: int
    question_count: int
    # In decimi, la stessa scala delle valutazioni
    score: float


class UserActivityReport(BaseModel):
    """Read-only recap of a user: quanto ha fatto, nel periodo scelto.

    Le due prove stanno sulla stessa riga perché la domanda del report è
    "questa persona cosa ha fatto", e chi ha solo svolto delle simulazioni
    con i soli conteggi delle conversazioni sembrerebbe fermo.

    Qui ci sono i conteggi e basta. Le prove una per una sono in
    `UserActivityDetail`, che si legge quando quella riga si apre: erano qui
    dentro, e voleva dire scaricare le conversazioni e i tentativi di tutti
    per mostrarne una riga alla volta.

    Le medie non ci sono: il voto appartiene alla singola prova, che se lo
    porta dentro l'elenco, e una media per persona la scrive già la dashboard
    su tutto il gruppo.
    """

    id: UUID
    email: str
    nome: str
    cognome: str
    ruolo: str
    organization_id: UUID | None = None
    organization_name: str | None = None
    created_at: datetime
    conversation_count: int
    total_duration_seconds: int
    simulation_count: int = 0


class UserActivityDetail(BaseModel):
    """Le prove di una persona sola, una per una, nel periodo scelto.

    È quello che si apre sotto la riga del report attività: le conversazioni
    con gli avatar da una parte, i test consegnati dall'altra, ciascuna con
    com'è andata. La persona non si ripete qui dentro, perché chi la chiede
    ha già la riga da cui è partito.
    """

    conversations: list[ConversationReport] = []
    simulation_attempts: list[SimulationAttemptReport] = []


class DebriefingTheme(BaseModel):
    """Un tema ricorrente del debriefing: cosa torna, e su quali prove."""

    title: str
    detail: str = ""
    # Le prove su cui il tema poggia, nominate dal modello. Un tema senza
    # evidenze è un'impressione, e chi legge deve poter risalire a dove
    # l'ha vista prima di ripeterla a voce a qualcuno.
    evidence: str = ""


class DebriefingCriterionAverage(BaseModel):
    """La media di un criterio sulle prove che il debriefing ha letto."""

    key: str
    label: str
    average: float
    # Di quanto è cambiata rispetto al quadro precedente. None quando il
    # confronto non si può fare: il primo quadro di una persona, o un
    # criterio che una delle due volte non era stato giudicato. La
    # sottrazione la fa il backend in lettura, vedi ``debriefing_source``.
    delta: float | None = None


class UserDebriefingResponse(BaseModel):
    """Una versione del quadro d'insieme su una persona, come si legge.

    Tutto quello che c'è qui è una fotografia salvata, tranne `is_stale` e i
    tre scarti: i numeri sono quelli che il modello aveva davanti quando ha
    scritto, non quelli di adesso. Ricalcolarli in lettura farebbe comparire
    una media che il testo accanto non ha mai visto, ed è esattamente il
    difetto che `ai_score_at_review` esiste per evitare sulle revisioni.

    Gli scarti sono l'eccezione, e non contraddicono la regola: non
    ricalcolano niente, sottraggono due fotografie che non cambiano più.
    """

    id: UUID
    user_id: UUID
    summary: str
    themes: list[DebriefingTheme] = []
    # Vuoto quando nel materiale non si vedeva nessun miglioramento: è un
    # esito, non un dato mancante, e l'interfaccia lo dice.
    improving: str | None = None
    next_step: str

    # Come si è mossa la persona rispetto al quadro precedente: "up",
    # "stable" o "down", con accanto il racconto di cosa è cambiato.
    # Tutti e due null sul primo quadro di una persona, dove un prima non
    # c'è e una direzione sarebbe inventata.
    direction: str | None = None
    change: str | None = None

    # Su quanto poggia
    covered_conversations: int
    covered_attempts: int
    covered_until: datetime
    conversation_average: float | None = None
    attempt_average: float | None = None
    criteria_averages: list[DebriefingCriterionAverage] = []

    # Di quanto si sono mosse le medie dal quadro precedente. La direzione
    # sopra la legge il modello nelle prove, questi sono una sottrazione: le
    # due cose possono non coincidere, e va bene così, perché mezzo punto di
    # media in più non è un miglioramento nel modo di lavorare.
    conversation_average_delta: float | None = None
    attempt_average_delta: float | None = None

    # True quando la persona ha svolto altre prove dopo che il quadro è
    # stato scritto: derivato in lettura, mai salvato, e solo sul più
    # recente. Su una versione vecchia dello storico non vuol dire niente,
    # perché quello che non ha visto è il quadro che l'ha sostituita.
    is_stale: bool = False
    created_at: datetime
    # Chi lo ha fatto scrivere, dalle colonne di paternità: un testo su una
    # persona è qualcosa che qualcuno ha deciso di chiedere. Una riga non
    # viene mai riscritta, quindi chi lo ha chiesto e quando sono per sempre
    # quelli della creazione.
    requested_by: str


class EvaluationCriterionScore(BaseModel):
    """Score of a single criterion inside the evaluations report."""

    key: str
    label: str
    score: float


class EvaluationReportRow(BaseModel):
    """One evaluated conversation, flattened for the dashboard charts.

    `overall_score` is the grade that counts, so a conversation a trainer
    corrected is charted and exported at the corrected value: a report that
    kept plotting the machine's number would contradict what the student
    reads on their own page. `ai_overall_score` keeps the AI's own next to
    it, and the two differ exactly when `has_override` is true.
    """

    conversation_id: UUID
    conversation_title: str
    # Channel it ran on: "voice" (call) or "text" (chat)
    mode: str = CONVERSATION_MODE_VOICE
    user_id: UUID
    user_email: str
    user_nome: str
    user_cognome: str
    organization_id: UUID | None = None
    organization_name: str | None = None
    avatar_id: UUID
    avatar_name: str
    conversation_at: datetime
    evaluated_at: datetime
    overall_score: float
    ai_overall_score: float
    has_override: bool = False
    # A trainer has been through this conversation (note, correction or both)
    has_review: bool = False
    # Chiave del criterio -> punteggio. Le etichette per esteso stanno una
    # volta sola sulla risposta (`EvaluationReportPage.criteria_labels`) e non
    # su ogni riga: sono le stesse sei parole per ogni conversazione, e
    # ripeterle riga per riga era il grosso di questo payload.
    criteria: dict[str, float]


class EvaluationReportPage(BaseModel):
    """Le valutazioni del periodo, con il vocabolario dei criteri accanto.

    Un oggetto e non un elenco perché due cose vanno dette sull'insieme e non
    sulla singola riga: come si chiamano per esteso i criteri, e se quello che
    si sta guardando è tutto quello che c'è.

    `truncated` è vero quando le righe superavano il tetto e sono state prese
    le più recenti. Non è un errore ed è quello che permette al tetto di
    esistere: senza dirlo, una dashboard tagliata mostrerebbe medie di una
    parte dello storico presentandole come le medie di tutto.
    """

    # Chiave -> etichetta per esteso, nell'ordine in cui il valutatore le dà
    criteria_labels: dict[str, str]
    rows: list[EvaluationReportRow]
    truncated: bool = False


class SimulationReportRow(BaseModel):
    """One delivered technical test, flattened for the dashboard charts.

    The written twin of `EvaluationReportRow`: same shape (who, when, what
    grade) so the dashboard can draw the two halves with the same components.
    The grade is the one frozen on the attempt, and nobody corrects it by
    hand, so here there is no AI score and no override to keep next to it.
    """

    attempt_id: UUID
    simulation_id: UUID
    simulation_title: str
    # Come si rispondeva: "multiple" o "open". Sta accanto al titolo per la
    # stessa ragione per cui `mode` sta accanto a una conversazione: due
    # prove che si svolgono in modi diversi non si leggono nella stessa
    # riga senza sapere quale delle due si sta guardando
    simulation_kind: str
    # Chi aveva scritto le domande: "ai" o "manual"
    simulation_source: str
    user_id: UUID
    user_email: str
    user_nome: str
    user_cognome: str
    organization_id: UUID | None = None
    organization_name: str | None = None
    attempted_at: datetime
    correct_count: int
    question_count: int
    # Out of ten, the same scale as the conversation evaluations
    score: float


class SimulationReportPage(BaseModel):
    """I test consegnati nel periodo, con lo stesso tetto dell'altra metà.

    Niente vocabolario qui: un tentativo non ha criteri, ha domande. Resta
    `truncated`, che è la stessa avvertenza per la stessa ragione.
    """

    rows: list[SimulationReportRow]
    truncated: bool = False


class AdminConversationDetail(BaseModel):
    """Full transcript + stored evaluation of a conversation, for the admin dashboard."""

    conversation_id: UUID
    messages: list[ChatMessageResponse]
    evaluation: ConversationEvaluationResponse | None = None
    # Carried next to the evaluation rather than inside it: a trainer can
    # annotate a conversation the AI never judged, and that review still has
    # to reach the modal.
    review: ConversationReviewResponse | None = None


# --- Confronto fra i tentativi di una persona ---


class AttemptResponse(BaseModel):
    """One evaluated conversation, as the comparison screen reads it.

    Everything needed to render one side of the comparison travels here:
    the scores, the criteria behind them and the trainer's words. The list
    is per person and never long enough to be worth splitting into a second
    round trip for the two the user ends up picking.
    """

    conversation_id: UUID
    title: str
    mode: str = CONVERSATION_MODE_VOICE
    avatar_id: UUID
    avatar_name: str
    conversation_at: datetime
    evaluated_at: datetime
    # The machine's own score and the one that counts: they differ exactly
    # when a trainer corrected it (see reviews.final_score)
    ai_score: float
    final_score: float
    has_override: bool = False
    summary: str = ""
    # The trainer's words, when a review was written
    reviewer_name: str | None = None
    review_note: str | None = None
    review_reason: str | None = None
    criteria: list[EvaluationCriterionScore] = []


class SimulationAnswerOutcome(BaseModel):
    """How one question went, as the comparison screen reads it.

    The question travels with its own text and not just its id: two attempts
    at the same test are matched by question, and a question that has been
    rewritten since must still be readable next to the answer it got.

    Three fields, and none of them is what was answered. The comparison draws
    a green or a red mark per question, so `is_correct` is all it needs, and
    it exists on all four kinds, which is why this screen needed no other
    field when two more arrived. What was picked, what was right and where
    the question sat in the run used to ride along unread: every attempt in
    the list carried them, for the two that get opened to ignore them, and
    what was actually answered is read from the attempt itself
    (`GET /api/simulations/attempts/{id}`), which the screen already opens
    for exactly that."""

    question_id: UUID
    text: str
    is_correct: bool


class SimulationComparisonAttempt(BaseModel):
    """One delivered technical test, as the comparison screen reads it.

    The written twin of `AttemptResponse`. There is no AI score and no
    trainer's words here: the grade frozen on the attempt is the only one
    there has ever been, whether it came from comparing two numbers or from
    a model reading what the person wrote.
    """

    attempt_id: UUID
    simulation_id: UUID
    simulation_title: str
    # The twin of `mode` on a conversation: which kind of test this was. Two
    # attempts at tests of different kinds can still be put side by side, and
    # the screen has to say so
    simulation_kind: str
    # Who wrote the questions: "ai" or "manual"
    simulation_source: str
    attempted_at: datetime
    correct_count: int
    question_count: int
    score: float
    answers: list[SimulationAnswerOutcome] = []


class ComparableUserResponse(BaseModel):
    """Someone whose attempts an admin can open, with how many there are.

    Only people with something to compare are listed: offering a name that
    opens an empty screen is a dead end the picker can spare the trainer.
    `attempts` counts both proofs together, evaluated conversations and
    delivered tests, because the picker is one for the whole screen.
    """

    id: UUID
    nome: str
    cognome: str
    email: str
    attempts: int


# --- Notifiche (derivate, mai memorizzate: vedi notifications.py) ---


class NotificationResponse(BaseModel):
    """One thing to tell the user, assembled at read time."""

    # Stable identity of the event: what a read mark refers to
    key: str
    # "assignment.assigned", "assignment.due_soon", "assignment.overdue",
    # "review.published" (see notifications.py)
    kind: str
    title: str
    body: str
    # When the event became true, which is the order of the list
    at: datetime
    read: bool
    # Where clicking it takes the user, None when there is nowhere to go
    link: str | None = None


class NotificationListResponse(BaseModel):
    """The user's notifications, newest first, with the unread counter.

    The counter is returned next to the items rather than left to the client
    to compute: the bell shows it before anything is opened, and two
    definitions of "unread" would eventually disagree.
    """

    items: list[NotificationResponse]
    unread: int


class NotificationReadRequest(BaseModel):
    """Mark notifications as read.

    An empty (or absent) list means "everything the user can currently see":
    it is the "segna tutte come lette" button, and it is resolved on the
    server because only the server knows what is derivable right now.
    """

    keys: list[str] | None = None


# --- Audit log (super admin only) ---


class AuditLogResponse(BaseModel):
    """One recorded action, as the super admin's registry shows it."""

    id: UUID
    created_at: datetime
    user_id: UUID | None = None
    user_email: str
    user_role: str
    organization_id: UUID | None = None
    organization_name: str | None = None
    action: str
    # Italian wording of `action`, resolved at read time from the catalogue
    action_label: str
    resource_type: str | None = None
    resource_id: str | None = None
    method: str
    path: str
    status_code: int
    client_ip: str
    user_agent: str
    details: dict | None = None


class AuditLogPage(BaseModel):
    """A window over the registry: the rows plus how many matched in all."""

    total: int
    items: list[AuditLogResponse]


class AuditActionOption(BaseModel):
    """An action the registry can contain, for the filter dropdown."""

    key: str
    label: str


# --- Simulazioni tecniche ---


class SimulationPair(BaseModel):
    """Una coppia di una domanda di abbinamento: la voce e il suo abbinato.

    Un oggetto con due campi e non una lista di due elementi: le coppie
    viaggiano nella chiave, nella risposta consegnata e nell'esito, e in
    tutti e tre i posti serve poter dire quale dei due sta a sinistra senza
    contare su un indice.
    """

    left: str
    right: str


class SimulationQuestionResponse(BaseModel):
    """Una domanda come la vede chi deve rispondere.

    Manca tutto quello che risolverebbe il test: la risposta esatta, la
    traccia della risposta attesa, la spiegazione e i passaggi del documento
    restano sul server e arrivano solo con l'esito, dopo la consegna. È il
    motivo per cui esiste uno schema separato da quello che legge il super
    admin.

    Ogni tipo di test riempie la propria lista e lascia vuote le altre, e
    una lista vuota non è un campo mancante: è la domanda che non ne ha. Chi
    la mostra guarda il tipo della simulazione, non la lunghezza di queste
    liste.

    **Sulle domande di ordinamento e di abbinamento la mescolata è già
    avvenuta qui.** ``steps`` sono i passi in ordine sparso e ``right`` la
    colonna di destra rimescolata: l'ordine giusto è la chiave, quindi
    mandarlo com'è scritto vorrebbe dire consegnare la risposta insieme alla
    domanda. Il server non si segna quale mescolata ha spedito, come non si
    segna quali domande ha estratto, ed è per questo che la consegna rimanda
    indietro il testo degli elementi e non la loro posizione (vedi
    ``SimulationAnswerPayload``).

    ``position`` vuol dire due cose diverse a seconda di chi chiede, e in
    entrambi i casi vuol dire "in che ordine si legge": per chi svolge il
    test è il posto nel tentativo appena estratto, per il super admin che
    rilegge il serbatoio è il posto nel serbatoio.
    """

    id: UUID
    position: int
    text: str
    options: list[str] = []
    # I passi da rimettere in ordine, mescolati
    steps: list[str] = []
    # Le due colonne da accoppiare: la sinistra come è scritta, la destra
    # mescolata. Sono due liste e non una di coppie proprio perché le coppie
    # sono la chiave
    left: list[str] = []
    right: list[str] = []

    model_config = {"from_attributes": True}


class SimulationQuestionAdminResponse(SimulationQuestionResponse):
    """La stessa domanda con le chiavi, per chi la deve rivedere.

    Le chiavi viaggiano tutte insieme e se ne legge una sola, quella del tipo
    del test: l'indice dell'alternativa corretta, la traccia di quello che
    una risposta scritta deve dire, i passi nell'ordine giusto, le coppie
    esatte.

    Qui l'ordinamento arriva **in ordine**, al contrario che nello schema da
    cui eredita: chi rivede la domanda deve leggere la chiave, non provare a
    indovinarla.
    """

    correct_option: int | None = None
    expected_answer: str = ""
    ordered_steps: list[str] | None = None
    pairs: list[SimulationPair] | None = None
    explanation: str
    source_chunks: list[int] | None = None


class SimulationResponse(BaseModel):
    """Una simulazione nell'elenco: quanto basta per decidere se aprirla."""

    id: UUID
    organization_id: UUID
    organization_name: str
    title: str
    description: str | None = None
    status: str
    # Come si risponde: "multiple" o "open", per tutte le domande del test
    kind: str
    # Chi ha scritto le domande: "ai" o "manual". Sta accanto a `kind` per la
    # stessa ragione per cui c'è `kind`, e viaggia fino a chi svolge il test:
    # sapere se le domande le ha scritte un modello o una persona cambia il
    # peso di una risposta contestata, e nasconderlo sarebbe una scelta al
    # posto di chi legge
    source: str
    document_name: str
    question_count: int
    created_at: datetime
    updated_at: datetime
    # Come è andata a chi guarda, sull'ultimo tentativo: assenti se non ne
    # ha ancora fatti. Un admin che guarda le simulazioni di altri legge i
    # propri tentativi, non i loro, ed è voluto: il riepilogo di chi le ha
    # svolte è un'altra domanda e ha il suo endpoint.
    last_attempt_at: datetime | None = None
    last_attempt_score: float | None = None
    attempt_count: int = 0


class SimulationDetailResponse(SimulationResponse):
    """La simulazione prima di cominciarla: le regole, non le domande.

    Le domande non stanno qui e non è una dimenticanza: si estraggono a caso
    dal serbatoio quando il test comincia (``POST .../start``), quindi
    aprire la pagina non le decide. ``question_count`` dice quante ne avrà
    il tentativo, che è la cosa che chi sta per rispondere vuole sapere.
    """


class AdminSimulationResponse(SimulationResponse, AuthorshipResponse):
    """La stessa riga dell'elenco, con in più chi l'ha creata e chi l'ha
    toccata per ultimo.

    La paternità sta qui e non su ``SimulationResponse`` perché quella la
    riceve anche chi il test lo svolge, e l'indirizzo di chi prepara i test
    non è qualcosa che serva a chi li fa. ``source`` invece sta là, perché
    quello lo legge anche chi risponde.
    """


class SimulationReviewFinding(BaseModel):
    """Una segnalazione del controllo del serbatoio."""

    # "duplicate", "unsupported", "implausible_options", "longest_correct",
    # "answer_position"
    kind: str
    # "high", "medium", "low": è l'ordine in cui il pannello le mette, cioè
    # la ragione per cui il controllo esiste
    severity: str
    # Le domande a cui si riferisce. Due sui duplicati, che parlano di una
    # coppia; nessuna su quelle che riguardano il serbatoio nel suo insieme.
    positions: list[int] = []
    message: str


class SimulationReviewResponse(BaseModel):
    """L'esito dell'ultimo controllo del serbatoio, se ne è stato chiesto uno.

    Non blocca niente: la pubblicazione resta possibile con tutte le
    segnalazioni aperte. Serve a dire da quale delle cinquanta domande
    conviene cominciare a rileggere.
    """

    findings: list[SimulationReviewFinding]
    # Quante domande sono state davvero lette dalla passata del modello: le
    # domande senza citazioni non hanno niente con cui essere confrontate, e
    # dire cinquanta dopo averne verificate trenta sarebbe una rassicurazione
    # inventata.
    checked: int
    reviewed_at: datetime
    # True quando le domande sono cambiate dopo il controllo: l'esito parla
    # di un serbatoio che non c'è più. Derivato in lettura, mai salvato.
    is_stale: bool = False


class SimulationAdminDetailResponse(AdminSimulationResponse):
    """La simulazione come la vede il super admin: domande con le chiavi,
    in quanti passaggi il documento è stato spezzato e quanti l'hanno svolta.

    Il testo del documento non c'è, per quanto sia scritto nella riga: nessuna
    schermata lo mostra, e a rileggerlo sono il modello che genera le domande
    e quello che le controlla, tutti e due dentro al server. Viaggiava in ogni
    risposta di questo router, salvataggio delle domande compreso, e un
    documento sta fino a dieci megabyte."""

    questions: list[SimulationQuestionAdminResponse]
    chunk_count: int
    total_attempts: int
    # Assente finché nessuno ha chiesto il controllo, che è diverso da un
    # controllo passato senza rilievi: quello è un esito con la lista vuota.
    review: SimulationReviewResponse | None = None


class SimulationCreateRequest(BaseModel):
    """I dati che accompagnano il documento caricato.

    Viaggiano come campi di form e non come JSON, perché arrivano insieme al
    file nella stessa richiesta multipart. Il documento c'è solo quando le
    domande le scrive il modello: a mano non serve, e infatti non si carica.

    Il tipo si decide qui e non si cambia più: le domande nascono già
    dell'una forma o dell'altra, e cambiarlo dopo vorrebbe dire buttarle. Chi
    le scrive è la stessa cosa, per la stessa ragione.
    """

    organization_id: UUID
    title: str = Field(min_length=1, max_length=150)
    description: str | None = None
    kind: str = SIMULATION_KIND_MULTIPLE
    source: str = SIMULATION_SOURCE_AI


class SimulationUpdateRequest(BaseModel):
    """Titolo e descrizione. Il documento non si modifica: si ricarica."""

    title: str = Field(min_length=1, max_length=150)
    description: str | None = None


class SimulationStatusRequest(BaseModel):
    """Pubblicazione e ritiro."""

    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ALL_SIMULATION_STATUSES:
            raise ValueError(f"Stato non valido: {v}")
        return v


class SimulationQuestionPayload(BaseModel):
    """Una domanda riscritta a mano dal super admin.

    Quello che rende valida una domanda dipende dal tipo del test, che qui
    non si sa: il payload porta le domande e non la simulazione a cui
    appartengono. Quindi i campi delle due chiavi sono tutti facoltativi e a
    controllarli è il router, che la simulazione ce l'ha davanti (vedi
    ``admin_simulations.save_questions``). Ripetere il tipo dentro il
    payload sarebbe la seconda copia di un dato che il server ha già, e due
    copie prima o poi dicono cose diverse.

    Quello che si può controllare senza sapere il tipo resta qui: quante sono
    le alternative, da due a sei, e che la risposta segnata come corretta sia
    una di quelle. Quante siano esattamente lo decide chi scrive la domanda,
    una domanda per volta: il modello ne scrive quattro perché è il numero su
    cui sono tarate le sue regole, il docente sceglie ogni volta, e una
    domanda con due alternative accanto a una con sei è un test legittimo.

    **Una domanda a metà si può salvare.** Un'alternativa ancora vuota e la
    risposta corretta non ancora segnata passano di qui, ed è quello che
    permette a chi sta scrivendo cinquanta domande di fermarsi alla ventesima
    senza perderle. A pretendere che siano finite è la pubblicazione (vedi
    ``admin_simulations.update_status``), che è il momento in cui smettono di
    essere appunti e diventano un test.
    """

    text: str = Field(min_length=1)
    options: list[str] | None = None
    correct_option: int | None = None
    expected_answer: str = ""
    ordered_steps: list[str] | None = None
    pairs: list[SimulationPair] | None = None
    explanation: str = ""

    @field_validator("options")
    @classmethod
    def validate_options(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned = [o.strip() for o in v]
        if not SIMULATION_MIN_OPTIONS <= len(cleaned) <= SIMULATION_MAX_OPTIONS:
            raise ValueError(
                f"Le alternative devono essere da {SIMULATION_MIN_OPTIONS} a "
                f"{SIMULATION_MAX_OPTIONS}."
            )
        return cleaned

    @field_validator("ordered_steps")
    @classmethod
    def validate_ordered_steps(cls, v: list[str] | None) -> list[str] | None:
        """Quanti sono i passi, non se sono finiti.

        Un passo ancora vuoto passa di qui, come un'alternativa vuota: è
        quello che permette di fermarsi a metà di una domanda senza perderla.
        A pretendere che sia finita è la pubblicazione.
        """
        if v is None:
            return None
        cleaned = [s.strip() for s in v]
        if not SIMULATION_MIN_ITEMS <= len(cleaned) <= SIMULATION_MAX_ITEMS:
            raise ValueError(
                f"I passi da ordinare devono essere da {SIMULATION_MIN_ITEMS} a "
                f"{SIMULATION_MAX_ITEMS}."
            )
        return cleaned

    @field_validator("pairs")
    @classmethod
    def validate_pairs(cls, v: list[SimulationPair] | None) -> list[SimulationPair] | None:
        if v is None:
            return None
        cleaned = [SimulationPair(left=p.left.strip(), right=p.right.strip()) for p in v]
        if not SIMULATION_MIN_ITEMS <= len(cleaned) <= SIMULATION_MAX_ITEMS:
            raise ValueError(
                f"Le coppie da abbinare devono essere da {SIMULATION_MIN_ITEMS} a "
                f"{SIMULATION_MAX_ITEMS}."
            )
        return cleaned

    @model_validator(mode="after")
    def validate_correct_option(self) -> "SimulationQuestionPayload":
        if self.options is None or self.correct_option is None:
            return self
        if not 0 <= self.correct_option < len(self.options):
            raise ValueError("La risposta corretta deve essere una delle alternative.")
        return self


class SimulationQuestionsPayload(BaseModel):
    """Le domande di una simulazione, tutte insieme.

    Si salvano in blocco e non una per volta perché sono un test: riordinarne
    una, toglierne una e riscriverne un'altra sono la stessa modifica, e a
    pezzi lascerebbero il test in stati che non hanno senso.
    """

    questions: list[SimulationQuestionPayload]

    @field_validator("questions")
    @classmethod
    def validate_questions(
        cls, v: list[SimulationQuestionPayload]
    ) -> list[SimulationQuestionPayload]:
        if not v:
            raise ValueError("Una simulazione deve avere almeno una domanda.")
        if len(v) > SIMULATION_POOL_COUNT:
            raise ValueError(f"Al massimo {SIMULATION_POOL_COUNT} domande.")
        return v


class SimulationAnswerPayload(BaseModel):
    """La risposta data a una domanda: quale opzione, cosa ha scritto, in
    che ordine ha messo i passi o come ha accoppiato le due colonne.

    Un campo per tipo di test, e se ne riempie uno solo. Vuoti tutti
    significa lasciata in bianco, che è una cosa che si può fare in ogni
    tipo.

    **Ordinamento e abbinamento rimandano il testo degli elementi e non la
    loro posizione.** Il server ha mescolato la domanda al momento
    dell'estrazione e non si è segnato come, esattamente come non si è
    segnato quali domande aveva estratto: un indice riferito a una mescolata
    che nessuno ha conservato non vorrebbe dire niente. Il testo invece si
    confronta con la chiave, ed è la stessa scelta di ``_submitted_questions``,
    dove è il payload a dire cosa era stato consegnato.
    """

    question_id: UUID
    # None significa lasciata in bianco, che vale come sbagliata ma si legge
    # diversamente nell'esito
    selected_option: int | None = None
    # Quello che ha scritto, sui test a risposta aperta. Il tetto è largo
    # apposta: serve a fermare un client che manda un megabyte, non a dire a
    # chi risponde quanto può scrivere.
    answer_text: str | None = Field(default=None, max_length=5000)
    # I passi nell'ordine in cui li ha disposti, come testo. Il tetto è quello
    # della domanda: una lista più lunga non è una risposta a questa domanda
    ordered_steps: list[str] | None = Field(default=None, max_length=SIMULATION_MAX_ITEMS)
    # Le coppie che ha formato. Una coppia lasciata a metà non si manda: chi
    # non ha abbinato una voce l'ha lasciata in bianco, e le voci in bianco
    # sono quelle che non compaiono qui
    pairs: list[SimulationPair] | None = Field(default=None, max_length=SIMULATION_MAX_ITEMS)
    # Quanto ci ha messo, misurato dal browser da quando la domanda è
    # comparsa: è quello che fa scendere il valore di una risposta corretta
    # (vedi simulation_scoring). Assente vale come il tempo massimo, non come
    # il minimo: chi non lo manda non deve guadagnarci. Sulle risposte aperte
    # non c'è cronometro e non arriva mai.
    elapsed_ms: int | None = None


class SimulationSubmitRequest(BaseModel):
    """Il test consegnato, con una voce per domanda."""

    answers: list[SimulationAnswerPayload]


class SimulationAnswerResult(BaseModel):
    """Com'è andata una singola domanda, con la sua correzione.

    Uno schema solo per tutti i tipi di test, con i campi degli altri vuoti:
    l'esito si legge nella stessa pagina, e più schemi vorrebbero dire più
    pagine che devono restare uguali a mano.
    """

    question_id: UUID
    position: int
    text: str
    options: list[str] = []
    selected_option: int | None = None
    correct_option: int | None = None
    # Quello che ha scritto e quello che avrebbe dovuto dire, sulle domande
    # aperte: la seconda è la traccia con cui il modello ha giudicato la
    # prima, e mostrarla è l'unico modo di rendere il voto verificabile da
    # chi lo riceve.
    answer_text: str | None = None
    expected_answer: str = ""
    # Le due righe con cui il modello motiva i punti che ha dato. Sulle
    # domande a scelta multipla è vuoto: là la correzione non ha niente da
    # motivare oltre a quale fosse la risposta. Il giudizio invece non ha un
    # campo suo, perché è già `points`: un numero solo, non due che devono
    # restare d'accordo.
    feedback: str = ""
    # Come ha disposto i passi e qual era l'ordine giusto, sulle domande di
    # ordinamento. Le due liste stanno affiancate nell'esito, ed è lì che si
    # vede quale passo era fuori posto.
    given_steps: list[str] = []
    correct_steps: list[str] = []
    # Le stesse due cose sulle domande di abbinamento: le coppie che ha
    # formato e quelle giuste
    given_pairs: list[SimulationPair] = []
    correct_pairs: list[SimulationPair] = []
    # Quanti elementi ha indovinato su quanti erano: è il numero da cui
    # escono i punti, e va scritto accanto a loro perché "0,7" non dice cosa
    # sia andato storto mentre "4 su 6" sì. Zero su zero sugli altri tipi
    matched_count: int = 0
    item_count: int = 0
    is_correct: bool
    # Quanto ci è voluto e quanto è valso: i punti sono da 1 a 0,1 su una
    # risposta corretta, 0 sulle altre. Il tempo torna indietro insieme ai
    # punti perché un numero più basso di 1 senza il tempo accanto sembra un
    # errore di correzione. Il tempo c'è solo sulle domande a scelta multipla,
    # che sono le sole ad avere il cronometro: sulle altre i punti li spiegano
    # il commento del giudice oppure gli elementi indovinati.
    elapsed_ms: int | None = None
    points: float = 0.0
    explanation: str
    # I passaggi del documento su cui la domanda si fonda: è quello che
    # trasforma "hai sbagliato" in "ecco cosa dice la procedura"
    sources: list[str] = []


class SimulationAttemptResponse(BaseModel):
    """L'esito di un test consegnato."""

    id: UUID
    simulation_id: UUID
    simulation_title: str
    # Il tipo del test, che decide come si legge l'esito: le alternative con
    # la corretta in verde, oppure la risposta scritta accanto alla traccia
    simulation_kind: str
    # Chi aveva scritto le domande: "ai" o "manual"
    simulation_source: str
    user_id: UUID
    user_email: str
    user_name: str
    correct_count: int
    question_count: int
    # I punti raccolti sulle domande, da cui esce il voto: le risposte esatte
    # restano accanto perché dicono un'altra cosa, quante ne sapeva
    earned_points: float
    score: float
    created_at: datetime
    answers: list[SimulationAnswerResult]


class SimulationAttemptSummary(BaseModel):
    """Un tentativo nell'elenco, senza il dettaglio delle risposte."""

    id: UUID
    simulation_id: UUID
    simulation_title: str
    simulation_kind: str
    simulation_source: str
    user_id: UUID
    user_email: str
    user_name: str
    correct_count: int
    question_count: int
    earned_points: float
    score: float
    created_at: datetime


# --- Generic Response ---


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str
    success: bool = True
