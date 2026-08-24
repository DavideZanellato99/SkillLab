import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchUserDebriefings: vi.fn(),
  generateUserDebriefing: vi.fn(),
}))
vi.mock('../../src/services/admin', () => servizio)

import { queryKeys } from '../../src/hooks/queryKeys'
import { useGenerateDebriefing, useUserDebriefings } from '../../src/hooks/useDebriefing'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const vecchio = {
  id: 'd-1',
  user_id: 'u-1',
  summary: 'Chiude presto.',
  themes: [],
  is_stale: true,
}
const nuovo = {
  id: 'd-2',
  user_id: 'u-1',
  summary: 'Chiude presto, ma meno.',
  themes: [],
  direction: 'up',
  is_stale: false,
}

beforeEach(() => {
  servizio.fetchUserDebriefings.mockReset().mockResolvedValue([])
  servizio.generateUserDebriefing.mockReset().mockResolvedValue(nuovo)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('useUserDebriefings', () => {
  it('legge i quadri della persona chiesta', async () => {
    const { result } = renderHook(() => useUserDebriefings('u-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchUserDebriefings).toHaveBeenCalledWith('u-1')
  })

  /* Due persone sono due voci di cache: con una chiave sola, aprire la riga
   * di qualcun altro mostrerebbe il quadro di chi si è guardato prima. */
  it('tiene persone diverse in voci di cache diverse', async () => {
    const prima = renderHook(() => useUserDebriefings('u-1'), { wrapper })
    await waitFor(() => expect(prima.result.current.isSuccess).toBe(true))

    const seconda = renderHook(() => useUserDebriefings('u-2'), { wrapper })
    await waitFor(() => expect(seconda.result.current.isSuccess).toBe(true))

    expect(servizio.fetchUserDebriefings).toHaveBeenCalledTimes(2)
    expect(queryKeys.debriefings.byUser('u-1')).not.toEqual(queryKeys.debriefings.byUser('u-2'))
  })

  it('non chiede niente quando è spento', () => {
    renderHook(() => useUserDebriefings('u-1', false), { wrapper })

    expect(servizio.fetchUserDebriefings).not.toHaveBeenCalled()
  })
})

describe('useGenerateDebriefing', () => {
  /* L'attesa è lunga: rileggere dal server quello che la risposta ha già
   * portato sarebbe una seconda richiesta davanti a chi sta già aspettando. */
  it('mette il quadro appena generato in cima allo storico in cache', async () => {
    client.setQueryData(queryKeys.debriefings.byUser('u-1'), [vecchio])
    const { result } = renderHook(() => useGenerateDebriefing('u-1'), { wrapper })

    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const storico = client.getQueryData(queryKeys.debriefings.byUser('u-1')) as (typeof vecchio)[]
    expect(storico.map((v) => v.id)).toEqual(['d-2', 'd-1'])
    expect(servizio.fetchUserDebriefings).not.toHaveBeenCalled()
  })

  /* Il segnale di vecchio vale solo sul più recente, e chi era il più
   * recente ha appena smesso di esserlo: lasciarglielo addosso mostrerebbe
   * due righe "da aggiornare" di cui una senza più senso. */
  it('toglie il segnale di vecchio alle versioni che scendono', async () => {
    client.setQueryData(queryKeys.debriefings.byUser('u-1'), [vecchio])
    const { result } = renderHook(() => useGenerateDebriefing('u-1'), { wrapper })

    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const storico = client.getQueryData(queryKeys.debriefings.byUser('u-1')) as (typeof vecchio)[]
    expect(storico[1].is_stale).toBe(false)
  })
})
