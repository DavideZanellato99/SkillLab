import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  updateMyProfile: vi.fn(),
  changeMyPassword: vi.fn(),
}))
vi.mock('../../src/services/profile', () => servizio)

import { useChangeMyPassword, useUpdateMyProfile } from '../../src/hooks/useProfile'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  servizio.updateMyProfile.mockReset()
  servizio.updateMyProfile.mockResolvedValue({ id: 'u-1', nome: 'Anna' })
  servizio.changeMyPassword.mockReset()
  servizio.changeMyPassword.mockResolvedValue({ success: true })
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
})

describe('useUpdateMyProfile', () => {
  /* Il profilo di chi sta guardando vive nel contesto di autenticazione e
   * non in cache: per questo la scrittura restituisce l'utente aggiornato
   * invece di invalidare qualcosa, ed è chi chiama ad allineare la sessione. */
  it('restituisce il profilo aggiornato da mettere nella sessione', async () => {
    const { result } = renderHook(() => useUpdateMyProfile(), { wrapper })

    result.current.mutate({ nome: 'Anna' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.updateMyProfile).toHaveBeenCalledWith({ nome: 'Anna' })
    expect(result.current.data).toEqual({ id: 'u-1', nome: 'Anna' })
  })

  it("espone l'errore invece di ingoiarlo", async () => {
    servizio.updateMyProfile.mockRejectedValueOnce(new Error('Nome non valido.'))
    const { result } = renderHook(() => useUpdateMyProfile(), { wrapper })

    result.current.mutate({ nome: '' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Nome non valido.')
  })
})

describe('useChangeMyPassword', () => {
  it('manda la password attuale insieme alla nuova', async () => {
    const { result } = renderHook(() => useChangeMyPassword(), { wrapper })

    result.current.mutate({ current_password: 'Vecchia-1!', new_password: 'Nuova-Lunga1!' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.changeMyPassword).toHaveBeenCalledWith({
      current_password: 'Vecchia-1!',
      new_password: 'Nuova-Lunga1!',
    })
  })

  it('riporta il rifiuto del server', async () => {
    servizio.changeMyPassword.mockRejectedValueOnce(new Error('Password attuale errata.'))
    const { result } = renderHook(() => useChangeMyPassword(), { wrapper })

    result.current.mutate({ current_password: 'sbagliata', new_password: 'Nuova-Lunga1!' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Password attuale errata.')
  })
})
