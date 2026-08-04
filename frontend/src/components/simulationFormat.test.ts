import { describe, expect, it } from 'vitest'

import { QUESTION_SECONDS, formatElapsed, pointsAfter } from './simulationFormat'

/* La scala del punteggio è scritta due volte, qui e in
 * `backend/simulation_scoring.py`, e la copia che assegna i voti è quella del
 * server. Questi sono gli stessi valori provati da `test_simulation_scoring`:
 * se le due scale si separano, uno dei due file di test lo dice prima che a
 * dirlo sia un utente che legge 0,8 durante la domanda e 0,7 nel riepilogo. */

describe('pointsAfter', () => {
  it.each([
    [0, 1],
    [1_000, 1],
    // Tre secondi esatti sono ancora il primo scalino, il primo istante dopo
    // è già il secondo
    [3_000, 1],
    [3_001, 0.9],
    [6_000, 0.9],
    [15_000, 0.6],
    [27_000, 0.2],
    [QUESTION_SECONDS * 1000, 0.1],
  ])('dopo %ims una risposta giusta vale %s', (elapsed, expected) => {
    expect(pointsAfter(elapsed)).toBe(expected)
  })

  it('un tempo fuori scala rientra invece di dare numeri impossibili', () => {
    expect(pointsAfter(999_000)).toBe(0.1)
    expect(pointsAfter(-5_000)).toBe(1)
  })
})

describe('formatElapsed', () => {
  it('scrive i secondi come si leggono in italiano', () => {
    expect(formatElapsed(8_000)).toBe('8s')
    expect(formatElapsed(8_450)).toBe('8,5s')
    expect(formatElapsed(600)).toBe('0,6s')
  })
})
