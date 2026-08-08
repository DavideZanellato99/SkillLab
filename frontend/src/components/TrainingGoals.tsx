import { useMyAssignments } from '../hooks/useTraining'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import PathStepsTrail from './PathStepsTrail'

/* "I tuoi percorsi" in cima alla home: le tappe assegnate, in ordine, con
 * quella aperta adesso in evidenza e le successive col lucchetto.
 *
 * Le tappe si vedono tutte e non solo quella corrente, ed è voluto: sapere
 * cosa viene dopo è metà del motivo per cui un percorso è una fila invece di
 * un elenco di obiettivi sparsi. Quelle chiuse restano lì con la spunta,
 * perché è quello che dice di quanta strada si è fatta.
 *
 * Una tappa aperta porta alla chat o al test; una bloccata no, e il tooltip
 * dice perché (vedi PathStepsTrail). L'avatar e il test restano comunque
 * raggiungibili da soli, dalla galleria e dalla pagina delle simulazioni: il
 * percorso decide in che ordine conta, non cosa si può aprire.
 *
 * Se non c'è nessun percorso la sezione non esiste. */

export default function TrainingGoals() {
  const { data: assignments = [] } = useMyAssignments()

  if (assignments.length === 0) return null

  // Prima quelli ancora da chiudere, i completati in coda e attenuati
  const sorted = [...assignments].sort((a, b) => {
    const openA = a.status === 'active' || a.status === 'overdue' ? 0 : 1
    const openB = b.status === 'active' || b.status === 'overdue' ? 0 : 1
    return openA - openB
  })

  return (
    <section className="mb-8" aria-label="I tuoi percorsi di training">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="font-heading text-lg font-bold text-slate-100">I tuoi percorsi</h2>
        <span className="text-xs text-slate-500">Tappe assegnate dal tuo formatore</span>
      </div>
      <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
        {sorted.map((assignment) => {
          const isOpen = assignment.status === 'active' || assignment.status === 'overdue'
          return (
            <article
              key={assignment.id}
              className={`rounded-2xl border border-white/6 bg-gray-900/60 p-4 backdrop-blur-md ${
                isOpen ? '' : 'opacity-60'
              }`}
            >
              <header className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[0.95rem] font-semibold text-slate-100">
                    {assignment.path_title}
                  </h3>
                  <p className="mt-0.5 text-[0.75rem] text-slate-500">
                    {assignment.completed_steps} di {assignment.steps.length}{' '}
                    {assignment.steps.length === 1 ? 'tappa superata' : 'tappe superate'}
                    {assignment.current_position !== null &&
                      ` · ora tocca alla ${assignment.current_position}`}
                  </p>
                </div>
                <AssignmentStatusBadge status={assignment.status} />
              </header>
              {assignment.path_description && (
                <p className="mb-3 text-[0.82rem] text-slate-400">{assignment.path_description}</p>
              )}
              <PathStepsTrail steps={assignment.steps} interactive />
            </article>
          )
        })}
      </div>
    </section>
  )
}
