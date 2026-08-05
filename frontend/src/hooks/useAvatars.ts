/* Il catalogo degli avatar come lo vede uno studente: la galleria, il
 * singolo avatar e le categorie con cui si filtra. */

import { useQuery } from '@tanstack/react-query'
import { fetchAvatars, fetchAvatar, fetchCategories } from '../services/api'
import { queryKeys } from './queryKeys'

/** Gli avatar della galleria, filtrati per categoria se ne arriva una.
 *
 *  `enabled` serve a chi la usa come sorgente di un selettore solo in certi
 *  ruoli, come il form dei percorsi di training. */
export function useAvatars(categoryId?: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.avatars.list(categoryId ?? undefined),
    queryFn: () => fetchAvatars(categoryId ?? undefined),
    enabled,
  })
}

/** Un avatar solo. Resta in attesa finché l'id non c'è (rotta in ingresso). */
export function useAvatar(avatarId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.avatars.detail(avatarId!),
    queryFn: () => fetchAvatar(avatarId!),
    enabled: avatarId !== undefined,
  })
}

/** Le categorie della propria organizzazione, nell'ordine deciso in admin. */
export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories.mine,
    queryFn: fetchCategories,
  })
}
