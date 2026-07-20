import { Children, useEffect, useState } from 'react';
import type { HTMLAttributes, ReactNode, TdHTMLAttributes } from 'react';
import Tooltip from './Tooltip';
import Select from './Select';

/* Tabella condivisa dell'app: contenitore, header, righe e celle hanno un
 * unico stile definito qui — le pagine descrivono solo colonne e contenuto. */

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

const paginationBtnCls =
  'flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/6 disabled:hover:bg-white/4 disabled:hover:text-slate-400';

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
  /** Disattiva la paginazione, mostrando tutte le righe senza footer (default: attiva) */
  paginate?: boolean;
  /** Opzioni proposte dal selettore "righe per pagina" (default [10, 25, 50, 100]) */
  pageSizeOptions?: number[];
  /** Righe del corpo: <Tr> con celle <Td>, una per elemento (un <Tr> = una riga di dati) */
  children?: ReactNode;
}

export default function DataTable({
  columns,
  isEmpty = false,
  emptyMessage,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Cerca...',
  paginate = true,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  children,
}: DataTableProps) {
  const rows = Children.toArray(children);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeOptions[0]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  // Riporta la pagina in un range valido quando i dati cambiano (es. una ricerca
  // riduce le righe filtrate e la pagina corrente non esiste più).
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const visibleRows = paginate ? rows.slice((safePage - 1) * pageSize, safePage * pageSize) : rows;
  const rangeStart = totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalRows);
  const showFooter = paginate && !isEmpty && totalRows > 0;

  return (
    <div className="rounded-2xl border border-white/6 bg-gray-900/60 backdrop-blur-md">
      {/* Ricerca e tabella restano nel proprio contenitore "overflow-hidden" (necessario per lo
       * scroll orizzontale e gli angoli arrotondati); il footer sta fuori così la tendina delle
       * righe per pagina, che si apre verso l'alto, non viene tagliata. */}
      <div className={`overflow-hidden ${showFooter ? 'rounded-t-2xl' : 'rounded-2xl'}`}>
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
                visibleRows
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showFooter && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-b-2xl border-t border-white/6 bg-gray-900/80 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="whitespace-nowrap">Righe per pagina</span>
            <Select
              value={String(pageSize)}
              onChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
              options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
              className="w-[77px]"
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="whitespace-nowrap tabular-nums">
              Da {rangeStart} a {rangeEnd} di {totalRows}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={safePage === 1}
                aria-label="Prima pagina"
                className={paginationBtnCls}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m11 17-5-5 5-5" />
                  <path d="m18 17-5-5 5-5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                aria-label="Pagina precedente"
                className={paginationBtnCls}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <span className="min-w-[92px] text-center tabular-nums text-slate-400">
                Pagina {safePage} di {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                aria-label="Pagina successiva"
                className={paginationBtnCls}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={safePage === totalPages}
                aria-label="Ultima pagina"
                className={paginationBtnCls}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 17 5-5-5-5" />
                  <path d="m13 17 5-5-5-5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
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
