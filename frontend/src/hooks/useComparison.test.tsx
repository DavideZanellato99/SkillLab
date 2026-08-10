import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchComparableUsers: vi.fn(),
  fetchAttempts: vi.fn(),
  fetchSimulationAttempts: vi.fn(),
}))
vi.mock('../services/comparison', () => servizio)

import { queryKeys } from './queryKeys'
import { useAttempts, useComparableUsers, useSimulationAttempts } from './useComparison'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  for (const fn of Object.values(servizio)) {
    fn.mockReset()
    fn.mockResolvedValue([])
  }
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('useComparableUsers', () => {
  it('legge le persone apribili', async () => {
    const { result } = renderHook(() => useComparableUsers(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchComparableUsers).toHaveBeenCalled()
  })

  /* Uno studente non ha nessuno da aprire oltre a se stesso: la lettura
   * resta spenta invece di chiedere una lista che il server rifiuterebbe. */
  it('resta spenta per chi non può aprire nessuno', () => {
    renderHook(() => useComparableUsers(false), { wrapper })
    expect(servizio.fetchComparableUsers).not.toHaveBeenCalled()
  })
})

/* Senza persona scelta il server risponde con i tentativi di chi guarda:
 * è la stessa richiesta con una risposta diversa, quindi le due cose devono
 * finire in due voci di cache separate. Condividerne una farebbe vedere a
 * uno studente i tentativi dell'ultima persona aperta da un admin nella
 * stessa scheda. */
describe('tentativi da confrontare', () => {
  it('separa in cache i propri tentativi da quelli di una persona', async () => {
    const propri = renderHook(() => useAttempts(), { wrapper })
    await waitFor(() => expect(propri.result.current.isSuccess).toBe(true))

    servizio.fetchAttempts.mockResolvedValue([{ conversation_id: 'c-1' }])
    const altrui = renderHook(() => useAttempts('u-1'), { wrapper })
    await waitFor(() => expect(altrui.result.current.isSuccess).toBe(true))

    expect(client.getQueryData(queryKeys.comparison.attempts())).toEqual([])
    expect(client.getQueryData(queryKeys.comparison.attempts('u-1'))).toEqual([
      { conversation_id: 'c-1' },
    ])
  })

  it('tratta la persona vuota come "i propri"', async () => {
    const { result } = renderHook(() => useAttempts(''), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchAttempts).toHaveBeenCalledWith(undefined)
    expect(client.getQueryData(queryKeys.comparison.attempts())).toEqual([])
  })

  it('legge i test tecnici della stessa persona da un ramo separato', async () => {
    const { result } = renderHook(() => useSimulationAttempts('u-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchSimulationAttempts).toHaveBeenCalledWith('u-1')
    expect(client.getQueryData(queryKeys.comparison.simulationAttempts('u-1'))).toEqual([])
  })

  it('tratta la persona vuota come "i propri" anche sui test', async () => {
    const { result } = renderHook(() => useSimulationAttempts(''), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchSimulationAttempts).toHaveBeenCalledWith(undefined)
  })
})
