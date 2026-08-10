import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { fetchAttempts, fetchComparableUsers, fetchSimulationAttempts } from './comparison'

function ultimaChiamata() {
  const [endpoint, options] = apiFetch.mock.calls.at(-1) as [string, Record<string, unknown>?]
  return { endpoint, options: options ?? {} }
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue([])
})

describe('fetchComparableUsers', () => {
  it('chiede le persone apribili senza nessun filtro', async () => {
    await fetchComparableUsers()
    expect(ultimaChiamata()).toEqual({ endpoint: '/api/comparison/users', options: {} })
  })
})

describe('fetchAttempts', () => {
  it('chiede i tentativi della persona aperta', async () => {
    await fetchAttempts('u-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/comparison/attempts',
      options: { params: { user_id: 'u-1' } },
    })
  })

  /* Senza persona il parametro non c'è: sono i propri, e passarlo vuoto
   * chiederebbe quelli di un utente senza id. */
  it('senza persona chiede i propri', async () => {
    await fetchAttempts()
    expect(ultimaChiamata().options.params).toBeUndefined()
  })
})

describe('fetchSimulationAttempts', () => {
  it('legge i test consegnati da un indirizzo separato dalle conversazioni', async () => {
    await fetchSimulationAttempts('u-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/comparison/simulation-attempts',
      options: { params: { user_id: 'u-1' } },
    })
  })

  it('senza persona chiede i propri', async () => {
    await fetchSimulationAttempts()
    expect(ultimaChiamata().options.params).toBeUndefined()
  })
})
