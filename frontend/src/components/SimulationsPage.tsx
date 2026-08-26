import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useSimulations } from '../hooks/useSimulations'
import { useAuth } from '../hooks/useAuth'
import { isSuperAdmin } from '../services/auth'
import type { Simulation } from '../services/simulations'
import { PageContainer, PageHeader } from './PageLayout'
import EmptyState from './EmptyState'
import FilterTabs from './FilterTabs'
import FormError from './FormError'
import LoadingState from './LoadingState'
import SearchInput from './SearchInput'
import Badge from './Badge'
import SimulationSourceBadge from './SimulationSourceBadge'
import Tooltip from './Tooltip'
import { formatRelativeDay } from './dateFormat'
import { filterSimulations, SIMULATION_FILTERS } from './simulationFilters'
import type { SimulationFilter } from './simulationFilters'
import { scoreBadgeTone, formatScore, kindLabel } from './simulationFormat'
import { formatDateTime } from './dateFormat'

/* L'elenco dei test tecnici che si possono svolgere.
 *
 * Nessun filtro per organizzazione: il server serve a ciascuno quelle del
 * proprio tenant, e al super admin tutte. Le simulazioni in bozza non
 * arrivano fin qui, stanno nella pagina di gestione.
 *
 * Di quale organizzazione sia il test lo legge solo il super admin, che è
 * l'unico ad avere davanti quelle di più tenant insieme. Chi appartiene a
 * un'organizzazione sola vedrebbe la stessa parola su ogni scheda, in una
 * riga che esiste per dire cosa distingue un test dall'altro.
 *
 * Sopra le schede stanno una ricerca e tre linguette, come nella galleria
 * degli avatar: con una decina di test pubblicati, "quali non ho ancora
 * fatto" era una domanda a cui si rispondeva leggendo la riga in fondo a ogni
 * scheda, una per una. I test arrivano tutti in una lettura sola, quindi il
 * restringere non torna mai sul server (vedi `simulationFilters`). */

function SimulationCard({
  simulation,
  showOrganization,
}: {
  simulation: Simulation
  showOrganization: boolean
}) {
  const done = simulation.attempt_count > 0
  const times = `Svolto ${simulation.attempt_count} ${simulation.attempt_count === 1 ? 'volta' : 'volte'}`
  return (
    <Link
      to={`/app/simulatore/${simulation.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-white/6 bg-gray-900/60 p-5 no-underline backdrop-blur-md transition hover:-translate-y-px hover:border-violet-600/50 hover:bg-violet-600/8"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 font-heading text-[1.05rem] font-semibold text-slate-100">
          {simulation.title}
        </h2>
        {done && (
          <Badge tone={scoreBadgeTone(simulation.last_attempt_score ?? 0)} className="shrink-0">
            {formatScore(simulation.last_attempt_score ?? 0)}
          </Badge>
        )}
      </div>
      {simulation.description && (
        <p className="line-clamp-3 text-[0.85rem] leading-relaxed text-slate-400">
          {simulation.description}
        </p>
      )}
      {/* Il tipo si legge prima di entrare: scegliere fra delle alternative
          in trenta secondi e scrivere dieci risposte sono due impegni molto
          diversi, e chi apre l'elenco sta decidendo se cominciare adesso.
          Accanto sta da dove vengono le domande, che non cambia l'impegno ma
          cambia cosa si ha davanti. */}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{simulation.question_count} domande</span>
        <span aria-hidden>·</span>
        <span>{kindLabel(simulation.kind).toLowerCase()}</span>
        <span aria-hidden>·</span>
        <SimulationSourceBadge source={simulation.source} />
        {showOrganization && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{simulation.organization_name}</span>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/6 pt-3 text-xs">
        {/* Quante volte, e quanto tempo fa. Il voto in alto dice com'è andata
            l'ultima prova, non se quell'ultima è di ieri o di sei mesi fa, che
            è la differenza fra un test da ripassare e uno appena fatto. La
            distanza da adesso si legge senza calcoli e la data esatta resta
            nel tooltip, come nella colonna dell'ultimo accesso. */}
        <span className="text-slate-500">
          {!done ? (
            'Mai svolto'
          ) : simulation.last_attempt_at ? (
            <Tooltip content={formatDateTime(simulation.last_attempt_at)}>
              <span>
                {times}, l'ultima {formatRelativeDay(simulation.last_attempt_at)}
              </span>
            </Tooltip>
          ) : (
            times
          )}
        </span>
        <span className="shrink-0 font-medium text-violet-400 transition group-hover:text-violet-300">
          {done ? 'Riprova' : 'Inizia'}
        </span>
      </div>
    </Link>
  )
}

/* Perché non c'è niente da mostrare, in ordine di quanto è facile
 * rimediarci: la ricerca, poi il filtro, e da ultimo l'elenco che è vuoto
 * davvero. Il testo lo dice, così una pagina ristretta non sembra guasta. */
function emptyMessage(
  hasSimulations: boolean,
  filter: SimulationFilter,
  search: string,
): { title: string; hint: string } {
  if (!hasSimulations) {
    return {
      title: 'Nessuna simulazione disponibile',
      hint: 'Le simulazioni tecniche vengono pubblicate da chi gestisce la piattaforma',
    }
  }
  if (search.trim() !== '') {
    return {
      title: 'Nessun test corrisponde alla ricerca',
      hint: 'Si può cercare per titolo, descrizione o tipo di test',
    }
  }
  if (filter === 'todo') {
    return {
      title: 'Nessun test ancora da svolgere',
      hint: 'Ogni test pubblicato è già stato svolto almeno una volta',
    }
  }
  return {
    title: 'Nessun test ancora svolto',
    hint: "I test conclusi compaiono qui, con il voto dell'ultimo tentativo",
  }
}

export default function SimulationsPage() {
  const { user } = useAuth()
  const showOrganization = isSuperAdmin(user)
  const { data: simulations = [], isLoading, error } = useSimulations()

  const [filter, setFilter] = useState<SimulationFilter>('all')
  const [search, setSearch] = useState('')

  const visible = useMemo(
    () => filterSimulations(simulations, filter, search),
    [simulations, filter, search],
  )

  const empty = emptyMessage(simulations.length > 0, filter, search)

  return (
    <PageContainer>
      <PageHeader
        title="Simulatore Tecnico"
        description="Verifica la tua preparazione sulle procedure con i test tecnici."
      />

      {isLoading ? (
        <LoadingState message="Caricamento simulazioni..." />
      ) : error ? (
        <FormError
          variant="page"
          message={
            error instanceof Error ? error.message : 'Errore nel caricamento delle simulazioni.'
          }
        />
      ) : (
        <>
          {/* La barra compare solo se c'è qualcosa da restringere: sopra un
              elenco vuoto sarebbe una casella di ricerca che non trova mai
              niente. */}
          {simulations.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Cerca per titolo, descrizione o tipo"
                ariaLabel="Cerca un test tecnico"
                className="min-w-[240px] flex-1"
              />
              <FilterTabs
                value={filter}
                onChange={setFilter}
                options={SIMULATION_FILTERS}
                ariaLabel="Quali test mostrare"
              />
            </div>
          )}

          {visible.length === 0 ? (
            <EmptyState title={empty.title} hint={empty.hint} />
          ) : (
            <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
              {visible.map((simulation) => (
                <SimulationCard
                  key={simulation.id}
                  simulation={simulation}
                  showOrganization={showOrganization}
                />
              ))}
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}
