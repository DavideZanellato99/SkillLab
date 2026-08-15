/* Percorsi di training: modelli riusabili fatti di tappe numerate, che un
 * admin compone una volta e affida a quante persone vuole.
 *
 * Una tappa è un obiettivo su un avatar o su una simulazione tecnica, e la
 * successiva si apre solo quando quella prima di lei è stata superata. Lo
 * stato di ogni tappa lo deriva il backend a ogni lettura, mai memorizzato:
 * qui non c'è niente da ricalcolare e niente da invalidare a mano.
 *
 * Compongono e assegnano sia il super admin sia l'organization admin; a
 * quest'ultimo il server impone comunque il proprio tenant, quindi qui non
 * c'è nessun controllo di ruolo da replicare. */

import { apiFetch } from './api'
import type { AuthUser } from './auth'

/**
 * "locked": la tappa prima non è ancora superata, quindi questa non conta
 * nemmeno. "active": aperta. "overdue": la data è passata. "completed":
 * obiettivo raggiunto. "completed_late": raggiunto dopo la scadenza.
 *
 * Lo stato dice se la tappa è in tempo, non se si può cominciare: una tappa
 * ancora chiusa la cui data è passata risponde "overdue", e a dire che non è
 * aperta resta `unlocked_at` vuoto (vedi `isStepLocked`).
 *
 * Solo una tappa può essere "locked": un percorso è aperto finché ha una
 * tappa da fare, e quale sia lo dice la tappa stessa.
 */
export type AssignmentStatus = 'locked' | 'active' | 'overdue' | 'completed' | 'completed_late'

/** Di cosa è fatta una tappa: una conversazione o un test tecnico. */
export type StepKind = 'avatar' | 'simulation'

/** Una tappa come la si compone: uno dei due bersagli, mai tutti e due. */
export interface PathStepInput {
  avatar_id?: string | null
  simulation_id?: string | null
  target_score: number
  /** Entro quando va chiusa, ISO 8601 con il fuso di chi la scrive. */
  due_at?: string | null
}

/** Una tappa come la si legge, con il nome del suo bersaglio già risolto. */
export interface PathStep {
  id: string
  /** Posto nella fila, da 1 e senza buchi. */
  position: number
  kind: StepKind
  target_score: number
  /** Entro quando va chiusa, o null se la tappa non scade. */
  due_at: string | null
  avatar_id: string | null
  avatar_name: string | null
  avatar_category: string | null
  /** Tinta della categoria, per la targhetta (vedi categoryStyles). */
  avatar_category_color: string
  simulation_id: string | null
  simulation_title: string | null
  simulation_kind: string | null
}

/** Una tappa vista da chi la sta percorrendo. */
export interface StepProgress extends PathStep {
  status: AssignmentStatus
  /** Da quando la tappa conta, assente finché è bloccata. La scadenza no:
   *  è scritta sulla tappa e la porta già `PathStep`. */
  unlocked_at: string | null
  /** Prove svolte dopo lo sblocco. */
  attempts: number
  best_score: number | null
  achieved_at: string | null
}

/** Un percorso nell'elenco di chi lo governa. */
export interface TrainingPath {
  id: string
  organization_id: string
  organization_name: string
  title: string
  description: string | null
  steps: PathStep[]
  /** Quante persone lo stanno percorrendo. */
  assigned_count: number
  created_at: string
  updated_at: string
}

/** Un percorso affidato a una persona, con il progresso di ogni tappa. */
export interface PathAssignment {
  id: string
  path_id: string
  path_title: string
  path_description: string | null
  user_id: string
  user_name: string
  user_email: string
  organization_id: string | null
  organization_name: string | null
  created_at: string
  /** Chi l'ha affidato, assente quando quell'account non c'è più. */
  assigned_by_name: string | null
  status: AssignmentStatus
  steps: StepProgress[]
  completed_steps: number
  /** La tappa da fare adesso, assente a percorso finito. */
  current_position: number | null
}

export interface PathWritePayload {
  title: string
  description?: string | null
  /** Solo il super admin lo passa: all'org admin il server impone il proprio. */
  organization_id?: string | null
  steps: PathStepInput[]
}

export interface AssignPathPayload {
  path_id: string
  user_ids: string[]
}

/** Di cosa può essere fatta una tappa, in un'organizzazione sola. */
export interface AssignableContent {
  avatars: {
    id: string
    name: string
    category: string
    category_color: string
  }[]
  simulations: {
    id: string
    title: string
    kind: string
  }[]
}

/** Una tappa come il modello la propone: il bersaglio, la soglia, e perché. */
export interface PathDraftStep {
  avatar_id: string | null
  simulation_id: string | null
  target_score: number
  /** Perché questa tappa e perché in questo punto della fila. Non si salva:
   *  serve a chi rilegge la proposta prima di accettarla. */
  reason: string
}

/**
 * Un percorso proposto dal modello, che nessuno ha ancora salvato.
 *
 * Le tappe arrivano già nell'ordine in cui vanno superate, e senza scadenze:
 * una data dipende da quando il corso comincia, che è la cosa che il modello
 * non può sapere, e la mette chi compone.
 */
export interface TrainingPathDraft {
  title: string
  description: string | null
  steps: PathDraftStep[]
}

/**
 * Fa comporre una bozza di percorso da un obiettivo raccontato a parole.
 *
 * Non salva niente: torna una proposta al form di chi l'ha chiesta, e il
 * percorso nasce con la creazione, che è un'altra richiesta.
 */
export const draftPath = (goal: string, organizationId?: string) =>
  apiFetch<TrainingPathDraft>('/api/training/paths/draft', {
    method: 'POST',
    body: { goal, ...(organizationId ? { organization_id: organizationId } : {}) },
  })

/** I percorsi componibili nello scope dell'admin. */
export const fetchPaths = (organizationId?: string) =>
  apiFetch<TrainingPath[]>('/api/training/paths', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  })

export const createPath = (payload: PathWritePayload) =>
  apiFetch<TrainingPath>('/api/training/paths', { method: 'POST', body: payload })

/** Riscrive un percorso, tappe comprese: vale subito per chi lo sta facendo. */
export const updatePath = (pathId: string, payload: PathWritePayload) =>
  apiFetch<TrainingPath>(`/api/training/paths/${pathId}`, { method: 'PUT', body: payload })

export const deletePath = (pathId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/training/paths/${pathId}`, {
    method: 'DELETE',
  })

/**
 * Gli avatar e i test di cui una tappa può essere fatta.
 *
 * La regola vive sul server, accanto alla validazione che rifiuta una tappa
 * sbagliata: filtrare qui un catalogo completo significherebbe tenerne una
 * copia libera di divergere da quella.
 */
export const fetchAssignableContent = (organizationId?: string) =>
  apiFetch<AssignableContent>('/api/training/assignable-content', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  })

/**
 * Le persone a cui un percorso di quell'organizzazione può essere affidato:
 * attive, del tenant del percorso, super admin esclusi.
 *
 * All'org admin il server impone la propria organizzazione, quindi il
 * parametro può restare vuoto; al super admin serve, perché "tutte" non è
 * una risposta valida.
 */
export const fetchAssignableUsers = (organizationId?: string) =>
  apiFetch<AuthUser[]>('/api/training/assignable-users', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  })

/** I percorsi dell'utente corrente, per la home. */
export const fetchMyAssignments = () => apiFetch<PathAssignment[]>('/api/training/assignments/me')

/** I percorsi affidati nello scope dell'admin, filtrabili per percorso. */
export const fetchAssignments = (organizationId?: string, pathId?: string) =>
  apiFetch<PathAssignment[]>('/api/training/assignments', {
    params: {
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(pathId ? { path_id: pathId } : {}),
    },
  })

/** Affida un percorso a una o più persone (admin). */
export const assignPath = (payload: AssignPathPayload) =>
  apiFetch<PathAssignment[]>('/api/training/assignments', { method: 'POST', body: payload })

/** Ritira un percorso a una persona (admin, solo nel proprio scope). */
export const deleteAssignment = (assignmentId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/training/assignments/${assignmentId}`, {
    method: 'DELETE',
  })
