import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useEvaluationsReport, useSimulationsReport } from '../hooks/useReports'
import type { EvaluationReportRow, SimulationReportRow } from '../services/admin'
import { isAdmin, isSuperAdmin } from '../services/auth'
import DashboardEvaluationsTable from './DashboardEvaluationsTable'
import DashboardSimulations from './DashboardSimulations'
import { useDashboardScope } from './dashboardViews'
import EmptyState from './EmptyState'
import { labelCls } from './Field'
import FilterTabs from './FilterTabs'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import { MODE_FILTERS } from './conversationMode'
import type { ModeFilter } from './conversationMode'
import Notice from './Notice'
import { KIND_FILTERS } from './simulationFormat'
import type { KindFilter } from './simulationFormat'
import MultiSearchSelect from './MultiSearchSelect'
import SearchSelect from './SearchSelect'
import { KpiCard, MeterRow, TrendChart } from './scoreCharts'
import { comparePeople } from './personOrder'
import { cardCls, dailyAverages, formatScore, personName, scoreTextColor } from './scoreFormat'
import type { CriterionAverage } from './scoreFormat'
import TabBar, { TabPanel } from './TabBar'
import Tooltip from './Tooltip'

/* La vista dei punteggi: i grafici di riepilogo, globali o per singolo
 * utente.
 *
 * Due prove, una linguetta per ciascuna: le conversazioni con gli avatar,
 * valutate da un modello e a volte corrette da un docente, e i test tecnici
 * del simulatore, corretti da soli. Sono due modi di misurare la stessa
 * persona, quindi stanno nella stessa vista, sotto gli stessi filtri e con
 * gli stessi disegni (vedi scoreCharts), ma non nella stessa colonna: si
 * guarda una prova per volta.
 *
 * Il periodo e l'organizzazione non sono qui: valgono per tutte e quattro le
 * viste della sezione e stanno nel guscio (vedi DashboardPage), che li passa
 * di qui dentro. Quello che resta sono i filtri che restringono righe già
 * arrivate: la persona, il canale e il tipo di test.
 *
 * Anche questi stanno nell'indirizzo e non solo in memoria: una dashboard è
 * la schermata che si guarda in due davanti allo stesso schermo, e senza di
 * questo un ricaricamento riportava tutti al punto di partenza e un
 * collegamento mandato a qualcuno gli apriva un'altra pagina. */

type ScoresSection = 'conversazioni' | 'simulazioni'

/* Come le scelte si scrivono nell'indirizzo. In italiano come le rotte, e
 * corte: è un indirizzo che finisce copiato in una chat. */
const SECTION_PARAM = 'prova'
const USER_PARAM = 'persona'
/* Le persone messe a confronto, separate da virgola. Sono id e non nomi,
 * quindi l'indirizzo si allunga: è il prezzo dell'unica identità che non
 * cambia quando qualcuno si sposa o corregge il proprio cognome. */
const COMPARE_PARAM = 'confronto'
const MODE_PARAM = 'canale'
const KIND_PARAM = 'tipo'

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

interface UserAvg {
  userId: string
  name: string
  /* Nome e cognome separati oltre al nome da mostrare: le barre si ordinano
     per media, la tendina che le sceglie per cognome, e quella regola vuole i
     due campi distinti (vedi `personOrder`). */
  nome: string
  cognome: string
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

export default function DashboardScores() {
  const { user } = useAuth()
  const { organizationId, days, period } = useDashboardScope()

  /* Le scelte stanno nei parametri dell'indirizzo, che è la loro unica copia:
     tenerle anche in uno `useState` vorrebbe dire due verità da riallineare a
     ogni passo indietro del browser. */
  const [params, setParams] = useSearchParams()
  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    /* Sempre sostituendo il passo: qui si cambia filtro di continuo, e ogni
       scelta lasciata in cronologia sarebbe un tasto indietro che non riporta
       alla pagina di prima ma al canale di prima. */
    setParams(next, { replace: true })
  }

  const selectedUserId = params.get(USER_PARAM) ?? ''
  const section: ScoresSection =
    params.get(SECTION_PARAM) === 'simulazioni' ? 'simulazioni' : 'conversazioni'
  /* Due default diversi, e non è una svista. Il canale parte dalle chiamate
   * perché al telefono e in chat non si è valutati alla pari e mescolarli
   * darebbe una media ambigua. Il tipo parte da "Tutti" perché i tipi di
   * test sono quattro e tre di loro sono arrivati dopo il primo: un default
   * che ne mostrasse uno solo terrebbe nascosta la maggior parte della
   * dashboard a chi non sa che il selettore esiste. */
  const modeFilter = pickOption<ModeFilter>(params.get(MODE_PARAM), MODE_FILTERS, 'voice')
  const kindFilter = pickOption<KindFilter>(params.get(KIND_PARAM), KIND_FILTERS, 'all')

  const {
    data: evaluations,
    isPending: isLoadingEvaluations,
    error: loadError,
    refetch,
  } = useEvaluationsReport(organizationId, days, isAdmin(user))

  /* L'altra metà della vista. È una query a parte e non un campo in più
   * della prima: le due prove hanno una riga per volta ciascuna, e chi non
   * usa il simulatore non deve pagare la scansione dei tentativi dentro la
   * lettura delle valutazioni. */
  const {
    data: simulations,
    isPending: isLoadingSimulations,
    error: simulationsError,
    refetch: refetchSimulations,
  } = useSimulationsReport(organizationId, days, isAdmin(user))

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
   * dov'è, quindi il messaggio arriva con il comando per riprovare. */
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

  /* Il selettore di canale sta a monte di tutto il resto: ogni conteggio,
   * media e grafico qui sotto parte da queste righe, non da rows. */
  const scopedRows = useMemo(
    () => (modeFilter === 'all' ? rows : rows.filter((r) => r.mode === modeFilter)),
    [rows, modeFilter],
  )

  /* Utenti presenti nei dati (per la ricerca utente), da entrambe le prove:
   * il filtro vale per tutta la vista, quindi chi ha solo svolto dei test
   * deve poterci finire dentro.
   * Volutamente su tutte le righe e non su scopedRows: se l'elenco si
   * restringesse col canale, l'utente selezionato potrebbe sparire dalle
   * opzioni e la sua chip svanirebbe pur restando il filtro attivo. */
  const usersInData = useMemo(() => {
    const map = new Map<string, { name: string; nome: string; cognome: string; email: string }>()
    for (const r of [...rows, ...simulationRows]) {
      if (!map.has(r.user_id)) {
        map.set(r.user_id, {
          name: personName(r),
          nome: r.user_nome,
          cognome: r.user_cognome,
          email: r.user_email,
        })
      }
    }
    /* Per cognome, come nella tabella di gestione utenti (vedi
       `personOrder`): due elenchi delle stesse persone ordinati in due modi
       si leggono come due elenchi diversi. */
    return Array.from(map, ([id, u]) => ({ id, ...u })).sort(comparePeople)
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
  const criteriaAvgs = useMemo<CriterionAverage[]>(() => {
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
        nome: r.user_nome,
        cognome: r.user_cognome,
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
        nome: e.nome,
        cognome: e.cognome,
        email: e.email,
        avg: e.sum / e.count,
        count: e.count,
      }))
      .sort((a, b) => b.avg - a.avg)
  }, [scopedRows])

  /* Le stesse persone in ordine alfabetico, per la tendina che le sceglie.
     Le barre restano dalla media più alta, che è la risposta della scheda;
     una tendina ordinata per media invece sarebbe un elenco in cui un nome si
     cerca scorrendo, e la regola per cercare un nome è quella della gestione
     utenti: cognome, nome, email. */
  const usersByName = useMemo(() => [...userAvgs].sort(comparePeople), [userAvgs])

  /* Le persone scelte per il confronto. Un id nell'indirizzo che non
     corrisponde a nessuna riga non si scarta: potrebbe essere qualcuno che
     nel periodo scelto non ha svolto prove, e togliergli la chip mentre si
     restringe il periodo farebbe sparire una scelta che nessuno ha disfatto. */
  const compareIds = useMemo(() => {
    const raw = params.get(COMPARE_PARAM) ?? ''
    return raw ? raw.split(',').filter(Boolean) : []
  }, [params])

  /* Il grafico è di chi è stato scelto, e senza nessuna scelta è di tutti:
     una scheda che parte vuota chiederebbe di comporre un confronto anche a
     chi voleva solo guardare come va il gruppo. */
  const comparedUsers = useMemo(
    () => (compareIds.length ? userAvgs.filter((u) => compareIds.includes(u.userId)) : userAvgs),
    [userAvgs, compareIds],
  )

  /* Il confronto vive dentro una organizzazione sola. Chi ne amministra una
     ce l'ha già, perché il server gli risponde solo con la sua; il super
     admin che le sta guardando tutte insieme deve prima sceglierne una. */
  const needsOrganization = isSuperAdmin(user) && !organizationId

  const detailRows = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.conversation_at).getTime() - new Date(a.conversation_at).getTime(),
      ),
    [filtered],
  )

  /** Il conteggio sulla linguetta, finché la sua metà non è arrivata. */
  const tabLabel = (label: string, count: number, isPending: boolean) =>
    isPending ? label : `${label} (${count})`

  if (loadErrorMessage) {
    return <LoadError message={loadErrorMessage} onRetry={retryLoad} variant="page" />
  }

  if (hasNothing) {
    return (
      <EmptyState
        title="Nessun dato disponibile"
        hint={
          period === 'all'
            ? 'I grafici saranno disponibili quando le conversazioni con gli avatar verranno valutate, oppure quando verrà svolto un test tecnico'
            : 'Nessuna prova nel periodo selezionato, scegline uno più ampio per vedere i dati disponibili'
        }
      />
    )
  }

  return (
    <>
      {/* Le prove del periodo erano più di quante il server ne manda in una
          volta, quindi questi sono i grafici delle più recenti. Va detto
          sopra i grafici e non sotto: sono medie di una parte dello storico,
          e chi le legge senza saperlo le prende per le medie di tutto. Il
          rimedio è restringere il periodo, che è il comando che sta qui
          sopra. */}
      {isTruncated && (
        <Notice className="mb-5">
          Le prove del periodo scelto sono troppe per essere lette in una volta: i grafici e la
          tabella mostrano le più recenti. Restringi il periodo per avere un intervallo completo
        </Notice>
      )}

      {/* Le due prove non si guardano insieme: una linguetta per volta,
       * perché "come parlano" e "cosa sanno" sono due domande e mescolarne
       * i grafici in una colonna sola li farebbe leggere come un seguito
       * l'uno dell'altro. */}
      <TabBar
        items={[
          {
            value: 'conversazioni',
            label: tabLabel('Conversazioni', rows.length, isLoadingEvaluations),
          },
          {
            value: 'simulazioni',
            label: tabLabel('Simulazioni tecniche', simulationRows.length, isLoadingSimulations),
          },
        ]}
        value={section}
        onChange={(value) => setParam(SECTION_PARAM, value === 'conversazioni' ? '' : value)}
        ariaLabel="Tipo di prova da visualizzare"
        panelBase={TAB_BASE}
      />

      {/* Riga filtri: scopa tutto ciò che sta sotto */}
      <div className="mb-6 flex items-center gap-3 max-lg:flex-wrap">
        <label htmlFor="dashboard-user-filter" className={labelCls}>
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
            <span className={`ml-auto ${labelCls} max-lg:ml-0`}>Canale</span>
            <FilterTabs
              value={modeFilter}
              onChange={(value) => setParam(MODE_PARAM, value === 'voice' ? '' : value)}
              options={MODE_FILTERS}
              ariaLabel="Canale delle conversazioni"
            />
          </>
        ) : (
          <>
            <span className={`ml-auto ${labelCls} max-lg:ml-0`}>Tipo</span>
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
          {/* Il canale può non avere nessuna conversazione: senza questo
           * avviso i KPI a zero si leggerebbero come un errore di
           * caricamento. */}
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
                      <p className={`mt-1 text-xl font-bold ${scoreTextColor(bestCriterion.avg)}`}>
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
                      <p className={`mt-1 text-xl font-bold ${scoreTextColor(worstCriterion.avg)}`}>
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

              {/* Confronto tra utenti. È una `section` col proprio nome, come
                  la mappa di un percorso: chi ascolta la pagina la ritrova
                  fra le regioni invece di attraversare tutte le barre per
                  capire dove si trova. */}
              <section aria-labelledby="confronto-utenti" className={`${cardCls} mb-6`}>
                {/* Il comando sta in testa alla scheda, a destra del titolo:
                    è quello che decide cosa c'è sotto, e messo sopra le barre
                    a tutta larghezza si leggeva come una seconda riga della
                    descrizione. Su schermo stretto scende sotto il titolo,
                    perché a fianco resterebbe una fessura in cui i nomi non
                    si leggono. */}
                <div className="mb-4 flex items-start justify-between gap-4 max-lg:flex-col">
                  <div className="min-w-0">
                    <h2 id="confronto-utenti" className="text-sm font-semibold text-slate-300">
                      Confronto tra Utenti
                    </h2>
                    <p className="text-xs text-slate-500">
                      Voto medio complessivo per utente, su tutte le valutazioni{' '}
                      {MODE_SUFFIX[modeFilter]}
                      {compareIds.length > 0 ? ', fra le persone scelte' : ''}
                    </p>
                  </div>
                  {!needsOrganization && userAvgs.length > 0 && (
                    <MultiSearchSelect
                      id="dashboard-compare"
                      values={compareIds}
                      onChange={(next) => setParam(COMPARE_PARAM, next.join(','))}
                      options={usersByName.map((u) => ({
                        value: u.userId,
                        label: u.name,
                        sub: u.email,
                      }))}
                      placeholder="Cerca e scegli le persone da confrontare..."
                      /* Le chip scelte si allineano a destra sotto il campo,
                         dove il campo stesso è: crescono verso il basso senza
                         spostare il titolo. */
                      align="right"
                      className="w-[520px] shrink-0 max-lg:w-full"
                    />
                  )}
                </div>
                {/* Mettere a confronto due persone di organizzazioni diverse
                    non è una domanda che si fa: si allenano su avatar diversi,
                    con test diversi, dentro programmi diversi, e le due medie
                    non stanno sulla stessa scala. Quindi finché il super admin
                    guarda tutti i tenant insieme la scheda non offre il
                    comando e lo dice, invece di lasciar comporre un confronto
                    che non vorrebbe dire niente. */}
                {needsOrganization ? (
                  <Notice>
                    Scegli una organizzazione qui sopra per mettere a confronto le sue persone: due
                    tenant diversi si allenano su avatar e test diversi, quindi le loro medie non si
                    leggono sulla stessa scala
                  </Notice>
                ) : userAvgs.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {comparedUsers.map((u) => (
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
              </section>

              <DashboardEvaluationsTable
                rows={detailRows}
                criteria={criteriaAvgs}
                organizationId={organizationId}
                days={days}
                exportable={rows.length > 0}
                onReviewSaved={() => void refetch()}
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
  )
}
