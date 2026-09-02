/* Dov'è, sullo schermo, l'elemento che la guida introduttiva sta
 * illuminando.
 *
 * La misura si rifà a ogni frame finché la guida è aperta, e non a ogni
 * evento che potrebbe spostarla. La differenza è che gli eventi da ascoltare
 * sarebbero tutti quelli sbagliati: lo scroll di una pagina, il ridimensionare
 * la finestra, il menu del proprio account che si apre con la sua animazione
 * e sposta di qualche pixel la voce da illuminare, un elenco che arriva dal
 * server e allunga la pagina sotto. Un `getBoundingClientRect` per frame su un
 * elemento solo non si sente, e vale mentre un riquadro copre lo schermo.
 *
 * Lo stato cambia solo quando la misura cambia davvero, altrimenti sarebbe un
 * render ogni sedici millisecondi.
 *
 * Un selettore che non trova niente restituisce null, e non è un errore: sotto
 * i 1024px le sezioni si ritirano in un pannello, e la voce in fila non esiste
 * più. Chi riceve il null disegna il riquadro al centro. */

import { useEffect, useState } from 'react'

export interface AnchorRect {
  top: number
  left: number
  width: number
  height: number
}

/* Lo stesso selettore trova più di un elemento: le sezioni stanno in fila
 * nella barra e nel pannello che la sostituisce su schermo stretto, e una
 * delle due copie è sempre nascosta. Vale quella che si vede, cioè quella che
 * occupa dello spazio. */
function visibleTarget(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return el
  }
  return null
}

const same = (a: AnchorRect | null, b: AnchorRect | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height)

export function useAnchorRect(selector: string | undefined, active: boolean): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null)

  useEffect(() => {
    if (!active || !selector) {
      setRect(null)
      return
    }

    /* L'elemento può stare fuori dalla parte visibile della pagina: la
       galleria è lunga, e illuminare qualcosa che sta sotto al bordo
       inferiore vorrebbe dire illuminare il vuoto. Una volta sola, quando il
       passo cambia: rifarlo a ogni frame combatterebbe con chi scorre. */
    const target = visibleTarget(selector)
    if (target) {
      const box = target.getBoundingClientRect()
      const offscreen = box.top < 0 || box.bottom > window.innerHeight
      if (offscreen && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }

    let frame = 0
    const read = () => {
      const el = visibleTarget(selector)
      const box = el?.getBoundingClientRect()
      const next = box
        ? { top: box.top, left: box.left, width: box.width, height: box.height }
        : null
      setRect((prev) => (same(prev, next) ? prev : next))
      frame = requestAnimationFrame(read)
    }
    read()

    return () => cancelAnimationFrame(frame)
  }, [selector, active])

  return rect
}
