import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  evaluateConversation: vi.fn(),
  fetchConversationEvaluation: vi.fn(),
}))
vi.mock('../../src/services/api', () => servizio)

import { queryKeys } from '../../src/hooks/queryKeys'
import { useConversationEvaluation, useEvaluateConversation } from '../../src/hooks/useEvaluation'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  servizio.evaluateConversation.mockReset()
  servizio.fetchConversationEvaluation.mockReset()
  servizio.fetchConversationEvaluation.mockResolvedValue(null)
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

describe('useConversationEvaluation', () => {
  it('legge la valutazione salvata', async () => {
    servizio.fetchConversationEvaluation.mockResolvedValue({ id: 'e-1' })
    const { result } = renderHook(() => useConversationEvaluation('c-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchConversationEvaluation).toHaveBeenCalledWith('c-1')
  })

  /* Una conversazione non ancora valutata risponde `null`, che è una
   * risposta e non un errore: è così che la pagella sa di dover offrire il
   * pulsante per generarla. */
  it('tratta la valutazione assente come una risposta', async () => {
    const { result } = renderHook(() => useConversationEvaluation('c-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('aspetta che una conversazione sia aperta', () => {
    renderHook(() => useConversationEvaluation(null), { wrapper })
    expect(servizio.fetchConversationEvaluation).not.toHaveBeenCalled()
  })
})

describe('useEvaluateConversation', () => {
  /* La risposta è già il referto: metterlo in cache evita un secondo giro
   * di rete e il momento in cui la pagella è vuota subito dopo averla
   * chiesta. */
  it('mette il referto in cache senza rileggerlo', async () => {
    servizio.evaluateConversation.mockResolvedValue({ id: 'e-1', overall_score: 8 })
    const { result } = renderHook(() => useEvaluateConversation(), { wrapper })

    result.current.mutate('c-1')

    await waitFor(() =>
      expect(client.getQueryData(queryKeys.evaluations.byConversation('c-1'))).toEqual({
        id: 'e-1',
        overall_score: 8,
      }),
    )
    expect(servizio.fetchConversationEvaluation).not.toHaveBeenCalled()
  })

  it('non tocca la cache quando la valutazione fallisce', async () => {
    servizio.evaluateConversation.mockRejectedValue(new Error('modello non disponibile'))
    const { result } = renderHook(() => useEvaluateConversation(), { wrapper })

    result.current.mutate('c-1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getQueryData(queryKeys.evaluations.byConversation('c-1'))).toBeUndefined()
  })
})
