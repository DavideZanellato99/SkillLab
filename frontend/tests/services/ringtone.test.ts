import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startRingback } from '../../src/services/ringtone'

/* jsdom non ha Web Audio, quindi lo squillo non si può sentire: quello che
 * si può guardare è la cadenza che viene programmata prima di suonare, cioè
 * l'unica cosa che questo modulo decide. Un finto AudioContext registra le
 * chiamate e le rende leggibili. */
interface EventoGuadagno {
  tipo: 'valore' | 'rampa'
  valore: number
  quando: number
}

let eventi: EventoGuadagno[]
let oscillatore: {
  type: string
  frequency: { value: number }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}
let chiusure: number

function creaContestoFinto() {
  eventi = []
  chiusure = 0
  oscillatore = {
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }

  return class {
    currentTime = 0
    destination = {}
    createGain() {
      return {
        gain: {
          value: 0,
          setValueAtTime: (valore: number, quando: number) =>
            eventi.push({ tipo: 'valore', valore, quando }),
          linearRampToValueAtTime: (valore: number, quando: number) =>
            eventi.push({ tipo: 'rampa', valore, quando }),
        },
        connect: vi.fn(),
      }
    }
    createOscillator() {
      return oscillatore
    }
    close() {
      chiusure += 1
      return Promise.resolve()
    }
  }
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', creaContestoFinto())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('startRingback', () => {
  it('suona una sinusoide a 425 Hz, il tono europeo', () => {
    startRingback()
    expect(oscillatore.type).toBe('sine')
    expect(oscillatore.frequency.value).toBe(425)
  })

  /* La cadenza è programmata tutta in anticipo e non un secondo alla volta:
   * un timer di JavaScript che deve svegliarsi ogni secondo arriva in
   * ritardo appena la pagina è occupata, e lo squillo verrebbe sfasato. */
  it('programma in anticipo un minuto di cadenza un secondo sì e uno no', () => {
    startRingback()

    const inizioSquilli = eventi.filter((e) => e.tipo === 'rampa' && e.valore > 0)
    expect(inizioSquilli).toHaveLength(30)
    expect(inizioSquilli.map((e) => e.quando)).toEqual(
      Array.from({ length: 30 }, (_, i) => i * 2 + 0.015),
    )

    expect(oscillatore.start).toHaveBeenCalledWith(0)
    expect(oscillatore.stop).toHaveBeenCalledWith(60)
  })

  /* Ogni squillo sale e scende con una rampa invece di accendersi di netto:
   * un'onda che parte a volume pieno si sente come uno schiocco. */
  it('apre e chiude ogni squillo con una rampa', () => {
    startRingback()

    const primoSquillo = eventi.slice(0, 4)
    expect(primoSquillo.map((e) => [e.tipo, e.valore])).toEqual([
      ['valore', 0],
      ['rampa', 0.15],
      ['valore', 0.15],
      ['rampa', 0],
    ])
    expect(primoSquillo[0].quando).toBeCloseTo(0)
    expect(primoSquillo[1].quando).toBeCloseTo(0.015)
    expect(primoSquillo[2].quando).toBeCloseTo(0.985)
    expect(primoSquillo[3].quando).toBeCloseTo(1)
  })

  it('chiude oscillatore e contesto quando si riaggancia', () => {
    startRingback().stop()

    expect(oscillatore.stop).toHaveBeenCalledTimes(2)
    expect(chiusure).toBe(1)
  })

  /* Fermare uno squillo già finito da solo non deve far esplodere niente:
   * succede ogni volta che l'altro risponde sull'ultimo squillo, e
   * l'eccezione arriverebbe in mezzo alla connessione della chiamata. */
  it('sopporta uno stop su un oscillatore già fermo', () => {
    const squillo = startRingback()
    oscillatore.stop.mockImplementation(() => {
      throw new Error('già fermo')
    })

    expect(() => squillo.stop()).not.toThrow()
    expect(chiusure).toBe(1)
  })
})
