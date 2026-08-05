/* L'anagrafica delle categorie vista da un admin, con le sue scritture.
 *
 * È lo stesso elenco che la galleria legge da `useCategories`, con addosso
 * il tenant e quanti avatar usano ciascuna riga. Ogni scrittura invalida
 * entrambe, e anche il ramo `avatars`: rinominare o ricolorare una categoria
 * cambia la targhetta di ogni avatar che la porta. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminAvatarCategoryPayload } from '../services/admin'
import {
  fetchAvatarCategories,
  createAvatarCategory,
  updateAvatarCategory,
  deleteAvatarCategory,
} from '../services/admin'
import { queryKeys } from './queryKeys'

/** L'anagrafica, di un'organizzazione sola quando ne arriva una. */
export function useAvatarCategories(organizationId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.categories.admin(organizationId),
    queryFn: () => fetchAvatarCategories(organizationId),
    enabled,
  })
}

function useInvalidateCategories() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.avatars.all })
  }
}

export function useCreateAvatarCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (payload: AdminAvatarCategoryPayload) => createAvatarCategory(payload),
    onSuccess: invalidate,
  })
}

export function useUpdateAvatarCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: ({
      categoryId,
      payload,
    }: {
      categoryId: string
      payload: AdminAvatarCategoryPayload
    }) => updateAvatarCategory(categoryId, payload),
    onSuccess: invalidate,
  })
}

/** Elimina una categoria. Il backend risponde 409 se la usa ancora qualcuno,
 *  e l'errore arriva al modale come messaggio da mostrare. */
export function useDeleteAvatarCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (categoryId: string) => deleteAvatarCategory(categoryId),
    onSuccess: invalidate,
  })
}
