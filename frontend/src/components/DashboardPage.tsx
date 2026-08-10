import { useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { fetchEvaluationsReportXlsx } from '../services/admin'
import { useEvaluationsReport, useSimulationsReport } from '../hooks/useReports'
import type { EvaluationReportRow } from '../services/admin'
import { saveBlob } from '../services/api'
import { useOrganizations } from '../hooks/useOrganizations'
import { isAdmin, isSuperAdmin } from '../services/auth'
import SearchSelect from './SearchSelect'
import Select from './Select'
import ConversationModeBadge from './ConversationModeBadge'
import { conversationModeLabel, MODE_FILTERS } from './conversationMode'
import type { ModeFilter } from './conversationMode'
import { KIND_FILTERS } from './simulationFormat'
import type { KindFilter } from './simulationFormat'
import DataTable, { Td, Tr } from './DataTable'
import FilterTabs from './FilterTabs'
import Tooltip from './Tooltip'
import { matchesSearch } from './tableSearch'
import ConversationDetailModal from './ConversationDetailModal'
import DashboardSimulations from './DashboardSimulations'
import TabBar from './TabBar'
import Spinner from './Spinner'
import LoadingState from './LoadingState'
import { PageContainer, PageHeader } from './PageLayout'
import FormError from './FormError'
import { KpiCard, MeterRow, TrendChart } from './scoreCharts'
import {
  cardCls,
  dailyAverages,
  formatDateTime,
  formatScore,
  personName,
  scoreTextColor,
} from './scoreFormat'

/* Dashboard admin: grafici di riepilogo sui punteggi, globali o filtrati per
 * singolo utente tramite la ricerca in alto.
 *
 * Due prove, una linguetta per ciascuna: le conversazioni con gli avatar,
 * valutate da un modello e a volte corrette da un docente, e i test tecnici
 * del simulatore, corretti da soli. Sono due modi di misurare la stessa
 * persona, quindi stanno nella stessa pagina, sotto gli stessi filtri e con
 * gli stessi disegni (vedi scoreCharts), ma non nella stessa colonna: si
 * guarda una prova per volta. */

type DashboardSection = 'conversazioni' | 'simulazioni'

interface CriterionAvg {
  key: string
  label: string
  avg: number
}

/* Intestazioni brevi per le colonne dei criteri nella tabella. La prima parola
 * dell'etichetta completa non basta a distinguerli, "Corretta identificazione
 * del cliente" diventerebbe "Corretta". L'etichetta intera resta nel tooltip.
 * Le chiavi sono quelle di openai_service.EVALUATION_CRITERIA. */
const CRITERION_SHORT_LABELS: Record<string, string> = {
  rispetto_fasi_chiamata: 'Fasi',
  empatia: 'Empatia',
  sicurezza_competenza: 'Sicurezza',
  appropriatezza_linguaggio: 'Linguaggio',
  identificazione_cliente: 'Identificazione',
  comprensione_casistica: 'Casistica',
}

function shortCriterionLabel(key: string, label: string): string {
  return CRITERION_SHORT_LABELS[key] ?? label.split(' ')[0].replace(/[,;:]$/, '')
}

interface UserAvg {
  userId: string
  name: string
  email: string
  avg: number
  count: number
}

/* Come si legge il canale attivo dentro le descrizioni delle sezioni */
const MODE_SUFFIX: Record<ModeFilter, string> = {
  voice: 'sulle chiamate',
  text: 'sulle chat',
  all: 'su chiamate e chat',
}

export default function DashboardPage() {
  const { user } = useAuth()
  const showOrgFilter = isSuperAdmin(user)
  const { data: organizations = [] } = useOrganizations(isSuperAdmin(user))
  const [orgFilter, setOrgFilter] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [section, setSection] = useState<DashboardSection>('conversazioni')
  /* I due selettori (le opzioni stanno in MODE_FILTERS e KIND_FILTERS, che
   * anche il report attivitÃ  usa) scopano l'intera metÃ  in cui vivono: ogni
   * conteggio, media e grafico parte dalle righe giÃ  ristrette.
   *
   * Due default diversi, e non Ã¨ una svista. Il canale parte dalle chiamate
   * perchÃ© al telefono e in chat non si Ã¨ valutati alla pari e mescolarli
   * darebbe una media ambigua. Il tipo parte da "Tutti" perchÃ© i tipi di
   * test sono quattro e tre di loro sono arrivati dopo il primo: un default
   * che ne mostrasse uno solo terrebbe nascosta la maggior parte della
   * dashboard a chi non sa che il selettore esiste. */
  const [modeFilter, setModeFilter] = useState<ModeFilter>('voice')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [search, setSearch] = useState('')
  const [detailRow, setDetailRow] = useState<EvaluationReportRow | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const {
    data: rows = [],
    isPending: isLoadingEvaluations,
    error: loadError,
    refetch,
  } = useEvaluationsReport(orgFilter, isAdmin(user))

  /* L'altra metÃ  della pagina. Ãˆ una query a parte e non un campo in piÃ¹
   * della prima: le due prove hanno una riga per volta ciascuna, e chi non
   * usa il simulatore non deve pagare la scansione dei tentativi dentro la
   * lettura delle valutazioni. */
  const {
    data: simulationRows = [],
    isPending: isLoadingSimulations,
    error: simulationsError,
  } = useSimulationsReport(orgFilter, isAdmin(user))

  const isLoading = isLoadingEvaluations || isLoadingSimulations

  /* L'errore mostrato Ã¨ quello del caricamento, o quello dell'esportazione se
   * Ã¨ lei a essere andata storta: sono due modi di non avere il report. */
  const error =
    exportError ||
    (loadError instanceof Error ? loadError.message : '') ||
    (simulationsError instanceof Error ? simulationsError.message : '')

  /* Excel del report: stesse righe della dashboard (stesso scope server
   * per organizzazione), i filtri piÃ¹ fini li offre il foglio stesso.
   * Resta fuori da TanStack perchÃ© produce un file da salvare, non uno
   * stato da tenere in cache. */
  const handleExportXlsx = async () => {
    if (isExporting) return
    setIsExporting(true)
    setExportError('')
    try {
      const blob = await fetchEvaluationsReportXlsx(orgFilter || undefined)
      saveBlob(blob, `report-valutazioni-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Esportazione non riuscita.')
    } finally {
      setIsExporting(false)
    }
  }

  const orgFilterOptions = [
    { value: '', label: 'Tutte le organizzazioni' },
    ...organizations.map((o) => ({ value: o.id, label: o.name })),
  ]

  /* Il selettore di canale sta a monte di tutto il resto: ogni conteggio,
   * media e grafico qui sotto parte da queste righe, non da rows. */
  const scopedRows = useMemo(
    () => (modeFilter === 'all' ? rows : rows.filter((r) => r.mode === modeFilter)),
    [rows, modeFilter],
  )

  /* Utenti presenti nei dati (per la ricerca utente), da entrambe le prove:
   * il filtro vale per tutta la pagina, quindi chi ha solo svolto dei test
   * deve poterci finire dentro.
   * Volutamente su tutte le righe e non su scopedRows: se l'elenco si
   * restringesse col canale, l'utente selezionato potrebbe sparire dalle
   * opzioni e la sua chip svanirebbe pur restando il filtro attivo. */
  const usersInData = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>()
    for (const r of [...rows, ...simulationRows]) {
      if (!map.has(r.user_id)) map.set(r.user_id, { name: personName(r), email: r.user_email })
    }
    return Array.from(map, ([id, u]) => ({ id, ...u })).sort((a, b) =>
      a.name.localeCompare(b.name, 'it'),
    )
  }, [rows, simulationRows])

  /* Il filtro utente scopa KPI, andamento e criteri */
  const filtered = useMemo(
    () => (selectedUserId ? scopedRows.filter((r) => r.user_id === selectedUserId) : scopedRows),
    [scopedRows, selectedUserId],
  )

  const overallAvg = useMemo(
    () =>
      filtered.length
        ? filtered.reduce((sum, r) => sum + r.overall_score, 0) / filtered.length
        : null,
    [filtered],
  )

  /* Media per giorno (asse temporale del grafico a linee) */
  const trendPoints = useMemo(
    () =>
      dailyAverages(
        filtered,
        (r) => r.conversation_at,
        (r) => r.overall_score,
      ),
    [filtered],
  )

  /* Media per criterio, nell'ordine in cui i criteri arrivano dal backend */
  const criteriaAvgs = useMemo<CriterionAvg[]>(() => {
    const acc = new Map<string, { label: string; sum: number; count: number }>()
    const order: string[] = []
    for (const r of filtered) {
      for (const c of r.criteria) {
        if (!acc.has(c.key)) {
          acc.set(c.key, { label: c.label, sum: 0, count: 0 })
          order.push(c.key)
        }
        const entry = acc.get(c.key)!
        entry.sum += c.score
        entry.count += 1
      }
    }
    return order.map((key) => {
      const e = acc.get(key)!
      return { key, label: e.label, avg: e.sum / e.count }
    })
  }, [filtered])

  const bestCriterion = useMemo(
    () => (criteriaAvgs.length ? criteriaAvgs.reduce((a, b) => (b.avg > a.avg ? b : a)) : null),
    [criteriaAvgs],
  )
  const worstCriterion = useMemo(
    () => (criteriaAvgs.length ? criteriaAvgs.reduce((a, b) => (b.avg < a.avg ? b : a)) : null),
    [criteriaAvgs],
  )

  /* Confronto tra utenti: sempre su tutti gli utenti del canale attivo,
   * il filtro utente evidenzia soltanto */
  const userAvgs = useMemo<UserAvg[]>(() => {
    const acc = new Map<string, UserAvg & { sum: number }>()
    for (const r of scopedRows) {
      const entry = acc.get(r.user_id) ?? {
        userId: r.user_id,
        name: personName(r),
        email: r.user_email,
        avg: 0,
        count: 0,
        sum: 0,
      }
      entry.sum += r.overall_score
      entry.count += 1
      acc.set(r.user_id, entry)
    }
    return Array.from(acc.values())
      .map((e) => ({
        userId: e.userId,
        name: e.name,
        email: e.email,
        avg: e.sum / e.count,
        count: e.count,
      }))
      .sort((a, b) => b.avg - a.avg)
  }, [scopedRows])

  const detailRows = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.conversation_at).getTime() - new Date(a.conversation_at).getTime(),
      ),
    [filtered],
  )

  const searchedRows = useMemo(
    () =>
      detailRows.filter((r) =>
        matchesSearch(
          search,
          r.conversation_title,
          // The channel is searchable by the same word the badge shows
          conversationModeLabel(r.mode),
          personName(r),
          r.user_email,
          r.avatar_name,
          formatDateTime(r.conversation_at),
        ),
      ),
    [detailRows, search],
  )

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Riepilogo dei punteggi delle conversazioni valutate e dei test tecnici svolti, globale o per singolo utente."
        actions={
          showOrgFilter && (
            <div className="flex shrink-0 items-center gap-2 max-sm:w-full">
              <Select
                id="dashboard-org-filter"
                className="min-w-[220px] max-sm:flex-1"
                value={orgFilter}
                onChange={(value) => {
                  setOrgFilter(value)
                  setSelectedUserId('')
                }}
                options={orgFilterOptions}
              />
            </div>
          )
        }
      />

      {error && <FormError message={error} variant="page" />}

      {isLoading ? (
        <LoadingState message="Caricamento dashboard..." />
      ) : rows.length === 0 && simulationRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/6 bg-gray-900/60 p-16 text-center">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-slate-600"
          >
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <h2 className="font-heading text-xl text-slate-100">Nessun dato disponibile</h2>
          <p className="max-w-[420px] text-sm text-slate-500">
            I grafici saranno disponibili quando le conversazioni con gli avatar verranno valutate,
            oppure quando verrÃ  svolto un test tecnico.
          </p>
        </div>
      ) : (
        <>
          {/* Le due prove non si guardano insieme: una linguetta per volta,
           * perchÃ© "come parlano" e "cosa sanno" sono due domande e mescolarne
           * i grafici in una colonna sola li farebbe leggere come un seguito
           * l'uno dell'altro. I filtri restano di sopra: valgono per
           * entrambe, e ritrovarli al loro posto cambiando linguetta Ã¨ quello
           * che tiene insieme la pagina. */}
          <TabBar
            items={[
              { value: 'conversazioni', label: `Conversazioni (${rows.length})` },
              { value: 'simulazioni', label: `Simulazioni tecniche (${simulationRows.length})` },
            ]}
            value={section}
            onChange={setSection}
            ariaLabel="Tipo di prova da visualizzare"
            className="mb-5 border-b border-white/6 pb-2"
          />

          {/* Riga filtri: scopa tutto ciÃ² che sta sotto */}
          <div className="mb-6 flex items-center gap-3 max-lg:flex-wrap">
            <label
              htmlFor="dashboard-user-filter"
              className="text-xs font-medium tracking-wide text-slate-400"
            >
              Utente
            </label>
            <SearchSelect
              id="dashboard-user-filter"
              value={selectedUserId}
              onChange={setSelectedUserId}
              options={usersInData.map((u) => ({ value: u.id, label: u.name, sub: u.email }))}
              placeholder="Cerca per nome o email..."
              emptyHint="Tutti gli utenti"
              className="w-full max-w-[440px]"
            />
            {/* Ogni metÃ  ha il proprio selettore di prova, nello stesso posto
                della barra: il canale di lÃ , il tipo di test di qua. Sono la
                stessa domanda ("quale delle due sto guardando") fatta su due
                cose diverse, quindi non possono essere un selettore solo. */}
            {section === 'conversazioni' ? (
              <>
                <span className="ml-auto text-xs font-medium tracking-wide text-slate-400 max-lg:ml-0">
                  Canale
                </span>
                <FilterTabs
                  value={modeFilter}
                  onChange={setModeFilter}
                  options={MODE_FILTERS}
                  ariaLabel="Canale delle conversazioni"
                />
              </>
            ) : (
              <>
                <span className="ml-auto text-xs font-medium tracking-wide text-slate-400 max-lg:ml-0">
                  Tipo
                </span>
                <FilterTabs
                  value={kindFilter}
                  onChange={setKindFilter}
                  options={KIND_FILTERS}
                  ariaLabel="Tipo dei test tecnici"
                />
              </>
            )}
          </div>

          {section === 'conversazioni' && (
            <>
              {/* Il canale puÃ² non avere nessuna conversazione: senza questo avviso
               * i KPI a zero si leggerebbero come un errore di caricamento. */}
              {rows.length > 0 && scopedRows.length === 0 && (
                <div className="mb-6 flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/40 px-6 py-4 text-sm text-slate-400">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-slate-500"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>
                    Nessuna valutazione {MODE_SUFFIX[modeFilter]}. Cambia canale per vedere i dati
                    disponibili.
                  </span>
                </div>
              )}

              {rows.length === 0 ? (
                <div className="mb-6 flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/40 px-6 py-4 text-sm text-slate-400">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-slate-500"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>
                    Nessuna conversazione ancora valutata. I grafici saranno disponibili quando le
                    sessioni con gli avatar verranno valutate
                  </span>
                </div>
              ) : (
                <>
                  {/* KPI */}
                  <div className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
                    <KpiCard label="Voto medio complessivo">
                      <p className="font-heading text-4xl font-bold text-slate-100">
                        {overallAvg !== null ? (
                          <>
                            <span className={scoreTextColor(overallAvg)}>
                              {formatScore(overallAvg)}
                            </span>
                            <span className="text-lg font-medium text-slate-500"> /10</span>
                          </>
                        ) : (
                          'â€”'
                        )}
                      </p>
                    </KpiCard>
                    <KpiCard label="Conversazioni valutate">
                      <p className="font-heading text-4xl font-bold text-slate-100">
                        {filtered.length}
                      </p>
                    </KpiCard>
                    <KpiCard label="Criterio piÃ¹ forte">
                      {bestCriterion ? (
                        <>
                          <Tooltip content={bestCriterion.label} truncateOnly>
                            <p className="truncate text-[0.95rem] font-semibold text-slate-100">
                              {bestCriterion.label}
                            </p>
                          </Tooltip>
                          <p
                            className={`mt-1 text-xl font-bold ${scoreTextColor(bestCriterion.avg)}`}
                          >
                            {formatScore(bestCriterion.avg)}
                            <span className="text-xs font-medium text-slate-500"> /10</span>
                          </p>
                        </>
                      ) : (
                        <p className="text-2xl text-slate-500">â€”</p>
                      )}
                    </KpiCard>
                    <KpiCard label="Criterio piÃ¹ debole">
                      {worstCriterion ? (
                        <>
                          <Tooltip content={worstCriterion.label} truncateOnly>
                            <p className="truncate text-[0.95rem] font-semibold text-slate-100">
                              {worstCriterion.label}
                            </p>
                          </Tooltip>
                          <p
                            className={`mt-1 text-xl font-bold ${scoreTextColor(worstCriterion.avg)}`}
                          >
                            {formatScore(worstCriterion.avg)}
                            <span className="text-xs font-medium text-slate-500"> /10</span>
                          </p>
                        </>
                      ) : (
                        <p className="text-2xl text-slate-500">â€”</p>
                      )}
                    </KpiCard>
                  </div>

                  {/* Andamento nel tempo */}
                  <div className={`${cardCls} mb-6`}>
                    <h2 className="text-sm font-semibold text-slate-300">Andamento nel tempo</h2>
                    <p className="mb-4 text-xs text-slate-500">
                      Media giornaliera del voto complessivo {MODE_SUFFIX[modeFilter]}
                      {selectedUserId ? ', per lâ€™utente selezionato' : ''}
                    </p>
                    {trendPoints.length > 0 ? (
                      <TrendChart points={trendPoints} />
                    ) : (
                      <p className="py-10 text-center text-sm italic text-slate-500">
                        Nessuna valutazione per la selezione corrente.
                      </p>
                    )}
                  </div>

                  {/* Media per criterio */}
                  <div className={`${cardCls} mb-6`}>
                    <h2 className="text-sm font-semibold text-slate-300">Media per criterio</h2>
                    <p className="mb-4 text-xs text-slate-500">
                      Punteggio medio dei 6 criteri di valutazione {MODE_SUFFIX[modeFilter]}
                    </p>
                    {criteriaAvgs.length > 0 ? (
                      <div className="flex flex-col gap-2.5">
                        {criteriaAvgs.map((c) => (
                          <MeterRow key={c.key} label={c.label} score={c.avg} fullLabel />
                        ))}
                      </div>
                    ) : (
                      <p className="py-6 text-center text-sm italic text-slate-500">
                        Nessuna valutazione per la selezione corrente.
                      </p>
                    )}
                  </div>

                  {/* Confronto tra utenti */}
                  <div className={`${cardCls} mb-6`}>
                    <h2 className="text-sm font-semibold text-slate-300">Confronto tra utenti</h2>
                    <p className="mb-4 text-xs text-slate-500">
                      Voto medio complessivo per utente, su tutte le valutazioni{' '}
                      {MODE_SUFFIX[modeFilter]}
                    </p>
                    {userAvgs.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {userAvgs.map((u) => (
                          <MeterRow
                            key={u.userId}
                            label={u.name}
                            sub={`${u.count} ${u.count === 1 ? 'valutazione' : 'valutazioni'}`}
                            score={u.avg}
                            dimmed={selectedUserId !== '' && u.userId !== selectedUserId}
                            highlighted={selectedUserId !== '' && u.userId === selectedUserId}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="py-6 text-center text-sm italic text-slate-500">
                        Nessuna valutazione per la selezione corrente.
                      </p>
                    )}
                  </div>

                  {/* Vista tabellare: tutti i valori raggiungibili senza hover */}
                  <DataTable
                    columns={[
                      { key: 'conversazione', label: 'Conversazione' },
                      { key: 'data', label: 'Data' },
                      { key: 'utente', label: 'Utente' },
                      { key: 'avatar', label: 'Avatar' },
                      ...criteriaAvgs.map((c) => ({
                        key: c.key,
                        label: shortCriterionLabel(c.key, c.label),
                        title: c.label,
                        align: 'center' as const,
                        compact: true,
                      })),
                      { key: 'voto', label: 'Voto', align: 'right' },
                    ]}
                    searchValue={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Cerca per conversazione, utente o avatar..."
                    searchActions={
                      <Tooltip content="Scarica il report delle valutazioni in Excel">
                        <button
                          className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                          onClick={handleExportXlsx}
                          disabled={isExporting || isLoading || rows.length === 0}
                        >
                          {isExporting ? (
                            <Spinner variant="small" />
                          ) : (
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          )}
                          Esporta Excel
                        </button>
                      </Tooltip>
                    }
                    isEmpty={searchedRows.length === 0}
                    emptyMessage={
                      search
                        ? 'Nessuna valutazione corrisponde alla ricerca.'
                        : 'Nessuna valutazione per la selezione corrente.'
                    }
                  >
                    {searchedRows.map((r) => (
                      <Tooltip
                        key={r.conversation_id}
                        content="Vedi conversazione e valutazione"
                        anchor="cursor"
                      >
                        <Tr className="cursor-pointer" onClick={() => setDetailRow(r)}>
                          <Td>
                            <div className="flex items-center gap-2">
                              <ConversationModeBadge mode={r.mode} iconOnly />
                              <span className="text-[0.85rem] font-medium text-slate-100">
                                {r.conversation_title}
                              </span>
                            </div>
                          </Td>
                          <Td className="text-[0.82rem] text-slate-400">
                            {formatDateTime(r.conversation_at)}
                          </Td>
                          <Td>
                            <span className="text-[0.85rem] font-medium text-slate-100">
                              {personName(r)}
                            </span>
                          </Td>
                          <Td className="text-[0.82rem] text-slate-400">{r.avatar_name}</Td>
                          {criteriaAvgs.map((c) => {
                            const crit = r.criteria.find((rc) => rc.key === c.key)
                            return (
                              <Td key={c.key} align="center" compact>
                                {crit ? (
                                  <span
                                    className={`text-[0.82rem] font-semibold tabular-nums ${scoreTextColor(crit.score)}`}
                                  >
                                    {formatScore(crit.score)}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">â€”</span>
                                )}
                              </Td>
                            )
                          })}
                          <Td align="right">
                            {/* Il voto in colonna Ã¨ quello che conta: se un docente
                        l'ha corretto va detto, altrimenti la tabella
                        sembrerebbe contraddire la valutazione automatica.

                        L'etichetta Ã¨ fuori dal flusso (absolute): la cella Ã¨
                        centrata in verticale, quindi una seconda riga vera
                        alzerebbe il numero. Riservare lo spazio in tutte le
                        celle allineava i voti fra loro ma spostava l'intera
                        colonna rispetto a quelle dei criteri; cosÃ¬ invece il
                        numero non si muove di un pixel, con o senza
                        correzione. */}
                            <span
                              className={`relative block text-sm font-bold tabular-nums ${scoreTextColor(r.overall_score)}`}
                            >
                              {formatScore(r.overall_score)}/10
                              {r.has_override && (
                                <Tooltip
                                  content={`Punteggio corretto dal docente, la valutazione automatica assegnava ${formatScore(r.ai_overall_score)}`}
                                >
                                  <span className="absolute right-0 top-full whitespace-nowrap text-[0.7rem] font-semibold text-violet-300">
                                    corretto
                                  </span>
                                </Tooltip>
                              )}
                            </span>
                          </Td>
                        </Tr>
                      </Tooltip>
                    ))}
                  </DataTable>
                </>
              )}
            </>
          )}

          {section === 'simulazioni' && (
            <DashboardSimulations
              rows={simulationRows}
              selectedUserId={selectedUserId}
              kindFilter={kindFilter}
            />
          )}
        </>
      )}

      {detailRow && (
        <ConversationDetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onReviewSaved={() => void refetch()}
          /* Eliminata di lÃ¬: la schermata si chiude su una conversazione che
             non c'Ã¨ piÃ¹, la tabella sotto si rilegge da sola. */
          onDeleted={() => setDetailRow(null)}
        />
      )}
    </PageContainer>
  )
}
