import { useMemo, useState } from 'react'
import type { HTMLAttributes, KeyboardEvent, ReactNode, TdHTMLAttributes } from 'react'
import Tooltip from './Tooltip'
import SearchInput from './SearchInput'
import PaginationBar from './Pagination'
import { usePagination } from '../hooks/usePagination'
import { ChevronDownIcon, ChevronUpIcon, SortIcon } from './icons'

/* Tabella condivisa dell'app: contenitore, header, righe e celle hanno un
 * unico stile definito qui — le pagine descrivono solo colonne e contenuto.
 *
 * Riceve i dati e non le righe già disegnate. La differenza non è di gusto:
 * finché arrivavano come `children`, la pagina costruiva un albero JSX per
 * ogni elemento dell'elenco e la tabella ne mostrava dieci, quindi su un
 * report di tremila valutazioni se ne buttavano via duemilanovecentonovanta
 * a ogni battuta scritta nella ricerca. Con `items` e `renderRow` il taglio
 * avviene prima: si disegna soltanto la pagina che si sta guardando.
 *
 * Sfogliare le righe non è affare suo: quello sta in Pagination, che serve
 * anche agli elenchi che tabella non sono. */

export type SortDirection = 'asc' | 'desc'

/** Su quale colonna un elenco è ordinato, e in che verso. */
export interface SortState {
  /** La `key` della colonna */
  key: string
  direction: SortDirection
}

export interface DataTableColumn<T = unknown> {
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
  /* Il valore su cui questa colonna ordina, letto da una riga. Dichiararlo è
   * quello che rende la colonna ordinabile: le azioni non lo sono, e nemmeno
   * le colonne che mostrano un disegno al posto di un dato.
   *
   * Serve alle tabelle che ordinano da sé. Dove l'ordine lo decide il server
   * (vedi `onSortChange`) la colonna si dichiara ordinabile con `sortable`,
   * perché qui in memoria c'è una finestra sola dell'elenco e il valore
   * delle righe non ancora scaricate non si può leggere. */
  sortValue?: (item: T) => string | number | null | undefined
  /** La colonna si ordina, ma è chi fornisce i dati a farlo. */
  sortable?: boolean
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  /** Gli elementi da mostrare, già filtrati dalla pagina. */
  items: T[]
  /* Come si disegna una riga. Restituisce un elemento con la propria `key`
   * (un `<Tr>`, o un Fragment quando sotto la riga se ne apre una seconda):
   * sono elementi di un elenco, e la chiave è quello con cui React li
   * riconosce da un ordinamento all'altro. */
  renderRow: (item: T) => ReactNode
  /** Cosa si legge al posto delle righe quando `items` è vuoto. */
  emptyMessage?: ReactNode
  /** Valore controllato della barra di ricerca; visibile solo se `onSearchChange` è definito */
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  /** Contenuto opzionale allineato a destra sulla stessa riga della ricerca (es. un bottone azione) */
  searchActions?: ReactNode
  /* Una fascia in fondo alla scheda, sotto quella per sfogliare: la usano gli
   * elenchi che dal server arrivano a finestre, per dire quante righe sono
   * state scaricate sul totale e offrire di chiederne altre. Sta dentro la
   * scheda e non sotto, insieme all'altro conteggio, perché due numeri sulla
   * stessa tabella a distanza di un centimetro si leggono come una
   * contraddizione: qui uno dice quante righe si stanno guardando, l'altro
   * quante ne sono arrivate. */
  footerNote?: ReactNode
  /** Disattiva la paginazione, mostrando tutte le righe senza footer (default: attiva) */
  paginate?: boolean
  /* Cosa rende queste righe un elenco diverso (i filtri attivi, di solito):
   * quando cambia si torna alla prima pagina. L'ordinamento ci finisce da
   * sé, quindi la pagina non ha bisogno di nominarlo. */
  pageResetKey?: string
  /* L'ordinamento deciso da fuori, per le tabelle che leggono l'elenco a
   * finestre: passandolo insieme a `onSortChange` la tabella smette di
   * ordinare e si limita a disegnare l'intestazione attiva. Ordinare qui
   * quelle righe vorrebbe dire ordinare la sola finestra già scaricata, cioè
   * dare per primo della classe il primo dei duecento arrivati. */
  sort?: SortState | null
  onSortChange?: (sort: SortState) => void
  /* Misura sotto la quale le colonne smettono di stringersi e a scorrere è
   * il contenitore. Le percentuali restano quelle dichiarate, ma di una
   * tabella troppo stretta sono percentuali di niente: su un telefono, o
   * in una tabella con dieci colonne, un po' di scorrimento orizzontale si
   * legge meglio di colonne schiacciate. */
  minWidth?: string
}

/* Un confronto solo per tutta l'app, costruito una volta: `localeCompare`
 * chiamato riga per riga rimette insieme le regole della lingua a ogni
 * coppia, e su un elenco lungo è il grosso del tempo dell'ordinamento.
 * `numeric` mette "Tappa 2" prima di "Tappa 10", che è l'ordine che chi
 * legge si aspetta da due nomi che finiscono con un numero. */
const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true })

/* Una cella senza valore non è né la più piccola né la più grande: è una
 * cella che a quella domanda non risponde, quindi resta in fondo in tutti e
 * due i versi invece di prendersi le prime righe a ogni inversione. */
const isBlank = (value: unknown) => value === null || value === undefined || value === ''

type SortableValue = string | number | null | undefined

function compareValues(a: SortableValue, b: SortableValue) {
  if (isBlank(a) || isBlank(b)) return isBlank(a) && isBlank(b) ? 0 : isBlank(a) ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

export default function DataTable<T>({
  columns,
  items,
  renderRow,
  emptyMessage,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Cerca...',
  searchActions,
  footerNote,
  paginate = true,
  pageResetKey = '',
  sort,
  onSortChange,
  minWidth = '880px',
}: DataTableProps<T>) {
  /* Due modi di ordinare, e a distinguerli è la presenza di `onSortChange`:
   * senza, l'ordine è una faccenda interna alla tabella; con, la tabella non
   * ordina niente e si limita a riportare la scelta a chi i dati li ha. */
  const isSortControlled = Boolean(onSortChange)
  const [ownSort, setOwnSort] = useState<SortState | null>(null)
  const activeSort = isSortControlled ? (sort ?? null) : ownSort

  const sortedItems = useMemo(() => {
    if (isSortControlled || !activeSort) return items
    const read = columns.find((col) => col.key === activeSort.key)?.sortValue
    if (!read) return items
    const sign = activeSort.direction === 'asc' ? 1 : -1
    /* Una copia, perché `sort` riordina l'array che riceve: questo arriva da
     * un `useMemo` della pagina, ed è lo stesso che la pagina rilegge per
     * contare le righe e per costruire l'Excel. */
    return [...items].sort((a, b) => {
      const left = read(a)
      const right = read(b)
      // Il verso non tocca le celle vuote, che restano in fondo comunque
      if (isBlank(left) || isBlank(right)) return compareValues(left, right)
      return compareValues(left, right) * sign
    })
  }, [items, columns, activeSort, isSortControlled])

  const isEmpty = items.length === 0
  /* Cambiare colonna o verso rimescola l'elenco, quindi la terza pagina di
   * prima non è la terza pagina di adesso: si riparte dalla prima, come
   * quando cambia un filtro. */
  const sortKey = activeSort ? `${activeSort.key}:${activeSort.direction}` : ''
  const { visible, bar } = usePagination(sortedItems, `${pageResetKey}|${sortKey}`)

  const visibleItems = paginate ? visible : sortedItems
  const showFooter = paginate && !isEmpty
  // Su una tabella vuota non c'è nessuna finestra da allargare
  const showNote = Boolean(footerNote) && !isEmpty

  const hasToolbar = Boolean(onSearchChange || searchActions)

  const toggleSort = (key: string) => {
    /* Una colonna nuova parte dal basso verso l'alto, quella già attiva si
     * rovescia: due clic sulla stessa intestazione sono la domanda opposta,
     * un clic su un'altra è una domanda nuova. */
    const next: SortState =
      activeSort?.key === key
        ? { key, direction: activeSort.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    if (onSortChange) onSortChange(next)
    else setOwnSort(next)
  }

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
              className="max-w-[340px] flex-1 max-md:max-w-none"
            />
          )}
          {/* Su schermo stretto i comandi vanno a capo sotto la ricerca e
              partono da sinistra: spinti a destra resterebbero appesi a un
              bordo con il vuoto davanti. */}
          {searchActions && <div className="ml-auto shrink-0 max-md:ml-0">{searchActions}</div>}
        </div>
      )}
      {/* "overflow-x-auto" serve allo scroll orizzontale e ritaglia anche gli
       * angoli arrotondati che tocca a questo blocco disegnare. */}
      <div
        className={`overflow-x-auto ${hasToolbar ? '' : 'rounded-t-2xl'} ${showFooter || showNote ? '' : 'rounded-b-2xl'}`}
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
                <HeaderCell
                  key={col.key}
                  column={col}
                  sortable={isSortControlled ? Boolean(col.sortable) : Boolean(col.sortValue)}
                  sort={activeSort}
                  onToggle={toggleSort}
                />
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
              visibleItems.map((item) => renderRow(item))
            )}
          </tbody>
        </table>
      </div>
      {showFooter && (
        <PaginationBar
          {...bar}
          className={`border-t border-white/6 bg-gray-900/80 ${showNote ? '' : 'rounded-b-2xl'}`}
        />
      )}
      {showNote && (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-b-2xl border-t border-white/6 bg-gray-900/80 px-4 py-3 text-xs text-slate-500">
          {footerNote}
        </div>
      )}
    </div>
  )
}

const headerCls =
  'border-b border-white/6 bg-gray-900/80 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-400'

/* L'intestazione di una colonna ordinabile è un bottone e non un `th` con un
 * `onClick` sopra: è un comando, quindi deve arrivare anche col tabulatore e
 * con Invio, e chi usa uno screen reader deve sentirlo annunciare come tale.
 * `aria-sort` invece resta sulla cella, che è dove lo standard lo cerca. */
function HeaderCell<T>({
  column,
  sortable,
  sort,
  onToggle,
}: {
  column: DataTableColumn<T>
  sortable: boolean
  sort: SortState | null
  onToggle: (key: string) => void
}) {
  const isActive = sortable && sort?.key === column.key
  const direction = isActive ? sort!.direction : null
  const label = column.title ? (
    <Tooltip content={column.title}>
      <span className="inline-flex">{column.label}</span>
    </Tooltip>
  ) : (
    column.label
  )

  return (
    <th
      aria-label={column.ariaLabel}
      aria-sort={
        sortable
          ? direction === 'asc'
            ? 'ascending'
            : direction === 'desc'
              ? 'descending'
              : 'none'
          : undefined
      }
      className={`${headerCls} ${column.compact ? 'px-3' : 'px-6'}`}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onToggle(column.key)}
          className="group flex w-full cursor-pointer items-center justify-center gap-1.5 border-none bg-transparent p-0 font-[inherit] text-[inherit] tracking-[inherit] text-slate-400 uppercase transition hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
        >
          {label}
          {direction === 'asc' ? (
            <ChevronUpIcon size={13} className="shrink-0 text-violet-400" />
          ) : direction === 'desc' ? (
            <ChevronDownIcon size={13} className="shrink-0 text-violet-400" />
          ) : (
            /* Tenue e non nascosta: un comando che compare solo passandoci
               sopra lo trova chi già sa che c'è. */
            <SortIcon
              size={13}
              className="shrink-0 opacity-40 transition group-hover:opacity-100"
            />
          )}
        </button>
      ) : (
        label
      )}
    </th>
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
