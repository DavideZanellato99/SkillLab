/* Un click fuori chiude quello che è aperto.
 *
 * Vale per i pannelli della barra, che si aprono sopra la pagina senza essere
 * modali: chi clicca altrove, sulla pagina o su un altro punto della barra,
 * si aspetta che il pannello si ritiri da sé.
 *
 * Si ascolta il `pointerdown` sul documento e non un velo trasparente steso
 * sotto il pannello, per due ragioni. La prima è che il velo non copre la
 * barra, e un click sul logo o sullo spazio vuoto accanto lasciava il menu
 * aperto. La seconda è che dentro la barra un velo `fixed` non funziona: la
 * barra sfoca quello che le passa dietro (`backdrop-filter`), e un elemento
 * con quel filtro diventa il riferimento dei discendenti `fixed`, che si
 * misurano su di lui e non sulla finestra. Il velo che doveva partire sotto
 * la barra e arrivare in fondo finiva alto zero, e nessun click lo
 * raggiungeva.
 *
 * I riferimenti esclusi sono il pannello e il pulsante che lo apre: il
 * pulsante deve restare quello che lo richiude, con il proprio `onToggle`, e
 * chiuderlo qui al `pointerdown` lo farebbe riaprire subito dopo al click. */

import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useCloseOnClickOutside(
  isOpen: boolean,
  close: () => void,
  refs: RefObject<HTMLElement | null>[],
) {
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (refs.some((ref) => ref.current?.contains(target))) return
      close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // I ref sono stabili per tutta la vita del componente: l'array che li
    // raccoglie cambia identità a ogni render, e metterlo fra le dipendenze
    // rimonterebbe il listener a ogni cambio di stato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, close])
}
