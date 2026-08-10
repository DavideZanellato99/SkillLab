import { describe, expect, it } from 'vitest'

import { splitEmotionTag } from './emotionTag'

/* Hume accoda al messaggio dell'utente un tag con le emozioni sentite nella
 * voce. Separarlo bene conta due volte: quello che resta è il testo del
 * messaggio, e se il taglio sbaglia si legge una graffa in mezzo alla
 * trascrizione, oppure sparisce un pezzo di quello che è stato detto. */

describe('splitEmotionTag', () => {
  it('lascia intatto un messaggio senza tag', () => {
    expect(splitEmotionTag('Buongiorno, come posso aiutarla?')).toEqual({
      text: 'Buongiorno, come posso aiutarla?',
      emotions: [],
    })
  })

  it('stacca il tag dal testo', () => {
    const { text, emotions } = splitEmotionTag('Buongiorno {somewhat focused}')

    expect(text).toBe('Buongiorno')
    expect(emotions).toHaveLength(1)
  })

  it('traduce emozione e intensità', () => {
    const [emozione] = splitEmotionTag('Buongiorno {slightly determined}').emotions

    expect(emozione.label).toBe('Determinazione')
    expect(emozione.intensityLabel).toBe('leggermente')
    expect(emozione.level).toBe(1)
    // L'originale resta, per il tooltip
    expect(emozione.raw).toBe('slightly determined')
  })

  it('legge più emozioni separate da virgola', () => {
    const { emotions } = splitEmotionTag('Ho un problema {somewhat focused, very angry}')

    expect(emotions.map((e) => e.label)).toEqual(['Concentrazione', 'Rabbia'])
    expect(emotions.map((e) => e.level)).toEqual([2, 3])
  })

  /* Gli avverbi si provano dal più lungo: "not at all" comincia come niente
   * altro, ma "a little" e "very" si sovrappongono a parole che potrebbero
   * seguirli, e l'ordine sbagliato lascerebbe pezzi di avverbio nel nome
   * dell'emozione. */
  it('riconosce anche gli avverbi composti', () => {
    const [emozione] = splitEmotionTag('Va bene {not at all interested}').emotions

    expect(emozione.label).toBe('Interesse')
    expect(emozione.intensityLabel).toBe('per nulla')
    expect(emozione.level).toBe(1)
  })

  it("accetta un'emozione senza intensità", () => {
    const [emozione] = splitEmotionTag('Va bene {joyful}').emotions

    expect(emozione.label).toBe('Gioia')
    expect(emozione.intensityLabel).toBe('')
    expect(emozione.level).toBe(2)
  })

  /* Un'emozione che non è nella tabella si mostra comunque, in inglese e con
   * l'iniziale maiuscola: perderla vorrebbe dire un badge vuoto sotto un
   * messaggio che invece qualcosa diceva. */
  it("mostra anche un'emozione che non conosce", () => {
    const [emozione] = splitEmotionTag('Va bene {quite peckish}').emotions

    expect(emozione.label).toBe('Peckish')
    expect(emozione.intensityLabel).toBe('piuttosto')
  })

  /* Delle graffe che non contengono emozioni fanno parte del messaggio: è il
   * caso di chi detta del codice o una formula, e tagliarle vorrebbe dire
   * cancellare un pezzo di quello che ha detto. */
  it('non tocca graffe che non descrivono emozioni', () => {
    const contenuto = 'Il campo vale {}'
    expect(splitEmotionTag(contenuto)).toEqual({ text: contenuto, emotions: [] })
  })

  it('taglia solo il tag in fondo, non quelli in mezzo', () => {
    const { text, emotions } = splitEmotionTag('Prima {slightly calm} poi {very tired}')

    expect(text).toBe('Prima {slightly calm} poi')
    expect(emotions.map((e) => e.label)).toEqual(['Stanchezza'])
  })

  it('toglie gli spazi lasciati dal tag', () => {
    expect(splitEmotionTag('Buongiorno   {calm}  ').text).toBe('Buongiorno')
  })

  it('regge un messaggio fatto del solo tag', () => {
    const { text, emotions } = splitEmotionTag('{very tired}')

    expect(text).toBe('')
    expect(emotions).toHaveLength(1)
  })

  it('scarta le voci vuote del tag', () => {
    const { emotions } = splitEmotionTag('Va bene {calm, , tired}')

    expect(emotions.map((e) => e.label)).toEqual(['Calma', 'Stanchezza'])
  })
})
