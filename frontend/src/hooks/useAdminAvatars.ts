/* Il catalogo degli avatar visto da un admin, con le sue scritture.
 *
 * È un elenco diverso da quello della galleria (`useAvatars`): questo porta
 * anche gli archiviati, il tenant proprietario e la scheda persona, e lo
 * legge solo chi può modificarli. Le due cose restano quindi due query, ma
 * ogni scrittura invalida entrambe: un avatar creato o archiviato cambia
 * anche quello che vedono gli studenti.
 *
 * Restano fuori l'anteprima del prompt e quella della voce: sono due
 * richieste su richiesta esplicita che non lasciano stato da tenere. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminAvatarPayload, PersonaDraftPayload } from '../services/admin'
import {
  fetchAdminAvatars,
  createAvatar,
  updateAvatar,
  deleteAvatar,
  restoreAvatar,
  uploadAvatarImage,
  fetchVoices,
  draftPersona,
} from '../services/admin'
import { queryKeys } from './queryKeys'

/** Il catalogo admin. `includeDeleted` fa parte della chiave: con e senza gli
 *  archiviati sono due risposte diverse dello stesso endpoint. */
export function useAdminAvatars(includeDeleted = false, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.avatars.all, 'admin', includeDeleted] as const,
    queryFn: () => fetchAdminAvatars(includeDeleted),
    enabled,
  })
}

/** Le voci disponibili per gli avatar: un catalogo che cambia solo quando lo
 *  cambia il fornitore, quindi si legge una volta e resta. */
export function useVoices(enabled = true) {
  return useQuery({
    queryKey: queryKeys.voices,
    queryFn: fetchVoices,
    enabled,
    staleTime: Infinity,
  })
}

/* Ogni scrittura su un avatar invalida tutto il ramo `avatars`, che comprende
 * il catalogo admin e la galleria degli studenti. */
function useInvalidateAvatars() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.avatars.all })
}

export function useCreateAvatar() {
  const invalidate = useInvalidateAvatars()
  return useMutation({
    mutationFn: (payload: AdminAvatarPayload) => createAvatar(payload),
    onSuccess: invalidate,
  })
}

export function useUpdateAvatar() {
  const invalidate = useInvalidateAvatars()
  return useMutation({
    mutationFn: ({ avatarId, payload }: { avatarId: string; payload: AdminAvatarPayload }) =>
      updateAvatar(avatarId, payload),
    onSuccess: invalidate,
  })
}

/** Archivia un avatar: esce dal catalogo degli studenti, ma conversazioni,
 *  valutazioni e scheda restano, e da qui può tornare indietro. */
export function useDeleteAvatar() {
  const invalidate = useInvalidateAvatars()
  return useMutation({
    mutationFn: (avatarId: string) => deleteAvatar(avatarId),
    onSuccess: invalidate,
  })
}

export function useRestoreAvatar() {
  const invalidate = useInvalidateAvatars()
  return useMutation({
    mutationFn: (avatarId: string) => restoreAvatar(avatarId),
    onSuccess: invalidate,
  })
}

/** Carica l'immagine e risponde con la sua URL, che il form mette nel campo:
 *  non tocca nessun avatar, quindi non c'è niente da invalidare. */
export function useUploadAvatarImage() {
  return useMutation({
    mutationFn: (file: File) => uploadAvatarImage(file),
  })
}

/** Genera una bozza di scheda persona.
 *
 * Non invalida niente e non tocca la cache, perché non salva niente: la
 * bozza è una proposta che torna al form aperto, e diventa un avatar solo se
 * chi l'ha chiesta la salva. È l'unica scrittura di questo file che non fa
 * rileggere nessun elenco. */
export function useDraftPersona() {
  return useMutation({
    mutationFn: (payload: PersonaDraftPayload) => draftPersona(payload),
  })
}
