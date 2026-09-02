import { describe, expect, it } from 'vitest'
import { placeBox, SPOTLIGHT_PADDING } from '../../src/components/tutorialPlacement'

/* Dove finisce il riquadro della guida. Sono i casi limite del calcolo, cioè
 * quelli che a schermo si vedono solo su una finestra di una certa misura:
 * l'elemento in fondo alla pagina, quello contro il bordo destro, la finestra
 * troppo bassa perché il riquadro ci stia da nessuna parte. */

const view = { width: 1200, height: 800 }
const box = { width: 360, height: 200 }

describe('senza un elemento da illuminare', () => {
  it('mette il riquadro al centro della finestra', () => {
    expect(placeBox(null, box, view)).toEqual({ top: 300, left: 420 })
  })
})

describe('con un elemento', () => {
  it('lo mette sotto, se sotto ci sta', () => {
    const anchor = { top: 100, left: 500, width: 200, height: 40 }

    const { top, left } = placeBox(anchor, box, view)

    expect(top).toBe(100 + 40 + SPOTLIGHT_PADDING + 16)
    // Centrato sull'elemento: 600 è il suo mezzo, 180 mezzo riquadro
    expect(left).toBe(420)
  })

  it('lo ribalta sopra quando sotto non entra', () => {
    const anchor = { top: 700, left: 500, width: 200, height: 40 }

    const { top } = placeBox(anchor, box, view)

    expect(top).toBe(700 - SPOTLIGHT_PADDING - 16 - box.height)
  })

  it('ripiega al centro quando non entra né sopra né sotto', () => {
    const stretta = { width: 1200, height: 300 }
    const anchor = { top: 120, left: 500, width: 200, height: 40 }

    const { top } = placeBox(anchor, box, stretta)

    expect(top).toBe((stretta.height - box.height) / 2)
  })

  it('rientra dal bordo destro invece di uscire dalla finestra', () => {
    const anchor = { top: 100, left: 1150, width: 40, height: 40 }

    const { left } = placeBox(anchor, box, view)

    expect(left).toBe(view.width - box.width - 12)
  })

  it('rientra dal bordo sinistro allo stesso modo', () => {
    const anchor = { top: 100, left: 4, width: 40, height: 40 }

    const { left } = placeBox(anchor, box, view)

    expect(left).toBe(12)
  })
})
