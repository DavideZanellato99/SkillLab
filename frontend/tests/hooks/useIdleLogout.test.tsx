import { act, renderHook } from '@testing-library/react'
import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useIdleLogout } from '../../src/hooks/useIdleLogout'

/* La disconnessione per inattività è sincronizzata fra le schede: usarne una
 * tiene viva la sessione in tutte, e quando scade una sola scheda fa la
 * disconnessione vera mentre le altre si limitano a dimenticare la sessione.
 * Sbagliarla si vede in due modi opposti: qualcuno buttato fuori mentre sta
 * lavorando in un'altra scheda, o una sessione che non scade mai. */

const TRENTA_MINUTI = 30 * 60 * 1000
const CHIAVE_ATTIVITA = 'skilllab_last_activity'
const CHIAVE_USCITA = 'skilllab_idle_logout'

let onIdle: Mock<() => void>
let onRemoteLogout: Mock<() => void>

function monta(enabled = true) {
  return renderHook(({ attiva }) => useIdleLogout({ enabled: attiva, onIdle, onRemoteLogout }), {
    initialProps: { attiva: enabled },
  })
}

/** Fa passare il tempo lasciando scattare il controllo periodico. */
function passaIlTempo(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/** Un evento `storage`, cioè una scrittura fatta da un'altra scheda. */
function altraScheda(key: string, newValue: string) {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  onIdle = vi.fn()
  onRemoteLogout = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useIdleLogout', () => {
  it("disconnette dopo mezz'ora senza attività", () => {
    monta()

    passaIlTempo(TRENTA_MINUTI - 1000)
    expect(onIdle).not.toHaveBeenCalled()

    passaIlTempo(60 * 1000)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('rimanda la scadenza a ogni gesto', () => {
    monta()

    passaIlTempo(TRENTA_MINUTI - 60 * 1000)
    act(() => {
      window.dispatchEvent(new Event('mousedown'))
    })

    passaIlTempo(TRENTA_MINUTI - 60 * 1000)
    expect(onIdle).not.toHaveBeenCalled()

    passaIlTempo(2 * 60 * 1000)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  /* Lavorare in un'altra scheda tiene viva anche questa: senza, chi legge
   * un report in una scheda si ritroverebbe scollegato nell'altra dove
   * stava scrivendo. */
  it("l'attività di un'altra scheda tiene viva la sessione", () => {
    monta()

    passaIlTempo(TRENTA_MINUTI - 60 * 1000)
    altraScheda(CHIAVE_ATTIVITA, String(Date.now()))

    passaIlTempo(TRENTA_MINUTI - 60 * 1000)
    expect(onIdle).not.toHaveBeenCalled()
  })

  /* Un timestamp più vecchio di quello che si ha già non deve riportare
   * indietro l'orologio: arriva dalla scheda che è rimasta ferma, e
   * accettarlo anticiperebbe la scadenza di quella in uso. */
  it('ignora un timestamp più vecchio di quello che ha già', () => {
    monta()

    act(() => {
      window.dispatchEvent(new Event('keydown'))
    })
    altraScheda(CHIAVE_ATTIVITA, String(Date.now() - TRENTA_MINUTI))

    passaIlTempo(TRENTA_MINUTI - 60 * 1000)
    expect(onIdle).not.toHaveBeenCalled()
  })

  /* La scheda che scade avvisa le altre prima di disconnettersi davvero:
   * loro dimenticano la sessione e basta, o partirebbero tante chiamate di
   * logout quante sono le schede aperte. */
  it('avvisa le altre schede prima di disconnettere', () => {
    monta()

    passaIlTempo(TRENTA_MINUTI + 1000)

    expect(onIdle).toHaveBeenCalledOnce()
    expect(localStorage.getItem(CHIAVE_USCITA)).not.toBeNull()
  })

  it("l'uscita decisa altrove fa solo dimenticare la sessione", () => {
    monta()

    altraScheda(CHIAVE_USCITA, String(Date.now()))

    expect(onRemoteLogout).toHaveBeenCalledOnce()
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('disconnette una volta sola, anche restando aperta', () => {
    monta()

    passaIlTempo(TRENTA_MINUTI + 60 * 1000)
    passaIlTempo(TRENTA_MINUTI)

    expect(onIdle).toHaveBeenCalledOnce()
  })

  /* I timer delle schede in secondo piano vengono rallentati o congelati dal
   * browser: al ritorno in primo piano il controllo va rifatto subito, o una
   * scheda lasciata indietro per ore resterebbe collegata. */
  it('ricontrolla appena la scheda torna in primo piano', () => {
    monta()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')

    // Il tempo passa senza che l'intervallo scatti, come in secondo piano
    vi.setSystemTime(Date.now() + TRENTA_MINUTI + 1000)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('resta ferma quando la scheda torna visibile prima della scadenza', () => {
    monta()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(onIdle).not.toHaveBeenCalled()
  })

  it('non sorveglia niente senza sessione', () => {
    monta(false)

    passaIlTempo(TRENTA_MINUTI * 2)

    expect(onIdle).not.toHaveBeenCalled()
    expect(localStorage.getItem(CHIAVE_ATTIVITA)).toBeNull()
  })

  /* Smontato l'hook non deve restare niente: né il controllo periodico né
   * gli ascoltatori, che continuerebbero a disconnettere una sessione che
   * nel frattempo può essere stata riaperta. */
  it('smette di sorvegliare quando la sessione finisce', () => {
    const { rerender } = monta()

    rerender({ attiva: false })
    passaIlTempo(TRENTA_MINUTI * 2)

    expect(onIdle).not.toHaveBeenCalled()
  })

  it('smette di sorvegliare quando la pagina si smonta', () => {
    const { unmount } = monta()

    unmount()
    passaIlTempo(TRENTA_MINUTI * 2)

    expect(onIdle).not.toHaveBeenCalled()
  })
})
