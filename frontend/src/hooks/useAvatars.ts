/* Il catalogo degli avatar come lo vede uno studente: la galleria, il
 * singolo avatar e le categorie con cui si filtra. */

import { useQuery } from '@tanstack/react-query'
import { fetchAvatars, fetchAvatar, fetchCategories } from '../services/api'
import { queryKeys } from './queryKeys'

/** Il catalogo intero, in una lettura sola.
 *
 *  La categoria era un parametro che finiva nella query string e quindi in
 *  una voce di cache per categoria: ogni pastiglia premuta era un giro sul
 *  server e un'attesa, per una lista che sta tutta in memoria e che la
 *  testata sta già leggendo intera. Il filtro per categoria e la ricerca per
 *  nome vivono ora nella galleria, su questi stessi dati (vedi
 *  `avatarFilters`): la scelta è immediata e il server la sente una volta. */
export function useAvatars() {
  return useQuery({
    queryKey: queryKeys.avatars.list(),
    queryFn: fetchAvatars,
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
