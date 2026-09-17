import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useOrganizations } from '../hooks/useOrganizations'
import { useEvaluationsReport, useSimulationsReport } from '../hooks/useReports'
import { isSuperAdmin } from '../services/auth'
import { ANY, matchesFilter } from './comparisonFilters'
import { labelCls } from './Field'
import ComparisonProvaTabs from './ComparisonProvaTabs'
import type { ComparisonProva } from './ComparisonProvaTabs'
import { MODE_FILTERS } from './conversationMode'
import type { ModeFilter } from './conversationMode'
import FiltersBar, { FilterField } from './FiltersBar'
import FilterTabs from './FilterTabs'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import MultiSearchSelect from './MultiSearchSelect'
import Notice from './Notice'
import { PageHeader } from './PageLayout'
import { comparePeople } from './personOrder'
import { MeterRow } from './scoreCharts'
import { cardCls, personName } from './scoreFormat'
import Select from './Select'
import { TabPanel } from './TabBar'
import { KIND_FILTERS } from './simulationFormat'
import type { KindFilter } from './simulationFormat'

/* La seconda sezione del confronto, per chi amministra: le medie di più
 * persone una sotto l'altra.
 *
 * È l'altra domanda che un docente si fa dopo "è migliorato": "come vanno
 * questi quattro". Sta qui e non nella dashboard, dove era nato, perché la
 * dashboard risponde su tutto il gruppo e questa pagina su persone scelte, e
 * un grafico che si compone scegliendo chi metterci stava in mezzo a schede
 * che non si compongono. Uno studente non lo vede: la sua pagina resta il
 * confronto con sé stesso.
 *
 * Parte vuoto. Non è la dashboard, dove senza nessuna scelta il grafico era
 * di tutti perché chi voleva solo guardare il gruppo non doveva comporre
 * niente: qui si viene per scegliere, e un elenco di trenta barre aperto
 * prima di aver scelto nessuno sarebbe la classifica dell'aula, che è la
 * cosa che questa pagina non vuole essere. Le barre sono di chi è stato
 * cercato e spuntato, e soltanto di loro.
 *
 * La prova si sceglie con la linguetta sotto il titolo, ed è la stessa
 * dell'altra sezione, che la pagina tiene nell'indirizzo per tutte e due:
 * sulle conversazioni il voto medio complessivo delle valutazioni, sui test
 * tecnici il voto medio dei tentativi. Il canale e il tipo di test si
 * restringono qui dentro e partono aperti, come i filtri dell'altra sezione,
 * perché qui si guarda cosa una persona ha fatto e non un canale solo.
 *
 * Le righe arrivano dagli stessi report della dashboard, su tutto lo storico:
 * questa pagina non ha un periodo, e l'altra sezione mostra tutte le prove
 * di una persona. Le persone scelte stanno nell'indirizzo (`confronto=`),
 * come la persona dell'altra sezione: un confronto composto si manda a
 * qualcuno. Sono id e non nomi, l'unica identità che non cambia quando
 * qualcuno corregge il proprio cognome. */

interface UserAvg {
  userId: string
  name: string
  nome: string
  cognome: string
  email: string
  avg: number
  count: number
}

/* Come le due scelte si scrivono nell'indirizzo, con gli stessi nomi della
 * dashboard: chi ha composto un confronto di là lo ricompone di qua con le
 * stesse parole. */
const COMPARE_PARAM = 'confronto'
const ORG_PARAM = 'organizzazione'

/** La radice degli id delle linguette della prova di questa sezione. */
const PROVA_BASE = 'confronto-utenti-prova'

const VALUTAZIONI: [string, string] = ['valutazione', 'valutazioni']
const TENTATIVI: [string, string] = ['tentativo', 'tentativi']

/** Quante prove, scritto come si legge: "1 valutazione", "4 tentativi". */
const conteggio = (n: number, [uno, tanti]: [string, string]) => `${n} ${n === 1 ? uno : tanti}`

/**
 * La media di ogni persona sulle righe date, dalla più alta.
 *
 * Una funzione sola per le due prove, che hanno la stessa persona sulla riga
 * e un voto in una colonna diversa: la stessa somma era scritta due volte
 * nelle due metà della dashboard.
 */
function averagesByUser<
  T extends { user_id: string; user_nome: string; user_cognome: string; user_email: string },
>(rows: T[], scoreOf: (row: T) => number): UserAvg[] {
  const acc = new Map<string, UserAvg & { sum: number }>()
  for (const r of rows) {
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
    entry.sum += scoreOf(r)
    entry.count += 1
    acc.set(r.user_id, entry)
  }
  return Array.from(acc.values())
    .map(({ sum, ...e }) => ({ ...e, avg: sum / e.count }))
    .sort((a, b) => b.avg - a.avg)
}

export default function ComparisonUsers({
  prova,
  onProvaChange,
  sectionTabs,
}: {
  prova: ComparisonProva
  onProvaChange: (value: ComparisonProva) => void
  /** La linguetta con cui si passa all'altra sezione, che la pagina disegna
      e che sta sotto l'intestazione. */
  sectionTabs: ReactNode
}) {
  const { user } = useAuth()
  const showOrgFilter = isSuperAdmin(user)
  const { data: organizations = [] } = useOrganizations(showOrgFilter)

  const [params, setParams] = useSearchParams()
  /* Sempre sostituendo il passo: le persone si spuntano una dopo l'altra, e
     ogni spunta lasciata in cronologia sarebbe un tasto indietro che toglie
     una persona invece di uscire dalla pagina. */
  const setParam = (name: string, value: string, daTogliere?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    if (daTogliere) next.delete(daTogliere)
    setParams(next, { replace: true })
  }

  /* L'organizzazione nell'indirizzo vale solo per chi la può scegliere: a un
     org admin il server risponde comunque con la sua. */
  const organizationId = showOrgFilter ? (params.get(ORG_PARAM) ?? '') : ''
  /* Un id scelto che qui non ha righe non si scarta: potrebbe avere prove
     solo dell'altro tipo, e cambiando filtro la scelta deve restare. */
  const compareIds = useMemo(() => {
    const raw = params.get(COMPARE_PARAM) ?? ''
    return raw ? raw.split(',').filter(Boolean) : []
  }, [params])

  /* Il canale e il tipo restano locali, come nell'altro riquadro: si cambiano
     mentre si guarda, e non sono quello che si manda a qualcuno. */
  const [modeFilter, setModeFilter] = useState<ModeFilter>(ANY)
  const [kindFilter, setKindFilter] = useState<KindFilter>(ANY)

  /* Il confronto vive dentro una organizzazione sola. Chi ne amministra una
     ce l'ha già, perché il server gli risponde solo con la sua; il super
     admin deve prima sceglierne una, e finché non l'ha fatto non si legge
     niente. */
  const needsOrganization = showOrgFilter && !organizationId

  /* Si legge solo la prova della linguetta aperta: l'altra, in quel momento,
     non la sta guardando nessuno. */
  const evaluations = useEvaluationsReport(
    organizationId,
    undefined,
    !needsOrganization && prova === 'conversazioni',
  )
  const simulations = useSimulationsReport(
    organizationId,
    undefined,
    !needsOrganization && prova === 'simulazioni',
  )
  const active = prova === 'conversazioni' ? evaluations : simulations

  const userAvgs = useMemo<UserAvg[]>(
    () =>
      prova === 'conversazioni'
        ? averagesByUser(
            (evaluations.data?.rows ?? []).filter((r) => matchesFilter(modeFilter, r.mode)),
            (r) => r.overall_score,
          )
        : averagesByUser(
            (simulations.data?.rows ?? []).filter((r) =>
              matchesFilter(kindFilter, r.simulation_kind),
            ),
            (r) => r.score,
          ),
    [prova, evaluations.data, simulations.data, modeFilter, kindFilter],
  )

  /* Le persone fra cui scegliere sono tutte quelle con una prova di questa
     specie, e non solo quelle del canale o del tipo attivo: restringere
     l'elenco col filtro farebbe sparire dalla tendina qualcuno già scelto.
     Per cognome, come ogni tendina di persone (vedi `personOrder`): le barre
     stanno dalla media più alta, che è la risposta, la tendina in ordine
     alfabetico, che è come si cerca un nome. */
  const people = useMemo(
    () =>
      (prova === 'conversazioni'
        ? averagesByUser(evaluations.data?.rows ?? [], (r) => r.overall_score)
        : averagesByUser(simulations.data?.rows ?? [], (r) => r.score)
      ).sort(comparePeople),
    [prova, evaluations.data, simulations.data],
  )

  const compared = useMemo(
    () => userAvgs.filter((u) => compareIds.includes(u.userId)),
    [userAvgs, compareIds],
  )

  const rowCount = active.data?.rows.length ?? 0
  const unit = prova === 'conversazioni' ? VALUTAZIONI : TENTATIVI

  /* Quello che il riquadro ha da dire quando non disegna barre. Sono quattro
     cose diverse e vanno dette diverse: non c'è nessuna prova, non è stato
     scelto nessuno, o il filtro attivo ha lasciato fuori tutti gli scelti.
     "Nessuna persona selezionata" davanti a un elenco vuoto manderebbe a
     cercare persone che non ci sono. */
  const emptyMessage =
    rowCount === 0
      ? prova === 'conversazioni'
        ? 'Nessuna conversazione ancora valutata'
        : 'Nessun test tecnico ancora consegnato'
      : compareIds.length === 0
        ? 'Nessuna persona selezionata'
        : compared.length === 0
          ? 'Nessuna prova per le persone scelte con il filtro attivo'
          : ''
  const emptyHint =
    rowCount > 0 && compareIds.length === 0
      ? 'Cerca e scegli le persone da confrontare per disegnare il grafico'
      : ''

  return (
    <>
      {/* La sezione porta la propria intestazione di pagina, con il titolo
          che la nomina e accanto le persone da spuntare: il titolo della
          pagina è quello della sezione aperta, e il comando sta a destra del
          titolo perché è quello che decide cosa c'è sotto.

          Il campo è lo stesso dell'altra sezione, etichetta sopra e stessa
          larghezza, e cambia solo quello che ci si fa: là si sceglie una
          persona, qui se ne spuntano quante se ne vogliono. Due campi
          diversi nello stesso posto delle due sezioni si leggevano come due
          comandi diversi, e sono la stessa domanda («chi»). */}
      <PageHeader
        title="Confronto tra Utenti"
        description={
          prova === 'conversazioni'
            ? 'Voto medio complessivo delle conversazioni valutate di ogni persona scelta, dalla media più alta.'
            : 'Voto medio dei test tecnici consegnati da ogni persona scelta, dalla media più alta.'
        }
        actions={
          !needsOrganization && (
            <div className="relative z-30 w-[380px] shrink-0 max-lg:w-full">
              <label className={`mb-1 block ${labelCls}`} htmlFor="confronto-utenti-persone">
                Utenti
              </label>
              <MultiSearchSelect
                id="confronto-utenti-persone"
                values={compareIds}
                onChange={(next) => setParam(COMPARE_PARAM, next.join(','))}
                options={people.map((u) => ({ value: u.userId, label: u.name, sub: u.email }))}
                placeholder="Cerca per nome o email..."
                /* Le voci si allineano a destra sotto il campo, dove il campo
                   stesso è: una lista che si allarga verso destra uscirebbe
                   dalla pagina. */
                align="right"
              />
            </div>
          )
        }
      />

      {sectionTabs}

      <ComparisonProvaTabs base={PROVA_BASE} value={prova} onChange={onProvaChange} />

      <TabPanel base={PROVA_BASE} value={prova}>
        <div className={cardCls}>
          <FiltersBar variant="section">
            {showOrgFilter && (
              <FilterField label="Organizzazione" htmlFor="confronto-utenti-org">
                <Select
                  id="confronto-utenti-org"
                  className="min-w-[220px]"
                  value={organizationId}
                  /* Cambiando organizzazione le persone scelte non sono più
                   fra quelle in elenco: se ne vanno con il filtro che le ha
                   portate. */
                  onChange={(value) => setParam(ORG_PARAM, value, COMPARE_PARAM)}
                  options={[
                    { value: '', label: 'Scegli una organizzazione' },
                    ...organizations.map((o) => ({ value: o.id, label: o.name })),
                  ]}
                />
              </FilterField>
            )}
            {prova === 'conversazioni' ? (
              <FilterField label="Modalità">
                <FilterTabs
                  value={modeFilter}
                  onChange={setModeFilter}
                  options={MODE_FILTERS}
                  ariaLabel="Modalità"
                />
              </FilterField>
            ) : (
              <FilterField label="Tipo di Test">
                <FilterTabs
                  value={kindFilter}
                  onChange={setKindFilter}
                  options={KIND_FILTERS}
                  ariaLabel="Tipo di Test"
                />
              </FilterField>
            )}
          </FiltersBar>

          {/* Mettere a confronto due persone di organizzazioni diverse non è
            una domanda che si fa: si allenano su avatar diversi, con test
            diversi, dentro programmi diversi, e le due medie non stanno
            sulla stessa scala. */}
          {needsOrganization ? (
            <Notice>
              Scegli una organizzazione per mettere a confronto le sue persone: due organizzazioni
              diverse si allenano su avatar e test diversi, quindi le loro medie non si leggono
              sulla stessa scala
            </Notice>
          ) : active.error ? (
            <LoadError
              message={
                active.error instanceof Error
                  ? active.error.message
                  : 'Impossibile caricare le prove.'
              }
              onRetry={() => void active.refetch()}
            />
          ) : active.isLoading ? (
            <LoadingState message="Caricamento prove..." variant="modal" />
          ) : emptyMessage ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">{emptyMessage}</p>
              {emptyHint && <p className="mt-2 text-[0.8rem] text-slate-600">{emptyHint}</p>}
            </div>
          ) : (
            <>
              {/* Le prove erano più di quante il server ne manda in una volta,
                quindi le medie sono delle più recenti. Va detto sopra le
                barre: medie di una parte dello storico presentate come le
                medie di tutto sarebbero un numero sbagliato dato con
                sicurezza. */}
              {active.data?.truncated && (
                <Notice className="mb-5">
                  Le prove sono troppe per essere lette in una volta: le medie sono calcolate sulle
                  più recenti
                </Notice>
              )}
              <div className="flex flex-col gap-1.5">
                {compared.map((u) => (
                  <MeterRow
                    key={u.userId}
                    label={u.name}
                    sub={conteggio(u.count, unit)}
                    score={u.avg}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </TabPanel>
    </>
  )
}
