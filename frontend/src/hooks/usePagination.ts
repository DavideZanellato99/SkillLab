import { useEffect, useState } from 'react'

/* Il conto di quale fetta di un elenco mostrare, per chiunque lo sfogli: la
 * tabella condivisa e la griglia dei percorsi. La barra che si vede è
 * PaginationBar, e i due si tengono per mano con `bar`. */

/* Righe per pagina: identiche in ogni elenco dell'app, non configurabili da
 * chi lo mostra. Sono impostate qui perché la barra sia la stessa ovunque, e
 * restano tutte a due cifre: il selettore ha una larghezza fissa, e un valore
 * a tre cifre ci starebbe stretto fino a essere troncato. */
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50]

/** Quello che serve alla barra per disegnarsi e per farsi sfogliare. */
export interface PaginationBarProps {
  page: number
  totalPages: number
  pageSize: number
  total: number
  rangeStart: number
  rangeEnd: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  /** Come si chiama quello che si conta, dove non sono righe di tabella */
  label?: string
  className?: string
}

/** Divide una lista in pagine: `visible` sono gli elementi da mostrare, `bar`
 * è quello che serve alla barra e si passa con lo spread.
 *
 * `resetKey` è cosa rende l'elenco un elenco diverso, per chi ne ha uno: i
 * filtri di una tabella, di solito. Quando cambia si torna a pagina uno,
 * perché restare alla terza pagina di una domanda a cui si è appena smesso di
 * rispondere non vuol dire niente. */
export function usePagination<T>(
  items: T[],
  resetKey?: unknown,
): { visible: T[]; bar: PaginationBarProps } {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])

  useEffect(() => {
    setPage(1)
  }, [resetKey])

  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  // Riporta la pagina in un range valido quando i dati cambiano (es. una ricerca
  // riduce gli elementi filtrati e la pagina corrente non esiste più).
  const safePage = Math.min(page, totalPages)
  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  return {
    visible: items.slice((safePage - 1) * pageSize, safePage * pageSize),
    bar: {
      page: safePage,
      totalPages,
      pageSize,
      total,
      rangeStart: total === 0 ? 0 : (safePage - 1) * pageSize + 1,
      rangeEnd: Math.min(safePage * pageSize, total),
      onPageChange: setPage,
      onPageSizeChange: (size: number) => {
        setPageSize(size)
        setPage(1)
      },
    },
  }
}
