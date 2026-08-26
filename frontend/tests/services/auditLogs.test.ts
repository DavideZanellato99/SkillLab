import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('../../src/services/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { fetchAuditActions, fetchAuditLogs } from '../../src/services/auditLogs'

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

  /* Un giorno di calendario è un intervallo, e quello che si intende è il
   * proprio, non quello di Greenwich: i due estremi partono come momenti veri,
   * con il fuso scritto, così il server confronta con la propria colonna in
   * UTC senza doverlo indovinare. Mandare la data nuda chiedeva la giornata
   * UTC, cioè un'ora o due di azioni prese dal giorno sbagliato a ogni
   * estremo. Il confronto qui non dipende dal fuso della macchina. */
  it('manda il periodo come momenti veri, non come date nude', async () => {
    await fetchAuditLogs({ dateFrom: '2026-03-01', dateTo: '2026-03-03' })
    const { date_from: dal, date_to: al } = ultimiParametri()

    expect(dal).toMatch(/Z$/)
    expect(al).toMatch(/Z$/)

    const inizio = new Date(dal)
    expect(inizio.getDate()).toBe(1)
    expect(inizio.getHours()).toBe(0)

    /* "Fino al 3" comprende tutto il 3: fermarsi a mezzanotte butterebbe via
     * l'intera giornata che si sta chiedendo. */
    const fine = new Date(al)
    expect(fine.getDate()).toBe(3)
    expect(fine.getHours()).toBe(23)
    expect(fine.getMinutes()).toBe(59)
  })

  it('lascia fuori un periodo scritto male invece di inventarlo', async () => {
    await fetchAuditLogs({ dateFrom: '01/03/2026', dateTo: '' })
    expect(ultimiParametri()).toEqual({})
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
