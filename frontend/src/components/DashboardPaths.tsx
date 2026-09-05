import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { usePathsDashboard } from '../hooks/useDashboards'
import type { PathDeadline, PathStats } from '../services/dashboards'
import { isAdmin } from '../services/auth'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import DataTable, { Td, Tr } from './DataTable'
import { useDashboardScope } from './dashboardViews'
import { formatDateTime } from './dateFormat'
import EmptyState from './EmptyState'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import Notice from './Notice'
import { KpiCard, RateRow } from './scoreCharts'
import { cardCls, formatScore } from './scoreFormat'
import StaleContent from './StaleContent'
import { matchesSearch } from './tableSearch'
import Tooltip from './Tooltip'

/* La vista dei percorsi: il programma di allenamento funziona?
 *
 * Le altre viste raccontano prove già svolte, una per una o in media. Questa
 * racconta un piano: quante persone stanno percorrendo cosa, quante ci
 * arrivano in fondo, in quanto tempo, e su quale tappa si ferma il gruppo.
 * È la domanda di chi il percorso lo ha composto, e finché non c'era si
 * rispondeva aprendo le assegnazioni una alla volta nella gestione percorsi.
 *
 * La tappa è il pezzo che vale la pena guardare: una tappa che nessuno
 * supera è un obiettivo tarato male, e siccome tiene chiuse tutte quelle
 * dopo di lei ferma il percorso di tutti. Per questo la quota di riuscita si
 * misura su chi ci è arrivato e non su tutti gli assegnatari, che in fondo a
 * un percorso lungo sarebbero quasi tutti gente che non ha ancora
 * cominciato.
 *
 * In coda le scadenze, che sono l'unica cosa in tutta l'applicazione che
 * guarda avanti: le tappe aperte con una data, dalla più vicina, scadute
 * comprese. */

/** Come si scrive un numero di giorni: "3,5 giorni", "1 giorno". */
function formatDays(days: number | null): string {
  if (days === null) return '—'
  const rounded = Math.round(days * 10) / 10
  const written = rounded.toLocaleString('it-IT', { maximumFractionDigits: 1 })
  return `${written} ${rounded === 1 ? 'giorno' : 'giorni'}`
}

/** Su quanti si sta misurando una tappa, scritto come si legge. */
function reachedNote(reached: number): string {
  if (reached === 0) return 'Nessuno ci è ancora arrivato'
  return `${reached} ${reached === 1 ? 'persona ci è arrivata' : 'persone ci sono arrivate'}`
}

function PathCard({ path }: { path: PathStats }) {
  return (
    <div className={`${cardCls} mb-6`}>
      <div className="mb-4 flex items-baseline justify-between gap-4 max-sm:flex-col max-sm:gap-1">
        <div className="min-w-0">
          <Tooltip content={path.title} truncateOnly>
            <h2 className="truncate text-sm font-semibold text-slate-300">{path.title}</h2>
          </Tooltip>
          <p className="mt-1 text-xs text-slate-500">
            {path.assignments} {path.assignments === 1 ? 'persona' : 'persone'}
            {path.organization_name ? ` · ${path.organization_name}` : ''} · chiusi in media in{' '}
            {formatDays(path.avg_days_to_complete)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
          <span className="text-emerald-400">{path.completed + path.completed_late} chiusi</span>
          <span className="text-cyan-400">{path.active} in corso</span>
          <span className="text-red-400">{path.overdue} scaduti</span>
        </div>
      </div>

      {path.steps.length === 0 ? (
        <p className="py-4 text-center text-sm italic text-slate-500">
          Percorso ancora senza tappe.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {path.steps.map((step) => (
            <RateRow
              key={step.position}
              label={`${step.position}. ${step.label}`}
              sub={`${reachedNote(step.reached)} · obiettivo ${formatScore(step.target_score)}${
                step.avg_attempts !== null
                  ? ` · ${formatScore(step.avg_attempts)} prove in media`
                  : ''
              }`}
              rate={step.reached ? (step.passed / step.reached) * 100 : 0}
              note={
                step.overdue > 0 ? (
                  <Tooltip content="Persone ferme su questa tappa con il termine già passato">
                    <span className="text-[0.72rem] font-semibold text-red-400">
                      {step.overdue} in ritardo
                    </span>
                  </Tooltip>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

const DEADLINE_COLUMNS = [
  { key: 'persona', label: 'Persona', width: '24%', sortValue: (d: PathDeadline) => d.user_name },
  {
    key: 'percorso',
    label: 'Percorso',
    width: '24%',
    sortValue: (d: PathDeadline) => d.path_title,
  },
  { key: 'tappa', label: 'Tappa', width: '26%', sortValue: (d: PathDeadline) => d.step_position },
  { key: 'scadenza', label: 'Scadenza', width: '16%', sortValue: (d: PathDeadline) => d.due_at },
  { key: 'stato', label: 'Stato', width: '10%', sortValue: (d: PathDeadline) => d.status },
]

export default function DashboardPaths() {
  const { user } = useAuth()
  const { organizationId, days, period } = useDashboardScope()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  const { data, isPending, isPlaceholderData, error, refetch } = usePathsDashboard(
    organizationId,
    days,
    isAdmin(user),
  )

  const deadlines = useMemo(
    () =>
      (data?.deadlines ?? []).filter((d) =>
        matchesSearch(debouncedSearch, d.user_name, d.user_email, d.path_title, d.step_label),
      ),
    [data, debouncedSearch],
  )

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
        title="Nessun percorso affidato"
        hint={
          period === 'all'
            ? 'I numeri compariranno quando un percorso verrà affidato a qualcuno dalla gestione percorsi'
            : 'Nessun percorso affidato nel periodo selezionato, scegline uno più ampio per vedere i dati disponibili'
        }
      />
    )
  }

  const closed = data.completed + data.completed_late

  return (
    /* Il periodo è appena cambiato e queste sono ancora le righe di prima:
       attenuate finché non arrivano quelle nuove, invece di una rotella al
       posto della pagina. */
    <StaleContent isStale={isPlaceholderData}>
      <div className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <KpiCard label="Percorsi Affidati">
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
          <p className="mt-1 text-xs text-slate-500">dall’affidamento all’ultima tappa</p>
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

      <Notice className="mb-6">
        La quota di ogni tappa è calcolata su chi l’ha sbloccata, non su tutti gli assegnatari: una
        tappa in fondo a un percorso lungo la raggiungono in pochi
      </Notice>

      {data.paths.map((path) => (
        <PathCard key={path.path_id} path={path} />
      ))}

      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-300">Scadenze</h2>
        <p className="text-xs text-slate-500">
          Le tappe aperte con un termine, dalla più vicina. Quelle già passate stanno in cima
        </p>
      </div>
      <DataTable
        columns={DEADLINE_COLUMNS}
        items={deadlines}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca per persona, percorso o tappa..."
        pageResetKey={`${organizationId}|${period}|${debouncedSearch}`}
        emptyMessage={
          debouncedSearch
            ? 'Nessuna scadenza corrisponde alla ricerca'
            : 'Nessuna tappa aperta con un termine'
        }
        renderRow={(d) => (
          <Tr key={d.assignment_id}>
            <Td align="left">
              <span className="text-[0.85rem] font-medium text-slate-100">{d.user_name}</span>
              <span className="block text-[0.72rem] text-slate-500">{d.user_email}</span>
            </Td>
            <Td className="text-[0.85rem] text-slate-300">{d.path_title}</Td>
            <Td className="text-[0.85rem] text-slate-300">
              {d.step_position}. {d.step_label}
            </Td>
            <Td className="text-[0.82rem] text-slate-400">{formatDateTime(d.due_at)}</Td>
            <Td>
              <AssignmentStatusBadge status={d.status} />
            </Td>
          </Tr>
        )}
      />
    </StaleContent>
  )
}
