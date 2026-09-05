import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useMyProgress } from '../hooks/useDashboards'
import type { MyProgressConversation, MyProgressSimulation } from '../services/dashboards'
import ConversationModeBadge from './ConversationModeBadge'
import DataTable, { Td, Tr } from './DataTable'
import { formatDateTime } from './dateFormat'
import EmptyState from './EmptyState'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import Notice from './Notice'
import { PageContainer, PageHeader } from './PageLayout'
import PeriodOrgFilters from './PeriodOrgFilters'
import { PERIOD_OPTIONS } from './reportFormat'
import type { PeriodValue } from './reportFormat'
import { Delta, KpiCard, MeterRow, TrendChart } from './scoreCharts'
import { cardCls, dailyAverages, formatScore, scoreTextColor } from './scoreFormat'
import type { CriterionAverage } from './scoreFormat'
import SimulationKindBadge from './SimulationKindBadge'
import StaleContent from './StaleContent'
import TabBar, { TabPanel } from './TabBar'
import Tooltip from './Tooltip'

/* I propri progressi: sto migliorando?
 *
 * La stessa domanda della dashboard, fatta su di sé da chi si allena. I
 * grafici sono quelli (vedi scoreCharts), le prove sono le stesse, ma qui
 * dentro non c'è niente che riguardi gli altri: nessuna media di gruppo,
 * nessuna posizione, nessun nome di collega. Una classifica in aula è una
 * domanda diversa, con altre conseguenze, e non è quella che questa pagina
 * pone.
 *
 * Il confronto che c'è è con sé stessi nel tempo: la curva dei voti, lo
 * scarto fra le prime prove e le ultime, e i criteri su cui si perde di più.
 * Il voto è quello finale, correzione del docente compresa, cioè quello che
 * si è visti dare.
 *
 * La pagina del Confronto risponde a un'altra domanda ancora, due tentativi
 * sullo stesso scenario messi uno accanto all'altro: qui c'è l'andamento,
 * là il faccia a faccia. */

type ProgressSection = 'conversazioni' | 'simulazioni'

const SECTION_PARAM = 'prova'
const PERIOD_PARAM = 'periodo'
const TAB_BASE = 'progressi'

const CONVERSATION_COLUMNS = [
  {
    key: 'conversazione',
    label: 'Conversazione',
    width: '34%',
    sortValue: (c: MyProgressConversation) => c.title,
  },
  {
    key: 'avatar',
    label: 'Avatar',
    width: '26%',
    sortValue: (c: MyProgressConversation) => c.avatar_name,
  },
  {
    key: 'data',
    label: 'Data',
    width: '22%',
    sortValue: (c: MyProgressConversation) => c.conversation_at,
  },
  { key: 'voto', label: 'Voto', width: '18%', sortValue: (c: MyProgressConversation) => c.score },
]

const SIMULATION_COLUMNS = [
  {
    key: 'test',
    label: 'Test',
    width: '38%',
    sortValue: (s: MyProgressSimulation) => s.simulation_title,
  },
  {
    key: 'esatte',
    label: 'Risposte esatte',
    width: '20%',
    sortValue: (s: MyProgressSimulation) => s.correct_count / (s.question_count || 1),
  },
  {
    key: 'data',
    label: 'Data',
    width: '24%',
    sortValue: (s: MyProgressSimulation) => s.attempted_at,
  },
  { key: 'voto', label: 'Voto', width: '18%', sortValue: (s: MyProgressSimulation) => s.score },
]

/** Il valore letto dall'indirizzo, se è uno di quelli che esistono. */
function pickOption<T extends string>(
  raw: string | null,
  options: readonly { value: T }[],
  fallback: T,
): T {
  return options.some((o) => o.value === raw) ? (raw as T) : fallback
}

/** Media di un elenco di voti, o null se è vuoto. */
function average(scores: number[]): number | null {
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null
}

/* Quanto è cambiato il voto dalla prima metà delle prove all'ultima.
 *
 * Metà e metà, e non la prima prova contro l'ultima: due prove sole sono due
 * giornate, e una giornata storta racconterebbe un peggioramento che non c'è
 * stato. Sotto le quattro prove non si dice niente, perché lì non c'è ancora
 * un andamento da leggere. */
function improvement(scores: number[]): number | null {
  if (scores.length < 4) return null
  const half = Math.floor(scores.length / 2)
  const before = average(scores.slice(0, half))
  const after = average(scores.slice(scores.length - half))
  return before === null || after === null ? null : after - before
}

export default function ProgressPage() {
  const [params, setParams] = useSearchParams()
  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace: true })
  }

  const period = pickOption<PeriodValue>(params.get(PERIOD_PARAM), PERIOD_OPTIONS, 'all')
  const days = period === 'all' ? undefined : Number(period)
  const section: ProgressSection =
    params.get(SECTION_PARAM) === 'simulazioni' ? 'simulazioni' : 'conversazioni'

  const { data, isPending, isPlaceholderData, error, refetch } = useMyProgress(days)

  const conversations = useMemo(() => data?.conversations ?? [], [data])
  const simulations = useMemo(() => data?.simulations ?? [], [data])

  const conversationTrend = useMemo(
    () =>
      dailyAverages(
        conversations,
        (c) => c.conversation_at,
        (c) => c.score,
      ),
    [conversations],
  )
  const simulationTrend = useMemo(
    () =>
      dailyAverages(
        simulations,
        (s) => s.attempted_at,
        (s) => s.score,
      ),
    [simulations],
  )

  /* Le medie per criterio: dove si perdono punti, che è la cosa su cui si
     può lavorare. Le etichette arrivano dal server insieme ai voti, come in
     ogni altra schermata che le mostra. */
  const criteriaAvgs = useMemo<CriterionAverage[]>(() => {
    const acc = new Map<string, { sum: number; count: number }>()
    const order: string[] = []
    for (const c of conversations) {
      for (const [key, score] of Object.entries(c.criteria)) {
        if (!acc.has(key)) {
          acc.set(key, { sum: 0, count: 0 })
          order.push(key)
        }
        const entry = acc.get(key)!
        entry.sum += score
        entry.count += 1
      }
    }
    return order.map((key) => {
      const e = acc.get(key)!
      return { key, label: data?.criteria_labels[key] ?? key, avg: e.sum / e.count }
    })
  }, [conversations, data])

  const worstCriterion = useMemo(
    () => (criteriaAvgs.length ? criteriaAvgs.reduce((a, b) => (b.avg < a.avg ? b : a)) : null),
    [criteriaAvgs],
  )

  const isConversations = section === 'conversazioni'
  const scores = isConversations
    ? conversations.map((c) => c.score)
    : simulations.map((s) => s.score)
  const avg = average(scores)
  const delta = improvement(scores)
  const rows = isConversations ? conversations : simulations
  const trendPoints = isConversations ? conversationTrend : simulationTrend

  /* Le prove più recenti in cima: la tabella si legge dall'ultima cosa
     fatta, mentre i grafici vanno in avanti nel tempo. */
  const conversationRows = useMemo(() => [...conversations].reverse(), [conversations])
  const simulationRows = useMemo(() => [...simulations].reverse(), [simulations])

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="I Miei Progressi" description={DESCRIPTION} />
        <LoadError
          message={error instanceof Error ? error.message : 'Impossibile caricare i progressi.'}
          onRetry={() => void refetch()}
          variant="page"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title="I Miei Progressi" description={DESCRIPTION} />

      <PeriodOrgFilters
        idPrefix="progressi"
        period={period}
        onPeriodChange={(value) => setParam(PERIOD_PARAM, value === 'all' ? '' : value)}
        onReset={() => setParam(PERIOD_PARAM, '')}
      />

      {isPending ? (
        <LoadingState message="Caricamento dei progressi..." />
      ) : conversations.length === 0 && simulations.length === 0 ? (
        <EmptyState
          title="Nessuna prova ancora"
          hint={
            period === 'all'
              ? 'I grafici compariranno dopo la prima conversazione valutata o il primo test consegnato'
              : 'Nessuna prova nel periodo selezionato, scegline uno più ampio per vedere i dati disponibili'
          }
        />
      ) : (
        <StaleContent isStale={isPlaceholderData}>
          <TabBar
            items={[
              { value: 'conversazioni', label: `Conversazioni (${conversations.length})` },
              { value: 'simulazioni', label: `Test tecnici (${simulations.length})` },
            ]}
            value={section}
            onChange={(value) => setParam(SECTION_PARAM, value === 'conversazioni' ? '' : value)}
            ariaLabel="Tipo di prova da visualizzare"
            panelBase={TAB_BASE}
          />

          {rows.length === 0 ? (
            <Notice>
              {isConversations
                ? 'Nessuna conversazione valutata nel periodo selezionato'
                : 'Nessun test consegnato nel periodo selezionato'}
            </Notice>
          ) : (
            <TabPanel base={TAB_BASE} value={section}>
              <div className="mb-6 grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
                <KpiCard label="Voto Medio">
                  <p className="font-heading text-4xl font-bold text-slate-100">
                    {avg !== null ? (
                      <>
                        <span className={scoreTextColor(avg)}>{formatScore(avg)}</span>
                        <span className="text-lg font-medium text-slate-500"> /10</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </p>
                </KpiCard>
                <KpiCard label={isConversations ? 'Conversazioni Valutate' : 'Test Consegnati'}>
                  <p className="font-heading text-4xl font-bold text-slate-100">{rows.length}</p>
                </KpiCard>
                <KpiCard label="Andamento">
                  {delta !== null ? (
                    <span className="flex items-baseline gap-2">
                      <Delta value={delta} size="lg" />
                      <span className="text-xs text-slate-500">fra le prime prove e le ultime</span>
                    </span>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Servono almeno quattro prove per leggere un andamento
                    </p>
                  )}
                </KpiCard>
              </div>

              <div className={`${cardCls} mb-6`}>
                <h2 className="text-sm font-semibold text-slate-300">Andamento nel Tempo</h2>
                <p className="mb-4 text-xs text-slate-500">
                  {isConversations
                    ? 'Media giornaliera del voto delle conversazioni valutate'
                    : 'Media giornaliera del voto dei test consegnati'}
                </p>
                {trendPoints.length > 0 ? (
                  <TrendChart
                    points={trendPoints}
                    unit={
                      isConversations ? ['valutazione', 'valutazioni'] : ['tentativo', 'tentativi']
                    }
                  />
                ) : (
                  <p className="py-10 text-center text-sm italic text-slate-500">
                    Nessuna prova nel periodo selezionato.
                  </p>
                )}
              </div>

              {isConversations && criteriaAvgs.length > 0 && (
                <div className={`${cardCls} mb-6`}>
                  <h2 className="text-sm font-semibold text-slate-300">Media per Criterio</h2>
                  <p className="mb-4 text-xs text-slate-500">
                    Dove si perdono punti nelle conversazioni valutate
                    {worstCriterion ? `, oggi soprattutto su ${worstCriterion.label}` : ''}
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {criteriaAvgs.map((c) => (
                      <MeterRow key={c.key} label={c.label} score={c.avg} fullLabel />
                    ))}
                  </div>
                </div>
              )}

              {isConversations ? (
                <DataTable
                  columns={CONVERSATION_COLUMNS}
                  items={conversationRows}
                  pageResetKey={period}
                  emptyMessage="Nessuna conversazione valutata"
                  renderRow={(c) => (
                    <Tr key={c.conversation_id}>
                      <Td align="left">
                        <span className="flex items-center gap-2">
                          <ConversationModeBadge mode={c.mode} iconOnly />
                          <span className="text-[0.85rem] font-medium text-slate-100">
                            {c.title}
                          </span>
                        </span>
                      </Td>
                      <Td className="text-[0.85rem] text-slate-300">{c.avatar_name}</Td>
                      <Td className="text-[0.82rem] text-slate-400">
                        {formatDateTime(c.conversation_at)}
                      </Td>
                      <Td>
                        <span
                          className={`text-sm font-bold tabular-nums ${scoreTextColor(c.score)}`}
                        >
                          {formatScore(c.score)}/10
                        </span>
                        {c.has_override && (
                          <Tooltip content="Punteggio corretto dal docente">
                            <span className="block text-[0.7rem] font-semibold text-violet-300">
                              corretto
                            </span>
                          </Tooltip>
                        )}
                      </Td>
                    </Tr>
                  )}
                />
              ) : (
                <DataTable
                  columns={SIMULATION_COLUMNS}
                  items={simulationRows}
                  pageResetKey={period}
                  emptyMessage="Nessun test consegnato"
                  renderRow={(s) => (
                    <Tr key={s.attempt_id}>
                      <Td align="left">
                        <span className="flex items-center gap-2">
                          <SimulationKindBadge kind={s.simulation_kind} />
                          <span className="text-[0.85rem] font-medium text-slate-100">
                            {s.simulation_title}
                          </span>
                        </span>
                      </Td>
                      <Td className="text-[0.85rem] text-slate-300 tabular-nums">
                        {s.correct_count} / {s.question_count}
                      </Td>
                      <Td className="text-[0.82rem] text-slate-400">
                        {formatDateTime(s.attempted_at)}
                      </Td>
                      <Td>
                        <span
                          className={`text-sm font-bold tabular-nums ${scoreTextColor(s.score)}`}
                        >
                          {formatScore(s.score)}/10
                        </span>
                      </Td>
                    </Tr>
                  )}
                />
              )}
            </TabPanel>
          )}
        </StaleContent>
      )}
    </PageContainer>
  )
}

const DESCRIPTION =
  'Come stanno andando le tue prove: la curva dei voti nel tempo, i criteri su cui perdi più punti e l’elenco di quello che hai svolto.'
