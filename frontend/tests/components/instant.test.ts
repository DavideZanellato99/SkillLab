import { describe, expect, it } from 'vitest'

import {
  endOfDayInstant,
  fromLocalInputValue,
  parseInstant,
  startOfDayInstant,
  toLocalInputValue,
} from '../../src/components/instant'

/* I confronti sono costruiti per non dipendere dal fuso della macchina che li
 * esegue: si verifica che il momento prodotto, riletto, cada dove deve nel
 * calendario di chi lo ha scelto. */

describe('parseInstant', () => {
  it('legge come UTC una data che il fuso non ce l’ha', () => {
    expect(parseInstant('2026-03-05T09:05:00').toISOString()).toBe('2026-03-05T09:05:00.000Z')
  })

  it('rispetta il fuso quando la data se lo porta scritto', () => {
    expect(parseInstant('2026-03-05T09:05:00+02:00').toISOString()).toBe('2026-03-05T07:05:00.000Z')
    expect(parseInstant('2026-03-05T09:05:00Z').toISOString()).toBe('2026-03-05T09:05:00.000Z')
  })
})

describe('toLocalInputValue e fromLocalInputValue', () => {
  it('portano un momento dentro un campo e lo riportano indietro intatto', () => {
    const partenza = '2026-03-05T09:05:00Z'
    const nelCampo = toLocalInputValue(partenza)

    expect(nelCampo).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(fromLocalInputValue(nelCampo)).toBe(partenza.replace('Z', '.000Z'))
  })

  it('un campo vuoto non è un momento', () => {
    expect(fromLocalInputValue('')).toBeNull()
  })
})

describe('startOfDayInstant', () => {
  it('è la mezzanotte di quel giorno nel calendario di chi lo ha scelto', () => {
    const inizio = new Date(startOfDayInstant('2026-03-05')!)

    expect(inizio.getFullYear()).toBe(2026)
    expect(inizio.getMonth()).toBe(2)
    expect(inizio.getDate()).toBe(5)
    expect(inizio.getHours()).toBe(0)
    expect(inizio.getMinutes()).toBe(0)
    expect(inizio.getSeconds()).toBe(0)
  })

  /* Il fuso scritto è il punto di tutto: senza, il server confronterebbe con
   * la propria colonna in UTC prendendo la giornata sbagliata a ogni estremo. */
  it('esce con il fuso scritto', () => {
    expect(startOfDayInstant('2026-03-05')).toMatch(/Z$/)
  })

  it('non inventa un giorno da un campo vuoto o malscritto', () => {
    expect(startOfDayInstant('')).toBeNull()
    expect(startOfDayInstant('05/03/2026')).toBeNull()
    expect(startOfDayInstant('2026-03')).toBeNull()
  })
})

describe('endOfDayInstant', () => {
  /* "Fino al 5" comprende tutto il 5: fermarsi a mezzanotte butterebbe via
   * l’intera giornata che si sta chiedendo. */
  it('è l’ultimo istante di quel giorno', () => {
    const fine = new Date(endOfDayInstant('2026-03-05')!)

    expect(fine.getDate()).toBe(5)
    expect(fine.getHours()).toBe(23)
    expect(fine.getMinutes()).toBe(59)
    expect(fine.getSeconds()).toBe(59)
  })

  it('insieme al suo inizio copre la giornata intera', () => {
    const inizio = new Date(startOfDayInstant('2026-03-05')!).getTime()
    const fine = new Date(endOfDayInstant('2026-03-05')!).getTime()

    expect(fine - inizio).toBe(86_400_000 - 1)
  })

  it('non inventa un giorno da un campo vuoto o malscritto', () => {
    expect(endOfDayInstant('')).toBeNull()
    expect(endOfDayInstant('non-una-data')).toBeNull()
  })
})
