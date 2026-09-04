import { Link } from 'react-router'
import { useMyAssignments } from '../hooks/useTraining'
import type { PathAssignment } from '../services/training'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import EmptyState from './EmptyState'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import { prefetchOnHover } from './lazyPages'
import PathProgressRing from './PathProgressRing'
import PathStepDots from './PathStepDots'
import StepDeadline from './StepDeadline'
import { PageContainer, PageHeader } from './PageLayout'
import { primaryActionCls } from './PrimaryButton'
import {
  assignedByLabel,
  currentStep,
  isOpenStatus,
  resumableStep,
  splitByOpen,
  stepKindLabel,
  stepLink,
  stepTarget,
} from './trainingFormat'

/* I percorsi che mi sono stati assegnati, tutti insieme.
 *
 * È l'elenco, non la mappa: risponde a «quanti ne ho e quale mi manca», e
 * ognuno si apre nel proprio sentiero. Prima questa domanda non aveva un
 * posto, perché i percorsi vivevano solo in cima alla home, sotto la galleria
 * degli avatar: una striscia va bene per ricordare cosa c'è da fare mentre si
 * sta facendo altro, non per andarci apposta.
 *
 * I completati restano, in fondo e sotto il proprio titolo, invece di
 * sparire: sono la strada già percorsa, e un elenco che dimentica quello che
 * si è chiuso racconta solo il debito. Stanno però in una metà loro, perché
 * l'unica differenza era l'opacità delle schede, e con più di quattro o cinque
 * percorsi il confine andava cercato scheda per scheda.
 *
 * **La scheda porta anche il bottone che riprende il percorso**, che salta la
 * mappa e va dritto alla prova della tappa di adesso: la domanda con cui si
 * apre questa pagina è quasi sempre «cosa devo fare», e la risposta stava a
 * tre clic, la scheda, il nodo sul sentiero, il bottone nel riquadro. La mappa
 * resta a un clic dal titolo, per la domanda che invece riguarda tutto il
 * percorso. */

function AssignmentCard({ assignment }: { assignment: PathAssignment }) {
  const open = isOpenStatus(assignment.status)
  const now = currentStep(assignment)
  const resume = resumableStep(assignment)

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/6 bg-gray-900/60 p-5 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-violet-600/30 hover:bg-gray-900/80 hover:shadow-[0_8px_28px_rgba(124,58,237,0.12)]">
      {/* Il collegamento avvolge il contenuto e non la scheda intera: il
          bottone che riprende è un secondo indirizzo, e un link dentro un
          link non esiste. Steso sopra tutto con uno pseudo-elemento
          spegnerebbe invece i tooltip dei trattini delle tappe, che sono
          l'unico posto in cui i nomi compaiono in questa pagina. */}
      <Link
        to={`/app/percorsi/${assignment.id}`}
        className="flex min-w-0 flex-1 items-start gap-4 rounded-xl no-underline outline-none focus-visible:ring-1 focus-visible:ring-violet-500/50"
        /* La mappa e la prova da cui si riprende arrivano su richiesta: i due
           file partono al passaggio del puntatore, così da qui si entra senza
           attesa (vedi `lazyPages`). */
        {...prefetchOnHover(`/app/percorsi/${assignment.id}`)}
      >
        <PathProgressRing done={assignment.completed_steps} total={assignment.steps.length} />
        <div className="min-w-0 flex-1">
          {/* Il titolo si accorcia con i puntini invece di spingere via la
              targhetta: `truncate` da solo non bastava, perché un figlio flex
              non scende sotto la larghezza del proprio testo se non glielo si
              dice, quindi non troncava mai e con un titolo lungo mandava lo
              stato a capo. */}
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate font-heading text-[1.05rem] font-bold text-slate-100">
              {assignment.path_title}
            </h3>
            <AssignmentStatusBadge status={assignment.status} />
          </div>
          <p className="mb-3 truncate text-[0.82rem] text-slate-400">
            {assignment.path_description ??
              `${assignment.steps.length} ${
                assignment.steps.length === 1 ? 'tappa' : 'tappe'
              } da superare in ordine`}
          </p>
          <PathStepDots steps={assignment.steps} />
          {now && (
            <p className="mt-2.5 truncate text-[0.78rem] text-slate-500">
              {open ? 'Tappa in corso' : 'Ultima tappa'}{' '}
              <strong className="font-semibold text-slate-300">{stepTarget(now)}</strong> ·{' '}
              {stepKindLabel(now).toLowerCase()}
            </p>
          )}
          {/* Il termine solo finché c'è qualcosa da chiudere entro quel
              giorno: su un percorso finito sarebbe la data di una corsa già
              corsa. */}
          {open && now && <StepDeadline step={now} className="mt-1.5" />}
          {/* Da chi arriva il percorso, in coda e attenuato: non è quello che
              si viene a fare, è quello che si cerca quando si vuole sapere a
              chi chiedere. */}
          <p className="mt-1 truncate text-[0.72rem] text-slate-600">
            {assignedByLabel(assignment)}
          </p>
        </div>
      </Link>
      {resume && (
        <Link
          to={stepLink(resume)}
          className={`${primaryActionCls} shrink-0 max-md:w-full`}
          aria-label={`Riprendi dalla tappa ${resume.position}, ${stepTarget(resume)}`}
          {...prefetchOnHover(stepLink(resume))}
        >
          Riprendi
        </Link>
      )}
    </li>
  )
}

/* Una metà dell'elenco. Il titolo compare solo quando le metà sono due: con
   una sola, dice quello che l'intestazione della pagina ha già detto. */
function AssignmentGroup({
  title,
  assignments,
}: {
  title: string | null
  assignments: PathAssignment[]
}) {
  return (
    <section>
      {title && (
        <h2 className="mb-3 flex items-baseline gap-2 font-heading text-[0.82rem] font-semibold uppercase tracking-wider text-slate-500">
          {title}
          <span className="text-[0.78rem] font-normal normal-case tracking-normal text-slate-600">
            {assignments.length}
          </span>
        </h2>
      )}
      <ul className="flex flex-col gap-4">
        {assignments.map((assignment) => (
          <AssignmentCard key={assignment.id} assignment={assignment} />
        ))}
      </ul>
    </section>
  )
}

export default function MyPathsPage() {
  const { data: assignments = [], isPending, error, refetch } = useMyAssignments()
  const { open, done } = splitByOpen(assignments)
  const bothHalves = open.length > 0 && done.length > 0

  return (
    <PageContainer>
      <PageHeader
        title="I Tuoi Percorsi"
        description="Le tappe che il tuo formatore ti ha assegnato: si superano in ordine, una alla volta."
      />

      {isPending ? (
        <LoadingState message="Caricamento percorsi..." />
      ) : error && assignments.length === 0 ? (
        /* Una lettura caduta non è un percorso mai assegnato: senza il comando
           per riprovare, a chi non ha ancora ricevuto niente e a chi non è
           riuscito a leggere si diceva la stessa cosa. */
        <LoadError
          message={error instanceof Error ? error.message : 'Impossibile caricare i percorsi.'}
          variant="page"
          onRetry={() => void refetch()}
          className="py-8"
        />
      ) : assignments.length === 0 ? (
        <EmptyState
          title="Nessun percorso assegnato"
          hint="Quando il tuo formatore te ne affida uno lo trovi qui, con le sue tappe"
        />
      ) : (
        <div className="flex flex-col gap-8">
          {open.length > 0 && (
            <AssignmentGroup title={bothHalves ? 'Da completare' : null} assignments={open} />
          )}
          {done.length > 0 && (
            <AssignmentGroup title={bothHalves ? 'Completati' : null} assignments={done} />
          )}
        </div>
      )}
    </PageContainer>
  )
}
