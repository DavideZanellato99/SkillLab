import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import {
  createOrganization,
  deleteOrganization,
  fetchOrganization,
  fetchOrganizations,
  setOrganizationStatus,
  updateOrganization,
} from './organizations'

function ultimaChiamata() {
  const [endpoint, options] = apiFetch.mock.calls.at(-1) as [string, Record<string, unknown>?]
  return { endpoint, options: options ?? {} }
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({})
})

describe('lettura delle organizzazioni', () => {
  it("legge l'elenco", async () => {
    await fetchOrganizations()
    expect(ultimaChiamata()).toEqual({ endpoint: '/api/admin/organizations', options: {} })
  })

  it('legge la singola organizzazione con le sue statistiche', async () => {
    await fetchOrganization('org-1')
    expect(ultimaChiamata().endpoint).toBe('/api/admin/organizations/org-1')
  })
})

describe('scrittura delle organizzazioni', () => {
  it('crea passando solo il nome, lo slug lo ricava il server', async () => {
    await createOrganization({ name: 'Acme' })
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/organizations',
      options: { method: 'POST', body: { name: 'Acme' } },
    })
  })

  it('crea con lo slug scelto a mano', async () => {
    await createOrganization({ name: 'Acme', slug: 'acme-spa' })
    expect(ultimaChiamata().options.body).toEqual({ name: 'Acme', slug: 'acme-spa' })
  })

  it('rinomina la singola organizzazione', async () => {
    await updateOrganization('org-1', { name: 'Acme SpA' })
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/organizations/org-1',
      options: { method: 'PUT', body: { name: 'Acme SpA' } },
    })
  })

  it('elimina la singola organizzazione', async () => {
    await deleteOrganization('org-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/organizations/org-1',
      options: { method: 'DELETE' },
    })
  })
})

describe('setOrganizationStatus', () => {
  it('sospende portando con sé il motivo', async () => {
    await setOrganizationStatus('org-1', 'suspended', 'Contratto scaduto')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/organizations/org-1/status',
      options: { method: 'PUT', body: { status: 'suspended', reason: 'Contratto scaduto' } },
    })
  })

  it('toglie gli spazi attorno al motivo', async () => {
    await setOrganizationStatus('org-1', 'suspended', '  Contratto scaduto  ')
    expect(ultimaChiamata().options.body).toEqual({
      status: 'suspended',
      reason: 'Contratto scaduto',
    })
  })

  /* Un motivo fatto di soli spazi vale come nessun motivo: è quel testo che
   * leggono gli utenti bloccati, e una schermata di blocco con una riga
   * vuota non spiega niente a nessuno. */
  it('tratta un motivo fatto di soli spazi come assente', async () => {
    await setOrganizationStatus('org-1', 'suspended', '   ')
    expect(ultimaChiamata().options.body).toEqual({ status: 'suspended', reason: null })
  })

  it('riattiva senza motivo', async () => {
    await setOrganizationStatus('org-1', 'active')
    expect(ultimaChiamata().options.body).toEqual({ status: 'active', reason: null })
  })
})
