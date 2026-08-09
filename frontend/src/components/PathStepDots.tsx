import type { AssignmentStatus, StepProgress } from '../services/training'
import Tooltip from './Tooltip'
import { stepTarget } from './trainingFormat'

/* Le tappe di un percorso ridotte a una fila di trattini colorati.
 *
 * Dove un percorso si presenta in poche righe (l'elenco dei propri percorsi,
 * il riepilogo in home) non c'è spazio né per il sentiero né per i nomi, ma
 * togliere del tutto le tappe lascerebbe un titolo e una percentuale, cioè
 * l'unica forma in cui due percorsi diversi si somigliano. I trattini
 * mostrano quante sono, in che ordine e a che punto: il nome resta nel
 * tooltip, per chi lo cerca. */

const DOT_STYLES: Record<AssignmentStatus, string> = {
  locked: 'bg-white/10',
  active: 'bg-gradient-to-r from-violet-600 to-cyan-500',
  overdue: 'bg-red-500/70',
  completed: 'bg-emerald-500/80',
  completed_late: 'bg-orange-500/80',
}

export default function PathStepDots({ steps }: { steps: StepProgress[] }) {
  return (
    <ol className="flex items-center gap-1">
      {steps.map((step) => (
        <li key={step.id} className="flex-1">
          <Tooltip content={`Tappa ${step.position} · ${stepTarget(step)}`}>
            <span className={`block h-1.5 rounded-full ${DOT_STYLES[step.status]}`} />
          </Tooltip>
        </li>
      ))}
    </ol>
  )
}
