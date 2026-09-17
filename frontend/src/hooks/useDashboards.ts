/* Le letture delle tre dashboard che stanno accanto a quella dei
 * punteggi: i percorsi, l'utilizzo e i propri progressi.
 *
 * Sono aggregati che il server calcola scorrendo le prove del tenant, cioè
 * la stessa famiglia di letture dei rendiconti, e restano valide per lo
 * stesso tempo: una dashboard è una fotografia d'insieme, e tre minuti di
 * ritardo non cambiano una decisione presa su medie di settimane. */

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchMyProgress, fetchPathsDashboard, fetchUsageDashboard } from '../services/dashboards'
import { queryKeys } from './queryKeys'

/** Lo stesso respiro dei rendiconti, per la stessa ragione (vedi useReports). */
const DASHBOARD_STALE_TIME = 1000 * 60 * 3

/** L'avanzamento dei percorsi assegnati, nel periodo e nell'organizzazione. */
export function usePathsDashboard(organizationId?: string, days?: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboards.paths(organizationId || undefined, days),
    queryFn: () => fetchPathsDashboard(organizationId || undefined, days),
    enabled,
    staleTime: DASHBOARD_STALE_TIME,
    /* Le righe di prima restano finché non arrivano quelle nuove: ogni
       periodo è una voce di cache a sé, e senza questo cambiare filtro
       svuotava la pagina per tutto il tempo della lettura. */
    placeholderData: keepPreviousData,
  })
}

/** L'utilizzo per organizzazione, del solo super admin. */
export function useUsageDashboard(days?: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboards.usage(days),
    queryFn: () => fetchUsageDashboard(days),
    enabled,
    staleTime: DASHBOARD_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

/** Le proprie prove, per chi si allena. */
export function useMyProgress(days?: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboards.me(days),
    queryFn: () => fetchMyProgress(days),
    enabled,
    staleTime: DASHBOARD_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}
