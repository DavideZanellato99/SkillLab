/* Quello che è ancora a schermo mentre arriva la risposta a una domanda
 * nuova: le righe di prima, attenuate e non più cliccabili.
 *
 * Serve alle tabelle che cambiano filtro senza svuotarsi (`keepPreviousData`
 * in TanStack Query): sostituirle con il riquadro di caricamento faceva
 * sparire tabella, ricerca e filtri, e la pagina saltava a ogni tasto premuto
 * nella ricerca.
 *
 * Era ricopiato in tre pagine, e nelle tre copie era già diverso: due
 * attenuavano al 60% e lasciavano le righe cliccabili, la terza al 50% e le
 * spegneva. Non cliccabili è la versione giusta: un clic su una riga vecchia
 * apre il dettaglio di qualcosa che sta per essere sostituito.
 *
 * `aria-busy` perché chi la pagina non la guarda deve sapere che quello che
 * sente non è ancora la risposta: l'attenuazione lo dice a chi vede. */

import type { ReactNode } from 'react'

export default function StaleContent({
  isStale,
  children,
}: {
  /** Se quello che si vede è ancora la risposta di prima. */
  isStale: boolean
  children: ReactNode
}) {
  return (
    <div
      aria-busy={isStale || undefined}
      className={`transition-opacity ${isStale ? 'pointer-events-none opacity-60' : ''}`}
    >
      {children}
    </div>
  )
}
