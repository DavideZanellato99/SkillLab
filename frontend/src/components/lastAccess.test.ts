import { describe, expect, it } from 'vitest'

import { formatDateTime, formatRelativeDay } from './lastAccess'

/* `now` è iniettato in ogni caso: un test che dipendesse dall'orologio reale
 * cambierebbe risultato a ogni esecuzione. Le date sono costruite in ora
 * locale, come i confronti che la funzione fa sulla mezzanotte locale. */
const now = new Date(2026, 6, 28, 15, 0) // 28 luglio 2026, 15:00

const daysBefore = (days: number, hour = 10): string =>
  new Date(2026, 6, 28 - days, hour).toISOString()

describe('formatRelativeDay', () => {
  it('counts calendar days, not elapsed hours', () => {
    // Ieri sera: meno di 24 ore fa, ma è comunque un altro giorno
    expect(formatRelativeDay(new Date(2026, 6, 27, 22, 0).toISOString(), now)).toBe('ieri')
    expect(formatRelativeDay(daysBefore(0), now)).toBe('oggi')
  })

  it('uses days up to a week', () => {
    expect(formatRelativeDay(daysBefore(3), now)).toBe('3 giorni fa')
    expect(formatRelativeDay(daysBefore(6), now)).toBe('6 giorni fa')
  })

  it('switches to weeks, then months, then years', () => {
    expect(formatRelativeDay(daysBefore(7), now)).toBe('1 settimana fa')
    expect(formatRelativeDay(daysBefore(20), now)).toBe('2 settimane fa')
    expect(formatRelativeDay(daysBefore(30), now)).toBe('1 mese fa')
    expect(formatRelativeDay(daysBefore(200), now)).toBe('6 mesi fa')
    expect(formatRelativeDay(daysBefore(400), now)).toBe('1 anno fa')
    expect(formatRelativeDay(daysBefore(900), now)).toBe('2 anni fa')
  })

  it('falls back to "oggi" for a date in the future', () => {
    // Orologi disallineati fra server e client: non deve uscire "-1 giorni fa"
    expect(formatRelativeDay(daysBefore(-2), now)).toBe('oggi')
  })

  it('returns a dash for an unparsable value', () => {
    expect(formatRelativeDay('non-una-data', now)).toBe('—')
  })
})

describe('formatDateTime', () => {
  /* La stringa esatta dipende dal fuso della macchina: si verifica la forma. */
  it('returns an Italian date with the time', () => {
    expect(formatDateTime('2026-03-05T09:05:00Z')).toMatch(/^\d{2} \p{L}{3,} \d{4},? \d{2}:\d{2}$/u)
  })
})
