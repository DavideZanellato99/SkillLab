import type { StepProgress } from '../services/training'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import StepCriteriaProgress from './StepCriteriaProgress'
import Tooltip from './Tooltip'
import { CheckIcon, LockIcon } from './icons'
import {
  formatScore,
  isStepDone,
  formatShortDeadline,
  isStepLocked,
  stepKindLabel,
  stepProgress,
  stepTarget,
} from './trainingFormat'

/* La fila delle tappe di un percorso, numerate e in ordine, per chi lo
 * guarda da fuori.
 *
 * È la vista di chi amministra: nella tabella delle assegnazioni una riga si
 * apre e mostra a che punto è quella persona, tappa per tappa. Nessuna di
 * queste tappe si può cominciare da qui, e non è una limitazione tecnica: la
 * chat e il test sono di chi il percorso lo sta facendo.
 *
 * Chi il percorso ce l'ha lo legge invece come mappa (vedi PathTrailMap), che
 * è la stessa regola detta a chi deve camminarla: lì le tappe si aprono, e a
 * dire quale sia il proprio turno è dove finisce la luce sul sentiero. Fino a
 * che i due posti condividevano questa fila, la differenza era una proprietà
 * `interactive` che spegneva metà del componente.
 *
 * Il numero della tappa è la sua posizione: chiusa porta la spunta, ancora
 * chiusa il lucchetto, ed è l'unico segno che serve per capire dove si è
 * arrivati senza leggere niente. */

const numberBaseCls =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[0.78rem] font-bold tabular-nums'

function StepNumber({ step }: { step: StepProgress }) {
  const done = isStepDone(step)
  if (done) {
    return (
      <span className={`${numberBaseCls} border-emerald-500/40 bg-emerald-500/15 text-emerald-400`}>
        <CheckIcon size={14} />
      </span>
    )
  }
  // Il lucchetto anche quando la data è già passata: la tappa è in ritardo e
  // insieme non ancora cominciabile, e il rosso dice la prima cosa senza
  // togliere la seconda.
  if (isStepLocked(step)) {
    return (
      <span
        className={`${numberBaseCls} ${
          step.status === 'overdue'
            ? 'border-red-500/40 bg-red-500/15 text-red-400'
            : 'border-white/10 bg-white/4 text-slate-600'
        }`}
      >
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

function StepRow({ step }: { step: StepProgress }) {
  const target = stepTarget(step)
  const locked = isStepLocked(step)
  const progress = stepProgress(step)

  return (
    <li
      className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${
        locked ? 'bg-white/2' : 'bg-white/4'
      }`}
    >
      <StepNumber step={step} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {/* Il nome della prova è quello che distingue una tappa
              dall'altra, e nella riga aperta di una tabella lo spazio è
              quello che avanza: quando ci finisce tagliato lo dà il
              tooltip, come sulla scheda del percorso. */}
          <Tooltip content={target} truncateOnly>
            <span
              className={`truncate text-[0.9rem] font-semibold ${
                locked ? 'text-slate-500' : 'text-slate-100'
              }`}
            >
              {target}
            </span>
          </Tooltip>
          <span className="text-[0.72rem] text-slate-500">{stepKindLabel(step)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.78rem]">
          <span className="text-slate-400">
            Obiettivo{' '}
            <strong className={locked ? 'font-bold text-slate-400' : 'font-bold text-slate-100'}>
              {formatScore(step.target_score)}/10
            </strong>
          </span>
          {step.due_at && (
            <span className="text-slate-500">entro il {formatShortDeadline(step.due_at)}</span>
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
        {step.criteria_targets.length > 0 && (
          <span className="mt-2 block">
            <StepCriteriaProgress
              targets={step.criteria_targets}
              best={step.best_criteria_scores}
              locked={locked}
            />
          </span>
        )}
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
    </li>
  )
}

export default function PathStepsTrail({ steps }: { steps: StepProgress[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </ol>
  )
}
