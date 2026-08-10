import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
}))
vi.mock('../services/notifications', () => servizio)

import { queryKeys } from './queryKeys'
import { useMarkNotificationsRead, useNotifications } from './useNotifications'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  servizio.fetchNotifications.mockReset()
  servizio.fetchNotifications.mockResolvedValue({ items: [], unread: 0 })
  servizio.markNotificationsRead.mockReset()
  servizio.markNotificationsRead.mockResolvedValue({ items: [], unread: 0 })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

describe('useNotifications', () => {
  it('legge la lista e il contatore', async () => {
    servizio.fetchNotifications.mockResolvedValue({ items: [{ key: 'k-1' }], unread: 1 })
    const { result } = renderHook(() => useNotifications(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.unread).toBe(1)
  })

  /* La campanella si spegne del tutto quando non c'è nessuna sessione:
   * senza questo, una scheda ferma sulla schermata di accesso continuerebbe
   * a bussare al server ogni due minuti prendendo 401. */
  it('non chiede niente senza sessione', () => {
    renderHook(() => useNotifications(false), { wrapper })
    expect(servizio.fetchNotifications).not.toHaveBeenCalled()
  })
})

describe('useMarkNotificationsRead', () => {
  /* La risposta contiene già la lista aggiornata e va dritta in cache: il
   * contatore si spegne senza un secondo giro di rete, e senza il momento in
   * cui la campanella mostra ancora il vecchio numero. */
  it('mette in cache la lista che torna dalla scrittura, senza rileggere', async () => {
    servizio.markNotificationsRead.mockResolvedValue({ items: [{ key: 'k-1' }], unread: 0 })
    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper })

    result.current.mutate(['k-1'])

    await waitFor(() =>
      expect(client.getQueryData(queryKeys.notifications)).toEqual({
        items: [{ key: 'k-1' }],
        unread: 0,
      }),
    )
    expect(servizio.markNotificationsRead).toHaveBeenCalledWith(['k-1'])
    expect(servizio.fetchNotifications).not.toHaveBeenCalled()
  })

  it('senza chiavi chiede di segnarle tutte', async () => {
    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper })

    result.current.mutate(undefined)

    await waitFor(() => expect(servizio.markNotificationsRead).toHaveBeenCalledWith(undefined))
  })

  it("lascia la cache com'era quando la scrittura fallisce", async () => {
    client.setQueryData(queryKeys.notifications, { items: [{ key: 'k-1' }], unread: 1 })
    servizio.markNotificationsRead.mockRejectedValueOnce(new Error('rete assente'))
    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper })

    result.current.mutate(['k-1'])

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getQueryData(queryKeys.notifications)).toEqual({
      items: [{ key: 'k-1' }],
      unread: 1,
    })
  })
})
