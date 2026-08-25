/* I report in sola lettura dell'area admin: il recap per utente delle
 * conversazioni svolte, i punteggi delle valutazioni e i tentativi sulle
 * simulazioni, da cui la dashboard ricava i suoi conteggi.
 *
 * I download (XLSX del report valutazioni) non stanno qui: producono un file
 * da salvare su disco, non uno stato da tenere in cache. */

import { useQuery } from '@tanstack/react-query'
import { fetchEvaluationsReport, fetchSimulationsReport, fetchUsersReport } from '../services/admin'
import { queryKeys } from './queryKeys'

/* Sono le due letture più costose dell'app: il server scandisce le
 * conversazioni del tenant e ne aggrega punteggi e durate. Restano valide più
 * a lungo del minuto di default perché un report è una fotografia d'insieme,
 * e tre minuti di ritardo non cambiano una decisione che si prende su medie
 * di settimane. Quello che invece deve arrivare subito, cioè la correzione di
 * un voto fatta da qui, arriva per invalidazione e non aspetta la scadenza. */
const REPORT_STALE_TIME = 1000 * 60 * 3

/** Recap per utente: le due prove svolte, come sono andate e gli obiettivi.
 *
 * `days` restringe le prove agli ultimi N giorni e fa parte della chiave:
 * cambiare periodo è una domanda diversa, non lo stesso elenco filtrato. */
export function useUsersReport(organizationId?: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.users(organizationId || undefined, days),
    queryFn: () => fetchUsersReport(organizationId || undefined, days),
    enabled,
    staleTime: REPORT_STALE_TIME,
  })
}

/** Le righe delle valutazioni, una per conversazione valutata.
 *
 * `days` fa parte della chiave come nel recap per utente: cambiare periodo è
 * una domanda diversa, non lo stesso elenco filtrato dopo. */
export function useEvaluationsReport(organizationId?: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.evaluations(organizationId || undefined, days),
    queryFn: () => fetchEvaluationsReport(organizationId || undefined, days),
    enabled,
    staleTime: REPORT_STALE_TIME,
  })
}

/** Le righe dei tentativi, una per test tecnico consegnato. */
export function useSimulationsReport(organizationId?: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.simulations(organizationId || undefined, days),
    queryFn: () => fetchSimulationsReport(organizationId || undefined, days),
    enabled,
    staleTime: REPORT_STALE_TIME,
  })
}
