import { Link } from 'react-router'
import { useMyAssignments } from '../hooks/useTraining'
import type { PathAssignment } from '../services/training'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import FormError from './FormError'
import LoadingState from './LoadingState'
import PathProgressRing from './PathProgressRing'
import PathStepDots from './PathStepDots'
import { PageContainer, PageHeader } from './PageLayout'
import {
  assignedByLabel,
  currentStep,
  isOpenStatus,
  openFirst,
  stepKindLabel,
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
 * I completati restano in fondo e attenuati invece di sparire: sono la strada
 * già percorsa, e un elenco che dimentica quello che si è chiuso racconta
 * solo il debito. */

function AssignmentCard({ assignment }: { assignment: PathAssignment }) {
  const open = isOpenStatus(assignment.status)
  const now = currentStep(assignment)

  return (
    <li>
      <Link
        to={`/app/percorsi/${assignment.id}`}
        className={`flex gap-4 rounded-2xl border border-white/6 bg-gray-900/60 p-5 no-underline backdrop-blur-md transition hover:-translate-y-0.5 hover:border-violet-600/30 hover:bg-gray-900/80 hover:shadow-[0_8px_28px_rgba(124,58,237,0.12)] ${
          open ? '' : 'opacity-70 hover:opacity-100'
        }`}
      >
        <PathProgressRing done={assignment.completed_steps} total={assignment.steps.length} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="truncate font-heading text-[1.05rem] font-bold text-slate-100">
              {assignment.path_title}
            </h2>
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
          {/* Da chi arriva il percorso, in coda e attenuato: non è quello che
              si viene a fare, è quello che si cerca quando si vuole sapere a
              chi chiedere. */}
          <p className="mt-1 truncate text-[0.72rem] text-slate-600">
            {assignedByLabel(assignment)}
          </p>
        </div>
      </Link>
    </li>
  )
}

export default function MyPathsPage() {
  const { data: assignments = [], isPending, error } = useMyAssignments()

  return (
    <PageContainer>
      <PageHeader
        title="I Tuoi Percorsi"
        description="Le tappe che il tuo formatore ti ha assegnato: si superano in ordine, una alla volta."
      />

      {error && (
        <FormError
          message={error instanceof Error ? error.message : 'Impossibile caricare i percorsi.'}
        />
      )}

      {isPending ? (
        <LoadingState message="Caricamento percorsi..." />
      ) : assignments.length === 0 ? (
        <p className="rounded-2xl border border-white/6 bg-gray-900/60 p-16 text-center text-slate-500 backdrop-blur-md">
          Nessun percorso assegnato
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {openFirst(assignments).map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </ul>
      )}
    </PageContainer>
  )
}
