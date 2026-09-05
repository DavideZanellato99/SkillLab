import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useContentDashboard } from '../hooks/useDashboards'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { AvatarStats, SimulationStats } from '../services/dashboards'
import { isAdmin } from '../services/auth'
import DashboardSimulationItems from './DashboardSimulationItems'
import DataTable, { Td, Tr } from './DataTable'
import { useDashboardScope } from './dashboardViews'
import { formatDateTime } from './dateFormat'
import EmptyState from './EmptyState'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import Notice from './Notice'
import { KpiCard } from './scoreCharts'
import { formatScore, scoreTextColor } from './scoreFormat'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import StaleContent from './StaleContent'
import TabBar, { TabPanel } from './TabBar'
import { matchesSearch } from './tableSearch'
import Tooltip from './Tooltip'

/* La vista dei contenuti: cosa è tarato male?
 *
 * Le stesse prove della vista dei punteggi, girate dall'altra parte. Là le
 * righe si raggruppano per persona e la domanda è chi è messo bene; qui si
 * raggruppano per avatar e per test, e la domanda è cosa va riscritto. Sono
 * due domande e non due schermate della stessa: chi guarda qui ha scritto la
 * scheda persona o le domande, e cerca la riga su cui si va peggio.
 *
 * Il criterio più debole accanto alla media è la ragione per cui la tabella
 * degli avatar esiste: la media dice che con questo interlocutore si va
 * male, il criterio dice su cosa, ed è la differenza fra sapere che qualcosa
 * non funziona e sapere cosa cambiare.
 *
 * Sui test si scende ancora di un passo: una riga si apre sulle sue domande
 * una per una, perché una domanda che sbagliano tutti in una media di dieci
 * non si vede. */

type ContentSection = 'avatar' | 'test'

/** Come la scelta si scrive nell'indirizzo, in italiano come le rotte. */
const SECTION_PARAM = 'contenuto'
const TAB_BASE = 'contenuti'

const AVATAR_COLUMNS = [
  { key: 'avatar', label: 'Avatar', width: '22%', sortValue: (a: AvatarStats) => a.avatar_name },
  {
    key: 'conversazioni',
    label: 'Conversazioni',
    width: '13%',
    sortValue: (a: AvatarStats) => a.conversations,
  },
  { key: 'persone', label: 'Persone', width: '10%', sortValue: (a: AvatarStats) => a.people },
  { key: 'media', label: 'Voto medio', width: '12%', sortValue: (a: AvatarStats) => a.avg_score },
  {
    key: 'criterio',
    label: 'Criterio più debole',
    width: '22%',
    sortValue: (a: AvatarStats) => a.weakest_criterion_avg,
  },
  {
    key: 'insufficienti',
    label: 'Insufficienti',
    width: '11%',
    sortValue: (a: AvatarStats) => a.below_pass,
  },
  { key: 'ultima', label: 'Ultima', width: '10%', sortValue: (a: AvatarStats) => a.last_at },
]

const SIMULATION_COLUMNS = [
  {
    key: 'test',
    label: 'Test',
    width: '26%',
    sortValue: (s: SimulationStats) => s.simulation_title,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    width: '16%',
    sortValue: (s: SimulationStats) => s.simulation_kind,
  },
  {
    key: 'tentativi',
    label: 'Tentativi',
    width: '11%',
    sortValue: (s: SimulationStats) => s.attempts,
  },
  { key: 'persone', label: 'Persone', width: '10%', sortValue: (s: SimulationStats) => s.people },
  {
    key: 'media',
    label: 'Voto medio',
    width: '11%',
    sortValue: (s: SimulationStats) => s.avg_score,
  },
  {
    key: 'esatte',
    label: 'Risposte esatte',
    width: '13%',
    sortValue: (s: SimulationStats) => s.correct_rate,
  },
  {
    key: 'insufficienti',
    label: 'Insufficienti',
    width: '13%',
    sortValue: (s: SimulationStats) => s.below_pass,
  },
]

export default function DashboardContent() {
  const { user } = useAuth()
  const { organizationId, days, period } = useDashboardScope()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  /* Il test di cui si stanno guardando le domande. Tiene la riga e non il
     solo id: la finestra scrive titolo e tipo nella propria intestazione, e
     li ha già qui invece di rileggerli. */
  const [openTest, setOpenTest] = useState<SimulationStats | null>(null)

  const section: ContentSection = params.get(SECTION_PARAM) === 'test' ? 'test' : 'avatar'
  const setSection = (value: ContentSection) => {
    const next = new URLSearchParams(params)
    if (value === 'avatar') next.delete(SECTION_PARAM)
    else next.set(SECTION_PARAM, value)
    setParams(next, { replace: true })
  }

  const { data, isPending, isPlaceholderData, error, refetch } = useContentDashboard(
    organizationId,
    days,
    isAdmin(user),
  )

  const avatars = useMemo(
    () => (data?.avatars ?? []).filter((a) => matchesSearch(debouncedSearch, a.avatar_name)),
    [data, debouncedSearch],
  )
  const simulations = useMemo(
    () =>
      (data?.simulations ?? []).filter((s) => matchesSearch(debouncedSearch, s.simulation_title)),
    [data, debouncedSearch],
  )

  if (error) {
    return (
      <LoadError
        message={error instanceof Error ? error.message : 'Impossibile caricare i contenuti.'}
        onRetry={() => void refetch()}
        variant="page"
      />
    )
  }

  if (isPending) return <LoadingState message="Caricamento contenuti..." />

  const hasNothing = !data || (data.avatars.length === 0 && data.simulations.length === 0)
  if (hasNothing) {
    return (
      <EmptyState
        title="Nessun contenuto ancora affrontato"
        hint={
          period === 'all'
            ? 'Le difficoltà compariranno quando le conversazioni verranno valutate, oppure quando verrà consegnato un test'
            : 'Nessuna prova nel periodo selezionato, scegline uno più ampio per vedere i dati disponibili'
        }
      />
    )
  }

  /* Le due righe in cima all'elenco, che è già ordinato dalla media più
     bassa: sono la risposta della pagina, e leggerle dalla tabella
     vorrebbe dire cercarle. */
  const hardestAvatar = data.avatars[0] ?? null
  const hardestTest = data.simulations[0] ?? null
  const criterionLabel = (key: string | null) => (key ? (data.criteria_labels[key] ?? key) : '')

  return (
    <StaleContent isStale={isPlaceholderData}>
      <div className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <KpiCard label="Avatar Più Duro">
          {hardestAvatar ? (
            <>
              <Tooltip content={hardestAvatar.avatar_name} truncateOnly>
                <p className="truncate text-[0.95rem] font-semibold text-slate-100">
                  {hardestAvatar.avatar_name}
                </p>
              </Tooltip>
              <p className={`mt-1 text-xl font-bold ${scoreTextColor(hardestAvatar.avg_score)}`}>
                {formatScore(hardestAvatar.avg_score)}
                <span className="text-xs font-medium text-slate-500"> /10</span>
              </p>
            </>
          ) : (
            <p className="text-2xl text-slate-500">—</p>
          )}
        </KpiCard>
        <KpiCard label="Test Più Duro">
          {hardestTest ? (
            <>
              <Tooltip content={hardestTest.simulation_title} truncateOnly>
                <p className="truncate text-[0.95rem] font-semibold text-slate-100">
                  {hardestTest.simulation_title}
                </p>
              </Tooltip>
              <p className={`mt-1 text-xl font-bold ${scoreTextColor(hardestTest.avg_score)}`}>
                {formatScore(hardestTest.avg_score)}
                <span className="text-xs font-medium text-slate-500"> /10</span>
              </p>
            </>
          ) : (
            <p className="text-2xl text-slate-500">—</p>
          )}
        </KpiCard>
        <KpiCard label="Avatar Affrontati">
          <p className="font-heading text-4xl font-bold text-slate-100">{data.avatars.length}</p>
        </KpiCard>
        <KpiCard label="Test Svolti">
          <p className="font-heading text-4xl font-bold text-slate-100">
            {data.simulations.length}
          </p>
        </KpiCard>
      </div>

      {data.truncated && (
        <Notice className="mb-5">
          Le prove del periodo scelto sono troppe per essere lette in una volta: le medie sono
          calcolate sulle più recenti. Restringi il periodo per avere un intervallo completo
        </Notice>
      )}

      {/* Avatar e test non si guardano insieme: sono due mestieri diversi di
          chi scrive i contenuti, la scheda persona di là e le domande di qua. */}
      <TabBar
        items={[
          { value: 'avatar', label: `Avatar (${data.avatars.length})` },
          { value: 'test', label: `Test tecnici (${data.simulations.length})` },
        ]}
        value={section}
        onChange={setSection}
        ariaLabel="Tipo di contenuto da visualizzare"
        panelBase={TAB_BASE}
      />

      {section === 'avatar' ? (
        <TabPanel base={TAB_BASE} value="avatar">
          <DataTable
            columns={AVATAR_COLUMNS}
            items={avatars}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cerca per nome dell’avatar..."
            pageResetKey={`${organizationId}|${period}|${debouncedSearch}`}
            emptyMessage={
              debouncedSearch
                ? 'Nessun avatar corrisponde alla ricerca'
                : 'Nessun avatar affrontato nella selezione corrente'
            }
            renderRow={(a) => (
              <Tr key={a.avatar_id}>
                <Td align="left">
                  <span className="text-[0.85rem] font-medium text-slate-100">{a.avatar_name}</span>
                </Td>
                <Td className="text-[0.85rem] text-slate-300">{a.conversations}</Td>
                <Td className="text-[0.85rem] text-slate-300">{a.people}</Td>
                <Td>
                  <span className={`text-sm font-bold tabular-nums ${scoreTextColor(a.avg_score)}`}>
                    {formatScore(a.avg_score)}/10
                  </span>
                </Td>
                <Td>
                  {a.weakest_criterion_key ? (
                    <span className="flex items-center justify-center gap-2">
                      <Tooltip content={criterionLabel(a.weakest_criterion_key)} truncateOnly>
                        <span className="truncate text-[0.82rem] text-slate-300">
                          {criterionLabel(a.weakest_criterion_key)}
                        </span>
                      </Tooltip>
                      <span
                        className={`shrink-0 text-[0.82rem] font-semibold tabular-nums ${scoreTextColor(
                          a.weakest_criterion_avg ?? 0,
                        )}`}
                      >
                        {formatScore(a.weakest_criterion_avg ?? 0)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </Td>
                <Td>
                  <span
                    className={`text-[0.85rem] font-semibold ${
                      a.below_pass > 0 ? 'text-red-400' : 'text-slate-400'
                    }`}
                  >
                    {a.below_pass}
                  </span>
                </Td>
                <Td className="text-[0.8rem] text-slate-400">{formatDateTime(a.last_at)}</Td>
              </Tr>
            )}
          />
        </TabPanel>
      ) : (
        <TabPanel base={TAB_BASE} value="test">
          <DataTable
            columns={SIMULATION_COLUMNS}
            items={simulations}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cerca per titolo del test..."
            pageResetKey={`${organizationId}|${period}|${debouncedSearch}`}
            emptyMessage={
              debouncedSearch
                ? 'Nessun test corrisponde alla ricerca'
                : 'Nessun test consegnato nella selezione corrente'
            }
            renderRow={(s) => (
              <Tooltip key={s.simulation_id} content="Vedi le domande una per una" anchor="cursor">
                <Tr onActivate={() => setOpenTest(s)}>
                  <Td align="left">
                    <span className="text-[0.85rem] font-medium text-slate-100">
                      {s.simulation_title}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex items-center justify-center gap-1.5">
                      <SimulationKindBadge kind={s.simulation_kind} />
                      <SimulationSourceBadge source={s.simulation_source} />
                    </span>
                  </Td>
                  <Td className="text-[0.85rem] text-slate-300">{s.attempts}</Td>
                  <Td className="text-[0.85rem] text-slate-300">{s.people}</Td>
                  <Td>
                    <span
                      className={`text-sm font-bold tabular-nums ${scoreTextColor(s.avg_score)}`}
                    >
                      {formatScore(s.avg_score)}/10
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={`text-[0.85rem] font-semibold tabular-nums ${scoreTextColor(
                        s.correct_rate / 10,
                      )}`}
                    >
                      {Math.round(s.correct_rate)}%
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={`text-[0.85rem] font-semibold ${
                        s.below_pass > 0 ? 'text-red-400' : 'text-slate-400'
                      }`}
                    >
                      {s.below_pass}
                    </span>
                  </Td>
                </Tr>
              </Tooltip>
            )}
          />
        </TabPanel>
      )}

      {openTest && (
        <DashboardSimulationItems
          simulationId={openTest.simulation_id}
          simulationTitle={openTest.simulation_title}
          simulationKind={openTest.simulation_kind}
          organizationId={organizationId}
          days={days}
          onClose={() => setOpenTest(null)}
        />
      )}
    </StaleContent>
  )
}
