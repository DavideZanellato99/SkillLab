import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchAvatars: vi.fn(),
  fetchAvatar: vi.fn(),
  fetchCategories: vi.fn(),
}))
vi.mock('../../src/services/api', () => servizio)

import { queryKeys } from '../../src/hooks/queryKeys'
import { useAvatar, useAvatars, useCategories } from '../../src/hooks/useAvatars'

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

describe('useAvatars', () => {
  /* Il catalogo si legge intero e una volta sola: il filtro per categoria è
   * locale alla galleria, quindi non esistono più liste diverse in cache né
   * una richiesta per ogni pastiglia premuta. */
  it('legge il catalogo intero in una voce di cache sola', async () => {
    const { result } = renderHook(() => useAvatars(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchAvatars).toHaveBeenCalledOnce()
    expect(client.getQueryData(queryKeys.avatars.list())).toEqual([])
  })
})

describe('useAvatar', () => {
  it('legge il singolo avatar', async () => {
    servizio.fetchAvatar.mockResolvedValue({ id: 'a-1' })
    const { result } = renderHook(() => useAvatar('a-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchAvatar).toHaveBeenCalledWith('a-1')
    expect(client.getQueryData(queryKeys.avatars.detail('a-1'))).toEqual({ id: 'a-1' })
  })

  /* L'id arriva dalla rotta e al primo giro può non esserci ancora:
   * chiederlo comunque significherebbe una richiesta a /api/avatars/undefined. */
  it('aspetta che un id ci sia', () => {
    renderHook(() => useAvatar(undefined), { wrapper })
    expect(servizio.fetchAvatar).not.toHaveBeenCalled()
  })
})

describe('useCategories', () => {
  it('legge le categorie della propria organizzazione', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchCategories).toHaveBeenCalled()
    expect(client.getQueryData(queryKeys.categories.mine)).toEqual([])
  })
})
