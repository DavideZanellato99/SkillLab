/* I percorsi di training: un admin assegna a uno o più utenti un obiettivo
 * su un avatar, e da qui ne segue il completamento.
 *
 * Lo stato di un percorso è derivato dalle valutazioni, quindi non si scrive
 * mai: cambia quando arriva una valutazione nuova. Le scritture qui sono solo
 * l'assegnazione e la sua revoca, e invalidano anche le notifiche, che dagli
 * obiettivi assegnati sono ricavate. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateAssignmentsPayload } from '../services/training'
import {
  fetchMyAssignments,
  fetchAssignments,
  fetchAssignableUsers,
  createAssignments,
  deleteAssignment,
} from '../services/training'
import { queryKeys } from './queryKeys'

/** I percorsi che un admin gestisce, filtrabili per organizzazione. */
export function useAssignments(organizationId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.training.assignments(organizationId || undefined),
    queryFn: () => fetchAssignments(organizationId || undefined),
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
 * Chi può ricevere l'avatar scelto come obiettivo.
 *
 * Lo decide il server, che applica la stessa regola con cui poi accetta o
 * rifiuta l'assegnazione: sono gli utenti attivi del tenant a cui l'avatar
 * appartiene. Resta in attesa finché un avatar non è stato scelto.
 */
export function useAssignableUsers(organizationId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.training.assignableUsers(organizationId!),
    queryFn: () => fetchAssignableUsers(organizationId!),
    enabled: organizationId !== null && enabled,
  })
}

/* Assegnare o revocare cambia anche le notifiche di chi riceve il percorso. */
function useInvalidateTraining() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.training.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
  }
}

export function useCreateAssignments() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: (payload: CreateAssignmentsPayload) => createAssignments(payload),
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
