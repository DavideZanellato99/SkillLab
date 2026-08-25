/* Il confronto fra due tentativi della stessa persona: chi si può guardare
 * (solo per un admin) e i tentativi di quella persona.
 *
 * Senza `subjectId` il server risponde con i tentativi di chi sta guardando,
 * quindi la chiave distingue quel caso da una persona scelta: sono due
 * risposte diverse allo stesso endpoint. */

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchAttempts,
  fetchComparableUsers,
  fetchSimulationAttempts,
} from '../services/comparison'
import { queryKeys } from './queryKeys'

/* Le prove già svolte non cambiano mentre si guarda un confronto: una
 * conversazione valutata e un test consegnato sono cose finite, e l'unica
 * che si muove è la correzione del docente, che parte da questa stessa
 * schermata e ricarica da sé. Senza intervallo, ogni ritorno alla pagina e
 * ogni finestra che tornava in primo piano rifacevano tre chiamate. */
const COMPARISON_STALE_TIME = 1000 * 60 * 5

/** Le persone del proprio tenant di cui un admin può leggere i tentativi. */
export function useComparableUsers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.comparison.people,
    queryFn: fetchComparableUsers,
    enabled,
    staleTime: COMPARISON_STALE_TIME,
  })
}

/** I tentativi da mettere a confronto: i propri, o quelli della persona scelta. */
export function useAttempts(subjectId?: string) {
  return useQuery({
    queryKey: queryKeys.comparison.attempts(subjectId || undefined),
    queryFn: () => fetchAttempts(subjectId || undefined),
    staleTime: COMPARISON_STALE_TIME,
    /* Cambiare persona tiene a schermo le prove di prima finché non
       arrivano le nuove: svuotare la pagina per mezzo secondo farebbe
       sparire i filtri e la fila proprio nel gesto che si ripete di più,
       cioè scorrere le persone di un'aula una dopo l'altra. */
    placeholderData: keepPreviousData,
  })
}

/** I test tecnici consegnati dalla stessa persona, l'altra prova. */
export function useSimulationAttempts(subjectId?: string) {
  return useQuery({
    queryKey: queryKeys.comparison.simulationAttempts(subjectId || undefined),
    queryFn: () => fetchSimulationAttempts(subjectId || undefined),
    staleTime: COMPARISON_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}
