import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { StepProgress } from '../services/training'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import Badge from './Badge'
import { categoryBadgeClasses } from './categoryStyles'
import { primaryActionCls } from './PrimaryButton'
import { ChatIcon, ChecklistIcon, CloseIcon, LockIcon } from './icons'
import {
  formatDate,
  formatDeadline,
  formatScore,
  isStepLocked,
  stepKindLabel,
  stepLink,
  stepProgress,
  stepTarget,
} from './trainingFormat'

/* La tappa scelta sulla mappa, letta per intero.
 *
 * Sulla mappa un nodo porta il numero e il nome, che è quanto serve per
 * capire dove si è; tutto il resto (l'obiettivo, la scadenza, quanto ci si è
 * andati vicino) sta qui, perché scritto attorno a ogni nodo trasformerebbe
 * il sentiero in un elenco disposto male.
 *
 * Il pannello risponde sempre, anche per una tappa bloccata: quello che
 * cambia è che al posto del bottone c'è il motivo per cui non si può ancora
 * cominciare. Un pannello vuoto direbbe che la tappa non esiste, e invece
 * esiste ed è la prossima.
 *
 * Il modo di chiudere lo porta chi lo apre: sulla mappa il pannello si posa
 * sopra il sentiero (vedi PathStepDrawer) e va tolto di mezzo, altrove sta
 * dove sta e un bottone per chiuderlo sarebbe un bottone che non fa niente. */

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2">
      <span className="block text-[0.68rem] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="mt-0.5 block text-[0.9rem] font-semibold text-slate-100">{children}</span>
    </div>
  )
}

export default function PathStepPanel({
  step,
  total,
  onClose,
}: {
  step: StepProgress
  total: number
  /** Passato solo da chi mostra il pannello sopra qualcos'altro. */
  onClose?: () => void
}) {
  const locked = isStepLocked(step)
  const progress = stepProgress(step)
  const reached = step.best_score !== null && step.best_score >= step.target_score

  return (
    <section
      className="rounded-2xl border border-white/6 bg-gray-900/85 p-5 shadow-2xl shadow-black/40 backdrop-blur-md"
      aria-label={`Tappa ${step.position}: ${stepTarget(step)}`}
    >
      <header className="mb-4 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[0.72rem] font-semibold uppercase tracking-wider text-slate-500">
              Tappa {step.position} di {total}
            </span>
            <AssignmentStatusBadge status={step.status} />
          </div>
          <h2 className="font-heading text-xl font-bold text-slate-100">{stepTarget(step)}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.8rem] text-slate-400">
            <span className="flex items-center gap-1.5">
              {step.kind === 'avatar' ? <ChatIcon size={13} /> : <ChecklistIcon size={13} />}
              {stepKindLabel(step)}
            </span>
            {step.avatar_category && (
              <Badge tone={categoryBadgeClasses(step.avatar_category_color)}>
                {step.avatar_category}
              </Badge>
            )}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi la tappa"
            className="-mr-1 -mt-1 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100"
          >
            <CloseIcon size={16} />
          </button>
        )}
      </header>

      {/* Quanto si è vicini all'obiettivo, che è la sola domanda che una
          tappa aperta pone. Su una bloccata la barra resta a zero, perché le
          prove fatte prima del suo turno non contano (vedi trainingFormat). */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[0.8rem]">
          <span className="text-slate-400">
            Obiettivo{' '}
            <strong className="font-bold text-slate-100">{formatScore(step.target_score)}</strong>{' '}
            su 10
          </span>
          <span className="tabular-nums text-slate-400">
            {step.best_score !== null ? (
              <>
                migliore{' '}
                <strong className={`font-bold ${reached ? 'text-emerald-400' : 'text-orange-400'}`}>
                  {formatScore(step.best_score)}
                </strong>
              </>
            ) : (
              'nessun tentativo'
            )}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/6">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              progress >= 1 ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-600 to-cyan-500'
            }`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <Stat label="Tentativi">
          {locked ? <span className="text-slate-500">—</span> : step.attempts}
        </Stat>
        <Stat label="Scadenza">
          {step.due_at ? (
            formatDeadline(step.due_at)
          ) : (
            <span className="text-slate-500">nessuna</span>
          )}
        </Stat>
        {step.unlocked_at && <Stat label="Aperta il">{formatDate(step.unlocked_at)}</Stat>}
        {step.achieved_at && <Stat label="Superata il">{formatDate(step.achieved_at)}</Stat>}
      </div>

      {locked ? (
        <p className="flex items-start gap-2 rounded-xl border border-white/6 bg-white/3 px-4 py-3 text-[0.82rem] text-slate-400">
          <LockIcon size={15} className="mt-0.5 shrink-0" />
          Si apre quando superi la tappa {step.position - 1}.
        </p>
      ) : (
        <Link to={stepLink(step)} className={primaryActionCls}>
          {step.kind === 'avatar' ? 'Vai alla conversazione' : 'Apri il test'}
        </Link>
      )}
    </section>
  )
}
