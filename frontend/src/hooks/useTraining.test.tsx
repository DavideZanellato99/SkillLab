import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* vi.mock viene issato in cima al file, quindi il finto servizio va creato
 * dentro vi.hoisted: definito qui sotto come normale costante, la fabbrica
 * lo leggerebbe prima che esista. */
const servizio = vi.hoisted(() => ({
  fetchPaths: vi.fn(),
  fetchAssignments: vi.fn(),
  fetchMyAssignments: vi.fn(),
  fetchAssignableContent: vi.fn(),
  fetchAssignableUsers: vi.fn(),
  createPath: vi.fn(),
  updatePath: vi.fn(),
  deletePath: vi.fn(),
  assignPath: vi.fn(),
  deleteAssignment: vi.fn(),
}))
vi.mock('../services/training', () => servizio)

import { queryKeys } from './queryKeys'
import {
  useAssignPath,
  useAssignableContent,
  useAssignableUsers,
  useAssignments,
  useCreatePath,
  useDeleteAssignment,
  useDeletePath,
  useMyAssignments,
  usePaths,
  useUpdatePath,
} from './useTraining'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  for (const fn of Object.values(servizio)) {
    fn.mockReset()
    fn.mockResolvedValue([])
  }
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

describe('letture', () => {
  it('legge i percorsi del tenant scelto', async () => {
    const { result } = renderHook(() => usePaths('org-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchPaths).toHaveBeenCalledWith('org-1')
  })

  /* La stringa vuota è come "nessun filtro": arriva così dalle tendine, dove
   * "Tutte le organizzazioni" vale "". Passata al server chiederebbe i
   * percorsi di un'organizzazione senza id, cioè nessuno. */
  it('tratta il tenant vuoto come nessun filtro', async () => {
    const { result } = renderHook(() => usePaths(''), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchPaths).toHaveBeenCalledWith(undefined)
    expect(client.getQueryData(queryKeys.training.paths(undefined))).toEqual([])
  })

  it('non legge finché la lettura è disabilitata', () => {
    renderHook(() => usePaths('org-1', false), { wrapper })
    expect(servizio.fetchPaths).not.toHaveBeenCalled()
  })

  it('combina i due filtri delle assegnazioni', async () => {
    const { result } = renderHook(() => useAssignments('org-1', 'p-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchAssignments).toHaveBeenCalledWith('org-1', 'p-1')
  })

  it('legge i propri percorsi senza nessun filtro', async () => {
    const { result } = renderHook(() => useMyAssignments(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchMyAssignments).toHaveBeenCalled()
  })

  /* Contenuti e persone assegnabili esistono solo dentro un'organizzazione:
   * finché non ne è stata scelta una non c'è niente da chiedere, e chiederlo
   * comunque riempirebbe la tendina con il catalogo di un tenant sbagliato. */
  it("aspetta che un'organizzazione sia stata scelta", () => {
    renderHook(() => useAssignableContent(null), { wrapper })
    renderHook(() => useAssignableUsers(null), { wrapper })

    expect(servizio.fetchAssignableContent).not.toHaveBeenCalled()
    expect(servizio.fetchAssignableUsers).not.toHaveBeenCalled()
  })

  it('legge contenuti e persone quando il tenant è noto', async () => {
    servizio.fetchAssignableContent.mockResolvedValue({ avatars: [], simulations: [] })
    const contenuti = renderHook(() => useAssignableContent('org-1'), { wrapper })
    const persone = renderHook(() => useAssignableUsers('org-1'), { wrapper })

    await waitFor(() => expect(contenuti.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(persone.result.current.isSuccess).toBe(true))
    expect(servizio.fetchAssignableContent).toHaveBeenCalledWith('org-1')
    expect(servizio.fetchAssignableUsers).toHaveBeenCalledWith('org-1')
  })
})

/* Ogni scrittura sui percorsi invalida due rami: quello del training e
 * quello delle notifiche. Le notifiche sono ricavate dalle stesse tappe,
 * quindi comporre o affidare un percorso cambia anche quelle, e senza la
 * seconda invalidazione la campanella continuerebbe a mostrare lo stato di
 * prima finché non scatta il suo intervallo. */
describe('scritture', () => {
  const casi: [string, () => { mutate: (v: never) => void }, unknown, ReturnType<typeof vi.fn>][] =
    [
      ['creazione', () => useCreatePath(), { title: 'Onboarding', steps: [] }, servizio.createPath],
      [
        'riscrittura',
        () => useUpdatePath(),
        { pathId: 'p-1', payload: { title: 'Onboarding', steps: [] } },
        servizio.updatePath,
      ],
      ['eliminazione', () => useDeletePath(), 'p-1', servizio.deletePath],
      [
        'assegnazione',
        () => useAssignPath(),
        { path_id: 'p-1', user_ids: ['u-1'] },
        servizio.assignPath,
      ],
      ['ritiro', () => useDeleteAssignment(), 'as-1', servizio.deleteAssignment],
    ]

  it.each(casi)('la %s invalida percorsi e notifiche', async (_nome, hook, variabili, chiamata) => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(hook, { wrapper })

    result.current.mutate(variabili as never)

    await waitFor(() => expect(chiamata).toHaveBeenCalled())
    await waitFor(() => expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.training.all }))
    expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.notifications })
  })

  it('passa id e contenuto separati alla riscrittura', async () => {
    const { result } = renderHook(() => useUpdatePath(), { wrapper })
    const payload = { title: 'Onboarding', steps: [] }

    result.current.mutate({ pathId: 'p-1', payload })

    await waitFor(() => expect(servizio.updatePath).toHaveBeenCalledWith('p-1', payload))
  })

  /* Una scrittura fallita non deve invalidare niente: rileggere dopo un
   * errore rimetterebbe sullo schermo gli stessi dati di prima facendo
   * credere che qualcosa sia cambiato. */
  it('non invalida niente quando la scrittura fallisce', async () => {
    servizio.deletePath.mockRejectedValueOnce(new Error('non permesso'))
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeletePath(), { wrapper })

    result.current.mutate('p-1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalida).not.toHaveBeenCalled()
  })
})
