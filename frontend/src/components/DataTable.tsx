import type { HTMLAttributes, ReactNode, TdHTMLAttributes } from 'react';
import Tooltip from './Tooltip';

/* Tabella condivisa dell'app: contenitore, header, righe e celle hanno un
 * unico stile definito qui — le pagine descrivono solo colonne e contenuto. */

export interface DataTableColumn {
  key: string;
  label?: ReactNode;
  align?: 'left' | 'center' | 'right';
  /** Padding orizzontale ridotto (px-3) per colonne numeriche strette */
  compact?: boolean;
  /** Tooltip custom sull'intestazione, utile quando `label` è abbreviata */
  title?: string;
  /** Nome accessibile per colonne senza label visibile */
  ariaLabel?: string;
}

const ALIGN = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

interface DataTableProps {
  columns: DataTableColumn[];
  /** Quando true mostra `emptyMessage` al posto delle righe */
  isEmpty?: boolean;
  emptyMessage?: ReactNode;
  /** Valore controllato della barra di ricerca; visibile solo se `onSearchChange` è definito */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Righe del corpo: <Tr> con celle <Td> */
  children?: ReactNode;
}

export default function DataTable({
  columns,
  isEmpty = false,
  emptyMessage,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Cerca...',
  children,
}: DataTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/6 bg-gray-900/60 backdrop-blur-md">
      {onSearchChange && (
        <div className="border-b border-white/6 bg-gray-900/80 px-4 py-3">
          <div className="flex max-w-[340px] items-center gap-2 rounded-xl border border-white/6 bg-slate-800/50 px-4 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full border-none bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            {searchValue && (
              <button
                onClick={() => onSearchChange('')}
                aria-label="Cancella ricerca"
                className="shrink-0 cursor-pointer rounded-lg border-none bg-transparent p-1 text-slate-500 transition hover:text-slate-100"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left [&_tbody>tr:last-child>td]:border-b-0">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  aria-label={col.ariaLabel}
                  className={`border-b border-white/6 bg-gray-900/80 ${col.compact ? 'px-3' : 'px-6'} py-4 text-xs font-semibold uppercase tracking-wide text-slate-400 ${ALIGN[col.align ?? 'left']}`}
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
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Evidenzia la riga al passaggio del mouse (default: attivo) */
  hover?: boolean;
}

export function Tr({ hover = true, className = '', ...props }: TrProps) {
  return <tr className={`transition ${hover ? 'hover:[&>td]:bg-white/4' : ''} ${className}`} {...props} />;
}

interface TdProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: 'left' | 'center' | 'right';
  /** Padding orizzontale ridotto, da usare in colonne `compact` */
  compact?: boolean;
}

export function Td({ align = 'left', compact = false, className = '', ...props }: TdProps) {
  return (
    <td
      className={`border-b border-white/6 ${compact ? 'px-3' : 'px-6'} py-4 align-middle ${ALIGN[align]} ${className}`}
      {...props}
    />
  );
}
