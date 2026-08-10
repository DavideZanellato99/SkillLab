import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Le funzioni qui sotto sono involucri sottili attorno ad apiFetch: quello
 * che vale la pena fissare è l'indirizzo, il verbo e i parametri, cioè le
 * uniche cose che possono divergere in silenzio dal backend. Mockare apiFetch
 * lascia vedere esattamente quelle. */
const apiFetch = vi.fn()
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import {
  assignPath,
  createPath,
  deleteAssignment,
  deletePath,
  fetchAssignableContent,
  fetchAssignableUsers,
  fetchAssignments,
  fetchMyAssignments,
  fetchPaths,
  updatePath,
} from './training'

/** L'ultima chiamata ad apiFetch, come coppia indirizzo/opzioni. */
function ultimaChiamata() {
  const [endpoint, options] = apiFetch.mock.calls.at(-1) as [string, Record<string, unknown>?]
  return { endpoint, options: options ?? {} }
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({})
})

describe('fetchPaths', () => {
  it("filtra per organizzazione quando l'admin ne ha scelta una", async () => {
    await fetchPaths('org-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/training/paths',
      options: { params: { organization_id: 'org-1' } },
    })
  })

  /* Senza organizzazione il parametro non deve comparire vuoto: è il server
   * a decidere lo scope, e "organization_id=" non è la stessa domanda. */
  it('non manda nessun parametro quando lo scope lo decide il server', async () => {
    await fetchPaths()
    expect(ultimaChiamata().options.params).toBeUndefined()
  })
})

describe('scrittura di un percorso', () => {
  const payload = {
    title: 'Onboarding',
    description: null,
    steps: [{ avatar_id: 'a-1', target_score: 7 }],
  }

  it('crea in POST sulla collezione', async () => {
    await createPath(payload)
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/training/paths',
      options: { method: 'POST', body: payload },
    })
  })

  /* PUT e non PATCH: la modifica riscrive il percorso tappe comprese, e
   * mandarne solo una parte cancellerebbe le altre. */
  it('riscrive in PUT sul singolo percorso', async () => {
    await updatePath('p-1', payload)
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/training/paths/p-1',
      options: { method: 'PUT', body: payload },
    })
  })

  it('elimina il singolo percorso', async () => {
    await deletePath('p-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/training/paths/p-1',
      options: { method: 'DELETE' },
    })
  })
})

describe('contenuti e persone assegnabili', () => {
  it('chiede i contenuti dello scope indicato', async () => {
    await fetchAssignableContent('org-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/training/assignable-content',
      options: { params: { organization_id: 'org-1' } },
    })
  })

  it('chiede i contenuti senza scope quando lo impone il server', async () => {
    await fetchAssignableContent()
    expect(ultimaChiamata().options.params).toBeUndefined()
  })

  it("chiede le persone dell'organizzazione indicata", async () => {
    await fetchAssignableUsers('org-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/training/assignable-users',
      options: { params: { organization_id: 'org-1' } },
    })
  })

  it('chiede le persone senza scope quando lo impone il server', async () => {
    await fetchAssignableUsers()
    expect(ultimaChiamata().options.params).toBeUndefined()
  })
})

describe('assegnazioni', () => {
  it('legge le proprie da un indirizzo dedicato', async () => {
    await fetchMyAssignments()
    expect(ultimaChiamata().endpoint).toBe('/api/training/assignments/me')
  })

  it('combina i due filtri di ricerca', async () => {
    await fetchAssignments('org-1', 'p-1')
    expect(ultimaChiamata().options.params).toEqual({
      organization_id: 'org-1',
      path_id: 'p-1',
    })
  })

  /* Un filtro non impostato deve sparire dalla query, non arrivare come
   * chiave vuota: il server la leggerebbe come "nessun percorso" invece che
   * come "tutti". */
  it('lascia fuori il filtro che non è stato scelto', async () => {
    await fetchAssignments(undefined, 'p-1')
    expect(ultimaChiamata().options.params).toEqual({ path_id: 'p-1' })
  })

  it('senza filtri manda una query vuota', async () => {
    await fetchAssignments()
    expect(ultimaChiamata().options.params).toEqual({})
  })

  it('affida un percorso a più persone in una chiamata sola', async () => {
    const payload = { path_id: 'p-1', user_ids: ['u-1', 'u-2'] }
    await assignPath(payload)
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/training/assignments',
      options: { method: 'POST', body: payload },
    })
  })

  it("ritira l'assegnazione, non il percorso", async () => {
    await deleteAssignment('as-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/training/assignments/as-1',
      options: { method: 'DELETE' },
    })
  })
})
