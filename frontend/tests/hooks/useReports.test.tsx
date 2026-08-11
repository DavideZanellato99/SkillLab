import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchUsersReport: vi.fn(),
  fetchEvaluationsReport: vi.fn(),
  fetchSimulationsReport: vi.fn(),
}))
vi.mock('../../src/services/admin', () => servizio)

import { queryKeys } from '../../src/hooks/queryKeys'
import {
  useEvaluationsReport,
  useSimulationsReport,
  useUsersReport,
} from '../../src/hooks/useReports'

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

describe('useUsersReport', () => {
  it('legge il recap del tenant e del periodo scelti', async () => {
    const { result } = renderHook(() => useUsersReport('org-1', 30), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchUsersReport).toHaveBeenCalledWith('org-1', 30)
  })

  /* Cambiare periodo è una domanda diversa, non lo stesso elenco filtrato a
   * schermo: le due risposte devono stare in due voci di cache separate, o
   * tornando a "ultimi 30 giorni" si vedrebbero i numeri di "sempre". */
  it('tiene periodi diversi in voci di cache diverse', async () => {
    servizio.fetchUsersReport.mockResolvedValueOnce([{ user_id: 'u-1' }])
    const trenta = renderHook(() => useUsersReport('org-1', 30), { wrapper })
    await waitFor(() => expect(trenta.result.current.isSuccess).toBe(true))

    servizio.fetchUsersReport.mockResolvedValueOnce([])
    const sempre = renderHook(() => useUsersReport('org-1'), { wrapper })
    await waitFor(() => expect(sempre.result.current.isSuccess).toBe(true))

    expect(client.getQueryData(queryKeys.reports.users('org-1', 30))).toEqual([{ user_id: 'u-1' }])
    expect(client.getQueryData(queryKeys.reports.users('org-1'))).toEqual([])
  })

  it('tratta il tenant vuoto come nessun filtro', async () => {
    const { result } = renderHook(() => useUsersReport('', undefined), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchUsersReport).toHaveBeenCalledWith(undefined, undefined)
  })

  it('non legge finché il report non serve', () => {
    renderHook(() => useUsersReport('org-1', 30, false), { wrapper })
    expect(servizio.fetchUsersReport).not.toHaveBeenCalled()
  })
})

describe('report della dashboard', () => {
  it('legge le valutazioni del tenant scelto', async () => {
    const { result } = renderHook(() => useEvaluationsReport('org-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchEvaluationsReport).toHaveBeenCalledWith('org-1')
  })

  it('legge i tentativi sulle simulazioni del tenant scelto', async () => {
    const { result } = renderHook(() => useSimulationsReport('org-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchSimulationsReport).toHaveBeenCalledWith('org-1')
  })

  it('restano spenti finché non servono', () => {
    renderHook(() => useEvaluationsReport('org-1', false), { wrapper })
    renderHook(() => useSimulationsReport('org-1', false), { wrapper })

    expect(servizio.fetchEvaluationsReport).not.toHaveBeenCalled()
    expect(servizio.fetchSimulationsReport).not.toHaveBeenCalled()
  })
})
