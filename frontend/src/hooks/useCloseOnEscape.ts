/* Esc chiude quello che è aperto, e riporta il fuoco da dove si era partiti.
 *
 * Vale per tutto ciò che si apre sopra la pagina senza essere una modale (i
 * due menu della barra, la campanella, il pannello che sostituisce le voci su
 * schermo stretto): chi naviga da tastiera si aspetta di poterlo richiudere
 * senza cercare la crocetta, e il listener va tolto quando la cosa si chiude,
 * altrimenti ogni apertura ne lascia in giro uno.
 *
 * Il fuoco torna al pulsante che ha aperto il pannello, quando gli viene
 * passato: chiuso il menu, quel pulsante non esiste più nel DOM come
 * contenitore del fuoco, che finirebbe sul body, cioè in cima alla pagina.
 * Da lì il Tab successivo ricomincerebbe dal salto al contenuto invece di
 * riprendere da dove si era. Solo su Esc e non a ogni chiusura: aprendo una
 * voce si va altrove, e riportare il fuoco sulla barra della pagina appena
 * lasciata sarebbe un salto all'indietro.
 *
 * Le modali non lo usano: hanno la propria gestione dentro ModalShell. */

import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useCloseOnEscape(
  isOpen: boolean,
  close: () => void,
  triggerRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      close()
      triggerRef?.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close, triggerRef])
}
