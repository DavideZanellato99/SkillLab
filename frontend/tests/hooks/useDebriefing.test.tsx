import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchUserDebriefing: vi.fn(),
  generateUserDebriefing: vi.fn(),
}))
vi.mock('../../src/services/admin', () => servizio)

import { queryKeys } from '../../src/hooks/queryKeys'
import { useGenerateDebriefing, useUserDebriefing } from '../../src/hooks/useDebriefing'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const quadro = { user_id: 'u-1', summary: 'Chiude presto.', themes: [] }

beforeEach(() => {
  servizio.fetchUserDebriefing.mockReset().mockResolvedValue(null)
  servizio.generateUserDebriefing.mockReset().mockResolvedValue(quadro)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('useUserDebriefing', () => {
  it('legge il quadro della persona chiesta', async () => {
    const { result } = renderHook(() => useUserDebriefing('u-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchUserDebriefing).toHaveBeenCalledWith('u-1')
  })

  /* Due persone sono due voci di cache: con una chiave sola, aprire la riga
   * di qualcun altro mostrerebbe il quadro di chi si è guardato prima. */
  it('tiene persone diverse in voci di cache diverse', async () => {
    const prima = renderHook(() => useUserDebriefing('u-1'), { wrapper })
    await waitFor(() => expect(prima.result.current.isSuccess).toBe(true))

    const seconda = renderHook(() => useUserDebriefing('u-2'), { wrapper })
    await waitFor(() => expect(seconda.result.current.isSuccess).toBe(true))

    expect(servizio.fetchUserDebriefing).toHaveBeenCalledTimes(2)
    expect(queryKeys.debriefings.byUser('u-1')).not.toEqual(queryKeys.debriefings.byUser('u-2'))
  })

  it('non chiede niente quando è spento', () => {
    renderHook(() => useUserDebriefing('u-1', false), { wrapper })

    expect(servizio.fetchUserDebriefing).not.toHaveBeenCalled()
  })
})

describe('useGenerateDebriefing', () => {
  /* L'attesa è lunga: rileggere dal server quello che la risposta ha già
   * portato sarebbe una seconda richiesta davanti a chi sta già aspettando. */
  it('scrive in cache il quadro appena generato', async () => {
    const { result } = renderHook(() => useGenerateDebriefing('u-1'), { wrapper })

    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryData(queryKeys.debriefings.byUser('u-1'))).toEqual(quadro)
    expect(servizio.fetchUserDebriefing).not.toHaveBeenCalled()
  })
})
