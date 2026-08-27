/* La forma della tabella mentre le righe stanno arrivando.
 *
 * Al suo posto c'era una rotella centrata: la pagina restava vuota per tutta
 * la lettura e poi si riempiva di colpo, spostando in basso tutto quello che
 * stava sotto. Un elenco che arriva è la cosa più prevedibile di questa
 * applicazione, e disegnarne l'ingombro prima che arrivi toglie il salto e
 * accorcia l'attesa percepita, che è l'unica parte dell'attesa su cui si può
 * ancora fare qualcosa.
 *
 * Prende le stesse colonne della tabella vera, quindi le intestazioni sono
 * già al loro posto e le celle grigie stanno alle misure che avranno: è la
 * stessa scheda, senza i dati dentro.
 *
 * È decorativo per chi non lo vede: il contenitore fa da `role="status"` e
 * porta la frase che dice cosa si sta aspettando, esattamente come fa
 * LoadingState, così chi usa uno screen reader sente la stessa cosa di prima
 * invece di una griglia di caselle vuote.
 */

import type { DataTableColumn } from './DataTable'

/* Quante righe finte. Cinque riempiono la scheda quanto basta a farne
 * riconoscere la forma, e restano meno di quante ne arriveranno: uno
 * scheletro più lungo dell'elenco vero farebbe rimpicciolire la scheda
 * proprio nel momento in cui i dati compaiono, che è il salto che questo
 * componente esiste per evitare. */
const ROWS = 5

/* Larghezze diverse riga per riga, in modo che non si legga come una griglia
 * di rettangoli identici: quello che sta arrivando è testo di lunghezze
 * diverse, e lo scheletro lo dice. Il ciclo si ripete ogni tre righe. */
const WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3']

export default function TableSkeleton({
  columns,
  message,
  minWidth = '880px',
}: {
  /** Le stesse della tabella che sta arrivando. */
  columns: DataTableColumn<never>[]
  /** Cosa si sta aspettando, es. "Caricamento avatar...". */
  message: string
  minWidth?: string
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="rounded-2xl border border-white/6 bg-gray-900/60 backdrop-blur-md"
    >
      {/* La frase resta per chi legge con uno screen reader, e non a schermo:
          lì è lo scheletro stesso a dire che si sta caricando. */}
      <span className="sr-only">{message}</span>
      <div className="overflow-x-auto rounded-2xl">
        <table style={{ minWidth }} className="w-full table-fixed border-collapse">
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={{ width: col.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  aria-hidden="true"
                  className={`border-b border-white/6 bg-gray-900/80 ${col.compact ? 'px-3' : 'px-6'} py-4 text-center text-xs font-semibold tracking-wide text-slate-400 uppercase`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody aria-hidden="true" className="animate-pulse">
            {Array.from({ length: ROWS }, (_, row) => (
              <tr key={row}>
                {columns.map((col, index) => (
                  <td
                    key={col.key}
                    className={`border-b border-white/6 ${col.compact ? 'px-3' : 'px-6'} py-4`}
                  >
                    <span
                      className={`mx-auto block h-3 rounded-full bg-white/8 ${WIDTHS[(row + index) % WIDTHS.length]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
