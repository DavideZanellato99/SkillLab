/* Come si restringe il catalogo della galleria: la categoria scelta e le
 * parole scritte nella casella di ricerca.
 *
 * Sta in un modulo puro e non dentro il componente perché è la regola con cui
 * si decide cosa si vede, e una regola si legge e si prova senza montare
 * niente. Il filtro è locale: gli avatar arrivano tutti in una lettura sola
 * (vedi `useAvatars`), quindi scegliere una categoria non è una domanda al
 * server ma un giro su una lista che è già in memoria. */

import type { Avatar } from '../services/api'
import { matchesSearch } from './tableSearch'

/** Categoria scelta, oppure `null` per il catalogo intero. */
export type CategoryFilter = string | null

/** Gli avatar che restano dopo la categoria e la ricerca.
 *
 *  Si cerca anche nella descrizione e nel nome della categoria, non solo nel
 *  nome dell'avatar: chi cerca «reclamo» sta cercando una situazione, e la
 *  situazione è scritta lì. */
export function filterAvatars(
  avatars: Avatar[],
  categoryId: CategoryFilter,
  search: string,
): Avatar[] {
  return avatars.filter(
    (avatar) =>
      (categoryId === null || avatar.category_id === categoryId) &&
      matchesSearch(search, avatar.name, avatar.description, avatar.category),
  )
}

/** Quanti avatar per categoria, per il numero accanto a ogni pastiglia.
 *
 *  Il conteggio è sul catalogo intero e non su quello già cercato: dice
 *  quanto c'è dentro una categoria, che è l'informazione con cui si decide se
 *  vale la pena aprirla. */
export function countByCategory(avatars: Avatar[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const avatar of avatars) {
    counts[avatar.category_id] = (counts[avatar.category_id] ?? 0) + 1
  }
  return counts
}
