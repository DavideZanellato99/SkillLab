import { Children } from 'react'
import type { HTMLAttributes, KeyboardEvent, ReactNode, TdHTMLAttributes } from 'react'
import Tooltip from './Tooltip'
import SearchInput from './SearchInput'
import PaginationBar from './Pagination'
import { usePagination } from '../hooks/usePagination'

/* Tabella condivisa dell'app: contenitore, header, righe e celle hanno un
 * unico stile definito qui — le pagine descrivono solo colonne e contenuto.
 *
 * Sfogliare le righe non è affare suo: quello sta in Pagination, che serve
 * anche agli elenchi che tabella non sono. */

export interface DataTableColumn {
  key: string
  label?: ReactNode
  /* Larghezza della colonna, in percentuale della tabella (es. '18%'): le
   * percentuali di un elenco di colonne sommano a 100. È obbligatoria
   * perché la tabella è a layout fisso, e una colonna senza misura si
   * prenderebbe quello che avanza invece di quello che le spetta. */
  width: string
  /** Padding orizzontale ridotto (px-3) per colonne numeriche strette */
  compact?: boolean
  /** Tooltip custom sull'intestazione, utile quando `label` è abbreviata */
  title?: string
  /** Nome accessibile per colonne senza label visibile */
  ariaLabel?: string
}

interface DataTableProps {
  columns: DataTableColumn[]
  /** Quando true mostra `emptyMessage` al posto delle righe */
  isEmpty?: boolean
  emptyMessage?: ReactNode
  /** Valore controllato della barra di ricerca; visibile solo se `onSearchChange` è definito */
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  /** Contenuto opzionale allineato a destra sulla stessa riga della ricerca (es. un bottone azione) */
  searchActions?: ReactNode
  /** Disattiva la paginazione, mostrando tutte le righe senza footer (default: attiva) */
  paginate?: boolean
  /* Misura sotto la quale le colonne smettono di stringersi e a scorrere è
   * il contenitore. Le percentuali restano quelle dichiarate, ma di una
   * tabella troppo stretta sono percentuali di niente: su un telefono, o
   * in una tabella con dieci colonne, un po' di scorrimento orizzontale si
   * legge meglio di colonne schiacciate. */
  minWidth?: string
  /** Righe del corpo: <Tr> con celle <Td>, una per elemento (un <Tr> = una riga di dati) */
  children?: ReactNode
}

export default function DataTable({
  columns,
  isEmpty = false,
  emptyMessage,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Cerca...',
  searchActions,
  paginate = true,
  minWidth = '880px',
  children,
}: DataTableProps) {
  const rows = Children.toArray(children)
  const { visible, bar } = usePagination(rows)

  const visibleRows = paginate ? visible : rows
  const showFooter = paginate && !isEmpty && rows.length > 0

  const hasToolbar = Boolean(onSearchChange || searchActions)

  return (
    <div className="rounded-2xl border border-white/6 bg-gray-900/60 backdrop-blur-md">
      {/* La barra dei comandi sta fuori dal contenitore che ritaglia, come il
       * footer: dentro, le tendine dei filtri che si aprono verso il basso
       * verrebbero tagliate dal bordo della tabella. Gli angoli arrotondati
       * se li disegna da sé, visto che è lei il bordo alto della scheda. */}
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-3 rounded-t-2xl border-b border-white/6 bg-gray-900/80 px-4 py-3">
          {onSearchChange && (
            <SearchInput
              value={searchValue}
              onChange={onSearchChange}
              placeholder={searchPlaceholder}
              className="max-w-[340px] flex-1"
            />
          )}
          {searchActions && <div className="ml-auto shrink-0">{searchActions}</div>}
        </div>
      )}
      {/* "overflow-x-auto" serve allo scroll orizzontale e ritaglia anche gli
       * angoli arrotondati che tocca a questo blocco disegnare. */}
      <div
        className={`overflow-x-auto ${hasToolbar ? '' : 'rounded-t-2xl'} ${showFooter ? '' : 'rounded-b-2xl'}`}
      >
        {/* Layout fisso: le colonne stanno alle misure dichiarate qui sotto e
         * non a quelle del contenuto. Senza, la stessa tabella cambia forma a
         * ogni pagina sfogliata, perché basta un'email lunga o un nome corto
         * perché le colonne si spostino sotto il cursore. */}
        {/* Tutto al centro della propria colonna, intestazioni e righe: è la
         * tabella a deciderlo, non la pagina, perché una colonna allineata
         * diversamente dalle altre si legge come una tabella diversa. Per
         * questo una colonna non ha più un `align` da scegliere. */}
        <table
          style={{ minWidth }}
          className="w-full table-fixed border-collapse text-center [&_tbody>tr:last-child>td]:border-b-0"
        >
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
                  aria-label={col.ariaLabel}
                  className={`border-b border-white/6 bg-gray-900/80 ${col.compact ? 'px-3' : 'px-6'} py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-400`}
                >
                  {col.title ? (
                    <Tooltip content={col.title}>
                      <span className="inline-flex">{col.label}</span>
                    </Tooltip>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr>
                <td colSpan={columns.length} className="p-16 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleRows
            )}
          </tbody>
        </table>
      </div>
      {showFooter && (
        <PaginationBar {...bar} className="rounded-b-2xl border-t border-white/6 bg-gray-900/80" />
      )}
    </div>
  )
}

interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Evidenzia la riga al passaggio del mouse (default: attivo) */
  hover?: boolean
  /* La riga apre qualcosa: il dettaglio di una conversazione, un test
   * consegnato, il pannello che si dispiega sotto. Da usare al posto di un
   * `onClick` scritto a mano, che era il modo in cui queste righe si aprivano
   * soltanto col mouse: qui arrivano anche il fuoco da tastiera, Invio e
   * Spazio, e il puntatore a manina, che erano tre cose da ricordarsi ogni
   * volta.
   *
   * Niente `role="button"`: sostituirebbe il ruolo di riga, e chi legge la
   * tabella con uno screen reader perderebbe la griglia (quante righe, quale
   * colonna) proprio nelle tabelle che si aprono. La riga resta una riga, e
   * riceve il fuoco. */
  onActivate?: () => void
}

export function Tr({ hover = true, onActivate, className = '', ...props }: TrProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (!onActivate) return
    /* Solo sulla riga stessa: dentro le celle ci sono bottoni e menu, e
       Invio là dentro è già il loro. */
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    // Spazio su un elemento che ha il fuoco fa scorrere la pagina
    event.preventDefault()
    onActivate()
  }

  return (
    <tr
      className={`transition ${hover ? 'hover:[&>td]:bg-white/4' : ''} ${
        onActivate
          ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-500'
          : ''
      } ${className}`}
      onClick={onActivate}
      onKeyDown={onActivate ? handleKeyDown : undefined}
      tabIndex={onActivate ? 0 : undefined}
      {...props}
    />
  )
}

interface TdProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, 'align'> {
  /** Padding orizzontale ridotto, da usare in colonne `compact` */
  compact?: boolean
  /* Le due eccezioni al centro, che restano eccezioni: la colonna che elenca
   * persone, dove un nome e un'email incolonnati a sinistra si scorrono con
   * l'occhio, e i pannelli che si aprono sotto una riga, che sono elenchi di
   * voci e valori e non righe di colonne. L'intestazione resta al centro in
   * entrambi i casi. Sta qui e non in una classe passata da fuori perché due
   * classi Tailwind in conflitto non si risolvono nell'ordine in cui uno le
   * scrive: qui la cella ne riceve una sola. */
  align?: 'center' | 'left'
}

/* Il contenuto sta al centro della cella in orizzontale e in verticale. Una
 * cella che dentro si costruisce da sé con un flex (un'immagine accanto a un
 * nome, due bottoncini) lo centra con `justify-center`: il centramento del
 * testo non arriva fin lì. */
export function Td({ compact = false, align = 'center', className = '', ...props }: TdProps) {
  return (
    <td
      className={`border-b border-white/6 ${compact ? 'px-3' : 'px-6'} py-4 ${align === 'left' ? 'text-left' : 'text-center'} align-middle break-words ${className}`}
      {...props}
    />
  )
}
