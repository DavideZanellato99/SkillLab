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
  draftPath,
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

/**
 * I propri percorsi, con il progresso di ogni tappa.
 *
 * Li chiedono l'elenco e la mappa, dove ci arriva solo chi si allena, ma
 * anche la chat e il simulatore, per dire che la prova che si sta per fare è
 * la tappa di un percorso: quelle due schermate le apre anche chi amministra,
 * e a lui questa rotta risponde 403, non un elenco vuoto. Da qui l'interruttore,
 * che è dove il chiamante dichiara di essere in un posto dove la domanda ha
 * senso, invece di far scoprire il ruolo a questo file.
 */
export function useMyAssignments(enabled = true) {
  return useQuery({
    queryKey: queryKeys.training.mine,
    queryFn: fetchMyAssignments,
    enabled,
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

/**
 * Fa comporre una bozza di percorso da un obiettivo raccontato a parole.
 *
 * Non invalida niente, ed è la differenza che conta rispetto alle tre
 * mutation qui sotto: questa non scrive nel database, restituisce una
 * proposta al form. Finché nessuno preme "crea il percorso" non è successo
 * niente che un elenco debba rileggere.
 */
export function useDraftPath() {
  return useMutation({
    mutationFn: ({ goal, organizationId }: { goal: string; organizationId?: string }) =>
      draftPath(goal, organizationId),
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
