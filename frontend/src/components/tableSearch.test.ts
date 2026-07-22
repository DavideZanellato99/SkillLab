import { describe, expect, it } from 'vitest'

import { matchesSearch } from './tableSearch'

describe('matchesSearch', () => {
  it('matches an empty query against anything', () => {
    expect(matchesSearch('', 'qualsiasi')).toBe(true)
    expect(matchesSearch('   ', 'qualsiasi')).toBe(true)
  })

  it('is case insensitive', () => {
    expect(matchesSearch('mario', 'Mario Rossi')).toBe(true)
    expect(matchesSearch('ROSSI', 'Mario Rossi')).toBe(true)
  })

  it('is accent insensitive', () => {
    expect(matchesSearch('citta', 'Città di test')).toBe(true)
    expect(matchesSearch('perché', 'perche')).toBe(true)
  })

  it('matches when any of the values contains the query', () => {
    expect(matchesSearch('rossi', 'Mario', 'Rossi', 'clienti')).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(matchesSearch('bianchi', 'Mario', 'Rossi')).toBe(false)
  })

  it('skips null and undefined values', () => {
    expect(matchesSearch('mario', null, undefined, 'Mario')).toBe(true)
    expect(matchesSearch('mario', null, undefined)).toBe(false)
  })
})
