import { describe, expect, it } from 'vitest'

import { formatDuration } from './reportFormat'

/* La durata come si scrive: è l'unica misura che il report inventa, tutto il
 * resto arriva dal server già calcolato. */

describe('formatDuration', () => {
  it('scrive ore, minuti e secondi secondo quanto è lunga', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(754)).toBe('12 min 34 s')
    expect(formatDuration(3900)).toBe('1 h 05 min')
  })

  it('una durata che non c è resta un trattino', () => {
    expect(formatDuration(0)).toBe('—')
  })
})
