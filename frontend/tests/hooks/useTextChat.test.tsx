import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessage, ChatMessageExchange } from '../../src/services/api'

const sendChatMessage = vi.fn()
const endChatConversation = vi.fn()
vi.mock('../../src/services/api', () => ({
  sendChatMessage: (...args: unknown[]) => sendChatMessage(...args),
  endChatConversation: (...args: unknown[]) => endChatConversation(...args),
  fetchConversations: vi.fn(),
  fetchConversation: vi.fn(),
  renameConversation: vi.fn(),
}))
vi.mock('../../src/services/admin', () => ({ deleteAdminConversation: vi.fn() }))

import { useTextChat } from '../../src/hooks/useTextChat'

/* La chat scritta è il punto in cui lo schermo va avanti prima del database:
 * il messaggio compare subito e la risposta cresce mentre arriva. Ha due
 * conseguenze che questi test presidiano.
 *
 * La prima è che le due bolle nascono con id inventati qui, e vanno
 * sostituite con quelle vere quando il server ha scritto lo scambio:
 * lasciarle addosso vorrebbe dire due bolle che non esistono da nessuna
 * altra parte, e citazioni della pagella che non le ritrovano più.
 *
 * La seconda è il rientro: se lo streaming si rompe il server non ha scritto
 * niente, quindi a schermo non deve restare traccia di un messaggio che per
 * il sistema non è mai esistito, e il testo deve tornare nella casella
 * invece di essere perso. */

const exchange: ChatMessageExchange = {
  conversation_id: 'conv-1',
  title: 'Clienti 1',
  user_message: {
    id: 'msg-utente',
    role: 'user',
    content: 'Buongiorno',
    created_at: '2026-03-01T10:00:00Z',
  },
  assistant_message: {
    id: 'msg-avatar',
    role: 'assistant',
    content: 'Buongiorno a lei',
    created_at: '2026-03-01T10:00:05Z',
  },
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Monta l'hook tenendo traccia dei messaggi come farebbe la pagina. */
function setup(conversationId: string | null = 'conv-1') {
  const state = {
    messages: [] as ChatMessage[],
    error: null as string | null,
    conversationId,
    ended: [] as string[],
  }

  const { result } = renderHook(
    () =>
      useTextChat({
        avatarId: 'av-1',
        conversationId: state.conversationId,
        setConversationId: (updater) => {
          state.conversationId = updater(state.conversationId)
        },
        setMessages: (updater) => {
          state.messages = updater(state.messages)
        },
        setError: (message) => {
          state.error = message
        },
        onEnded: (id) => state.ended.push(id),
      }),
    { wrapper },
  )

  return { result, state }
}

describe('useTextChat', () => {
  beforeEach(() => {
    sendChatMessage.mockReset()
    endChatConversation.mockReset()
  })

  it('mostra subito il messaggio, poi lo sostituisce con quello salvato', async () => {
    sendChatMessage.mockImplementation(
      async (_avatarId, _conversationId, _content, onDelta: (text: string) => void) => {
        onDelta('Buongiorno ')
        onDelta('a lei')
        return exchange
      },
    )

    const { result, state } = setup()
    act(() => result.current.setInput('Buongiorno'))
    act(() => result.current.send())

    // La casella si svuota all'istante: il messaggio è già a schermo
    expect(result.current.input).toBe('')
    expect(state.messages[0]).toMatchObject({ role: 'user', content: 'Buongiorno' })

    await waitFor(() => expect(state.messages).toHaveLength(2))
    // I due frammenti finiscono in una bolla sola, che cresce
    expect(state.messages[1].content).toBe('Buongiorno a lei')

    await waitFor(() => expect(state.messages[0].id).toBe('msg-utente'))
    expect(state.messages[1].id).toBe('msg-avatar')
    expect(result.current.streamingReplyId).toBeNull()
  })

  it('adotta la conversazione creata dal primo messaggio', async () => {
    sendChatMessage.mockResolvedValue(exchange)

    const { result, state } = setup(null)
    act(() => result.current.setInput('Buongiorno'))
    act(() => result.current.send())

    await waitFor(() => expect(state.conversationId).toBe('conv-1'))
  })

  it('riporta indietro tutto quando lo streaming si interrompe', async () => {
    sendChatMessage.mockImplementation(
      async (_avatarId, _conversationId, _content, onDelta: (text: string) => void) => {
        onDelta('Buongi')
        throw new Error('Risposta interrotta: invia di nuovo il messaggio.')
      },
    )

    const { result, state } = setup()
    act(() => result.current.setInput('Buongiorno'))
    act(() => result.current.send())

    await waitFor(() => expect(state.error).not.toBeNull())
    // Niente è stato scritto sul server: a schermo non resta niente
    expect(state.messages).toHaveLength(0)
    // E il testo torna dov'era, pronto da rimandare
    expect(result.current.input).toBe('Buongiorno')
    expect(state.error).toContain('Risposta interrotta')
  })

  it('non manda una riga vuota', () => {
    const { result } = setup()
    act(() => result.current.setInput('   '))
    act(() => result.current.send())
    expect(sendChatMessage).not.toHaveBeenCalled()
  })

  it('chiudere una chat mai iniziata non chiama il server', () => {
    const { result, state } = setup(null)
    act(() => result.current.start())
    expect(result.current.started).toBe(true)

    act(() => result.current.end())

    expect(endChatConversation).not.toHaveBeenCalled()
    expect(state.ended).toEqual([])
    // Si torna comunque alla scelta del canale
    expect(result.current.started).toBe(false)
  })

  it('chiudere una chat vera avvisa chi deve far partire la valutazione', async () => {
    endChatConversation.mockResolvedValue({ id: 'conv-1', avatar_id: 'av-1', ended_at: 'ora' })

    const { result, state } = setup('conv-1')
    act(() => result.current.start())
    act(() => result.current.end())

    await waitFor(() => expect(state.ended).toEqual(['conv-1']))
    expect(result.current.started).toBe(false)
  })

  it('una chiusura fallita lo dice e lascia la chat aperta', async () => {
    endChatConversation.mockRejectedValue(new Error('Il server non risponde.'))

    const { result, state } = setup('conv-1')
    act(() => result.current.start())
    act(() => result.current.end())

    await waitFor(() => expect(state.error).toContain('Impossibile terminare la chat'))
    expect(state.ended).toEqual([])
    expect(result.current.started).toBe(true)
  })
})
