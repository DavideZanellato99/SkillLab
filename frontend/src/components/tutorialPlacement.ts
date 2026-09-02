/* Dove finisce il riquadro della guida, dato l'elemento di cui parla.
 *
 * È un calcolo puro, separato dal componente che lo disegna, perché è
 * l'unica parte con dei casi limite veri: un elemento in fondo allo schermo,
 * uno appiccicato al bordo destro, una finestra troppo bassa perché il
 * riquadro ci stia sopra o sotto. Qui si possono provare tutti senza montare
 * niente.
 *
 * La regola è semplice: sotto l'elemento se ci sta, sopra se sta solo lì,
 * altrimenti al centro della finestra, che è il caso in cui il riquadro
 * coprirebbe comunque qualcosa e tanto vale sia leggibile. In orizzontale
 * segue il centro dell'elemento e rientra dai bordi. */

import type { AnchorRect } from '../hooks/useAnchorRect'

export interface Size {
  width: number
  height: number
}

/** Quanto il ritaglio dell'elemento respira oltre l'elemento stesso. */
export const SPOTLIGHT_PADDING = 8

/** Distanza fra il ritaglio e il riquadro che lo spiega. */
const GAP = 16

/** Il minimo che resta fra il riquadro e il bordo della finestra. */
const EDGE = 12

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

/** L'angolo in alto a sinistra del riquadro, in coordinate di finestra. */
export function placeBox(
  anchor: AnchorRect | null,
  box: Size,
  view: Size,
): { top: number; left: number } {
  /* Senza un elemento da illuminare il riquadro sta al centro: è il passo
     che parla della piattaforma intera, non di un punto dello schermo. */
  if (!anchor) {
    return {
      top: Math.max(EDGE, (view.height - box.height) / 2),
      left: Math.max(EDGE, (view.width - box.width) / 2),
    }
  }

  const below = anchor.top + anchor.height + SPOTLIGHT_PADDING + GAP
  const above = anchor.top - SPOTLIGHT_PADDING - GAP - box.height

  let top: number
  if (below + box.height <= view.height - EDGE) top = below
  else if (above >= EDGE) top = above
  else top = Math.max(EDGE, (view.height - box.height) / 2)

  const centered = anchor.left + anchor.width / 2 - box.width / 2
  const left = clamp(centered, EDGE, view.width - box.width - EDGE)

  return { top, left }
}
