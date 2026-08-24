/* Esc chiude quello che è aperto.
 *
 * Vale per tutto ciò che si apre sopra la pagina senza essere una modale (i
 * due menu della barra, il pannello che la sostituisce su schermo stretto):
 * chi naviga da tastiera si aspetta di poterlo richiudere senza cercare la
 * crocetta, e il listener va tolto quando la cosa si chiude, altrimenti ogni
 * apertura ne lascia in giro uno.
 *
 * Le modali non lo usano: hanno la propria gestione dentro ModalShell. */

import { useEffect } from 'react'

export function useCloseOnEscape(isOpen: boolean, close: () => void) {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close])
}
