/* Le conversazioni con un avatar: l'elenco, il singolo colloquio con la sua
 * trascrizione, e le azioni che li cambiano (scrivere in chat, chiudere,
 * rinominare, eliminare).
 *
 * Dove la risposta del server porta già il record aggiornato, la cache viene
 * ritoccata invece di essere invalidata: un giro di rete in meno, e il dato
 * nuovo è sullo schermo subito. Si invalida solo quando l'effetto della
 * scrittura non è conoscibile da qui, per esempio il primo messaggio di una
 * chat, che crea una conversazione che l'elenco non sa di avere. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ChatConversation, ChatConversationSummary } from '../services/api'
import {
  fetchConversations,
  fetchConversation,
  renameConversation,
  sendChatMessage,
  endChatConversation,
} from '../services/api'
import { deleteAdminConversation } from '../services/admin'
import { queryKeys } from './queryKeys'

/** Tutte le conversazioni avute con un avatar. */
export function useConversations(avatarId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.byAvatar(avatarId!),
    queryFn: () => fetchConversations(avatarId!),
    enabled: avatarId !== undefined,
  })
}

/** Una conversazione con tutti i suoi messaggi. */
export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(conversationId!),
    queryFn: () => fetchConversation(conversationId!),
    enabled: conversationId !== null,
  })
}

/**
 * Manda un messaggio dell'operatore e riceve la risposta dell'avatar mentre
 * arriva: `onDelta` prende i frammenti, la mutation si chiude quando lo
 * scambio è stato salvato.
 *
 * L'elenco si invalida perché lo scambio ne cambia il conteggio e l'anteprima,
 * e il primo messaggio crea la conversazione stessa.
 */
export function useSendChatMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      avatarId,
      conversationId,
      content,
      onDelta,
    }: {
      avatarId: string
      conversationId: string | null
      content: string
      onDelta: (text: string) => void
    }) => sendChatMessage(avatarId, conversationId, content, onDelta),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all })
    },
  })
}

/** Chiude una chat: la trascrizione diventa definitiva e non si riprende. */
export function useEndChatConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (conversationId: string) => endChatConversation(conversationId),

    // Le cache si ritoccano invece di rileggere: così `ended_at` è noto
    // subito e la barra di scrittura smette di proporre di continuare.
    onSuccess: (updated) => {
      queryClient.setQueryData<ChatConversationSummary[]>(
        queryKeys.conversations.byAvatar(updated.avatar_id),
        (list) => list?.map((conv) => (conv.id === updated.id ? { ...conv, ...updated } : conv)),
      )
      queryClient.setQueryData<ChatConversation>(
        queryKeys.conversations.detail(updated.id),
        (conv) => (conv ? { ...conv, ended_at: updated.ended_at } : conv),
      )
    },
  })
}

/** Rinomina una conversazione. Il titolo è obbligatorio, vuoto viene rifiutato. */
export function useRenameConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ conversationId, title }: { conversationId: string; title: string }) =>
      renameConversation(conversationId, title),

    // La risposta porta già il riepilogo aggiornato, e porta anche `ended_at`,
    // che le cache possono non avere ancora quando si rinomina subito dopo
    // aver chiuso la chiamata.
    onSuccess: (updated) => {
      queryClient.setQueryData<ChatConversationSummary[]>(
        queryKeys.conversations.byAvatar(updated.avatar_id),
        (list) => list?.map((conv) => (conv.id === updated.id ? { ...conv, ...updated } : conv)),
      )
      queryClient.setQueryData<ChatConversation>(
        queryKeys.conversations.detail(updated.id),
        (conv) => (conv ? { ...conv, title: updated.title, ended_at: updated.ended_at } : conv),
      )
    },
  })
}

/** Elimina una conversazione. Solo admin: un utente non ha un endpoint per
 *  cancellare la propria cronologia.
 *
 *  Insieme agli elenchi si invalidano i report, che contano le conversazioni
 *  e ne sommano le durate. */
export function useDeleteConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (conversationId: string) => deleteAdminConversation(conversationId),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
