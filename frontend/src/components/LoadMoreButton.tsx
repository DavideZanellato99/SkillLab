/* Il pulsante che allarga una finestra: gli elenchi che dal server arrivano a
 * pezzi ne hanno uno in fondo alla tabella, dentro il `footerNote` di
 * DataTable, accanto al conteggio di quante righe si sono scaricate.
 *
 * Le classi erano ricopiate carattere per carattere fra la gestione utenti e
 * il registro attività, e con loro lo spinner e la parola "Caricamento...":
 * qui c'è una volta sola anche quel comportamento, cioè che mentre la finestra
 * arriva il pulsante si spegne e lo dice.
 *
 * L'etichetta la scrive chi lo usa perché porta il conteggio e il suo genere:
 * "Carica altri 200 utenti" non è "Carica altre 200 azioni". */

import type { ReactNode } from 'react'
import Spinner from './Spinner'

interface LoadMoreButtonProps {
  onClick: () => void
  /** La finestra successiva sta arrivando. */
  isLoading: boolean
  children: ReactNode
}

export default function LoadMoreButton({ onClick, isLoading, children }: LoadMoreButtonProps) {
  return (
    <button
      type="button"
      className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
      onClick={onClick}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Spinner variant="button" />
          Caricamento...
        </>
      ) : (
        children
      )}
    </button>
  )
}
