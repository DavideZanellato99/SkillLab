/* I due report in sola lettura dell'area admin: il recap per utente delle
 * conversazioni svolte, e i punteggi delle valutazioni da cui la dashboard
 * ricava i suoi conteggi.
 *
 * I download (XLSX del report valutazioni) non stanno qui: producono un file
 * da salvare su disco, non uno stato da tenere in cache. */

import { useQuery } from '@tanstack/react-query'
import { fetchEvaluationsReport, fetchUsersReport } from '../services/admin'
import { queryKeys } from './queryKeys'

/* Sono le due letture più costose dell'app: il server scandisce le
 * conversazioni del tenant e ne aggrega punteggi e durate. Restano valide più
 * a lungo del minuto di default perché un report è una fotografia d'insieme,
 * e tre minuti di ritardo non cambiano una decisione che si prende su medie
 * di settimane. Quello che invece deve arrivare subito, cioè la correzione di
 * un voto fatta da qui, arriva per invalidazione e non aspetta la scadenza. */
const REPORT_STALE_TIME = 1000 * 60 * 3

/** Recap per utente: conversazioni avute e tempo passato in chiamata. */
export function useUsersReport(organizationId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.users(organizationId || undefined),
    queryFn: () => fetchUsersReport(organizationId || undefined),
    enabled,
    staleTime: REPORT_STALE_TIME,
  })
}

/** Le righe delle valutazioni, una per conversazione valutata. */
export function useEvaluationsReport(organizationId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.evaluations(organizationId || undefined),
    queryFn: () => fetchEvaluationsReport(organizationId || undefined),
    enabled,
    staleTime: REPORT_STALE_TIME,
  })
}
