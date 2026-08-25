import type { PathStep } from '../services/training'
import { ClockIcon } from './icons'
import { deadlineNote } from './trainingFormat'

/* Entro quando va chiusa una tappa, dove basta uno sguardo.
 *
 * La scadenza c'era già, ma solo dentro il riquadro di una tappa aperta
 * apposta, scritta come una data qualunque accanto ai tentativi: per sapere
 * quale percorso stringe bisognava entrare in ognuno e confrontare quattro
 * date con oggi. Qui la conclusione è già fatta (vedi `deadlineNote`) e il
 * colore la ripete senza leggerla, perché è quello che decide da dove si
 * comincia.
 *
 * Tre toni e non due: rosso quando il termine è passato, arancione nella
 * finestra in cui il server manda già l'avviso, e il grigio del resto della
 * riga quando la data è lontana. Una scadenza fra tre settimane accesa come
 * le altre trasformerebbe il colore in decorazione, e la volta che serve non
 * si distinguerebbe.
 *
 * Torna vuoto se la tappa non scade: una riga "nessuna scadenza" occuperebbe
 * un posto per dire che non c'è niente da sapere. */

const TONE_CLS = {
  overdue: 'text-red-400',
  soon: 'text-orange-400',
  plain: 'text-slate-500',
} as const

export default function StepDeadline({
  step,
  compact = false,
  className = '',
}: {
  step: PathStep
  /** Sotto un nodo della mappa, dove la riga sta insieme al nome e al tipo. */
  compact?: boolean
  /** Solo dove sta la riga in chi la ospita, come il margine sopra. */
  className?: string
}) {
  const note = deadlineNote(step)
  if (!note) return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${compact ? 'text-[0.68rem]' : 'text-[0.78rem]'} ${TONE_CLS[note.tone]} ${className}`}
    >
      <ClockIcon size={compact ? 11 : 13} className="shrink-0" />
      {note.text}
    </span>
  )
}
