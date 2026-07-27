import { describe, expect, it } from 'vitest'

import { formatTime, formatDate } from './chatFormat'

/* Le stringhe esatte dipendono dal fuso orario della macchina: si verifica il
 * contratto di formato (forma e locale), non i valori assoluti. */
describe('chatFormat', () => {
  it('formatTime returns a zero-padded HH:MM string', () => {
    expect(formatTime('2026-03-05T09:05:00Z')).toMatch(/^\d{2}:\d{2}$/)
  })

  it('formatDate returns a "DD mon YYYY" Italian short date', () => {
    // Two-digit day, a short month name, four-digit year
    expect(formatDate('2026-03-05T09:05:00Z')).toMatch(/^\d{2} \p{L}{3,} \d{4}$/u)
  })
})
