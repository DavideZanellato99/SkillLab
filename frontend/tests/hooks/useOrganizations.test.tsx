import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchOrganizations: vi.fn(),
  fetchOrganization: vi.fn(),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  setOrganizationStatus: vi.fn(),
  deleteOrganization: vi.fn(),
}))
vi.mock('../../src/services/organizations', () => servizio)

import { queryKeys } from '../../src/hooks/queryKeys'
import {
  useCreateOrganization,
  useDeleteOrganization,
  useOrganization,
  useOrganizations,
  useSetOrganizationStatus,
  useUpdateOrganization,
} from '../../src/hooks/useOrganizations'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  for (const fn of Object.values(servizio)) {
    fn.mockReset()
    fn.mockResolvedValue({})
  }
  servizio.fetchOrganizations.mockResolvedValue([])
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

describe('letture', () => {
  it("legge l'elenco dei tenant", async () => {
    const { result } = renderHook(() => useOrganizations(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchOrganizations).toHaveBeenCalled()
  })

  /* Le pagine che usano l'elenco come filtro lo chiedono solo a un super
   * admin: per tutti gli altri il server risponderebbe 403, e il filtro non
   * esiste nemmeno. */
  it("non chiede l'elenco a chi non è super admin", () => {
    renderHook(() => useOrganizations(false), { wrapper })
    expect(servizio.fetchOrganizations).not.toHaveBeenCalled()
  })

  /* L'elenco è condiviso da sette pagine: una chiave sola, quindi passare
   * da una all'altra non rifà la stessa richiesta. */
  it('condivide una lettura sola fra chi la chiede', async () => {
    const prima = renderHook(() => useOrganizations(), { wrapper })
    const seconda = renderHook(() => useOrganizations(), { wrapper })

    await waitFor(() => expect(prima.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(seconda.result.current.isSuccess).toBe(true))
    expect(servizio.fetchOrganizations).toHaveBeenCalledOnce()
  })

  it('legge le statistiche di una sola organizzazione', async () => {
    const { result } = renderHook(() => useOrganization('org-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchOrganization).toHaveBeenCalledWith('org-1')
  })

  it("aspetta che un'organizzazione sia stata scelta", () => {
    renderHook(() => useOrganization(null), { wrapper })
    expect(servizio.fetchOrganization).not.toHaveBeenCalled()
  })
})

/* Le scritture invalidano l'elenco invece di ritoccarlo: `user_count` e
 * `avatar_count` li calcola il server, e ricostruirli qui vorrebbe dire
 * riscrivere quel calcolo. */
describe('scritture', () => {
  const casi: [string, () => { mutate: (v: never) => void }, unknown, ReturnType<typeof vi.fn>][] =
    [
      ['creazione', () => useCreateOrganization(), { name: 'Acme' }, servizio.createOrganization],
      [
        'rinomina',
        () => useUpdateOrganization(),
        { organizationId: 'org-1', payload: { name: 'Acme SpA' } },
        servizio.updateOrganization,
      ],
      [
        'sospensione',
        () => useSetOrganizationStatus(),
        { organizationId: 'org-1', status: 'suspended', reason: 'Contratto scaduto' },
        servizio.setOrganizationStatus,
      ],
    ]

  it.each(casi)("la %s rilegge l'elenco", async (_nome, hook, variabili, chiamata) => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(hook, { wrapper })

    result.current.mutate(variabili as never)

    await waitFor(() => expect(chiamata).toHaveBeenCalled())
    await waitFor(() =>
      expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.organizations.all }),
    )
  })

  it('passa id, stato e motivo separati alla sospensione', async () => {
    const { result } = renderHook(() => useSetOrganizationStatus(), { wrapper })

    result.current.mutate({
      organizationId: 'org-1',
      status: 'suspended',
      reason: 'Contratto scaduto',
    })

    await waitFor(() =>
      expect(servizio.setOrganizationStatus).toHaveBeenCalledWith(
        'org-1',
        'suspended',
        'Contratto scaduto',
      ),
    )
  })

  /* Eliminare un tenant porta via le persone, gli avatar, le conversazioni,
   * i test tecnici e i percorsi: fermarsi alle organizzazioni lascerebbe a
   * schermo righe di dati che non esistono più. */
  it("l'eliminazione azzera tutto quello che mostrava quel tenant", async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteOrganization(), { wrapper })

    result.current.mutate('org-1')

    await waitFor(() => expect(servizio.deleteOrganization).toHaveBeenCalledWith('org-1'))
    await waitFor(() =>
      expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.organizations.all }),
    )
    for (const queryKey of [
      queryKeys.users.all,
      queryKeys.avatars.all,
      queryKeys.categories.all,
      queryKeys.conversations.all,
      queryKeys.simulations.all,
      queryKeys.training.all,
      queryKeys.reports.all,
      queryKeys.comparison.all,
    ]) {
      expect(invalida).toHaveBeenCalledWith({ queryKey })
    }
  })

  /* Il registro attività resta dov'è di proposito: le sue righe sopravvivono
   * al tenant con il nome che avevano, quindi non diventano sbagliate. */
  it('lascia stare il registro attività', async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteOrganization(), { wrapper })

    result.current.mutate('org-1')

    await waitFor(() => expect(servizio.deleteOrganization).toHaveBeenCalledWith('org-1'))
    expect(invalida).not.toHaveBeenCalledWith({ queryKey: queryKeys.auditLogs.all })
  })
})
