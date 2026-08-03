/* Il simulatore tecnico, lato dati.
 *
 * Due famiglie di hook che stanno insieme perché guardano le stesse righe:
 * quelli di chi svolge il test e quelli di chi lo crea. Ogni scrittura del
 * super admin invalida tutto il prefisso `simulations`, perché pubblicare o
 * ritirare una simulazione cambia anche l'elenco di chi la deve svolgere, e
 * quale delle due liste sia in cache in quel momento non lo sa nessuno. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SimulationAnswerPayload, SimulationQuestionPayload } from '../services/simulations'
import {
  createSimulation,
  deleteSimulation,
  fetchAdminSimulation,
  fetchAdminSimulations,
  fetchAttempt,
  fetchMyAttempts,
  fetchSimulation,
  fetchSimulationResults,
  fetchSimulations,
  generateSimulationQuestions,
  replaceSimulationDocument,
  saveSimulationQuestions,
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

export function useSimulation(simulationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.simulations.detail(simulationId!),
    queryFn: () => fetchSimulation(simulationId!),
    enabled: Boolean(simulationId),
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
