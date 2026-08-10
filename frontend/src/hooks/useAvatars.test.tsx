import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchAvatars: vi.fn(),
  fetchAvatar: vi.fn(),
  fetchCategories: vi.fn(),
}))
vi.mock('../services/api', () => servizio)

import { queryKeys } from './queryKeys'
import { useAvatar, useAvatars, useCategories } from './useAvatars'

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
  it('legge la galleria filtrata per categoria', async () => {
    const { result } = renderHook(() => useAvatars('cat-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchAvatars).toHaveBeenCalledWith('cat-1')
  })

  /* "Tutte le categorie" arriva come null dal filtro della galleria: va
   * tradotto in nessun parametro, e deve finire in una voce di cache sua,
   * distinta da quella di una categoria scelta. */
  it('tratta nessuna categoria come galleria intera', async () => {
    const { result } = renderHook(() => useAvatars(null), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchAvatars).toHaveBeenCalledWith(undefined)
    expect(client.getQueryData(queryKeys.avatars.list())).toEqual([])
  })

  it('non legge la galleria quando serve solo come sorgente spenta', () => {
    renderHook(() => useAvatars('cat-1', false), { wrapper })
    expect(servizio.fetchAvatars).not.toHaveBeenCalled()
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
