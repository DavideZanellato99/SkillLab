import type { AssignmentStatus } from '../services/training'
import { STATUS_META } from './assignmentStatus'

/* A che punto è un percorso assegnato, in una parola e un colore.
 *
 * Un componente suo e non un pezzo di TrainingPage: la stessa targhetta la
 * legge l'admin nella tabella di gestione e la persona assegnata sulla
 * propria home, e finché stava dentro la pagina di gestione bastava quella
 * riga sulla home a far scaricare a tutti l'intera schermata di
 * amministrazione. */
export default function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold ${meta.cls}`}
    >
      {meta.label}
    </span>
  )
}
