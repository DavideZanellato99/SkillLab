/* Le quattro dashboard che stanno accanto a quella dei punteggi.
 *
 * Quella dei punteggi legge i rendiconti di `/api/admin` e sta in
 * `services/admin`, insieme alle altre letture dell'amministrazione. Queste
 * quattro rispondono a domande diverse sulle stesse prove e hanno un proprio
 * prefisso sul server (`/api/dashboards`), quindi stanno in un file loro:
 *
 * - i percorsi, cioè se il programma funziona;
 * - i contenuti, cioè cosa è tarato male;
 * - l'utilizzo per organizzazione, che è del solo super admin;
 * - i propri progressi, che è la stessa domanda fatta su di sé da chi si
 *   allena, e l'unica di qui che non passa dall'amministrazione.
 *
 * I due parametri sono quelli di sempre, organizzazione e periodo: sono i
 * filtri che il server capisce, cioè quelli che decidono quali righe
 * arrivano. */

import { apiFetch } from './api'
import type { ConversationMode } from './api'
import type { SimulationKind, SimulationSource } from './simulations'

/** Lo stato di un percorso o di una tappa, come lo scrive il server. */
export type AssignmentStatus = 'active' | 'completed' | 'completed_late' | 'overdue' | 'locked'

/* ── I percorsi ── */

/** Una tappa vista su tutti quelli che la stanno percorrendo. */
export interface PathStepStats {
  position: number
  label: string
  /** "avatar" per una conversazione, "simulation" per un test tecnico. */
  kind: 'avatar' | 'simulation'
  target_score: number
  /* Quanti l'hanno sbloccata, cioè quanti ci sono arrivati: è su questo che
   * si misura `passed`, perché l'ultima tappa di un percorso lungo la
   * raggiungono in pochi. */
  reached: number
  passed: number
  /** Superate dopo la data della tappa, e comprese dentro `passed`. */
  late: number
  overdue: number
  /** Null quando non l'ha sbloccata nessuno: lì non c'è niente da leggere. */
  avg_attempts: number | null
  avg_best_score: number | null
}

export interface PathStats {
  path_id: string
  title: string
  organization_name: string | null
  assignments: number
  active: number
  completed: number
  completed_late: number
  overdue: number
  completion_rate: number
  /** Giorni medi dall'affidamento alla chiusura, sui soli percorsi chiusi. */
  avg_days_to_complete: number | null
  steps: PathStepStats[]
}

/** Una tappa con una data, di chi la sta percorrendo adesso. */
export interface PathDeadline {
  assignment_id: string
  path_id: string
  path_title: string
  user_id: string
  user_name: string
  user_email: string
  step_position: number
  step_label: string
  due_at: string
  status: 'active' | 'overdue'
}

export interface PathsDashboard {
  assignments: number
  people: number
  active: number
  completed: number
  completed_late: number
  overdue: number
  completion_rate: number
  avg_days_to_complete: number | null
  paths: PathStats[]
  deadlines: PathDeadline[]
}

/* ── I contenuti ── */

export interface AvatarStats {
  avatar_id: string
  avatar_name: string
  conversations: number
  people: number
  avg_score: number
  /** Conversazioni chiuse sotto la sufficienza. */
  below_pass: number
  weakest_criterion_key: string | null
  weakest_criterion_avg: number | null
  criteria: Record<string, number>
  last_at: string
}

export interface SimulationStats {
  simulation_id: string
  simulation_title: string
  simulation_kind: SimulationKind
  simulation_source: SimulationSource
  attempts: number
  people: number
  avg_score: number
  /** Percentuale di risposte esatte su tutte le domande poste. */
  correct_rate: number
  below_pass: number
  last_at: string
}

export interface ContentDashboard {
  criteria_labels: Record<string, string>
  /** Ordinati dalla media più bassa: in cima c'è quello che si sta cercando. */
  avatars: AvatarStats[]
  simulations: SimulationStats[]
  truncated: boolean
}

/** Una domanda e come è andata a chi se l'è trovata davanti. */
export interface SimulationItemStats {
  question_id: string
  text: string
  answers: number
  correct: number
  /** Lasciate in bianco: sono dentro `answers` e fuori da `correct`. */
  unanswered: number
  correct_rate: number
  /** Solo dove il cronometro c'è, cioè sulla scelta multipla. */
  avg_seconds: number | null
}

export interface SimulationItemsReport {
  simulation_id: string
  simulation_title: string
  simulation_kind: SimulationKind
  attempts: number
  items: SimulationItemStats[]
  truncated: boolean
}

/* ── L'utilizzo ── */

export interface OrganizationUsage {
  organization_id: string
  organization_name: string
  people: number
  /** Quanti hanno svolto almeno una prova: è il rapporto con `people` a dire
   *  se la piattaforma sta servendo a qualcuno. */
  active_people: number
  conversations: number
  voice_conversations: number
  text_conversations: number
  attempts: number
  total_duration_seconds: number
  last_activity_at: string | null
}

export interface UsageDay {
  day: string
  conversations: number
  attempts: number
}

export interface UsageDashboard {
  organizations: OrganizationUsage[]
  people: number
  active_people: number
  conversations: number
  attempts: number
  total_duration_seconds: number
  daily: UsageDay[]
}

/* ── I propri progressi ── */

export interface MyProgressConversation {
  conversation_id: string
  title: string
  mode: ConversationMode
  avatar_name: string
  conversation_at: string
  /** Il voto finale, correzione del docente compresa. */
  score: number
  has_override: boolean
  criteria: Record<string, number>
}

export interface MyProgressSimulation {
  attempt_id: string
  simulation_id: string
  simulation_title: string
  simulation_kind: SimulationKind
  attempted_at: string
  score: number
  correct_count: number
  question_count: number
}

export interface MyProgress {
  criteria_labels: Record<string, string>
  conversations: MyProgressConversation[]
  simulations: MyProgressSimulation[]
}

/* I due parametri che il server capisce, gli stessi dei rendiconti: assenti
 * vuol dire tutte le organizzazioni e da sempre. */
const scopeParams = (organizationId?: string, days?: number) => ({
  ...(organizationId ? { organization_id: organizationId } : {}),
  ...(days ? { days: String(days) } : {}),
})

/** L'avanzamento dei percorsi affidati (super admin e organization admin). */
export const fetchPathsDashboard = (organizationId?: string, days?: number) =>
  apiFetch<PathsDashboard>('/api/dashboards/paths', { params: scopeParams(organizationId, days) })

/** Quanto è difficile quello che è stato scritto: gli avatar e i test. */
export const fetchContentDashboard = (organizationId?: string, days?: number) =>
  apiFetch<ContentDashboard>('/api/dashboards/content', {
    params: scopeParams(organizationId, days),
  })

/** Le domande di un test, una per una: si legge aprendo la sua riga. */
export const fetchSimulationItems = (
  simulationId: string,
  organizationId?: string,
  days?: number,
) =>
  apiFetch<SimulationItemsReport>(`/api/dashboards/content/simulations/${simulationId}`, {
    params: scopeParams(organizationId, days),
  })

/** L'utilizzo per organizzazione: solo super admin, niente filtro tenant. */
export const fetchUsageDashboard = (days?: number) =>
  apiFetch<UsageDashboard>('/api/dashboards/usage', { params: scopeParams(undefined, days) })

/** Le proprie prove, per chi si allena. */
export const fetchMyProgress = (days?: number) =>
  apiFetch<MyProgress>('/api/dashboards/me', { params: scopeParams(undefined, days) })
