/* Admin API service for managing users */
import { apiFetch, apiFetchBlob } from './api'
import type {
  ChatMessage,
  ConversationEvaluation,
  ConversationMode,
  ConversationReview,
  MessageAnnotation,
} from './api'
import type { AuthUser, RoleName, UserStatus } from './auth'
import type { Authored } from './authorship'
import type { SimulationKind, SimulationSource } from './simulations'

export interface CreateUserPayload {
  email: string
  nome: string
  cognome: string
  ruolo: RoleName
  /** Required for user/organization_admin, null for super_admin. */
  organization_id?: string | null
}

/** L'account come lo vede l'amministrazione: in più rispetto ad AuthUser porta
 * chi l'ha aperto e chi l'ha toccato per ultimo, che le rotte di /api/admin
 * sono le uniche a rispondere. */
export interface AdminUser extends AuthUser, Authored {}

/** Una finestra sugli utenti: `total` conta tutti quelli che soddisfano i
 * filtri, non quelli restituiti. */
export interface UserPage {
  total: number
  items: AdminUser[]
}

export interface UserFilters {
  organizationId?: string
  ruolo?: RoleName
  status?: UserStatus
  /** true elenca solo gli inviti mai accettati, false solo chi ha già acceduto. */
  neverLoggedIn?: boolean
  search?: string
  /* La colonna su cui ordinare, con lo stesso nome che ha nella tabella
   * (`utente`, `ruolo`, `creazione`...). Vuoto vuol dire l'ordine di
   * partenza, gli ultimi registrati per primi. Ordina il server, non la
   * tabella: qui c'è una finestra dell'elenco, e ordinare quella metterebbe
   * in cima il primo dei duecento scaricati. */
  sort?: string
  direction?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

/**
 * Legge una finestra dell'elenco utenti (solo Super Admin), più recenti
 * prima. Ricerca, filtri e ordinamento girano sul server: applicarli qui
 * varrebbe solo per le righe già caricate, cioè risponderebbe «nessun
 * utente» su qualcuno che esiste ma sta oltre la finestra.
 */
export const fetchUsers = (filters: UserFilters = {}) =>
  apiFetch<UserPage>('/api/admin/users', {
    params: {
      ...(filters.organizationId ? { organization_id: filters.organizationId } : {}),
      ...(filters.ruolo ? { ruolo: filters.ruolo } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.neverLoggedIn !== undefined
        ? { never_logged_in: String(filters.neverLoggedIn) }
        : {}),
      ...(filters.search ? { q: filters.search } : {}),
      ...(filters.sort ? { sort: filters.sort, direction: filters.direction ?? 'asc' } : {}),
      ...(filters.limit !== undefined ? { limit: String(filters.limit) } : {}),
      ...(filters.offset !== undefined ? { offset: String(filters.offset) } : {}),
    },
  })

/**
 * Create a new user in Cognito and local DB (Super Admin only).
 */
export const createNewUser = (payload: CreateUserPayload) =>
  apiFetch<AdminUser>('/api/admin/users', {
    method: 'POST',
    body: payload,
  })

export interface UpdateUserPayload {
  nome?: string
  cognome?: string
  ruolo?: RoleName
  organization_id?: string | null
}

/**
 * Update a user's fields and/or role (Super Admin only).
 */
export const updateUser = (userId: string, payload: UpdateUserPayload) =>
  apiFetch<AdminUser>(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: payload,
  })

/**
 * Delete a user from Cognito and the local DB (Super Admin only).
 */
export const deleteUser = (userId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/users/${userId}`, {
    method: 'DELETE',
  })

/**
 * Change an account's state (Super Admin only): 'suspended' is reversible,
 * 'disabled' is final. Any non-active state blocks login and kills the
 * user's open sessions immediately.
 */
export const setUserStatus = (userId: string, status: UserStatus) =>
  apiFetch<AdminUser>(`/api/admin/users/${userId}/status`, {
    method: 'PUT',
    body: { status },
  })

/**
 * Send the user a fresh temporary password via Cognito email (Super Admin
 * only). The old credentials stop working; on the next login the user must
 * set a new password.
 */
export const resendUserCredentials = (userId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/users/${userId}/resend-credentials`, {
    method: 'POST',
  })

// ── Avatar CRUD (super admin only) ───────────────────

export interface AdminAvatar extends Authored {
  id: string
  name: string
  image_url: string
  /** Il nome della categoria, per mostrarla: a salvarla è `category_id`. */
  category: string
  category_id: string
  /** Tinta della pastiglia, una di CATEGORY_COLORS. */
  category_color: string
  description: string | null
  voice_id: string | null
  /** Owning tenant: every avatar belongs to exactly one organization. */
  organization_id: string
  organization_name: string
  profile: Record<string, string>
  /** Quando l'avatar è stato archiviato; null se è ancora in catalogo. */
  deleted_at: string | null
  conversation_count: number
}

export interface AdminAvatarPayload {
  /** Una categoria della stessa organizzazione dell'avatar. */
  category_id: string
  description: string | null
  image_url: string | null
  voice_id: string | null
  /** Required owning tenant: the avatar is private to that organization. */
  organization_id: string
  profile: Record<string, string>
}

/** List all avatars with their full persona sheet (Super Admin only).
 *  Con `includeDeleted` la lista comprende anche gli avatar archiviati. */
export const fetchAdminAvatars = (includeDeleted = false) =>
  apiFetch<AdminAvatar[]>(`/api/admin/avatars${includeDeleted ? '?include_deleted=true' : ''}`)

/** Create a new avatar/persona (Super Admin only). */
export const createAvatar = (payload: AdminAvatarPayload) =>
  apiFetch<AdminAvatar>('/api/admin/avatars', {
    method: 'POST',
    body: payload,
  })

/** Update an avatar/persona (Super Admin only). */
export const updateAvatar = (avatarId: string, payload: AdminAvatarPayload) =>
  apiFetch<AdminAvatar>(`/api/admin/avatars/${avatarId}`, {
    method: 'PUT',
    body: payload,
  })

/** Archivia un avatar (Super Admin only): eliminazione logica, conversazioni
 *  e valutazioni già svolte restano intatte. */
export const deleteAvatar = (avatarId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/avatars/${avatarId}`, {
    method: 'DELETE',
  })

/** Riporta in catalogo un avatar archiviato (Super Admin only). */
export const restoreAvatar = (avatarId: string) =>
  apiFetch<AdminAvatar>(`/api/admin/avatars/${avatarId}/restore`, {
    method: 'POST',
  })

// ── Anagrafica delle categorie (super admin only) ────

export interface AdminAvatarCategory extends Authored {
  id: string
  name: string
  /** Una di CATEGORY_COLORS: il nome di una tinta, non un colore CSS. */
  color: string
  organization_id: string
  organization_name: string
  /** Quanti avatar la usano, archiviati compresi: se non è 0 non si elimina. */
  avatar_count: number
}

export interface AdminAvatarCategoryPayload {
  name: string
  color: string
  /** Solo alla creazione: l'organizzazione di una categoria non si cambia. */
  organization_id?: string
}

/** L'anagrafica di tutte le organizzazioni, o di una sola. */
export const fetchAvatarCategories = (organizationId?: string) =>
  apiFetch<AdminAvatarCategory[]>('/api/admin/avatar-categories', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  })

export const createAvatarCategory = (payload: AdminAvatarCategoryPayload) =>
  apiFetch<AdminAvatarCategory>('/api/admin/avatar-categories', {
    method: 'POST',
    body: payload,
  })

export const updateAvatarCategory = (categoryId: string, payload: AdminAvatarCategoryPayload) =>
  apiFetch<AdminAvatarCategory>(`/api/admin/avatar-categories/${categoryId}`, {
    method: 'PUT',
    body: payload,
  })

/** Elimina una categoria. Il backend rifiuta con 409 se la usa qualcuno. */
export const deleteAvatarCategory = (categoryId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/avatar-categories/${categoryId}`, {
    method: 'DELETE',
  })

// ── Strumenti del form avatar ────────────────────────
// Non toccano nessun avatar salvato: servono la scheda mentre la si compila.

/** Carica un ritratto e restituisce l'URL da mettere nel campo immagine. */
export const uploadAvatarImage = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<{ image_url: string }>('/api/admin/avatars/image', {
    method: 'POST',
    body: form,
  })
}

/** Canale su cui l'avatar interpreta la scheda: chiamata o chat scritta. */
export type PersonaChannel = 'voice' | 'text'

export interface PersonaPromptPreview {
  prompt: string
  channel: PersonaChannel
  /** Campi compilati che il prompt scarta perché contengono un marcatore vuoto. */
  ignored_fields: string[]
}

/** Il prompt di roleplay che la scheda produce, anche se non è ancora salvata. */
export const previewPersonaPrompt = (profile: Record<string, string>, channel: PersonaChannel) =>
  apiFetch<PersonaPromptPreview>('/api/admin/avatars/prompt-preview', {
    method: 'POST',
    body: { profile, channel },
  })

/** Da dove nasce una bozza di scheda: un caso raccontato, o una conversazione
 *  vera già anonimizzata da chi la incolla. Sono due lavori diversi per il
 *  modello, non due modi di dire la stessa cosa (vedi backend/persona_draft). */
export type PersonaDraftSource = 'descrizione' | 'conversazione'

export interface PersonaDraftPayload {
  text: string
  source: PersonaDraftSource
}

/** Una bozza di scheda persona. Non salva niente: torna al form, e a
 *  decidere cosa tenerne è la persona che l'ha chiesta. */
export const draftPersona = (payload: PersonaDraftPayload) =>
  apiFetch<{ profile: Record<string, string> }>('/api/admin/avatars/draft', {
    method: 'POST',
    body: payload,
  })

export interface VoiceOption {
  id: string
  name: string
  language: string
  description: string | null
}

/** Catalogo voci Cartesia, quelle nella lingua dell'app per prime. */
export const fetchVoices = () => apiFetch<VoiceOption[]>('/api/admin/voices')

/** Una battuta pronunciata con una voce, per confrontarle prima di salvare. */
export const fetchVoicePreview = (voiceId: string, text?: string) =>
  apiFetchBlob('/api/admin/voices/preview', {
    method: 'POST',
    body: { voice_id: voiceId, text: text ?? null },
  })

// ── Activity report (read-only) ──────────────────────

export interface ConversationReport {
  id: string
  title: string
  /** Channel it ran on: "voice" for a call, "text" for a chat. */
  mode: ConversationMode
  avatar_id: string
  avatar_name: string
  avatar_category: string
  /** Tinta della categoria, per la targhetta (vedi categoryStyles). */
  avatar_category_color: string
  created_at: string
  message_count: number
  duration_seconds: number
  /** Voto finale, correzione del docente compresa. null se non valutata. */
  score: number | null
}

/** Un test tecnico consegnato: il gemello scritto di ConversationReport. */
export interface SimulationAttemptReport {
  id: string
  simulation_id: string
  simulation_title: string
  /** "multiple" o "open": come si rispondeva. */
  simulation_kind: SimulationKind
  /** "ai" o "manual": chi aveva scritto le domande. */
  simulation_source: SimulationSource
  created_at: string
  correct_count: number
  question_count: number
  score: number
}

/** Una riga del report: quanto una persona ha fatto nel periodo scelto.
 *
 *  I conteggi e basta. Le prove una per una stanno in `UserActivityDetail`,
 *  che si legge aprendo la riga: erano dentro questa, e voleva dire
 *  scaricare le conversazioni e i tentativi di tutti per aprirne uno. */
export interface UserActivityReport {
  id: string
  email: string
  nome: string
  cognome: string
  ruolo: string
  organization_id: string | null
  organization_name: string | null
  created_at: string
  conversation_count: number
  total_duration_seconds: number
  simulation_count: number
}

/** Le prove di una persona sola, nel periodo scelto: quello che si apre
 *  sotto la sua riga. */
export interface UserActivityDetail {
  conversations: ConversationReport[]
  simulation_attempts: SimulationAttemptReport[]
}

/**
 * Fetch the read-only users activity recap: quanto ha fatto ogni persona
 * (Super Admin + Organization Admin). The Super Admin may filter by
 * organization; the Organization Admin is always scoped to its own. `days`
 * restringe i conteggi agli ultimi N giorni.
 */
export const fetchUsersReport = (organizationId?: string, days?: number) =>
  apiFetch<UserActivityReport[]>('/api/admin/users-report', {
    params: {
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(days ? { days: String(days) } : {}),
    },
  })

/**
 * Le prove di una persona, una per una, nello stesso periodo dell'elenco:
 * la riga dice "tre conversazioni" e sotto se ne devono aprire tre.
 */
export const fetchUserReportDetail = (userId: string, days?: number) =>
  apiFetch<UserActivityDetail>(`/api/admin/users-report/${userId}`, {
    params: { ...(days ? { days: String(days) } : {}) },
  })

// ── Debriefing di una persona ────────────────

/** Un tema ricorrente: cosa torna, perché è un problema, e su quali prove. */
export interface DebriefingTheme {
  title: string
  detail: string
  evidence: string
}

/** La media di un criterio sulle prove che il debriefing ha letto. */
export interface DebriefingCriterionAverage {
  key: string
  label: string
  average: number
  /** Di quanto è cambiata dal quadro precedente, null se non c'è confronto. */
  delta: number | null
}

/** Come si è mossa la persona rispetto al quadro precedente. */
export type DebriefingDirection = 'up' | 'stable' | 'down'

/**
 * Una versione del quadro d'insieme su una persona: quello che si vede solo
 * guardando più prove insieme, che è l'unica cosa che nessun'altra schermata
 * sa dire.
 *
 * Ogni generazione è una riga sua e nessuna sostituisce quella di prima, che
 * è la ragione per cui `direction` può esistere: come sta andando qualcuno è
 * una domanda che ha risposta solo rispetto a dove era.
 *
 * Tutti i numeri qui dentro sono una fotografia del momento in cui è stato
 * scritto, non di adesso: sono quelli che il modello aveva davanti, e
 * ricalcolarli farebbe comparire una media che il testo accanto non ha mai
 * visto. A dire che il tempo è passato c'è `is_stale`.
 */
export interface UserDebriefing {
  id: string
  user_id: string
  summary: string
  themes: DebriefingTheme[]
  /** null quando nel materiale non si vedeva nessun miglioramento. */
  improving: string | null
  next_step: string
  /** null sul primo quadro di una persona, dove un prima non c'è. */
  direction: DebriefingDirection | null
  change: string | null
  covered_conversations: number
  covered_attempts: number
  covered_until: string
  conversation_average: number | null
  attempt_average: number | null
  criteria_averages: DebriefingCriterionAverage[]
  /* Gli scarti delle medie rispetto al quadro precedente. La direzione qui
   * sopra la legge il modello nelle prove, questi sono una sottrazione: le
   * due cose possono non coincidere, e va bene, perché mezzo punto di media
   * in più non è un miglioramento nel modo di lavorare. */
  conversation_average_delta: number | null
  attempt_average_delta: number | null
  /** La persona ha svolto altre prove dopo che il quadro è stato scritto. */
  is_stale: boolean
  created_at: string
  /** Chi lo ha fatto scrivere. */
  requested_by: string
}

/** Tutti i quadri scritti su questa persona, dal più recente. */
export const fetchUserDebriefings = (userId: string) =>
  apiFetch<UserDebriefing[]>(`/api/admin/users/${userId}/debriefings`)

/** Fa scrivere un quadro nuovo, che si aggiunge a quelli di prima. */
export const generateUserDebriefing = (userId: string) =>
  apiFetch<UserDebriefing>(`/api/admin/users/${userId}/debriefings`, { method: 'POST' })

// ── Evaluations dashboard (read-only) ────────────────

export interface EvaluationCriterionScore {
  key: string
  label: string
  score: number
}

export interface EvaluationReportRow {
  conversation_id: string
  conversation_title: string
  /** Channel it ran on: "voice" for a call, "text" for a chat. */
  mode: ConversationMode
  user_id: string
  user_email: string
  user_nome: string
  user_cognome: string
  organization_id: string | null
  organization_name: string | null
  avatar_id: string
  avatar_name: string
  conversation_at: string
  evaluated_at: string
  /** Il voto che conta: la correzione del docente quando c'è. */
  overall_score: number
  /** Quello proposto dalla macchina, diverso dal precedente solo se corretto. */
  ai_overall_score: number
  has_override: boolean
  /** Un docente è passato di qui (nota, correzione o entrambe). */
  has_review: boolean
  /* Chiave del criterio -> punteggio. Le etichette per esteso stanno una
   * volta sola sulla risposta (`criteria_labels`) e non su ogni riga: sono le
   * stesse sei parole per ogni conversazione, e ripeterle riga per riga era
   * il grosso di questo payload. */
  criteria: Record<string, number>
}

/** Le valutazioni del periodo, con il vocabolario dei criteri accanto. */
export interface EvaluationReportPage {
  /* Chiave -> etichetta per esteso, nell'ordine in cui il valutatore le dà.
   * Restano del server, come vuole il commento in testa a evaluationCriteria:
   * qui non se ne tiene una copia, perché una lista ricopiata a mano col
   * tempo racconta criteri diversi da quelli su cui il giudizio è stato
   * dato. */
  criteria_labels: Record<string, string>
  rows: EvaluationReportRow[]
  /* Vero quando le righe superavano il tetto del server e sono arrivate le
   * più recenti. Non è un errore: è quello che permette alla pagina di dirlo
   * invece di mostrare le medie di una parte dello storico spacciandole per
   * le medie di tutto. */
  truncated: boolean
}

/* Il gemello scritto della riga qui sopra: un test tecnico consegnato.
 *
 * Stessa forma (chi, quando, che voto) perché la dashboard disegna le due
 * metà con gli stessi componenti. Il voto è quello congelato sul tentativo:
 * qui non c'è nessuna correzione del docente da tenere accanto. */
export interface SimulationReportRow {
  attempt_id: string
  simulation_id: string
  simulation_title: string
  /** Come si rispondeva, il gemello di `mode` su una conversazione. */
  simulation_kind: SimulationKind
  /** Chi aveva scritto le domande: "ai" o "manual". */
  simulation_source: SimulationSource
  user_id: string
  user_email: string
  user_nome: string
  user_cognome: string
  organization_id: string | null
  organization_name: string | null
  attempted_at: string
  correct_count: number
  question_count: number
  /** In decimi, la stessa scala delle valutazioni. */
  score: number
}

/** I test consegnati nel periodo, con lo stesso tetto dell'altra metà.
 *  Niente vocabolario: un tentativo non ha criteri, ha domande. */
export interface SimulationReportPage {
  rows: SimulationReportRow[]
  truncated: boolean
}

/**
 * Fetch every evaluated conversation with its scores — the data source for
 * the dashboard charts (Super Admin + Organization Admin).
 */
export interface AdminConversationDetail {
  conversation_id: string
  messages: ChatMessage[]
  evaluation: ConversationEvaluation | null
  /** Fuori dalla valutazione: un docente può aver annotato una trascrizione
   *  che l'AI non ha mai giudicato. */
  review: ConversationReview | null
}

export interface SaveReviewPayload {
  summary_note?: string | null
  /** Da mandare insieme alla motivazione, o per niente. */
  override_score?: number | null
  override_reason?: string | null
}

/** Scrive (o riscrive) la revisione del docente su una conversazione. */
export const saveConversationReview = (conversationId: string, payload: SaveReviewPayload) =>
  apiFetch<ConversationReview>(`/api/admin/conversations/${conversationId}/review`, {
    method: 'PUT',
    body: payload,
  })

/** Ritira la revisione: il voto torna a essere quello della macchina. Le
 *  annotazioni sui messaggi restano, si tolgono una per una. */
export const deleteConversationReview = (conversationId: string) =>
  apiFetch<{ message: string; success: boolean }>(
    `/api/admin/conversations/${conversationId}/review`,
    { method: 'DELETE' },
  )

/** Appunta una nota su un messaggio, sostituendo quella che c'era già:
 *  al massimo una per messaggio. */
export const saveMessageAnnotation = (conversationId: string, messageId: string, note: string) =>
  apiFetch<MessageAnnotation>(`/api/admin/conversations/${conversationId}/annotations`, {
    method: 'PUT',
    body: { message_id: messageId, note },
  })

export const deleteMessageAnnotation = (annotationId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/annotations/${annotationId}`, {
    method: 'DELETE',
  })

/**
 * Fetch the full transcript + stored evaluation of any conversation
 * (Super Admin + Organization Admin) — used by the dashboard detail modal.
 */
export const fetchAdminConversation = (conversationId: string) =>
  apiFetch<AdminConversationDetail>(`/api/admin/conversations/${conversationId}`)

/**
 * Delete any user's conversation together with its messages and evaluation
 * (Super Admin + Organization Admin only — a normal user cannot delete
 * their own conversations).
 */
export const deleteAdminConversation = (conversationId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/conversations/${conversationId}`, {
    method: 'DELETE',
  })

/**
 * Il PDF della valutazione di una conversazione altrui, con le regole di
 * scope di fetchAdminConversation: è lo stesso documento che scarica chi ha
 * tenuto la conversazione, chiesto da un altro endpoint perché quello dello
 * studente serve solo il proprietario.
 */
export const fetchAdminEvaluationPdf = (conversationId: string) =>
  apiFetchBlob(`/api/admin/conversations/${conversationId}/evaluation/pdf`)

/* I tre parametri che il server capisce sono gli stessi per le tre letture,
 * e il foglio Excel non fa eccezione: è quello che si sta guardando, non un
 * estratto suo. `days` restringe agli ultimi N giorni, come nel report
 * attività, e assente vuol dire "da sempre". */
const reportParams = (organizationId?: string, days?: number) => ({
  ...(organizationId ? { organization_id: organizationId } : {}),
  ...(days ? { days: String(days) } : {}),
})

/**
 * The evaluations report as a formatted .xlsx file, same admin scope rules
 * as fetchEvaluationsReport.
 */
export const fetchEvaluationsReportXlsx = (organizationId?: string, days?: number) =>
  apiFetchBlob('/api/admin/evaluations-report/export', {
    params: reportParams(organizationId, days),
  })

export const fetchEvaluationsReport = (organizationId?: string, days?: number) =>
  apiFetch<EvaluationReportPage>('/api/admin/evaluations-report', {
    params: reportParams(organizationId, days),
  })

/** I tentativi sulle simulazioni tecniche, stesse regole di scope. */
export const fetchSimulationsReport = (organizationId?: string, days?: number) =>
  apiFetch<SimulationReportPage>('/api/admin/simulations-report', {
    params: reportParams(organizationId, days),
  })
