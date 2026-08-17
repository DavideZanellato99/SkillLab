import Select from './Select'
import { PAGE_SIZE_OPTIONS } from '../hooks/usePagination'
import type { PaginationBarProps } from '../hooks/usePagination'

/* La barra per sfogliare un elenco lungo: righe per pagina, a che punto si è
 * e i quattro bottoni. Il conto di cosa mostrare lo fa `usePagination`.
 *
 * Nasce dentro DataTable e si è spostata qui quando è servita anche a un
 * elenco che tabella non è, la griglia dei percorsi. Due paginazioni scritte
 * due volte sarebbero due paginazioni che prima o poi non si somigliano più:
 * stessa ragione per cui la casella di ricerca vive in SearchInput. */

/* Larghezza del selettore, tarata sui valori per pagina. Vive qui e non nelle
 * pagine così che nessun elenco possa averlo di una misura diversa. */
const pageSizeSelectCls = 'w-[77px]'

const paginationBtnCls =
  'flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/6 disabled:hover:bg-white/4 disabled:hover:text-slate-400'

export default function PaginationBar({
  page,
  totalPages,
  pageSize,
  total,
  rangeStart,
  rangeEnd,
  onPageChange,
  onPageSizeChange,
  label = 'Righe',
  className = '',
}: PaginationBarProps) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 px-4 py-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="whitespace-nowrap">{label} per pagina</span>
        <Select
          value={String(pageSize)}
          onChange={(value) => onPageSizeChange(Number(value))}
          options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          className={pageSizeSelectCls}
        />
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="whitespace-nowrap tabular-nums">
          Da {rangeStart} a {rangeEnd} di {total}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            aria-label="Prima Pagina"
            className={paginationBtnCls}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m11 17-5-5 5-5" />
              <path d="m18 17-5-5 5-5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label="Pagina Precedente"
            className={paginationBtnCls}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="min-w-[92px] text-center tabular-nums text-slate-400">
            Pagina {page} di {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            aria-label="Pagina Successiva"
            className={paginationBtnCls}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
            aria-label="Ultima Pagina"
            className={paginationBtnCls}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 17 5-5-5-5" />
              <path d="m13 17 5-5-5-5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
