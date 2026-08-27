/* Il registro delle attività, in sola lettura per costruzione: il backend
 * non espone modi per modificarlo o cancellarlo, quindi qui non ci sono
 * mutation e non c'è niente da invalidare.
 *
 * Il registro cresce senza limite, quindi si legge a finestre: la pagina ne
 * chiede una e la estende su richiesta. `useInfiniteQuery` tiene le pagine
 * già lette e ne aggiunge una alla volta, mentre un cambio di filtro genera
 * una chiave nuova e quindi ricomincia da capo, che è il comportamento
 * voluto. */

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { fetchAuditActions, fetchAuditLogs } from '../services/auditLogs'
import { queryKeys } from './queryKeys'

/** Righe lette per volta. */
export const AUDIT_WINDOW_SIZE = 200

/* Il registro si legge come uno storico, non come un cruscotto: una riga
 * comparsa un minuto fa non cambia niente a chi sta indagando. Cinque minuti
 * anche perché al ritorno sulla scheda una query a finestre rilegge tutte le
 * pagine già caricate, e qui possono essere parecchie. */
const AUDIT_STALE_TIME = 1000 * 60 * 5

export interface AuditLogFilters {
  action: string
  organizationId: string
  dateFrom: string
  dateTo: string
  search: string
  /* L'ordinamento sta con i filtri e non a parte perché fa la stessa cosa:
   * cambia la domanda che si fa al server, quindi è una chiave di cache
   * diversa e riparte dalla prima finestra. Ordinare tenendo le pagine già
   * caricate vorrebbe dire rimescolare duecento righe e chiamarle le prime
   * duecento dell'ordine nuovo. */
  sort?: string
  direction?: 'asc' | 'desc'
}

export function useAuditLogs(filters: AuditLogFilters, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.auditLogs.list(filters),
    queryFn: ({ pageParam }) =>
      fetchAuditLogs({ ...filters, limit: AUDIT_WINDOW_SIZE, offset: pageParam }),
    initialPageParam: 0,
    /* La pagina successiva parte da quante righe si hanno già; quando le
     * righe lette raggiungono il totale non c'è più niente da chiedere. */
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled,
    staleTime: AUDIT_STALE_TIME,
    /* Cambiare un filtro o scrivere nella ricerca è una chiave di cache
     * nuova, cioè una query che non ha ancora dati: senza questo la tabella
     * spariva e al suo posto compariva il riquadro di caricamento, con la
     * pagina che saltava a ogni tasto premuto. Con le righe di prima al loro
     * posto (`isPlaceholderData` dice che sono quelle vecchie, e la pagina le
     * attenua) resta solo il tempo di attesa, senza il salto. */
    placeholderData: keepPreviousData,
  })

  const pages = query.data?.pages ?? []
  return {
    ...query,
    logs: pages.flatMap((page) => page.items),
    total: pages.at(-1)?.total ?? 0,
  }
}

/** Le azioni con cui si può filtrare, con la loro etichetta italiana. */
export function useAuditActions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.auditLogs.actions,
    queryFn: fetchAuditActions,
    enabled,
    // L'elenco delle azioni possibili cambia solo con un deploy.
    staleTime: Infinity,
  })
}
