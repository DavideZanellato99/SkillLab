import { Link } from 'react-router'
import type { StepProgress } from '../services/training'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import Tooltip from './Tooltip'
import { CheckIcon, LockIcon } from './icons'
import {
  formatScore,
  formatShortDate,
  stepKindLabel,
  stepLink,
  stepProgress,
  stepTarget,
} from './trainingFormat'

/* La fila delle tappe di un percorso, numerate e in ordine.
 *
 * Un componente solo per i due posti in cui si legge: la scheda di chi
 * amministra e la home di chi si allena. Il disegno è quello che racconta la
 * regola, cioè che si va avanti una tappa per volta, e due copie
 * finirebbero per dirla in due modi.
 *
 * Quello che cambia fra i due posti è se una tappa si può aprire: da
 * amministratore no, perché la chat e il test sono di chi il percorso lo sta
 * facendo. Il numero della tappa è la sua posizione nella fila: chiusa porta
 * la spunta, ancora chiusa il lucchetto, ed è l'unico segno che serve per
 * capire dove si è arrivati senza leggere niente.
 */

const numberBaseCls =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[0.78rem] font-bold tabular-nums'

function StepNumber({ step }: { step: StepProgress }) {
  const done = step.status === 'completed' || step.status === 'completed_late'
  if (done) {
    return (
      <span className={`${numberBaseCls} border-emerald-500/40 bg-emerald-500/15 text-emerald-400`}>
        <CheckIcon size={14} />
      </span>
    )
  }
  if (step.status === 'locked') {
    return (
      <span className={`${numberBaseCls} border-white/10 bg-white/4 text-slate-600`}>
        <LockIcon size={13} />
      </span>
    )
  }
  return (
    <span
      className={`${numberBaseCls} ${
        step.status === 'overdue'
          ? 'border-red-500/40 bg-red-500/15 text-red-400'
          : 'border-violet-500/40 bg-violet-500/15 text-violet-300'
      }`}
    >
      {step.position}
    </span>
  )
}

function StepRow({ step, interactive }: { step: StepProgress; interactive: boolean }) {
  const target = stepTarget(step)
  const locked = step.status === 'locked'
  const progress = stepProgress(step)

  const body = (
    <>
      <StepNumber step={step} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={`truncate text-[0.9rem] font-semibold ${
              locked ? 'text-slate-500' : 'text-slate-100'
            }`}
          >
            {target}
          </span>
          <span className="text-[0.72rem] text-slate-500">{stepKindLabel(step)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.78rem]">
          <span className="text-slate-400">
            Obiettivo{' '}
            <strong className={locked ? 'font-bold text-slate-400' : 'font-bold text-slate-100'}>
              {formatScore(step.target_score)}/10
            </strong>
          </span>
          {step.due_at ? (
            <span className="text-slate-500">entro il {formatShortDate(step.due_at)}</span>
          ) : (
            step.due_days !== null &&
            locked && (
              <span className="text-slate-500">{step.due_days} giorni una volta aperta</span>
            )
          )}
          {!locked && (
            <span className="tabular-nums text-slate-400">
              {step.best_score !== null ? (
                <>
                  migliore{' '}
                  <strong
                    className={`font-bold ${
                      step.best_score >= step.target_score ? 'text-emerald-400' : 'text-orange-400'
                    }`}
                  >
                    {formatScore(step.best_score)}
                  </strong>
                </>
              ) : (
                'nessun tentativo'
              )}
            </span>
          )}
        </span>
        {!locked && (
          <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-white/6">
            <span
              className={`block h-full rounded-full transition-all ${
                progress >= 1 ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-600 to-cyan-500'
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </span>
        )}
      </span>
      <span className="shrink-0 self-start">
        <AssignmentStatusBadge status={step.status} />
      </span>
    </>
  )

  const rowCls = `flex items-start gap-3 rounded-xl px-3 py-2.5 ${
    locked ? 'bg-white/2' : 'bg-white/4'
  }`

  // Una tappa chiusa non si apre, e il tooltip dice perché invece di
  // lasciare un bersaglio che non risponde al clic.
  if (!interactive) return <li className={rowCls}>{body}</li>
  if (locked) {
    return (
      <li>
        <Tooltip content="Si sblocca superando la tappa precedente">
          <div className={`${rowCls} cursor-not-allowed`}>{body}</div>
        </Tooltip>
      </li>
    )
  }
  return (
    <li>
      <Link
        to={stepLink(step)}
        className={`${rowCls} no-underline transition hover:bg-violet-600/10`}
      >
        {body}
      </Link>
    </li>
  )
}

export default function PathStepsTrail({
  steps,
  interactive = false,
}: {
  steps: StepProgress[]
  /** Le tappe aperte portano alla chat o al test: solo per chi le percorre. */
  interactive?: boolean
}) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step) => (
        <StepRow key={step.id} step={step} interactive={interactive} />
      ))}
    </ol>
  )
}
