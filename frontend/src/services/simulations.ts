/* Simulatore tecnico: test a risposta multipla ricavati da un documento
 * aziendale. Le simulazioni appartengono a un'organizzazione, quindi qui non
 * c'è nessun filtro da replicare: il server serve a ciascuno quelle che può
 * vedere, e al super admin tutte.
 *
 * Le domande che arrivano a chi svolge il test non contengono la risposta
 * esatta: quella entra in scena solo nell'esito, dopo la consegna. È il
 * motivo per cui `SimulationQuestion` e `SimulationQuestionAdmin` sono due
 * tipi diversi e non uno con dei campi opzionali. */

import { apiFetch } from './api'
import type { Authored } from './authorship'

/** In bozza esiste solo per il super admin, pubblicata la vede la sua org. */
export type SimulationStatus = 'draft' | 'published'

/** Quante domande ha un test, come il server pretende per pubblicarlo. */
export const QUESTION_COUNT = 10

export interface SimulationQuestion {
  id: string
  position: number
  text: string
  options: string[]
}

export interface SimulationQuestionAdmin extends SimulationQuestion {
  correct_option: number
  explanation: string
  /** I passaggi del documento da cui la domanda nasce. */
  source_chunks: number[] | null
}

export interface Simulation {
  id: string
  organization_id: string
  organization_name: string
  title: string
  description: string | null
  status: SimulationStatus
  document_name: string
  question_count: number
  created_at: string
  updated_at: string
  /** Come è andata a chi guarda, sull'ultimo tentativo. */
  last_attempt_at: string | null
  last_attempt_score: number | null
  attempt_count: number
}

export interface SimulationDetail extends Simulation {
  questions: SimulationQuestion[]
}

/* La stessa riga con la firma di chi l'ha scritta. La paternità arriva solo
 * dagli endpoint di amministrazione: a chi svolge il test il server non manda
 * l'indirizzo di chi lo ha preparato. */
export interface AdminSimulation extends Simulation, Authored {}

export interface SimulationAdminDetail extends AdminSimulation {
  questions: SimulationQuestionAdmin[]
  document_text: string
  chunk_count: number
  total_attempts: number
}

export interface SimulationAnswerResult {
  question_id: string
  position: number
  text: string
  options: string[]
  /** null quando la domanda è stata lasciata in bianco. */
  selected_option: number | null
  correct_option: number
  is_correct: boolean
  explanation: string
  /** Il testo dei passaggi del documento su cui la domanda si fonda. */
  sources: string[]
}

export interface SimulationAttemptSummary {
  id: string
  simulation_id: string
  simulation_title: string
  user_id: string
  user_email: string
  user_name: string
  correct_count: number
  question_count: number
  /** Il voto in decimi, sulla stessa scala delle valutazioni. */
  score: number
  created_at: string
}

export interface SimulationAttempt extends SimulationAttemptSummary {
  answers: SimulationAnswerResult[]
}

/** Una risposta data: l'indice dell'opzione scelta, o null se in bianco. */
export interface SimulationAnswerPayload {
  question_id: string
  selected_option: number | null
}

export interface SimulationQuestionPayload {
  text: string
  options: string[]
  correct_option: number
  explanation: string
}

// --- Lato di chi svolge il test ---

export const fetchSimulations = () => apiFetch<Simulation[]>('/api/simulations')

export const fetchSimulation = (simulationId: string) =>
  apiFetch<SimulationDetail>(`/api/simulations/${simulationId}`)

export const submitSimulation = (simulationId: string, answers: SimulationAnswerPayload[]) =>
  apiFetch<SimulationAttempt>(`/api/simulations/${simulationId}/attempts`, {
    method: 'POST',
    body: { answers },
  })

/** I propri tentativi su una simulazione, dal più recente. */
export const fetchMyAttempts = (simulationId: string) =>
  apiFetch<SimulationAttemptSummary[]>(`/api/simulations/${simulationId}/attempts`)

export const fetchAttempt = (attemptId: string) =>
  apiFetch<SimulationAttempt>(`/api/simulations/attempts/${attemptId}`)

/** Tutti i tentativi su una simulazione (admin del tenant). */
export const fetchSimulationResults = (simulationId: string) =>
  apiFetch<SimulationAttemptSummary[]>(`/api/simulations/${simulationId}/results`)

// --- Gestione (super admin) ---

export const fetchAdminSimulations = () => apiFetch<AdminSimulation[]>('/api/admin/simulations')

export const fetchAdminSimulation = (simulationId: string) =>
  apiFetch<SimulationAdminDetail>(`/api/admin/simulations/${simulationId}`)

/**
 * Crea la simulazione dal documento caricato. Non genera ancora le domande:
 * quella è una chiamata a parte perché può prendersi minuti, e un modello
 * lento non deve far perdere il documento appena caricato.
 */
export function createSimulation(payload: {
  organizationId: string
  title: string
  description: string
  file: File
}) {
  const form = new FormData()
  form.append('organization_id', payload.organizationId)
  form.append('title', payload.title)
  form.append('description', payload.description)
  form.append('file', payload.file)
  return apiFetch<SimulationAdminDetail>('/api/admin/simulations', {
    method: 'POST',
    body: form,
  })
}

/** Sostituisce il documento e ne reindicizza i passaggi. */
export function replaceSimulationDocument(simulationId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<SimulationAdminDetail>(`/api/admin/simulations/${simulationId}/document`, {
    method: 'POST',
    body: form,
  })
}

/** Genera le domande dal documento. Lenta: è il modello che ragiona. */
export const generateSimulationQuestions = (simulationId: string) =>
  apiFetch<SimulationAdminDetail>(`/api/admin/simulations/${simulationId}/generate`, {
    method: 'POST',
  })

export const updateSimulation = (
  simulationId: string,
  payload: { title: string; description: string },
) =>
  apiFetch<SimulationAdminDetail>(`/api/admin/simulations/${simulationId}`, {
    method: 'PUT',
    body: payload,
  })

/** Salva le domande riviste, tutte insieme. */
export const saveSimulationQuestions = (
  simulationId: string,
  questions: SimulationQuestionPayload[],
) =>
  apiFetch<SimulationAdminDetail>(`/api/admin/simulations/${simulationId}/questions`, {
    method: 'PUT',
    body: { questions },
  })

export const updateSimulationStatus = (simulationId: string, status: SimulationStatus) =>
  apiFetch<SimulationAdminDetail>(`/api/admin/simulations/${simulationId}/status`, {
    method: 'PUT',
    body: { status },
  })

export const deleteSimulation = (simulationId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/simulations/${simulationId}`, {
    method: 'DELETE',
  })
