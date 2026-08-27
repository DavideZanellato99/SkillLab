import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { fetchEvaluationsReportXlsx } from '../services/admin'
import { useEvaluationsReport, useSimulationsReport } from '../hooks/useReports'
import type { EvaluationReportRow, SimulationReportRow } from '../services/admin'
import { saveBlob } from '../services/api'
import { useOrganizations } from '../hooks/useOrganizations'
import { isAdmin, isSuperAdmin } from '../services/auth'
import SearchSelect from './SearchSelect'
import Select from './Select'
import ConversationModeBadge from './ConversationModeBadge'
import { shortCriterionLabel } from './evaluationCriteria'
import { conversationModeLabel, MODE_FILTERS } from './conversationMode'
import type { ModeFilter } from './conversationMode'
import { KIND_FILTERS } from './simulationFormat'
import type { KindFilter } from './simulationFormat'
import DataTable, { Td, Tr } from './DataTable'
import type { DataTableColumn } from './DataTable'
import EmptyState from './EmptyState'
import FilterTabs from './FilterTabs'
import Notice from './Notice'
import Tooltip from './Tooltip'
import { matchesSearch } from './tableSearch'
import ConversationDetailModal from './ConversationDetailModal'
import DashboardSimulations from './DashboardSimulations'
import TabBar, { TabPanel } from './TabBar'
import Spinner from './Spinner'
import LoadingState from './LoadingState'
import LoadError from './LoadError'
import { PageContainer, PageHeader } from './PageLayout'
import FormError from './FormError'
import { PERIOD_OPTIONS } from './reportFormat'
import type { PeriodValue } from './reportFormat'
import { KpiCard, MeterRow, TrendChart } from './scoreCharts'
import {
  cardCls,
  dailyAverages,
  formatDateTime,
  formatScore,
  personName,
  scoreTextColor,
} from './scoreFormat'
import { DownloadIcon } from './icons'

/* Dashboard admin: grafici di riepilogo sui punteggi, globali o filtrati per
 * singolo utente tramite la ricerca in alto.
 *
 * Due prove, una linguetta per ciascuna: le conversazioni con gli avatar,
 * valutate da un modello e a volte corrette da un docente, e i test tecnici
 * del simulatore, corretti da soli. Sono due modi di misurare la stessa
 * persona, quindi stanno nella stessa pagina, sotto gli stessi filtri e con
 * gli stessi disegni (vedi scoreCharts), ma non nella stessa colonna: si
 * guarda una prova per volta.
 *
 * I filtri stanno nell'indirizzo e non solo in memoria: una dashboard è la
 * schermata che si guarda in due davanti allo stesso schermo, e senza di
 * questo un ricaricamento riportava tutti al punto di partenza e un
 * collegamento mandato a qualcuno gli apriva un'altra pagina. */

type DashboardSection = 'conversazioni' | 'simulazioni'

/* Come le scelte si scrivono nell'indirizzo. In italiano come le rotte, e
 * corte: è un indirizzo che finisce copiato in una chat. */
const SECTION_PARAM = 'prova'
const ORG_PARAM = 'organizzazione'
const USER_PARAM = 'persona'
const MODE_PARAM = 'canale'
const KIND_PARAM = 'tipo'
const PERIOD_PARAM = 'periodo'

/** La radice degli id che legano le due linguette ai loro pannelli. */
const TAB_BASE = 'dashboard'

/* Il vuoto da mostrare finché una lettura non è arrivata. Sono costanti e
 * non `?? []` scritto sul posto: quello sarebbe un array nuovo a ogni render,
 * e siccome da qui scendono tutti i conteggi e tutte le medie della pagina,
 * ogni `useMemo` sotto si rifarebbe da capo a ogni battuta scritta nella
 * ricerca. Un riferimento stabile è quello che li tiene fermi. */
const NO_EVALUATIONS: EvaluationReportRow[] = []
const NO_SIMULATIONS: SimulationReportRow[] = []
const NO_LABELS: Record<string, string> = {}

interface CriterionAvg {
  key: string
  label: string
  avg: number
}

/* Le colonne della tabella delle valutazioni sono le uniche dell'app a non
 * essere note in anticipo: i criteri arrivano dal backend, quindi il riparto
 * si calcola invece di essere scritto a mano. Si parte dalla misura che ogni
 * colonna vuole in pixel, e da lì escono sia le percentuali sia la larghezza
 * minima della tabella.
 *
 * Le misure sono strette apposta. Sotto la larghezza minima è il riquadro a
 * scorrere di lato, e con undici colonne larghe si scorreva sempre: la
 * pagina è larga 1200px, il contenuto 1152, e la somma di prima ne chiedeva
 * quasi milleseicento. Scorrere di lato è il modo peggiore di leggere questa
 * tabella, perché per arrivare all'ultimo criterio si perde di vista la
 * conversazione di cui si sta guardando il voto. La somma di adesso è 1130px
 * e ci sta, e a pagare sono i titoli lunghi, che vanno a capo su due righe:
 * una riga alta il doppio si legge, una tabella che scappa a destra no.
 *
 * Il padding stretto (`compact`) è per tutte le colonne e non solo per
 * quelle dei criteri: dodici pixel per lato invece di ventiquattro sono
 * centoventi pixel di testo in più su undici colonne, cioè la differenza fra
 * un titolo su due righe e uno su tre. */
const EVALUATION_COLUMN_PX = {
  conversazione: 170,
  data: 110,
  utente: 125,
  avatar: 100,
  criterio: 90,
  voto: 85,
}

function evaluationColumns(criteria: CriterionAvg[]) {
  const px = EVALUATION_COLUMN_PX
  const totalPx =
    px.conversazione + px.data + px.utente + px.avatar + px.voto + criteria.length * px.criterio
  const width = (columnPx: number) => `${((columnPx / totalPx) * 100).toFixed(2)}%`

  /* Ogni colonna sa da sé su cosa si ordina, criteri compresi: quella di un
     criterio legge il proprio punteggio dalla riga, e una conversazione a cui
     quel criterio non è stato dato finisce in fondo invece di valere zero,
     che è un voto e non un'assenza. È la colonna che risponde a "su cosa
     inciampa questo gruppo", e a occhio, su una tabella di sei numeri per
     riga, non si legge. */
  const columns: DataTableColumn<EvaluationReportRow>[] = [
    {
      key: 'conversazione',
      label: 'Conversazione',
      compact: true,
      width: width(px.conversazione),
      sortValue: (r) => r.conversation_title,
    },
    {
      key: 'data',
      label: 'Data',
      compact: true,
      width: width(px.data),
      sortValue: (r) => r.conversation_at,
    },
    {
      key: 'utente',
      label: 'Utente',
      compact: true,
      width: width(px.utente),
      sortValue: (r) => personName(r),
    },
    {
      key: 'avatar',
      label: 'Avatar',
      compact: true,
      width: width(px.avatar),
      sortValue: (r) => r.avatar_name,
    },
    ...criteria.map((c) => ({
      key: c.key,
      label: shortCriterionLabel(c.key, c.label),
      title: c.label,
      compact: true,
      width: width(px.criterio),
      sortValue: (r: EvaluationReportRow) => r.criteria[c.key] ?? null,
    })),
    {
      key: 'voto',
      label: 'Voto',
      compact: true,
      width: width(px.voto),
      sortValue: (r) => r.overall_score,
    },
  ]

  return { minWidth: `${totalPx}px`, columns }
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

/** Il valore letto dall'indirizzo, se è uno di quelli che esistono. */
function pickOption<T extends string>(
  raw: string | null,
  options: readonly { value: T }[],
  fallback: T,
): T {
  return options.some((o) => o.value === raw) ? (raw as T) : fallback
}

export default function DashboardPage() {
  const { user } = useAuth()
  const showOrgFilter = isSuperAdmin(user)
  const { data: organizations = [] } = useOrganizations(isSuperAdmin(user))

  /* Le scelte stanno nei parametri dell'indirizzo, che è la loro unica copia:
     tenerle anche in uno `useState` vorrebbe dire due verità da riallineare a
     ogni passo indietro del browser. */
  const [params, setParams] = useSearchParams()
  const setParam = (name: string, value: string, extra?: [string, string]) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    if (extra) {
      const [otherName, otherValue] = extra
      if (otherValue) next.set(otherName, otherValue)
      else next.delete(otherName)
    }
    /* Sempre sostituendo il passo: qui si cambia filtro di continuo, e ogni
       scelta lasciata in cronologia sarebbe un tasto indietro che non riporta
       alla pagina di prima ma al canale di prima. */
    setParams(next, { replace: true })
  }

  /* L'organizzazione nell'indirizzo vale solo per chi la può scegliere: a un
     org admin il server risponde comunque con la sua, e la pagina intanto si
     scriverebbe accanto al titolo il nome di un'altra. */
  const orgFilter = showOrgFilter ? (params.get(ORG_PARAM) ?? '') : ''
  const selectedUserId = params.get(USER_PARAM) ?? ''
  const section: DashboardSection =
    params.get(SECTION_PARAM) === 'simulazioni' ? 'simulazioni' : 'conversazioni'
  /* Due default diversi, e non è una svista. Il canale parte dalle chiamate
   * perché al telefono e in chat non si è valutati alla pari e mescolarli
   * darebbe una media ambigua. Il tipo parte da "Tutti" perché i tipi di
   * test sono quattro e tre di loro sono arrivati dopo il primo: un default
   * che ne mostrasse uno solo terrebbe nascosta la maggior parte della
   * dashboard a chi non sa che il selettore esiste. */
  const modeFilter = pickOption<ModeFilter>(params.get(MODE_PARAM), MODE_FILTERS, 'voice')
  const kindFilter = pickOption<KindFilter>(params.get(KIND_PARAM), KIND_FILTERS, 'all')
  /* Il periodo è l'unico filtro che il server capisce insieme
     all'organizzazione: gli altri restringono righe già arrivate, questo
     decide quante ne arrivano. Parte da "Sempre" come nel report attività,
     perché un filtro già acceso mostrerebbe una pagina mezza vuota a chi non
     sa che esiste, e quella si legge come un dato sbagliato. */
  const period = pickOption<PeriodValue>(params.get(PERIOD_PARAM), PERIOD_OPTIONS, 'all')
  const days = period === 'all' ? undefined : Number(period)

  /* La casella scrive subito, il filtro aspetta la fine della parola. È la
   * ricerca dove conta di più: sotto ci sono tutte le valutazioni del
   * periodo, e senza attesa ogni tasto premuto le riscorreva tutte per
   * ridisegnare una tabella di dieci righe. */
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [detailRow, setDetailRow] = useState<EvaluationReportRow | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const {
    data: evaluations,
    isPending: isLoadingEvaluations,
    error: loadError,
    refetch,
  } = useEvaluationsReport(orgFilter, days, isAdmin(user))

  /* L'altra metà della pagina. È una query a parte e non un campo in più
   * della prima: le due prove hanno una riga per volta ciascuna, e chi non
   * usa il simulatore non deve pagare la scansione dei tentativi dentro la
   * lettura delle valutazioni. */
  const {
    data: simulations,
    isPending: isLoadingSimulations,
    error: simulationsError,
    refetch: refetchSimulations,
  } = useSimulationsReport(orgFilter, days, isAdmin(user))

  const rows = evaluations?.rows ?? NO_EVALUATIONS
  const simulationRows = simulations?.rows ?? NO_SIMULATIONS
  /* Le etichette per esteso dei criteri, dette una volta per risposta invece
   * che sei volte per riga. Restano del server: qui non se ne tiene una
   * copia, per la ragione scritta in testa a evaluationCriteria. */
  const criteriaLabels = evaluations?.criteria_labels ?? NO_LABELS
  /* Il periodo scelto pesava più del tetto del server, quindi quello che si
   * sta guardando sono le prove più recenti e non tutte. Va detto: medie di
   * una parte dello storico presentate come le medie di tutto sarebbero un
   * numero sbagliato dato con sicurezza. */
  const isTruncated = Boolean(evaluations?.truncated || simulations?.truncated)

  /* Le due metà si aspettano solo quando serve: la linguetta che si sta
   * guardando disegna appena i suoi dati sono pronti, senza restare ferma
   * dietro la scansione dell'altra prova. Il conteggio sulla linguetta
   * dell'altra compare quando arriva. */
  const isLoadingSection = section === 'conversazioni' ? isLoadingEvaluations : isLoadingSimulations
  const isSettled = !isLoadingEvaluations && !isLoadingSimulations
  const hasNothing = isSettled && rows.length === 0 && simulationRows.length === 0

  /* Un caricamento caduto è l'unica cosa a cui si può rimediare restando
   * dov'è, quindi il messaggio arriva con il comando per riprovare. Distinto
   * dall'errore dell'esportazione, che è un file non prodotto e non una
   * pagina senza dati: quello si dice accanto al bottone che l'ha causato,
   * altrimenti un download fallito si legge come una dashboard rotta. */
  const loadErrorMessage =
    loadError instanceof Error
      ? loadError.message
      : simulationsError instanceof Error
        ? simulationsError.message
        : loadError || simulationsError
          ? 'Impossibile caricare la dashboard.'
          : ''

  const retryLoad = () => {
    void refetch()
    void refetchSimulations()
  }

  /* Excel del report: le stesse righe che il server ha mandato a questa
   * pagina, cioè la stessa organizzazione e lo stesso periodo. Le fette più
   * fini (la persona, il canale) restano all'autofiltro del foglio, e il
   * tooltip lo dice invece di lasciarlo scoprire aprendo il file.
   * Resta fuori da TanStack perché produce un file da salvare, non uno
   * stato da tenere in cache. */
  const handleExportXlsx = async () => {
    if (isExporting) return
    setIsExporting(true)
    setExportError('')
    try {
      const blob = await fetchEvaluationsReportXlsx(orgFilter || undefined, days)
      saveBlob(blob, `report-valutazioni-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Esportazione non riuscita.')
    } finally {
      setIsExporting(false)
    }
  }

  const orgFilterOptions = [
    { value: '', label: 'Tutte le Organizzazioni' },
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
    const acc = new Map<string, { sum: number; count: number }>()
    const order: string[] = []
    for (const r of filtered) {
      for (const [key, score] of Object.entries(r.criteria)) {
        if (!acc.has(key)) {
          acc.set(key, { sum: 0, count: 0 })
          order.push(key)
        }
        const entry = acc.get(key)!
        entry.sum += score
        entry.count += 1
      }
    }
    /* L'etichetta per esteso arriva dal vocabolario della risposta, e la
       chiave le fa da ripiego: un criterio che il server manda senza
       etichetta deve comunque intestare la sua colonna. */
    return order.map((key) => {
      const e = acc.get(key)!
      return { key, label: criteriaLabels[key] ?? key, avg: e.sum / e.count }
    })
  }, [filtered, criteriaLabels])

  const evaluationTable = useMemo(() => evaluationColumns(criteriaAvgs), [criteriaAvgs])

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
          debouncedSearch,
          r.conversation_title,
          // The channel is searchable by the same word the badge shows
          conversationModeLabel(r.mode),
          personName(r),
          r.user_email,
          r.avatar_name,
          formatDateTime(r.conversation_at),
        ),
      ),
    [detailRows, debouncedSearch],
  )

  /** Il conteggio sulla linguetta, finché la sua metà non è arrivata. */
  const tabLabel = (label: string, count: number, isPending: boolean) =>
    isPending ? label : `${label} (${count})`

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Riepilogo dei punteggi delle conversazioni valutate e dei test tecnici svolti, globale o per singolo utente."
        /* Periodo e organizzazione stanno insieme, in cima: sono i due filtri
           che il server capisce, cioè quelli che decidono quali righe
           arrivano. Quelli della riga sotto restringono righe già qui. */
        actions={
          <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full">
            <FilterTabs<PeriodValue>
              value={period}
              onChange={(value) => setParam(PERIOD_PARAM, value === 'all' ? '' : value)}
              options={[...PERIOD_OPTIONS]}
              ariaLabel="Periodo delle prove"
            />
            {showOrgFilter && (
              <Select
                id="dashboard-org-filter"
                ariaLabel="Organizzazione"
                className="min-w-[220px] max-sm:flex-1"
                value={orgFilter}
                /* Cambiando organizzazione la persona scelta non è più fra
                   quelle in elenco: se ne va con il filtro che l'ha portata. */
                onChange={(value) => setParam(ORG_PARAM, value, [USER_PARAM, ''])}
                options={orgFilterOptions}
              />
            )}
          </div>
        }
      />

      {loadErrorMessage ? (
        <LoadError message={loadErrorMessage} onRetry={retryLoad} variant="page" />
      ) : hasNothing ? (
        <EmptyState
          title="Nessun dato disponibile"
          hint={
            period === 'all'
              ? 'I grafici saranno disponibili quando le conversazioni con gli avatar verranno valutate, oppure quando verrà svolto un test tecnico'
              : 'Nessuna prova nel periodo selezionato, scegline uno più ampio per vedere i dati disponibili'
          }
        />
      ) : (
        <>
          {/* Le prove del periodo erano più di quante il server ne manda in
              una volta, quindi questi sono i grafici delle più recenti. Va
              detto sopra i grafici e non sotto: sono medie di una parte dello
              storico, e chi le legge senza saperlo le prende per le medie di
              tutto. Il rimedio è restringere il periodo, che è il comando che
              sta qui accanto. */}
          {isTruncated && (
            <Notice className="mb-5">
              Le prove del periodo scelto sono troppe per essere lette in una volta: i grafici e la
              tabella mostrano le più recenti. Restringi il periodo per avere un intervallo completo
            </Notice>
          )}

          {/* Le due prove non si guardano insieme: una linguetta per volta,
           * perché "come parlano" e "cosa sanno" sono due domande e mescolarne
           * i grafici in una colonna sola li farebbe leggere come un seguito
           * l'uno dell'altro. I filtri restano di sopra: valgono per
           * entrambe, e ritrovarli al loro posto cambiando linguetta è quello
           * che tiene insieme la pagina. */}
          <TabBar
            items={[
              {
                value: 'conversazioni',
                label: tabLabel('Conversazioni', rows.length, isLoadingEvaluations),
              },
              {
                value: 'simulazioni',
                label: tabLabel(
                  'Simulazioni tecniche',
                  simulationRows.length,
                  isLoadingSimulations,
                ),
              },
            ]}
            value={section}
            onChange={(value) => setParam(SECTION_PARAM, value === 'conversazioni' ? '' : value)}
            ariaLabel="Tipo di prova da visualizzare"
            panelBase={TAB_BASE}
            className="mb-5 border-b border-white/6 pb-2"
          />

          {/* Riga filtri: scopa tutto ciò che sta sotto */}
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
              onChange={(value) => setParam(USER_PARAM, value)}
              options={usersInData.map((u) => ({ value: u.id, label: u.name, sub: u.email }))}
              placeholder="Cerca per nome o email..."
              emptyHint="Tutti gli utenti"
              className="w-full max-w-[440px]"
            />
            {/* Ogni metà ha il proprio selettore di prova, nello stesso posto
                della barra: il canale di là, il tipo di test di qua. Sono la
                stessa domanda ("quale delle due sto guardando") fatta su due
                cose diverse, quindi non possono essere un selettore solo. */}
            {section === 'conversazioni' ? (
              <>
                <span className="ml-auto text-xs font-medium tracking-wide text-slate-400 max-lg:ml-0">
                  Canale
                </span>
                <FilterTabs
                  value={modeFilter}
                  onChange={(value) => setParam(MODE_PARAM, value === 'voice' ? '' : value)}
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
                  onChange={(value) => setParam(KIND_PARAM, value === 'all' ? '' : value)}
                  options={KIND_FILTERS}
                  ariaLabel="Tipo dei test tecnici"
                />
              </>
            )}
          </div>

          {isLoadingSection ? (
            <LoadingState message="Caricamento dashboard..." />
          ) : section === 'conversazioni' ? (
            <TabPanel base={TAB_BASE} value="conversazioni">
              {/* Il canale può non avere nessuna conversazione: senza questo avviso
               * i KPI a zero si leggerebbero come un errore di caricamento. */}
              {rows.length > 0 && scopedRows.length === 0 && (
                <Notice className="mb-6">
                  Nessuna valutazione {MODE_SUFFIX[modeFilter]}. Cambia canale per vedere i dati
                  disponibili
                </Notice>
              )}

              {rows.length === 0 ? (
                <Notice className="mb-6">
                  Nessuna conversazione ancora valutata. I grafici saranno disponibili quando le
                  sessioni con gli avatar verranno valutate
                </Notice>
              ) : (
                <>
                  {/* KPI */}
                  <div className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
                    <KpiCard label="Voto Medio Complessivo">
                      <p className="font-heading text-4xl font-bold text-slate-100">
                        {overallAvg !== null ? (
                          <>
                            <span className={scoreTextColor(overallAvg)}>
                              {formatScore(overallAvg)}
                            </span>
                            <span className="text-lg font-medium text-slate-500"> /10</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </p>
                    </KpiCard>
                    <KpiCard label="Conversazioni Valutate">
                      <p className="font-heading text-4xl font-bold text-slate-100">
                        {filtered.length}
                      </p>
                    </KpiCard>
                    <KpiCard label="Criterio Più Forte">
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
                        <p className="text-2xl text-slate-500">—</p>
                      )}
                    </KpiCard>
                    <KpiCard label="Criterio Più Debole">
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
                        <p className="text-2xl text-slate-500">—</p>
                      )}
                    </KpiCard>
                  </div>

                  {/* Andamento nel tempo */}
                  <div className={`${cardCls} mb-6`}>
                    <h2 className="text-sm font-semibold text-slate-300">Andamento nel Tempo</h2>
                    <p className="mb-4 text-xs text-slate-500">
                      Media giornaliera del voto complessivo {MODE_SUFFIX[modeFilter]}
                      {selectedUserId ? ', per l’utente selezionato' : ''}
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
                    <h2 className="text-sm font-semibold text-slate-300">Media per Criterio</h2>
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
                    <h2 className="text-sm font-semibold text-slate-300">Confronto tra Utenti</h2>
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

                  {/* L'esportazione fallita si dice qui, accanto al bottone
                      che l'ha chiesta: è un file non prodotto, non una
                      pagina senza dati. */}
                  {exportError && <FormError message={exportError} variant="page" />}

                  {/* Vista tabellare: tutti i valori raggiungibili senza hover */}
                  <DataTable
                    columns={evaluationTable.columns}
                    minWidth={evaluationTable.minWidth}
                    searchValue={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Cerca per conversazione, utente o avatar..."
                    searchActions={
                      <Tooltip content="Scarica in Excel le valutazioni del periodo e dell'organizzazione selezionati, senza i filtri per utente e canale">
                        <button
                          type="button"
                          className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                          onClick={handleExportXlsx}
                          disabled={isExporting || rows.length === 0}
                        >
                          {isExporting ? <Spinner variant="small" /> : <DownloadIcon size={15} />}
                          Esporta Excel
                        </button>
                      </Tooltip>
                    }
                    items={searchedRows}
                    emptyMessage={
                      debouncedSearch
                        ? 'Nessuna valutazione corrisponde alla ricerca.'
                        : 'Nessuna valutazione per la selezione corrente.'
                    }
                    renderRow={(r) => (
                      <Tooltip
                        key={r.conversation_id}
                        content="Vedi conversazione e valutazione"
                        anchor="cursor"
                      >
                        <Tr onActivate={() => setDetailRow(r)}>
                          <Td compact>
                            <div className="flex items-center justify-center gap-2">
                              <ConversationModeBadge mode={r.mode} iconOnly />
                              <span className="text-[0.85rem] font-medium text-slate-100">
                                {r.conversation_title}
                              </span>
                            </div>
                          </Td>
                          <Td compact className="text-[0.82rem] text-slate-400">
                            {formatDateTime(r.conversation_at)}
                          </Td>
                          <Td compact>
                            <span className="text-[0.85rem] font-medium text-slate-100">
                              {personName(r)}
                            </span>
                          </Td>
                          <Td compact className="text-[0.82rem] text-slate-400">
                            {r.avatar_name}
                          </Td>
                          {criteriaAvgs.map((c) => {
                            const score = r.criteria[c.key]
                            return (
                              <Td key={c.key} compact>
                                {score === undefined ? (
                                  <span className="text-slate-600">—</span>
                                ) : (
                                  <span
                                    className={`text-[0.82rem] font-semibold tabular-nums ${scoreTextColor(score)}`}
                                  >
                                    {formatScore(score)}
                                  </span>
                                )}
                              </Td>
                            )
                          })}
                          <Td compact>
                            {/* Il voto in colonna è quello che conta: se un docente
                        l'ha corretto va detto, altrimenti la tabella
                        sembrerebbe contraddire la valutazione automatica.

                        L'etichetta è fuori dal flusso (absolute): la cella è
                        centrata in verticale, quindi una seconda riga vera
                        alzerebbe il numero. Riservare lo spazio in tutte le
                        celle allineava i voti fra loro ma spostava l'intera
                        colonna rispetto a quelle dei criteri; così invece il
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
                                  <span className="absolute inset-x-0 top-full whitespace-nowrap text-[0.7rem] font-semibold text-violet-300">
                                    corretto
                                  </span>
                                </Tooltip>
                              )}
                            </span>
                          </Td>
                        </Tr>
                      </Tooltip>
                    )}
                  />
                </>
              )}
            </TabPanel>
          ) : (
            <TabPanel base={TAB_BASE} value="simulazioni">
              <DashboardSimulations
                rows={simulationRows}
                selectedUserId={selectedUserId}
                kindFilter={kindFilter}
              />
            </TabPanel>
          )}
        </>
      )}

      {detailRow && (
        <ConversationDetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onReviewSaved={() => void refetch()}
          /* Eliminata di lì: la schermata si chiude su una conversazione che
             non c'è più, la tabella sotto si rilegge da sola. */
          onDeleted={() => setDetailRow(null)}
        />
      )}
    </PageContainer>
  )
}
