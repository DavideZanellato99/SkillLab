/* La valutazione di una conversazione: quella già salvata e la richiesta di
 * generarla. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { evaluateConversation, fetchConversationEvaluation } from '../services/api'
import { queryKeys } from './queryKeys'

/** La valutazione salvata di una conversazione, `null` se non c'è ancora. */
export function useConversationEvaluation(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.evaluations.byConversation(conversationId!),
    queryFn: () => fetchConversationEvaluation(conversationId!),
    enabled: conversationId !== null,
  })
}

/** Fa valutare la conversazione dal formatore AI e mette il referto in cache
 *  senza rileggerlo: la risposta è già il referto. */
export function useEvaluateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (conversationId: string) => evaluateConversation(conversationId),

    onSuccess: (data, conversationId) => {
      queryClient.setQueryData(queryKeys.evaluations.byConversation(conversationId), data)
    },
  })
}
