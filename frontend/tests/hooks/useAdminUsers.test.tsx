import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchUsers: vi.fn(),
  createNewUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  setUserStatus: vi.fn(),
  resendUserCredentials: vi.fn(),
}))
vi.mock('../../src/services/admin', () => servizio)

import { queryKeys } from '../../src/hooks/queryKeys'
import {
  USERS_WINDOW_SIZE,
  useAdminUsers,
  useCreateUser,
  useDeleteUser,
  useResendUserCredentials,
  useSetUserStatus,
  useUpdateUser,
} from '../../src/hooks/useAdminUsers'

const filtri = { search: 'anna' }

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function pagina(quanti: number, total: number, da = 0) {
  return {
    total,
    items: Array.from({ length: quanti }, (_, i) => ({ id: `u-${da + i}` })),
  }
}

beforeEach(() => {
  for (const fn of Object.values(servizio)) {
    fn.mockReset()
    fn.mockResolvedValue({ success: true })
  }
  servizio.fetchUsers.mockResolvedValue(pagina(2, 2))
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

describe('useAdminUsers', () => {
  it('legge la prima finestra con i filtri attivi', async () => {
    const { result } = renderHook(() => useAdminUsers(filtri), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchUsers).toHaveBeenCalledWith({
      ...filtri,
      limit: USERS_WINDOW_SIZE,
      offset: 0,
    })
    expect(result.current.users.map((u) => u.id)).toEqual(['u-0', 'u-1'])
    expect(result.current.total).toBe(2)
  })

  /* "Carica altri" aggiunge righe a quelle già a schermo e riparte dallo
   * scarto pari a quante se ne hanno: le pagine si accumulano, non si
   * sostituiscono. */
  it('accumula le finestre invece di sostituirle', async () => {
    servizio.fetchUsers
      .mockResolvedValueOnce(pagina(200, 250))
      .mockResolvedValueOnce(pagina(50, 250, 200))

    const { result } = renderHook(() => useAdminUsers(filtri), { wrapper })
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    result.current.fetchNextPage()

    await waitFor(() => expect(result.current.users).toHaveLength(250))
    expect(servizio.fetchUsers).toHaveBeenLastCalledWith({
      ...filtri,
      limit: USERS_WINDOW_SIZE,
      offset: 200,
    })
    expect(result.current.hasNextPage).toBe(false)
  })

  it('non legge niente finché la pagina non lo chiede', () => {
    renderHook(() => useAdminUsers(filtri, false), { wrapper })
    expect(servizio.fetchUsers).not.toHaveBeenCalled()
  })
})

/* Ogni scrittura su un account rilegge l'elenco invece di ritoccarlo in
 * memoria: dopo la modifica una riga può non rientrare più nei filtri
 * attivi, e deciderlo qui vorrebbe dire riscrivere la regola del server. */
describe('scritture su un account', () => {
  const casi: [string, () => { mutate: (v: never) => void }, unknown, ReturnType<typeof vi.fn>][] =
    [
      [
        'creazione',
        () => useCreateUser(),
        { email: 'anna@test.it', nome: 'Anna', cognome: 'Rossi' },
        servizio.createNewUser,
      ],
      [
        'modifica',
        () => useUpdateUser(),
        { userId: 'u-1', payload: { nome: 'Anna' } },
        servizio.updateUser,
      ],
      [
        'cambio di stato',
        () => useSetUserStatus(),
        { userId: 'u-1', status: 'suspended' },
        servizio.setUserStatus,
      ],
      [
        'reinvio credenziali',
        () => useResendUserCredentials(),
        'u-1',
        servizio.resendUserCredentials,
      ],
    ]

  it.each(casi)("la %s rilegge l'elenco", async (_nome, hook, variabili, chiamata) => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(hook, { wrapper })

    result.current.mutate(variabili as never)

    await waitFor(() => expect(chiamata).toHaveBeenCalled())
    await waitFor(() => expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.users.all }))
  })

  it('passa id e contenuto separati alla modifica', async () => {
    const { result } = renderHook(() => useUpdateUser(), { wrapper })

    result.current.mutate({ userId: 'u-1', payload: { nome: 'Anna' } })

    await waitFor(() => expect(servizio.updateUser).toHaveBeenCalledWith('u-1', { nome: 'Anna' }))
  })

  /* Eliminare un account porta via anche le sue conversazioni, quindi tocca
   * elenchi che nessun'altra scrittura sposta: i report continuerebbero a
   * contare le prove di una persona che non c'è più. */
  it("l'eliminazione rilegge anche conversazioni e report", async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteUser(), { wrapper })

    result.current.mutate('u-1')

    await waitFor(() => expect(servizio.deleteUser).toHaveBeenCalledWith('u-1'))
    await waitFor(() => expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.users.all }))
    expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.conversations.all })
    expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.reports.all })
  })

  it('non rilegge niente quando la scrittura fallisce', async () => {
    servizio.createNewUser.mockRejectedValueOnce(new Error('email già usata'))
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateUser(), { wrapper })

    result.current.mutate({ email: 'anna@test.it' } as never)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalida).not.toHaveBeenCalled()
  })
})
