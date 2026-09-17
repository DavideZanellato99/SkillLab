import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { usePathsDashboard } from '../hooks/useDashboards'
import { useAssignments, usePaths } from '../hooks/useTraining'
import type { PathAssignment } from '../services/training'
import { isAdmin, isSuperAdmin } from '../services/auth'
import { errorMessage } from '../services/errors'
import DashboardAssignmentCards from './DashboardAssignmentCards'
import { PATH_PARAM, useDashboardScope } from './dashboardViews'
import EmptyState from './EmptyState'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import { formatDecimal } from './numberFormat'
import { KpiCard } from './scoreCharts'
import StaleContent from './StaleContent'
import { assignedWithin } from './trainingFormat'

/* La vista dei percorsi: il programma di allenamento funziona?
 *
 * Le altre viste raccontano prove già svolte, una per una o in media. Questa
 * racconta un piano, prima in quattro numeri e poi persona per persona:
 * quanti percorsi sono stati assegnati, quanti sono arrivati in fondo, in
 * quanto tempo, quanti hanno una tappa oltre il termine, e sotto chi sta
 * percorrendo cosa e a che punto è. È la domanda di chi il percorso lo ha
 * composto; comporlo e assegnarlo si fa nella gestione percorsi, che è
 * l'altra metà dello stesso lavoro.
 *
 * I quattro numeri arrivano già contati dal server, le righe sono le stesse
 * assegnazioni che legge la gestione percorsi: due letture e non una, perché
 * i conteggi passano dal progresso di ogni assegnazione e le righe ce l'hanno
 * già dentro, e chiedere al server una risposta che portasse le due cose
 * insieme sarebbe stato ricopiare l'elenco dentro la dashboard. */

/** Come si scrive un numero di giorni: "3,5 giorni", "1 giorno". */
function formatDays(days: number | null): string {
  if (days === null) return '—'
  const rounded = Math.round(days * 10) / 10
  const written = formatDecimal(rounded)
  return `${written} ${rounded === 1 ? 'giorno' : 'giorni'}`
}

/* Il vuoto da mostrare finché le righe non sono arrivate: una costante e
 * non `?? []` sul posto, che sarebbe un array nuovo a ogni render e
 * rifarebbe il filtro sotto a ogni battuta scritta nella ricerca. */
const NO_ASSIGNMENTS: PathAssignment[] = []

export default function DashboardPaths() {
  const { user } = useAuth()
  const { organizationId, days, period } = useDashboardScope()

  /* Il percorso scelto sta nell'indirizzo, che è la sua unica copia: ci si
     arriva anche da fuori, dalla scheda del percorso nella gestione, e un
     collegamento mandato a qualcuno deve aprire la stessa tabella. */
  const [params, setParams] = useSearchParams()
  const pathFilter = params.get(PATH_PARAM) ?? ''
  const setPathFilter = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(PATH_PARAM, value)
    else next.delete(PATH_PARAM)
    setParams(next, { replace: true })
  }

  const { data, isPending, isPlaceholderData, error, refetch } = usePathsDashboard(
    organizationId,
    days,
    isAdmin(user),
  )
  const {
    data: assignments = NO_ASSIGNMENTS,
    isPending: isLoadingAssignments,
    error: assignmentsError,
    refetch: reloadAssignments,
  } = useAssignments(organizationId, undefined, isAdmin(user))
  const { data: paths = [] } = usePaths(organizationId, isAdmin(user))

  /* Il periodo della sezione vale anche per le righe, e si applica qui: i
     quattro numeri contano le assegnazioni fatte negli ultimi N giorni, e
     una tabella che sotto ne mostrasse altre li smentirebbe. Le righe sono
     già tutte in mano, e la data di assegnazione è sulla riga. */
  const rows = useMemo(() => assignedWithin(assignments, days), [assignments, days])

  if (error) {
    return (
      <LoadError
        message={error instanceof Error ? error.message : 'Impossibile caricare i percorsi.'}
        onRetry={() => void refetch()}
        variant="page"
      />
    )
  }

  if (isPending) return <LoadingState message="Caricamento percorsi..." />

  if (!data || data.assignments === 0) {
    return (
      <EmptyState
        title="Nessun percorso assegnato"
        hint={
          period === 'all'
            ? 'I numeri compariranno quando un percorso verrà assegnato a qualcuno dalla gestione percorsi'
            : 'Nessun percorso assegnato nel periodo selezionato, scegline uno più ampio per vedere i dati disponibili'
        }
      />
    )
  }

  const closed = data.completed + data.completed_late

  return (
    /* Il periodo è appena cambiato e questi sono ancora i numeri di prima:
       attenuati finché non arrivano quelli nuovi, invece di una rotella al
       posto della pagina. */
    <StaleContent isStale={isPlaceholderData}>
      <div className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <KpiCard label="Percorsi Assegnati">
          <p className="font-heading text-4xl font-bold text-slate-100">{data.assignments}</p>
          <p className="mt-1 text-xs text-slate-500">
            a {data.people} {data.people === 1 ? 'persona' : 'persone'}
          </p>
        </KpiCard>
        <KpiCard label="Percorsi Chiusi">
          <p className="font-heading text-4xl font-bold text-slate-100">
            {Math.round(data.completion_rate)}
            <span className="text-lg font-medium text-slate-500">%</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {closed} su {data.assignments}
            {data.completed_late > 0 ? `, ${data.completed_late} in ritardo` : ''}
          </p>
        </KpiCard>
        <KpiCard label="Tempo Medio di Chiusura">
          <p className="font-heading text-4xl font-bold text-slate-100">
            {formatDays(data.avg_days_to_complete)}
          </p>
          <p className="mt-1 text-xs text-slate-500">dall’assegnazione all’ultima tappa</p>
        </KpiCard>
        <KpiCard label="Percorsi Scaduti">
          <p
            className={`font-heading text-4xl font-bold ${
              data.overdue > 0 ? 'text-red-400' : 'text-slate-100'
            }`}
          >
            {data.overdue}
          </p>
          <p className="mt-1 text-xs text-slate-500">con una tappa oltre il termine</p>
        </KpiCard>
      </div>

      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-300">Chi sta percorrendo cosa</h2>
        <p className="text-xs text-slate-500">
          Una scheda per persona e percorso, con le tappe in fila: verde superata, arancione
          superata in ritardo, viola aperta adesso, rosso oltre il termine
        </p>
      </div>
      {/* Le righe hanno la loro lettura e il loro errore, separati dai
          quattro numeri: un elenco caduto non è una dashboard vuota, e i
          conteggi arrivati restano dove sono. */}
      {isLoadingAssignments ? (
        <LoadingState message="Caricamento assegnazioni..." />
      ) : assignmentsError ? (
        <LoadError
          message={errorMessage(assignmentsError, 'Impossibile caricare le assegnazioni.')}
          variant="page"
          onRetry={() => void reloadAssignments()}
          className="py-8"
        />
      ) : (
        <DashboardAssignmentCards
          assignments={rows}
          paths={paths}
          pathFilter={pathFilter}
          onPathFilterChange={setPathFilter}
          showOrganization={isSuperAdmin(user)}
          pageResetKey={`${organizationId}|${period}`}
        />
      )}
    </StaleContent>
  )
}
