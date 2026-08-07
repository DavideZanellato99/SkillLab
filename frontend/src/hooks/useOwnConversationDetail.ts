/* Trascrizione, valutazione e revisione di una propria conversazione, nella
 * stessa forma in cui l'endpoint admin le serve tutte insieme.
 *
 * Un admin le chiede con una lettura sola perché ha un endpoint che le mette
 * insieme; uno studente ha due letture, la conversazione e il suo referto, e
 * le compone qui invece che nella schermata: così il dettaglio è un
 * componente solo per tutti e due, e chi lo usa non deve sapere da quante
 * chiamate arriva quello che mostra. */

import { useMemo } from 'react'
import type { AdminConversationDetail } from '../services/admin'
import { useConversation } from './useConversations'
import { useConversationEvaluation } from './useEvaluation'

export function useOwnConversationDetail(conversationId: string | null) {
  const conversation = useConversation(conversationId)
  const evaluation = useConversationEvaluation(conversationId)

  const data = useMemo<AdminConversationDetail | undefined>(() => {
    if (!conversation.data) return undefined
    return {
      conversation_id: conversation.data.id,
      messages: conversation.data.messages,
      evaluation: evaluation.data ?? null,
      review: conversation.data.review ?? null,
    }
  }, [conversation.data, evaluation.data])

  return {
    data,
    // In attesa finché manca una delle due: mostrare la trascrizione con la
    // colonna della valutazione ancora vuota si leggerebbe come "questa
    // conversazione non è stata valutata", che è un'altra cosa.
    isPending: conversation.isPending || evaluation.isPending,
    error: conversation.error ?? evaluation.error,
    refetch: () => {
      void conversation.refetch()
      void evaluation.refetch()
    },
  }
}
