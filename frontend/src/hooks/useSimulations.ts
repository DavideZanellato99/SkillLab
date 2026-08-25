/* Il simulatore tecnico, lato dati.
 *
 * Due famiglie di hook che stanno insieme perché guardano le stesse righe:
 * quelli di chi svolge il test e quelli di chi lo crea. Ogni scrittura del
 * super admin invalida tutto il prefisso `simulations`, perché pubblicare o
 * ritirare una simulazione cambia anche l'elenco di chi la deve svolgere, e
 * quale delle due liste sia in cache in quel momento non lo sa nessuno. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Simulation,
  SimulationAnswerPayload,
  SimulationQuestionPayload,
} from '../services/simulations'
import {
  createSimulation,
  deleteSimulation,
  deleteSimulationAttempt,
  fetchAdminSimulation,
  fetchAdminSimulations,
  fetchAttempt,
  fetchMyAttempts,
  fetchSimulation,
  fetchSimulationResults,
  fetchSimulations,
  generateSimulationQuestions,
  replaceSimulationDocument,
  reviewSimulationPool,
  saveSimulationQuestions,
  startSimulation,
  submitSimulation,
  updateSimulation,
  updateSimulationStatus,
} from '../services/simulations'
import { queryKeys } from './queryKeys'

// --- Chi svolge il test ---

export function useSimulations() {
  return useQuery({
    queryKey: queryKeys.simulations.list,
    queryFn: fetchSimulations,
  })
}

/**
 * Il test prima di cominciarlo: il titolo, il tipo, quante domande sono.
 *
 * Ci si arriva quasi sempre dall'elenco, che ha già in cache esattamente
 * questa riga: il dettaglio è lo stesso schema della lista, senza un campo
 * in più. Quindi si parte da quella invece che da una schermata di
 * caricamento, e le regole del test compaiono nell'istante in cui si preme
 * la scheda.
 *
 * Non è una copia che resta lì: `initialDataUpdatedAt` porta con sé anche
 * *quando* la lista era stata letta, quindi il dettaglio nasce vecchio
 * quanto lei e si ricontrolla da solo appena scade, invece di fidarsi per
 * un minuto di dati che sullo schermo erano già da dieci. Chi apre
 * l'indirizzo di un test direttamente non trova niente in cache, e la
 * chiamata parte come prima.
 */
export function useSimulation(simulationId: string | undefined) {
  const queryClient = useQueryClient()
  const fromList = () =>
    queryClient
      .getQueryData<Simulation[]>(queryKeys.simulations.list)
      ?.find((simulation) => simulation.id === simulationId)

  return useQuery({
    queryKey: queryKeys.simulations.detail(simulationId!),
    queryFn: () => fetchSimulation(simulationId!),
    enabled: Boolean(simulationId),
    initialData: fromList,
    initialDataUpdatedAt: () =>
      fromList() ? queryClient.getQueryState(queryKeys.simulations.list)?.dataUpdatedAt : undefined,
  })
}

/**
 * Comincia il test e riceve le domande estratte per questo tentativo.
 *
 * È una mutation e non una query, e non è un dettaglio tecnico: le domande
 * non sono un dato da tenere in cache e da riprendere quando la finestra
 * torna in primo piano, sono l'esito di un'estrazione fatta una volta. Una
 * query le rifarebbe estrarre a metà test, cambiando le domande sotto le
 * mani di chi sta rispondendo.
 */
export function useStartSimulation(simulationId: string) {
  return useMutation({
    mutationFn: () => startSimulation(simulationId),
  })
}

export function useMyAttempts(simulationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.simulations.attempts(simulationId!),
    queryFn: () => fetchMyAttempts(simulationId!),
    enabled: Boolean(simulationId),
  })
}

export function useAttempt(attemptId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.simulations.attempt(attemptId!),
    queryFn: () => fetchAttempt(attemptId!),
    enabled: Boolean(attemptId),
  })
}

/** Tutti i tentativi su una simulazione, per gli admin del tenant. */
export function useSimulationResults(simulationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.simulations.results(simulationId!),
    queryFn: () => fetchSimulationResults(simulationId!),
    enabled: Boolean(simulationId) && enabled,
  })
}

/* Consegnare un test aggiunge un tentativo, quindi cambia sia l'elenco dei
 * propri tentativi sia la riga della simulazione, che mostra come è andato
 * l'ultimo. */
export function useSubmitSimulation(simulationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (answers: SimulationAnswerPayload[]) => submitSimulation(simulationId, answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.simulations.all })
    },
  })
}

// --- Gestione (super admin) ---

export function useAdminSimulations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.simulations.adminList,
    queryFn: fetchAdminSimulations,
    enabled,
  })
}

export function useAdminSimulation(simulationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.simulations.adminDetail(simulationId!),
    queryFn: () => fetchAdminSimulation(simulationId!),
    enabled: Boolean(simulationId),
  })
}

function useInvalidateSimulations() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.simulations.all })
}

export function useCreateSimulation() {
  const invalidate = useInvalidateSimulations()
  return useMutation({
    mutationFn: createSimulation,
    onSuccess: invalidate,
  })
}

export function useReplaceSimulationDocument(simulationId: string) {
  const invalidate = useInvalidateSimulations()
  return useMutation({
    mutationFn: (file: File) => replaceSimulationDocument(simulationId, file),
    onSuccess: invalidate,
  })
}

/**
 * La generazione delle domande.
 *
 * È l'unica chiamata dell'app che può prendersi minuti: sono due passate su
 * un modello di ragionamento con il recupero semantico in mezzo. Non ha
 * ritentativi automatici, perché ripartire da capo da solo raddoppierebbe
 * l'attesa proprio quando è già lunga.
 */
export function useGenerateQuestions(simulationId: string) {
  const invalidate = useInvalidateSimulations()
  return useMutation({
    mutationFn: () => generateSimulationQuestions(simulationId),
    retry: false,
    onSuccess: invalidate,
  })
}

/**
 * Il controllo del serbatoio.
 *
 * Lento come la generazione e senza ritentativi automatici, per la stessa
 * ragione: indicizza le cinquanta domande e ne fa rileggere una parte al
 * modello, e ripartire da capo da solo raddoppierebbe un'attesa già lunga.
 */
export function useReviewPool(simulationId: string) {
  const invalidate = useInvalidateSimulations()
  return useMutation({
    mutationFn: () => reviewSimulationPool(simulationId),
    retry: false,
    onSuccess: invalidate,
  })
}

export function useUpdateSimulation(simulationId: string) {
  const invalidate = useInvalidateSimulations()
  return useMutation({
    mutationFn: (payload: { title: string; description: string }) =>
      updateSimulation(simulationId, payload),
    onSuccess: invalidate,
  })
}

export function useSaveQuestions(simulationId: string) {
  const invalidate = useInvalidateSimulations()
  return useMutation({
    mutationFn: (questions: SimulationQuestionPayload[]) =>
      saveSimulationQuestions(simulationId, questions),
    onSuccess: invalidate,
  })
}

export function useUpdateSimulationStatus(simulationId: string) {
  const invalidate = useInvalidateSimulations()
  return useMutation({
    mutationFn: (status: 'draft' | 'published') => updateSimulationStatus(simulationId, status),
    onSuccess: invalidate,
  })
}

export function useDeleteSimulation() {
  const invalidate = useInvalidateSimulations()
  return useMutation({
    mutationFn: (simulationId: string) => deleteSimulation(simulationId),
    onSuccess: invalidate,
  })
}

/** Elimina un test consegnato, dal report attività. La simulazione resta:
 *  sparisce la fotografia di quelle risposte, non il test.
 *
 *  Insieme agli elenchi si invalidano i report, che contano i tentativi e ne
 *  fanno le medie. */
export function useDeleteSimulationAttempt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (attemptId: string) => deleteSimulationAttempt(attemptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.simulations.all })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
