import { describe, expect, it } from 'vitest'

import {
  GRACE_SECONDS,
  QUESTION_SECONDS,
  formatElapsed,
  pointsAfter,
} from '../../src/components/simulationFormat'

/* La scala del punteggio è scritta due volte, qui e in
 * `backend/simulation_scoring.py`, e la copia che assegna i voti è quella del
 * server. Questi sono gli stessi valori provati da `test_simulation_scoring`:
 * se le due scale si separano, uno dei due file di test lo dice prima che a
 * dirlo sia un utente che legge 0,8 durante la domanda e 0,7 nel riepilogo. */

describe('pointsAfter', () => {
  it.each([
    [0, 1],
    [1_000, 1],
    // Dentro la grazia non si perde niente, per quanto tardi si risponda
    [120_000, 1],
    // I quattro minuti esatti sono ancora punto pieno, il primo istante dopo
    // costa il primo decimo
    [GRACE_SECONDS * 1000, 1],
    [GRACE_SECONDS * 1000 + 1, 0.9],
    [GRACE_SECONDS * 1000 + 10_000, 0.9],
    [GRACE_SECONDS * 1000 + 10_001, 0.8],
    [300_000, 0.4],
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

  it('oltre il minuto passa al cronometro, dove il decimo non serve', () => {
    expect(formatElapsed(59_900)).toBe('59,9s')
    expect(formatElapsed(60_000)).toBe('1:00')
    expect(formatElapsed(125_400)).toBe('2:05')
    expect(formatElapsed(QUESTION_SECONDS * 1000)).toBe('5:30')
  })
})
