import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useDashboardScope } from './dashboardViews'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useUsageDashboard } from '../hooks/useDashboards'
import type { OrganizationUsage } from '../services/dashboards'
import { isSuperAdmin } from '../services/auth'
import DataTable, { Td, Tr } from './DataTable'
import { formatDateTime } from './dateFormat'
import EmptyState from './EmptyState'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import { KpiCard, RateRow, TrendChart } from './scoreCharts'
import { cardCls } from './scoreFormat'
import { formatDuration } from './reportFormat'
import StaleContent from './StaleContent'
import { matchesSearch } from './tableSearch'
import Tooltip from './Tooltip'

/* La vista dell'utilizzo: chi sta usando la piattaforma?
 *
 * Del solo super admin, ed è l'unica vista che lo sia: la domanda è quali
 * organizzazioni si allenano e quali sono ferme, e ha senso solo per chi ne
 * guarda più di una. Chi ne amministra una la stessa cosa la legge nel
 * report attività, persona per persona.
 *
 * Il numero che conta è il rapporto fra le persone che ci sono e quelle che
 * hanno svolto almeno una prova: cento account di cui tre si allenano sono
 * una licenza che non sta servendo, e un conteggio delle sole prove non lo
 * direbbe. Per questo le organizzazioni ci sono tutte, anche a zero: una
 * riga vuota è la risposta, e un elenco delle sole attive nasconderebbe
 * esattamente quelle che si stanno cercando.
 *
 * Le due forme di prova restano separate qui come ovunque: una chiamata e un
 * test consegnato non si sommano in un numero solo, perché non sono la
 * stessa cosa. */

const USAGE_COLUMNS = [
  {
    key: 'organizzazione',
    label: 'Organizzazione',
    width: '24%',
    sortValue: (o: OrganizationUsage) => o.organization_name,
  },
  {
    key: 'persone',
    label: 'Si allenano',
    width: '14%',
    sortValue: (o: OrganizationUsage) => (o.people ? o.active_people / o.people : 0),
  },
  {
    key: 'conversazioni',
    label: 'Conversazioni',
    width: '16%',
    sortValue: (o: OrganizationUsage) => o.conversations,
  },
  {
    key: 'test',
    label: 'Test',
    width: '10%',
    sortValue: (o: OrganizationUsage) => o.attempts,
  },
  {
    key: 'durata',
    label: 'Tempo parlato',
    width: '18%',
    sortValue: (o: OrganizationUsage) => o.total_duration_seconds,
  },
  {
    key: 'ultima',
    label: 'Ultima attività',
    width: '18%',
    sortValue: (o: OrganizationUsage) => o.last_activity_at,
  },
]

export default function DashboardUsage() {
  const { user } = useAuth()
  const { days, period } = useDashboardScope()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  const { data, isPending, isPlaceholderData, error, refetch } = useUsageDashboard(
    days,
    isSuperAdmin(user),
  )

  const organizations = useMemo(
    () =>
      (data?.organizations ?? []).filter((o) =>
        matchesSearch(debouncedSearch, o.organization_name),
      ),
    [data, debouncedSearch],
  )

  /* Le prove al giorno, le due forme sommate: qui la domanda è quanto la
     piattaforma viene usata, non su quale canale, e quello lo dicono le
     colonne della tabella. Il grafico è quello dei voti riusato su un'altra
     misura, quindi il valore sta sulla scala da zero a dieci: oltre le dieci
     prove al giorno la linea si appiattisce in cima, ed è il momento in cui
     conta il numero e non più la forma. */
  const trendPoints = useMemo(
    () =>
      (data?.daily ?? []).map((day) => ({
        date: new Date(day.day),
        avg: Math.min(day.conversations + day.attempts, 10),
        count: day.conversations + day.attempts,
      })),
    [data],
  )

  if (error) {
    return (
      <LoadError
        message={error instanceof Error ? error.message : 'Impossibile caricare l’utilizzo.'}
        onRetry={() => void refetch()}
        variant="page"
      />
    )
  }

  if (isPending) return <LoadingState message="Caricamento utilizzo..." />

  if (!data || data.organizations.length === 0) {
    return (
      <EmptyState
        title="Nessuna organizzazione"
        hint="I numeri compariranno quando verrà creata la prima organizzazione"
      />
    )
  }

  return (
    <StaleContent isStale={isPlaceholderData}>
      <div className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <KpiCard label="Persone che si Allenano">
          <p className="font-heading text-4xl font-bold text-slate-100">
            {data.active_people}
            <span className="text-lg font-medium text-slate-500"> / {data.people}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            almeno una prova {period === 'all' ? 'da sempre' : 'nel periodo'}
          </p>
        </KpiCard>
        <KpiCard label="Conversazioni">
          <p className="font-heading text-4xl font-bold text-slate-100">{data.conversations}</p>
        </KpiCard>
        <KpiCard label="Test Consegnati">
          <p className="font-heading text-4xl font-bold text-slate-100">{data.attempts}</p>
        </KpiCard>
        <KpiCard label="Tempo Parlato">
          <p className="font-heading text-3xl font-bold text-slate-100">
            {formatDuration(data.total_duration_seconds)}
          </p>
          <p className="mt-1 text-xs text-slate-500">dal primo all’ultimo messaggio</p>
        </KpiCard>
      </div>

      <div className={`${cardCls} mb-6`}>
        <h2 className="text-sm font-semibold text-slate-300">Prove al Giorno</h2>
        <p className="mb-4 text-xs text-slate-500">
          Conversazioni e test consegnati, sommati, giorno per giorno
        </p>
        {trendPoints.length > 0 ? (
          <TrendChart points={trendPoints} unit={['prova', 'prove']} />
        ) : (
          <p className="py-10 text-center text-sm italic text-slate-500">
            Nessuna prova nel periodo selezionato.
          </p>
        )}
      </div>

      <div className={`${cardCls} mb-6`}>
        <h2 className="text-sm font-semibold text-slate-300">Quanti si Allenano</h2>
        <p className="mb-4 text-xs text-slate-500">
          Persone con almeno una prova sul totale degli account che si allenano, organizzazione per
          organizzazione
        </p>
        <div className="flex flex-col gap-1.5">
          {data.organizations.map((o) => (
            <RateRow
              key={o.organization_id}
              label={o.organization_name}
              sub={`${o.active_people} su ${o.people} ${o.people === 1 ? 'persona' : 'persone'}`}
              rate={o.people ? (o.active_people / o.people) * 100 : 0}
            />
          ))}
        </div>
      </div>

      <DataTable
        columns={USAGE_COLUMNS}
        items={organizations}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca per organizzazione..."
        pageResetKey={`${period}|${debouncedSearch}`}
        emptyMessage={
          debouncedSearch
            ? 'Nessuna organizzazione corrisponde alla ricerca'
            : 'Nessuna organizzazione'
        }
        renderRow={(o) => (
          <Tr key={o.organization_id}>
            <Td align="left">
              <span className="text-[0.85rem] font-medium text-slate-100">
                {o.organization_name}
              </span>
            </Td>
            <Td>
              <span className="text-[0.85rem] text-slate-300 tabular-nums">
                {o.active_people} / {o.people}
              </span>
            </Td>
            <Td>
              <Tooltip content={`${o.voice_conversations} chiamate, ${o.text_conversations} chat`}>
                <span className="text-[0.85rem] text-slate-300 tabular-nums">
                  {o.conversations}
                </span>
              </Tooltip>
            </Td>
            <Td className="text-[0.85rem] text-slate-300 tabular-nums">{o.attempts}</Td>
            <Td className="text-[0.82rem] text-slate-400">
              {formatDuration(o.total_duration_seconds)}
            </Td>
            <Td className="text-[0.82rem] text-slate-400">
              {o.last_activity_at ? formatDateTime(o.last_activity_at) : '—'}
            </Td>
          </Tr>
        )}
      />
    </StaleContent>
  )
}
