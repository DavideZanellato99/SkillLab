import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchAuditLogs: vi.fn(),
  fetchAuditActions: vi.fn(),
}))
vi.mock('../services/auditLogs', () => servizio)

import { AUDIT_WINDOW_SIZE, useAuditActions, useAuditLogs } from './useAuditLogs'

const filtri = { action: '', organizationId: '', dateFrom: '', dateTo: '', search: '' }

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Una finestra di registro con `quante` righe finte su un totale. */
function pagina(quante: number, total: number) {
  return {
    total,
    items: Array.from({ length: quante }, (_, i) => ({ id: `log-${i}` })),
  }
}

beforeEach(() => {
  servizio.fetchAuditLogs.mockReset()
  servizio.fetchAuditActions.mockReset()
  servizio.fetchAuditActions.mockResolvedValue([])
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('useAuditLogs', () => {
  it('chiede la prima finestra partendo da zero', async () => {
    servizio.fetchAuditLogs.mockResolvedValue(pagina(5, 5))
    const { result } = renderHook(() => useAuditLogs(filtri), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchAuditLogs).toHaveBeenCalledWith({
      ...filtri,
      limit: AUDIT_WINDOW_SIZE,
      offset: 0,
    })
    expect(result.current.logs).toHaveLength(5)
    expect(result.current.total).toBe(5)
  })

  /* La finestra successiva comincia da quante righe si hanno già, non da un
   * numero di pagina: contare le pagine sballa appena il server ne rende una
   * più corta del limite, e si riceverebbero righe saltate o ripetute. */
  it('parte dallo scarto pari alle righe già lette', async () => {
    servizio.fetchAuditLogs
      .mockResolvedValueOnce(pagina(200, 350))
      .mockResolvedValueOnce(pagina(150, 350))

    const { result } = renderHook(() => useAuditLogs(filtri), { wrapper })
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    result.current.fetchNextPage()

    await waitFor(() => expect(result.current.logs).toHaveLength(350))
    expect(servizio.fetchAuditLogs).toHaveBeenLastCalledWith({
      ...filtri,
      limit: AUDIT_WINDOW_SIZE,
      offset: 200,
    })
    // Le righe già lette restano: la finestra si estende, non si sostituisce
    expect(result.current.hasNextPage).toBe(false)
  })

  it('non offre altre pagine quando le righe lette sono il totale', async () => {
    servizio.fetchAuditLogs.mockResolvedValue(pagina(3, 3))
    const { result } = renderHook(() => useAuditLogs(filtri), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(false)
  })

  /* Un filtro diverso è una domanda diversa, quindi ricomincia da capo
   * invece di aggiungersi in fondo alle righe già a schermo. */
  it('riparte dalla prima finestra quando cambia un filtro', async () => {
    servizio.fetchAuditLogs.mockResolvedValue(pagina(2, 2))
    const { result, rerender } = renderHook((f: typeof filtri) => useAuditLogs(f), {
      wrapper,
      initialProps: filtri,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    rerender({ ...filtri, action: 'user.create' })

    await waitFor(() =>
      expect(servizio.fetchAuditLogs).toHaveBeenLastCalledWith({
        ...filtri,
        action: 'user.create',
        limit: AUDIT_WINDOW_SIZE,
        offset: 0,
      }),
    )
    await waitFor(() => expect(result.current.logs).toHaveLength(2))
  })

  it('mostra un registro vuoto finché non è arrivato niente', () => {
    servizio.fetchAuditLogs.mockResolvedValue(pagina(0, 0))
    const { result } = renderHook(() => useAuditLogs(filtri), { wrapper })

    expect(result.current.logs).toEqual([])
    expect(result.current.total).toBe(0)
  })

  it('non legge il registro finché la pagina non lo chiede', () => {
    renderHook(() => useAuditLogs(filtri, false), { wrapper })
    expect(servizio.fetchAuditLogs).not.toHaveBeenCalled()
  })
})

describe('useAuditActions', () => {
  it('legge il catalogo delle azioni per la tendina', async () => {
    servizio.fetchAuditActions.mockResolvedValue([{ key: 'user.create', label: 'Utente creato' }])
    const { result } = renderHook(() => useAuditActions(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })

  it('non legge il catalogo quando è disabilitato', () => {
    renderHook(() => useAuditActions(false), { wrapper })
    expect(servizio.fetchAuditActions).not.toHaveBeenCalled()
  })
})
