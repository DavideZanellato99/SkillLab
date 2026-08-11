import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  fetchConversations: vi.fn(),
  fetchConversation: vi.fn(),
  renameConversation: vi.fn(),
  sendChatMessage: vi.fn(),
  endChatConversation: vi.fn(),
}))
vi.mock('../services/api', () => api)
const deleteAdminConversation = vi.hoisted(() => vi.fn())
vi.mock('../services/admin', () => ({ deleteAdminConversation }))

import { queryKeys } from './queryKeys'
import {
  useConversation,
  useConversations,
  useDeleteConversation,
  useEndChatConversation,
  useRenameConversation,
  useSendChatMessage,
} from './useConversations'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const riepilogo = {
  id: 'c-1',
  avatar_id: 'a-1',
  title: 'Clienti 1',
  mode: 'text',
  ended_at: null,
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
  message_count: 4,
  last_message_preview: 'Buongiorno',
}

beforeEach(() => {
  for (const fn of Object.values(api)) {
    fn.mockReset()
    fn.mockResolvedValue([])
  }
  deleteAdminConversation.mockReset()
  deleteAdminConversation.mockResolvedValue({ success: true })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

describe('letture', () => {
  it('legge le conversazioni avute con un avatar', async () => {
    const { result } = renderHook(() => useConversations('a-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchConversations).toHaveBeenCalledWith('a-1')
  })

  /* L'id dell'avatar arriva dalla rotta e al primo giro può non esserci:
   * chiederlo comunque significherebbe una richiesta su /avatar/undefined. */
  it('aspetta che un avatar ci sia', () => {
    renderHook(() => useConversations(undefined), { wrapper })
    expect(api.fetchConversations).not.toHaveBeenCalled()
  })

  it('legge la trascrizione di una conversazione', async () => {
    api.fetchConversation.mockResolvedValue({ ...riepilogo, messages: [] })
    const { result } = renderHook(() => useConversation('c-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchConversation).toHaveBeenCalledWith('c-1')
  })

  it('aspetta che una conversazione sia aperta', () => {
    renderHook(() => useConversation(null), { wrapper })
    expect(api.fetchConversation).not.toHaveBeenCalled()
  })
})

/* Il primo messaggio crea la conversazione, e ogni scambio cambia conteggio
 * e anteprima dell'elenco: qui l'effetto non è conoscibile da qui, quindi si
 * rilegge invece di ritoccare la cache a mano. */
describe('useSendChatMessage', () => {
  it('rilegge gli elenchi dopo uno scambio', async () => {
    api.sendChatMessage.mockResolvedValue({ conversation_id: 'c-1' })
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSendChatMessage(), { wrapper })

    result.current.mutate({
      avatarId: 'a-1',
      conversationId: null,
      content: 'Buongiorno',
      onDelta: vi.fn(),
    })

    await waitFor(() =>
      expect(api.sendChatMessage).toHaveBeenCalledWith(
        'a-1',
        null,
        'Buongiorno',
        expect.any(Function),
      ),
    )
    await waitFor(() =>
      expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.conversations.all }),
    )
  })

  /* Uno streaming interrotto non ha salvato niente: rileggere farebbe
   * comparire nell'elenco un'anteprima che il server non ha. */
  it('non rilegge niente quando lo scambio si rompe', async () => {
    api.sendChatMessage.mockRejectedValue(new Error('Risposta interrotta'))
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSendChatMessage(), { wrapper })

    result.current.mutate({
      avatarId: 'a-1',
      conversationId: 'c-1',
      content: 'Buongiorno',
      onDelta: vi.fn(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalida).not.toHaveBeenCalled()
  })
})

/* Chiudere e rinominare rispondono con il riepilogo aggiornato: la cache si
 * ritocca invece di rileggere, così il dato nuovo è a schermo subito e senza
 * un secondo giro di rete. */
describe('scritture che ritoccano la cache', () => {
  function precarica() {
    client.setQueryData(queryKeys.conversations.byAvatar('a-1'), [riepilogo])
    client.setQueryData(queryKeys.conversations.detail('c-1'), {
      ...riepilogo,
      messages: [{ id: 'm-1' }],
    })
  }

  it('chiudere una chat scrive la fine in entrambe le cache', async () => {
    precarica()
    api.endChatConversation.mockResolvedValue({ ...riepilogo, ended_at: '2026-03-01T11:00:00Z' })
    const { result } = renderHook(() => useEndChatConversation(), { wrapper })

    result.current.mutate('c-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const elenco = client.getQueryData<(typeof riepilogo)[]>(
      queryKeys.conversations.byAvatar('a-1'),
    )
    expect(elenco?.[0].ended_at).toBe('2026-03-01T11:00:00Z')
    const dettaglio = client.getQueryData<{ ended_at: string | null; messages: unknown[] }>(
      queryKeys.conversations.detail('c-1'),
    )
    expect(dettaglio?.ended_at).toBe('2026-03-01T11:00:00Z')
    // La trascrizione resta dov'è: chiudere non la ricarica
    expect(dettaglio?.messages).toHaveLength(1)
    expect(api.fetchConversations).not.toHaveBeenCalled()
  })

  it('rinominare cambia il titolo in entrambe le cache', async () => {
    precarica()
    api.renameConversation.mockResolvedValue({ ...riepilogo, title: 'Reclamo difficile' })
    const { result } = renderHook(() => useRenameConversation(), { wrapper })

    result.current.mutate({ conversationId: 'c-1', title: 'Reclamo difficile' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.renameConversation).toHaveBeenCalledWith('c-1', 'Reclamo difficile')
    const elenco = client.getQueryData<(typeof riepilogo)[]>(
      queryKeys.conversations.byAvatar('a-1'),
    )
    expect(elenco?.[0].title).toBe('Reclamo difficile')
    expect(
      client.getQueryData<{ title: string }>(queryKeys.conversations.detail('c-1'))?.title,
    ).toBe('Reclamo difficile')
  })

  /* La risposta porta anche `ended_at`, che le cache possono non avere
   * ancora quando si rinomina subito dopo aver chiuso la chiamata. */
  it('la rinomina porta con sé anche la fine della conversazione', async () => {
    precarica()
    api.renameConversation.mockResolvedValue({
      ...riepilogo,
      title: 'Reclamo difficile',
      ended_at: '2026-03-01T11:00:00Z',
    })
    const { result } = renderHook(() => useRenameConversation(), { wrapper })

    result.current.mutate({ conversationId: 'c-1', title: 'Reclamo difficile' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(
      client.getQueryData<{ ended_at: string | null }>(queryKeys.conversations.detail('c-1'))
        ?.ended_at,
    ).toBe('2026-03-01T11:00:00Z')
  })

  /* Ritoccare una cache che non c'è non deve inventarla: una conversazione
   * mai aperta non ha una trascrizione da mettere in memoria. */
  it('non inventa una trascrizione mai letta', async () => {
    api.renameConversation.mockResolvedValue({ ...riepilogo, title: 'Reclamo difficile' })
    const { result } = renderHook(() => useRenameConversation(), { wrapper })

    result.current.mutate({ conversationId: 'c-1', title: 'Reclamo difficile' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryData(queryKeys.conversations.detail('c-1'))).toBeUndefined()
  })
})

/* Eliminare una conversazione tocca anche i report, che ne contano il numero
 * e ne sommano le durate: senza, resterebbero a schermo somme che
 * comprendono una conversazione che non c'è più. */
describe('useDeleteConversation', () => {
  it('rilegge elenchi e report', async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteConversation(), { wrapper })

    result.current.mutate('c-1')

    await waitFor(() => expect(deleteAdminConversation).toHaveBeenCalledWith('c-1'))
    await waitFor(() =>
      expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.conversations.all }),
    )
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['reports'] })
  })

  it("non rilegge niente quando l'eliminazione fallisce", async () => {
    deleteAdminConversation.mockRejectedValue(new Error('non permesso'))
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteConversation(), { wrapper })

    result.current.mutate('c-1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalida).not.toHaveBeenCalled()
  })
})
