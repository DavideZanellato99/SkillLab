/* I metadati della registrazione di una chiamata: se esiste e quanto dura.
 *
 * Tre punti dell'app la chiedono per la stessa conversazione: il lettore
 * audio, la chat (che da lì stima il punto citato dalla valutazione) e il
 * dettaglio lato admin. Prima ognuno scriveva la propria `useQuery` con la
 * chiave a mano, tre stringhe uguali per combinazione; ora la chiave è una
 * e la risposta si condivide davvero.
 *
 * L'audio in sé non passa da qui: è un blob che si scarica su richiesta
 * esplicita e finisce in un object URL, non un dato da tenere in cache. */

import { useQuery } from '@tanstack/react-query'
import { fetchRecordingInfo } from '../services/voice'
import { queryKeys } from './queryKeys'

export function useRecordingInfo(conversationId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.recordings.info(conversationId!),
    queryFn: () => fetchRecordingInfo(conversationId!),
    enabled: conversationId !== null && enabled,
  })
}
