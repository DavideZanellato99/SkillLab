import { useState } from 'react'

/**
 * La chiusura di una finestra in cui si sta scrivendo qualcosa.
 *
 * Una modale si chiude in quattro modi (la X, Esc, il clic sullo sfondo, un
 * bottone «Annulla»), e tutti e quattro passano dallo stesso `onClose`. Dove
 * dentro c'è del lavoro non salvato quel gesto costa caro: il pannello delle
 * domande di una simulazione ne tiene fino a cinquanta, scritte una per una,
 * e un Esc premuto per chiudere una tendina che non era aperta le porta via
 * tutte senza dire niente.
 *
 * Non è una conferma in più su ogni chiusura: quando non c'è niente da
 * perdere chiude e basta, ed è il chiamante a dire quando c'è, perché è
 * l'unico che sa cosa ha in mano.
 *
 * Il dialogo non lo disegna questo hook: sta in `UnsavedChangesModal`, così
 * le parole sono le stesse ovunque e chi ne ha di più precise da dire le
 * aggiunge.
 */
export function useCloseGuard(hasUnsavedChanges: boolean, onClose: () => void) {
  const [isAsking, setIsAsking] = useState(false)

  return {
    /** Da passare al posto di `onClose`: chiude, oppure chiede prima. */
    requestClose: () => {
      if (hasUnsavedChanges) setIsAsking(true)
      else onClose()
    },
    /** Se la conferma è aperta adesso. */
    isAsking,
    /** Torna a quello che si stava scrivendo. */
    keepEditing: () => setIsAsking(false),
    /** Chiude comunque, buttando via il lavoro non salvato. */
    discard: () => {
      setIsAsking(false)
      onClose()
    },
  }
}
