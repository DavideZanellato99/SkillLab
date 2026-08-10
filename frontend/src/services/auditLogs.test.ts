import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { fetchAuditActions, fetchAuditLogs } from './auditLogs'

function ultimiParametri(): Record<string, string> {
  const [, options] = apiFetch.mock.calls.at(-1) as [string, { params: Record<string, string> }]
  return options.params
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({ total: 0, items: [] })
})

describe('fetchAuditLogs', () => {
  it('senza filtri chiede la finestra predefinita del registro', async () => {
    await fetchAuditLogs()
    expect(apiFetch.mock.calls[0][0]).toBe('/api/admin/audit-logs')
    expect(ultimiParametri()).toEqual({})
  })

  it('traduce ogni filtro nel nome che usa il server', async () => {
    await fetchAuditLogs({
      userId: 'u-1',
      organizationId: 'org-1',
      action: 'user.create',
      search: 'anna',
    })

    expect(ultimiParametri()).toEqual({
      user_id: 'u-1',
      organization_id: 'org-1',
      action: 'user.create',
      q: 'anna',
    })
  })

  /* "Fino al 3" deve comprendere tutto il 3: senza l'orario di fine giornata
   * la data verrebbe letta come mezzanotte e le azioni di quel giorno
   * sparirebbero dal registro proprio nel giorno che si sta guardando. */
  it('allarga le date a giornate intere', async () => {
    await fetchAuditLogs({ dateFrom: '2026-03-01', dateTo: '2026-03-03' })
    expect(ultimiParametri()).toEqual({
      date_from: '2026-03-01T00:00:00',
      date_to: '2026-03-03T23:59:59',
    })
  })

  /* Zero è una risposta valida sia per la pagina sia per lo scorrimento:
   * trattarlo come "non impostato" riporterebbe alla prima pagina chi ha
   * chiesto esattamente lo scarto zero. */
  it('manda anche limite e scarto quando valgono zero', async () => {
    await fetchAuditLogs({ limit: 0, offset: 0 })
    expect(ultimiParametri()).toEqual({ limit: '0', offset: '0' })
  })

  it('impagina la finestra richiesta', async () => {
    await fetchAuditLogs({ limit: 50, offset: 100 })
    expect(ultimiParametri()).toEqual({ limit: '50', offset: '100' })
  })

  it('lascia fuori i filtri lasciati in bianco', async () => {
    await fetchAuditLogs({ userId: '', action: '', search: '' })
    expect(ultimiParametri()).toEqual({})
  })
})

describe('fetchAuditActions', () => {
  it('legge il catalogo delle azioni da un indirizzo dedicato', async () => {
    apiFetch.mockResolvedValueOnce([])
    await fetchAuditActions()
    expect(apiFetch.mock.calls[0][0]).toBe('/api/admin/audit-logs/actions')
  })
})
