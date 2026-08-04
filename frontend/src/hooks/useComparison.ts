/* Il confronto fra due tentativi della stessa persona: chi si può guardare
 * (solo per un admin) e i tentativi di quella persona.
 *
 * Senza `subjectId` il server risponde con i tentativi di chi sta guardando,
 * quindi la chiave distingue quel caso da una persona scelta: sono due
 * risposte diverse allo stesso endpoint. */

import { useQuery } from '@tanstack/react-query'
import {
  fetchAttempts,
  fetchComparableUsers,
  fetchSimulationAttempts,
} from '../services/comparison'
import { queryKeys } from './queryKeys'

/** Le persone del proprio tenant di cui un admin può leggere i tentativi. */
export function useComparableUsers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.comparison.people,
    queryFn: fetchComparableUsers,
    enabled,
  })
}

/** I tentativi da mettere a confronto: i propri, o quelli della persona scelta. */
export function useAttempts(subjectId?: string) {
  return useQuery({
    queryKey: queryKeys.comparison.attempts(subjectId || undefined),
    queryFn: () => fetchAttempts(subjectId || undefined),
  })
}

/** I test tecnici consegnati dalla stessa persona, l'altra prova. */
export function useSimulationAttempts(subjectId?: string) {
  return useQuery({
    queryKey: queryKeys.comparison.simulationAttempts(subjectId || undefined),
    queryFn: () => fetchSimulationAttempts(subjectId || undefined),
  })
}
