/* Le tre dashboard che stanno accanto a quella dei punteggi.
 *
 * Quella dei punteggi legge i rendiconti di `/api/admin` e sta in
 * `services/admin`, insieme alle altre letture dell'amministrazione. Queste
 * tre rispondono a domande diverse sulle stesse prove e hanno un proprio
 * prefisso sul server (`/api/dashboards`), quindi stanno in un file loro:
 *
 * - i percorsi, cioè se il programma funziona;
 * - l'utilizzo per organizzazione, che è del solo super admin;
 * - i propri progressi, che è la stessa domanda fatta su di sé da chi si
 *   allena, e l'unica di qui che non passa dall'amministrazione.
 *
 * I due parametri sono quelli di sempre, organizzazione e periodo: sono i
 * filtri che il server capisce, cioè quelli che decidono quali righe
 * arrivano. */

import { apiFetch } from './api'
import type { ConversationMode } from './api'
import type { SimulationKind } from './simulations'

/* ── I percorsi ── */

/** I percorsi assegnati, in quattro numeri: quanti, quanti chiusi, in
 *  quanti giorni, quanti scaduti. Il dettaglio persona per persona sta nella
 *  gestione percorsi. */
export interface PathsDashboard {
  assignments: number
  people: number
  active: number
  completed: number
  completed_late: number
  overdue: number
  completion_rate: number
  /** Giorni medi dall'assegnazione alla chiusura, sui soli percorsi chiusi. */
  avg_days_to_complete: number | null
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

/** L'avanzamento dei percorsi assegnati (super admin e organization admin). */
export const fetchPathsDashboard = (organizationId?: string, days?: number) =>
  apiFetch<PathsDashboard>('/api/dashboards/paths', { params: scopeParams(organizationId, days) })

/** L'utilizzo per organizzazione: solo super admin, niente filtro tenant. */
export const fetchUsageDashboard = (days?: number) =>
  apiFetch<UsageDashboard>('/api/dashboards/usage', { params: scopeParams(undefined, days) })

/** Le proprie prove, per chi si allena. */
export const fetchMyProgress = (days?: number) =>
  apiFetch<MyProgress>('/api/dashboards/me', { params: scopeParams(undefined, days) })
