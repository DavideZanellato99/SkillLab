/* Il dettaglio di una conversazione visto da un admin: trascrizione,
 * valutazione e revisione del docente in un colpo solo.
 *
 * È separato da `useConversation` perché è un altro endpoint e un altro
 * permesso: quello legge la propria conversazione, questo qualunque
 * conversazione del tenant, con in più le annotazioni del docente. */

import { useQuery } from '@tanstack/react-query'
import { fetchAdminConversation } from '../services/admin'
import { queryKeys } from './queryKeys'

export function useAdminConversation(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.conversations.adminDetail(conversationId!),
    queryFn: () => fetchAdminConversation(conversationId!),
    enabled: conversationId !== null,
  })
}
