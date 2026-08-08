/* I percorsi di training: un admin ne compone uno fatto di tappe numerate e
 * lo affida a più persone, poi da qui ne segue l'avanzamento.
 *
 * Lo stato di una tappa è derivato dalle prove svolte, quindi non si scrive
 * mai: cambia quando arriva una valutazione o un test consegnato. Le
 * scritture qui sono la composizione del percorso e l'assegnazione, e
 * invalidano anche le notifiche, che dalle stesse tappe sono ricavate.
 *
 * Riscrivere un percorso invalida tutto il ramo `training` e non solo il
 * percorso toccato: le tappe che cambia le stanno percorrendo delle persone,
 * quindi anche le loro assegnazioni raccontano adesso qualcosa di diverso. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AssignPathPayload, PathWritePayload } from '../services/training'
import {
  assignPath,
  createPath,
  deleteAssignment,
  deletePath,
  fetchAssignableContent,
  fetchAssignableUsers,
  fetchAssignments,
  fetchMyAssignments,
  fetchPaths,
  updatePath,
} from '../services/training'
import { queryKeys } from './queryKeys'

/** I percorsi componibili, filtrabili per organizzazione. */
export function usePaths(organizationId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.training.paths(organizationId || undefined),
    queryFn: () => fetchPaths(organizationId || undefined),
    enabled,
  })
}

/** I percorsi affidati che un admin segue, per organizzazione o per percorso. */
export function useAssignments(organizationId?: string, pathId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.training.assignments(organizationId || undefined, pathId || undefined),
    queryFn: () => fetchAssignments(organizationId || undefined, pathId || undefined),
    enabled,
  })
}

/** I propri percorsi, per la striscia in cima alla home. */
export function useMyAssignments() {
  return useQuery({
    queryKey: queryKeys.training.mine,
    queryFn: fetchMyAssignments,
  })
}

/**
 * Di cosa può essere fatta una tappa in quell'organizzazione.
 *
 * Lo decide il server, che applica la stessa regola con cui poi accetta o
 * rifiuta la tappa: gli avatar attivi e le simulazioni pubblicate di quel
 * tenant. Resta in attesa finché un'organizzazione non è stata scelta.
 */
export function useAssignableContent(organizationId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.training.assignableContent(organizationId!),
    queryFn: () => fetchAssignableContent(organizationId!),
    enabled: organizationId !== null && enabled,
  })
}

/**
 * Chi può ricevere il percorso.
 *
 * Sono gli utenti attivi del tenant a cui il percorso appartiene, e lo
 * decide il server con la stessa regola che usa per accettare
 * l'assegnazione.
 */
export function useAssignableUsers(organizationId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.training.assignableUsers(organizationId!),
    queryFn: () => fetchAssignableUsers(organizationId!),
    enabled: organizationId !== null && enabled,
  })
}

/* Comporre, affidare o ritirare cambia anche le notifiche di chi il percorso
 * ce l'ha. */
function useInvalidateTraining() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.training.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
  }
}

export function useCreatePath() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: (payload: PathWritePayload) => createPath(payload),
    onSuccess: invalidate,
  })
}

export function useUpdatePath() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: ({ pathId, payload }: { pathId: string; payload: PathWritePayload }) =>
      updatePath(pathId, payload),
    onSuccess: invalidate,
  })
}

export function useDeletePath() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: (pathId: string) => deletePath(pathId),
    onSuccess: invalidate,
  })
}

export function useAssignPath() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: (payload: AssignPathPayload) => assignPath(payload),
    onSuccess: invalidate,
  })
}

export function useDeleteAssignment() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: (assignmentId: string) => deleteAssignment(assignmentId),
    onSuccess: invalidate,
  })
}
