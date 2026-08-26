/* I report in sola lettura dell'area admin: il recap per utente delle
 * conversazioni svolte, i punteggi delle valutazioni e i tentativi sulle
 * simulazioni, da cui la dashboard ricava i suoi conteggi.
 *
 * I download (XLSX del report valutazioni) non stanno qui: producono un file
 * da salvare su disco, non uno stato da tenere in cache. */

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchEvaluationsReport,
  fetchSimulationsReport,
  fetchUserReportDetail,
  fetchUsersReport,
} from '../services/admin'
import { queryKeys } from './queryKeys'

/* Sono le due letture più costose dell'app: il server scandisce le
 * conversazioni del tenant e ne aggrega punteggi e durate. Restano valide più
 * a lungo del minuto di default perché un report è una fotografia d'insieme,
 * e tre minuti di ritardo non cambiano una decisione che si prende su medie
 * di settimane. Quello che invece deve arrivare subito, cioè la correzione di
 * un voto fatta da qui, arriva per invalidazione e non aspetta la scadenza. */
const REPORT_STALE_TIME = 1000 * 60 * 3

/** Recap per utente: quanto ognuno si è allenato nel periodo scelto.
 *
 * `days` restringe i conteggi agli ultimi N giorni e fa parte della chiave:
 * cambiare periodo è una domanda diversa, non lo stesso elenco filtrato.
 *
 * Le righe di prima restano finché non arrivano quelle nuove. Ogni periodo è
 * una voce di cache a sé, quindi senza, cambiare periodo o organizzazione
 * svuotava la pagina: sparivano la tabella, la barra di ricerca e i filtri, e
 * al loro posto compariva una rotella per tutto il tempo della lettura più
 * lenta dell'applicazione. Che i dati siano quelli di prima lo dice
 * `isPlaceholderData`, e la schermata li attenua mentre aspetta. */
export function useUsersReport(organizationId?: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.users(organizationId || undefined, days),
    queryFn: () => fetchUsersReport(organizationId || undefined, days),
    enabled,
    staleTime: REPORT_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

/** Le prove di una persona, che si leggono quando la sua riga si apre.
 *
 * Una voce di cache per persona e per periodo: riaprire la stessa riga non
 * ripaga la lettura, e le eliminazioni fatte da lì invalidano `reports.all`,
 * che comprende anche queste.
 *
 * `enabled` è falso finché la riga è chiusa: l'elenco ne ha una per persona,
 * e sono letture che si fanno una alla volta e solo se qualcuno guarda. */
export function useUserReportDetail(userId: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.userDetail(userId, days),
    queryFn: () => fetchUserReportDetail(userId, days),
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
