/* Simulatore tecnico: test ricavati da un documento aziendale, a scelta
 * multipla o a risposta aperta. Le simulazioni appartengono a
 * un'organizzazione, quindi qui non c'è nessun filtro da replicare: il server
 * serve a ciascuno quelle che può vedere, e al super admin tutte.
 *
 * Le domande che arrivano a chi svolge il test non contengono la risposta
 * esatta: quella entra in scena solo nell'esito, dopo la consegna. È il
 * motivo per cui `SimulationQuestion` e `SimulationQuestionAdmin` sono due
 * tipi diversi e non uno con dei campi opzionali. */

import { apiFetch } from './api'
import type { Authored } from './authorship'

/** In bozza esiste solo per il super admin, pubblicata la vede la sua org. */
export type SimulationStatus = 'draft' | 'published'

/* Come si risponde a un test, per tutte le sue domande: scegliendo fra le
 * alternative, oppure scrivendo. Si decide alla creazione e non si cambia
 * più, perché le domande nascono già così. */
export type SimulationKind = 'multiple' | 'open'

/* Chi ha scritto le domande: il modello leggendo un documento, oppure il
 * docente una per una. Anche questo si decide alla creazione: una scritta a
 * mano non ha un documento da cui generare, e una generata ha domande che
 * citano i passaggi da cui nascono. */
export type SimulationSource = 'ai' | 'manual'

/* Quante domande scrive la generazione, e quante ne ha un tentativo.
 *
 * Il serbatoio è tutto quello che si può chiedere su quel documento, e il
 * server lo pretende pieno per pubblicare; le dieci si estraggono a caso
 * quando il test comincia, quindi due prove dello stesso test non sono la
 * stessa fila di domande. Il primo numero lo legge chi prepara i test, il
 * secondo chi li svolge. */
export const POOL_COUNT = 50
export const QUESTION_COUNT = 10

/* Quante alternative può avere una domanda scritta a mano, il gemello di
 * SIMULATION_MIN_OPTIONS e SIMULATION_MAX_OPTIONS nel backend: sotto le due
 * non c'è più niente da scegliere, sopra le sei la domanda non si legge più
 * su un telefono. Quelle generate ne hanno quattro. */
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 6

/** Quante domande servono per pubblicare, il gemello di `required_pool`.
 *
 * Il serbatoio pieno alla generazione non costa niente, cinquanta domande
 * sono la stessa attesa di dieci. A mano sono cinquanta domande scritte una
 * per una, e il minimo diventa quanto serve a comporre un tentativo. */
export function requiredPool(source: SimulationSource): number {
  return source === 'manual' ? QUESTION_COUNT : POOL_COUNT
}

export interface SimulationQuestion {
  id: string
  position: number
  text: string
  /** Vuoto sui test a risposta aperta, dove non c'è niente da scegliere. */
  options: string[]
}

export interface SimulationQuestionAdmin extends SimulationQuestion {
  /** null sui test a risposta aperta. */
  correct_option: number | null
  /** La traccia con cui una risposta scritta viene giudicata. */
  expected_answer: string
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
  kind: SimulationKind
  /* Chi ha scritto le domande. Arriva anche a chi svolge il test, come il
   * tipo: non serve a rispondere, serve a sapere cosa si ha davanti. */
  source: SimulationSource
  document_name: string
  question_count: number
  created_at: string
  updated_at: string
  /** Come è andata a chi guarda, sull'ultimo tentativo. */
  last_attempt_at: string | null
  last_attempt_score: number | null
  attempt_count: number
}

/* Non c'è nessun `SimulationDetail` con dentro le domande: la simulazione si
 * legge per sapere di cosa si tratta e quante domande saranno, le domande
 * arrivano da `startSimulation` quando il test comincia davvero. */

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
  /** Vuoto sulle domande aperte. */
  options: string[]
  /** null quando la domanda è stata lasciata in bianco, o è aperta. */
  selected_option: number | null
  correct_option: number | null
  /** Quello che ha scritto, null se la domanda è rimasta in bianco. */
  answer_text: string | null
  /** La traccia con cui quella risposta è stata giudicata. */
  expected_answer: string
  /** Le due righe con cui il modello motiva i punti di una risposta aperta. */
  feedback: string
  is_correct: boolean
  /** Quanto ci è voluto: null sulle aperte, dove non c'è cronometro. */
  elapsed_ms: number | null
  /* Su una domanda a scelta multipla: da 1 a 0,1 se la risposta è giusta, 0
   * se è sbagliata o in bianco. Su una aperta: quanto la risposta è
   * completa, da 0 a 1. */
  points: number
  explanation: string
  /** Il testo dei passaggi del documento su cui la domanda si fonda. */
  sources: string[]
}

export interface SimulationAttemptSummary {
  id: string
  simulation_id: string
  simulation_title: string
  /** Il tipo del test, che decide come si legge l'esito. */
  simulation_kind: SimulationKind
  /** Chi aveva scritto le domande: "ai" o "manual". */
  simulation_source: SimulationSource
  user_id: string
  user_email: string
  user_name: string
  correct_count: number
  question_count: number
  /** I punti raccolti, da cui il voto: il tempo li fa scendere. */
  earned_points: number
  /** Il voto in decimi, sulla stessa scala delle valutazioni. */
  score: number
  created_at: string
}

export interface SimulationAttempt extends SimulationAttemptSummary {
  answers: SimulationAnswerResult[]
}

/* Una risposta data. Un campo per tipo di test e se ne manda uno solo:
 * l'indice dell'opzione scelta, oppure quello che è stato scritto. Vuoti
 * entrambi vuol dire lasciata in bianco. */
export interface SimulationAnswerPayload {
  question_id: string
  selected_option?: number | null
  answer_text?: string | null
  /** Da quando la domanda è comparsa a quando è stata consegnata. Solo
   * sulle domande a scelta multipla: le aperte non hanno cronometro. */
  elapsed_ms?: number
}

export interface SimulationQuestionPayload {
  text: string
  /** Assenti sulle domande aperte. */
  options: string[] | null
  correct_option: number | null
  expected_answer: string
  explanation: string
}

// --- Lato di chi svolge il test ---

export const fetchSimulations = () => apiFetch<Simulation[]>('/api/simulations')

export const fetchSimulation = (simulationId: string) =>
  apiFetch<Simulation>(`/api/simulations/${simulationId}`)

/**
 * Comincia un tentativo: il server estrae a caso le domande dal serbatoio e
 * le manda, senza le risposte esatte.
 *
 * È una POST perché non è una lettura: la stessa chiamata due volte dà due
 * test diversi, ed è il gesto con cui il test comincia. Quali domande siano
 * state date lo sa solo questo browser, e tornano indietro con la consegna.
 */
export const startSimulation = (simulationId: string) =>
  apiFetch<SimulationQuestion[]>(`/api/simulations/${simulationId}/start`, { method: 'POST' })

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
 * Crea la simulazione, dal documento caricato o vuota da riempire a mano.
 *
 * Non genera ancora le domande: quella è una chiamata a parte perché può
 * prendersi minuti, e un modello lento non deve far perdere il documento
 * appena caricato. Quando le domande le scrive il docente il file non c'è, e
 * il server rifiuterebbe una simulazione a mano che ne porta uno.
 */
export function createSimulation(payload: {
  organizationId: string
  title: string
  description: string
  kind: SimulationKind
  source: SimulationSource
  file: File | null
}) {
  const form = new FormData()
  form.append('organization_id', payload.organizationId)
  form.append('title', payload.title)
  form.append('description', payload.description)
  form.append('kind', payload.kind)
  form.append('source', payload.source)
  if (payload.file) form.append('file', payload.file)
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

/** Elimina un tentativo consegnato, dal report attività. Cancella la
 *  fotografia di quelle risposte, non la simulazione che le ha poste. */
export const deleteSimulationAttempt = (attemptId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/simulation-attempts/${attemptId}`, {
    method: 'DELETE',
  })
