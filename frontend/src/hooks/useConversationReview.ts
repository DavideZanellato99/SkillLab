/* Il giudizio del docente su una conversazione: la revisione in fondo alla
 * valutazione (con l'eventuale correzione del voto) e le note appese ai
 * singoli messaggi della trascrizione.
 *
 * Nessuna di queste mutation invalida da sé il dettaglio che si sta
 * guardando, e non è una dimenticanza: le note vengono applicate alla cache
 * da chi le usa, perché ricaricare tutta la trascrizione rimbalzerebbe lo
 * scroll a ogni nota, che è il gesto che il docente ripete di più. La
 * revisione, che cambia il voto finale, fa invece rileggere il dettaglio e i
 * report, dove quel voto compare.
 *
 * Le notifiche si invalidano perché una revisione pubblicata è una notifica
 * per chi ha svolto la conversazione. */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SaveReviewPayload } from '../services/admin'
import {
  deleteConversationReview,
  deleteMessageAnnotation,
  saveConversationReview,
  saveMessageAnnotation,
} from '../services/admin'
import { queryKeys } from './queryKeys'

/** Invalida quello che mostra il voto di una conversazione. */
function useInvalidateReview(conversationId: string) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.adminDetail(conversationId),
    })
    queryClient.invalidateQueries({ queryKey: ['reports'] })
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
  }
}

export function useSaveConversationReview(conversationId: string) {
  const invalidate = useInvalidateReview(conversationId)
  return useMutation({
    mutationFn: (payload: SaveReviewPayload) => saveConversationReview(conversationId, payload),
    onSuccess: invalidate,
  })
}

/** Ritira la revisione: il voto torna a essere quello della macchina. */
export function useDeleteConversationReview(conversationId: string) {
  const invalidate = useInvalidateReview(conversationId)
  return useMutation({
    mutationFn: () => deleteConversationReview(conversationId),
    onSuccess: invalidate,
  })
}

/** Appunta una nota su un messaggio, al massimo una per messaggio. */
export function useSaveMessageAnnotation(conversationId: string) {
  return useMutation({
    mutationFn: ({ messageId, note }: { messageId: string; note: string }) =>
      saveMessageAnnotation(conversationId, messageId, note),
  })
}

/** Toglie una nota. Vuole l'id dell'annotazione, non quello del messaggio. */
export function useDeleteMessageAnnotation() {
  return useMutation({
    mutationFn: (annotationId: string) => deleteMessageAnnotation(annotationId),
  })
}
