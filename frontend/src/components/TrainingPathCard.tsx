import type { TrainingPath } from '../services/training'
import Tooltip from './Tooltip'
import { PencilIcon, TrashIcon, UserPlusIcon } from './icons'
import { formatScore, formatShortDeadline, stepKindLabel, stepTarget } from './trainingFormat'

/* Un percorso nell'elenco di chi lo governa: com'è fatto e quanti lo stanno
 * percorrendo.
 *
 * Le tappe si vedono per intero e non dietro un "3 tappe" da aprire: sono la
 * cosa che distingue un percorso da un altro, e un titolo da solo non dice
 * se «Onboarding» finisce con una conversazione o con un test. Sono in fila
 * orizzontale e numerate perché è l'ordine a contare, che è anche l'unica
 * cosa che si perde riassumendole.
 *
 * Le tre azioni sono in chiaro e non dentro un menu: sono tre, si fanno
 * tutte dalla stessa scheda, e nasconderle dietro un puntino vorrebbe dire
 * un clic in più per il gesto più frequente, che è assegnare. */

const actionBtnCls =
  'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-white/4 text-slate-400 transition hover:bg-white/8 hover:text-slate-100'

export default function TrainingPathCard({
  path,
  showOrganization,
  onAssign,
  onEdit,
  onDelete,
}: {
  path: TrainingPath
  /** L'organizzazione si scrive solo a chi ne vede più di una. */
  showOrganization: boolean
  onAssign: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <article className="rounded-2xl border border-white/6 bg-gray-900/60 p-5 backdrop-blur-md">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-[1.05rem] font-bold text-slate-100">
            {path.title}
          </h3>
          <p className="mt-0.5 text-[0.78rem] text-slate-500">
            {showOrganization && <span>{path.organization_name} · </span>}
            {path.steps.length} {path.steps.length === 1 ? 'tappa' : 'tappe'} ·{' '}
            {path.assigned_count === 0
              ? 'non ancora assegnato'
              : `${path.assigned_count} ${
                  path.assigned_count === 1 ? 'persona' : 'persone'
                } in percorso`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip content="Assegna a delle persone">
            <button
              className={actionBtnCls}
              onClick={onAssign}
              aria-label={`Assegna ${path.title}`}
            >
              <UserPlusIcon size={15} />
            </button>
          </Tooltip>
          <Tooltip content="Modifica il percorso">
            <button className={actionBtnCls} onClick={onEdit} aria-label={`Modifica ${path.title}`}>
              <PencilIcon size={15} />
            </button>
          </Tooltip>
          <Tooltip content="Elimina il percorso">
            <button
              className={`${actionBtnCls} hover:bg-red-500/10 hover:text-red-400`}
              onClick={onDelete}
              aria-label={`Elimina ${path.title}`}
            >
              <TrashIcon size={15} />
            </button>
          </Tooltip>
        </div>
      </header>

      {path.description && <p className="mb-3 text-[0.85rem] text-slate-400">{path.description}</p>}

      <ol className="flex flex-wrap items-center gap-1.5">
        {path.steps.map((step) => (
          <li
            key={step.id}
            className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/4 px-2.5 py-1.5"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-[0.68rem] font-bold tabular-nums text-violet-300">
              {step.position}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[0.82rem] font-medium text-slate-100">
                {stepTarget(step)}
              </span>
              <span className="block text-[0.68rem] text-slate-500">
                {stepKindLabel(step)} · obiettivo {formatScore(step.target_score)}
                {step.due_at && ` · entro il ${formatShortDeadline(step.due_at)}`}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </article>
  )
}
