import { describe, expect, it } from 'vitest'

import {
  ALL_PROFILE_KEYS,
  DIFFICULTY_OPTIONS,
  PROFILE_SECTIONS,
  countFilled,
  emptyProfile,
  inputToPercent,
  missingEssentials,
  percentToInput,
} from '../../src/components/avatarProfileConfig'

describe('percentuali della scheda', () => {
  it('scrive il valore con il simbolo e lo rilegge senza', () => {
    expect(inputToPercent('60')).toBe('60%')
    expect(percentToInput('60%')).toBe('60')
  })

  it('lascia vuoto un campo svuotato invece di scrivere 0%', () => {
    // Il patto della scheda: un tratto che non si applica resta in bianco.
    // Uno 0% direbbe al modello che il tratto è assente, che è un'altra cosa.
    expect(inputToPercent('')).toBe('')
    expect(inputToPercent('abc')).toBe('')
    expect(percentToInput('')).toBe('')
    expect(percentToInput(undefined)).toBe('')
  })

  it('non lascia superare il 100 e ignora quello che non è cifra', () => {
    expect(inputToPercent('140')).toBe('100%')
    expect(inputToPercent('4x2')).toBe('42%')
  })
})

describe('completezza della scheda', () => {
  it('non conta i campi vuoti o pieni di spazi', () => {
    const profile = { ...emptyProfile(), NOME: 'Anna', COGNOME: '   ', PAURE: 'Perdere il lavoro' }
    expect(countFilled(profile)).toBe(2)
  })

  it('conta solo le chiavi richieste quando gliele si passa', () => {
    const profile = { ...emptyProfile(), NOME: 'Anna', PAURE: 'Perdere il lavoro' }
    expect(countFilled(profile, ['NOME', 'COGNOME'])).toBe(1)
  })

  it('elenca i campi chiave ancora vuoti con la loro etichetta', () => {
    const missing = missingEssentials(emptyProfile())
    expect(missing).toContain('Nome')
    expect(missing).toContain('Tipo di Scenario')

    const filled = { ...emptyProfile(), NOME: 'Anna' }
    expect(missingEssentials(filled)).not.toContain('Nome')
  })
})

describe('definizione della scheda', () => {
  it('non ha chiavi duplicate fra le sezioni', () => {
    expect(new Set(ALL_PROFILE_KEYS).size).toBe(ALL_PROFILE_KEYS.length)
  })

  it('propone opzioni solo per i campi a scelta chiusa', () => {
    for (const field of PROFILE_SECTIONS.flatMap((s) => s.fields)) {
      if (field.options) expect(field.kind).toBe('choice')
      if (field.kind === 'choice') expect(field.options?.length).toBeGreaterThan(0)
    }
  })

  it('offre le dieci difficoltà nel formato che il backend espone', () => {
    expect(DIFFICULTY_OPTIONS).toHaveLength(10)
    expect(DIFFICULTY_OPTIONS[7]).toBe('8/10')
  })
})
