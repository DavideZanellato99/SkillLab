import { Link } from 'react-router'
import { useSimulations } from '../hooks/useSimulations'
import type { Simulation } from '../services/simulations'
import { PageContainer, PageHeader } from './PageLayout'
import LoadingState from './LoadingState'
import Badge from './Badge'
import SimulationSourceBadge from './SimulationSourceBadge'
import { scoreBadgeTone, formatScore, kindLabel } from './simulationFormat'

/* L'elenco dei test tecnici che si possono svolgere.
 *
 * Nessun filtro per organizzazione: il server serve a ciascuno quelle del
 * proprio tenant, e al super admin tutte. Le simulazioni in bozza non
 * arrivano fin qui, stanno nella pagina di gestione. */

function SimulationCard({ simulation }: { simulation: Simulation }) {
  const done = simulation.attempt_count > 0
  return (
    <Link
      to={`/simulatore/${simulation.id}`}
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
        <span aria-hidden>·</span>
        <span className="truncate">{simulation.organization_name}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/6 pt-3 text-xs">
        <span className="text-slate-500">
          {done
            ? `Svolto ${simulation.attempt_count} ${simulation.attempt_count === 1 ? 'volta' : 'volte'}`
            : 'Mai svolto'}
        </span>
        <span className="font-medium text-violet-400 transition group-hover:text-violet-300">
          {done ? 'Riprova' : 'Inizia'}
        </span>
      </div>
    </Link>
  )
}

export default function SimulationsPage() {
  const { data: simulations = [], isLoading, error } = useSimulations()

  return (
    <PageContainer>
      <PageHeader
        title="Simulatore Tecnico"
        description="Verifica la tua preparazione sulle procedure con i test tecnici."
      />

      {isLoading ? (
        <LoadingState message="Caricamento simulazioni..." />
      ) : error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center text-[0.9rem] text-red-300">
          {error instanceof Error ? error.message : 'Errore nel caricamento delle simulazioni.'}
        </div>
      ) : simulations.length === 0 ? (
        <div className="rounded-2xl border border-white/6 bg-gray-900/60 p-16 text-center text-slate-500 backdrop-blur-md">
          <p className="mb-1 text-[0.95rem]">Nessuna simulazione disponibile</p>
          <p className="text-sm">
            Le simulazioni tecniche vengono pubblicate da chi gestisce la piattaforma
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {simulations.map((simulation) => (
            <SimulationCard key={simulation.id} simulation={simulation} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
