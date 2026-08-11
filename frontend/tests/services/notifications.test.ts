import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('../../src/services/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { fetchNotifications, markNotificationsRead } from '../../src/services/notifications'

function ultimaChiamata() {
  const [endpoint, options] = apiFetch.mock.calls.at(-1) as [string, Record<string, unknown>?]
  return { endpoint, options: options ?? {} }
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({ items: [], unread: 0 })
})

describe('fetchNotifications', () => {
  it('legge la lista e il contatore in una chiamata sola', async () => {
    apiFetch.mockResolvedValueOnce({ items: [{ key: 'k-1' }], unread: 1 })
    const lista = await fetchNotifications()

    expect(ultimaChiamata().endpoint).toBe('/api/notifications')
    expect(lista.unread).toBe(1)
  })
})

describe('markNotificationsRead', () => {
  it('segna lette le chiavi indicate', async () => {
    await markNotificationsRead(['k-1', 'k-2'])
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/notifications/read',
      options: { method: 'POST', body: { keys: ['k-1', 'k-2'] } },
    })
  })

  /* Senza chiavi il corpo porta `null` esplicito e non una lista vuota: la
   * prima chiede "tutte quelle visibili adesso", la seconda non chiederebbe
   * niente e la campanella resterebbe accesa. */
  it('chiede di segnarle tutte con un null esplicito', async () => {
    await markNotificationsRead()
    expect(ultimaChiamata().options.body).toEqual({ keys: null })
  })

  /* Una lista vuota resta vuota e non diventa `null`: è il chiamante a dire
   * "queste zero", e trasformarla in "tutte" segnerebbe lette notifiche che
   * nessuno ha aperto. */
  it('non confonde la lista vuota con la richiesta di segnarle tutte', async () => {
    await markNotificationsRead([])
    expect(ultimaChiamata().options.body).toEqual({ keys: [] })
  })
})
