import type { PathAssignment } from '../services/training'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import PathProgressRing from './PathProgressRing'
import PathStepDots from './PathStepDots'
import StepDeadline from './StepDeadline'
import Tooltip from './Tooltip'
import { stepTarget } from './trainingFormat'

/* Una persona su un percorso, in una scheda: chi è, quanto le manca, a che
 * punto è, e se il tempo stringe.
 *
 * L'anello e i trattini sono gli stessi che l'allievo vede di sé nel proprio
 * elenco (PathProgressRing, PathStepDots): l'amministratore guarda la stessa
 * cosa dall'altro lato, e due disegni diversi per lo stesso avanzamento si
 * leggerebbero come due numeri diversi. La percentuale sta in grande perché è
 * la prima cosa che si cerca su una scheda, e i trattini sotto dicono dove
 * quel numero è stato fatto: quattro tappe su otto chiuse in fila non sono le
 * stesse quattro con una scaduta in mezzo.
 *
 * In fondo lo stato e, se la tappa aperta ha una data, la scadenza con il suo
 * tono (StepDeadline): è quella su cui si può ancora fare qualcosa. Senza una
 * data resta il nome della tappa, che è comunque la risposta a «dov'è». */

export default function AssignmentCard({
  assignment,
  showOrganization,
}: {
  assignment: PathAssignment
  /** L'organizzazione si scrive solo a chi ne vede più di una. */
  showOrganization: boolean
}) {
  const { steps, completed_steps: done } = assignment
  const current = assignment.current_position ? steps[assignment.current_position - 1] : null

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-white/6 bg-gray-900/60 p-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <PathProgressRing done={done} total={steps.length} size={52} showPercent />
        <div className="min-w-0">
          <Tooltip content={assignment.user_name} truncateOnly>
            <h3 className="truncate text-[0.9rem] font-semibold text-slate-100">
              {assignment.user_name}
            </h3>
          </Tooltip>
          <Tooltip
            content={`${assignment.path_title}${
              showOrganization && assignment.organization_name
                ? ` · ${assignment.organization_name}`
                : ''
            }`}
            truncateOnly
          >
            <p className="truncate text-[0.75rem] text-slate-500">
              {assignment.path_title}
              {showOrganization && assignment.organization_name && (
                <span> · {assignment.organization_name}</span>
              )}
            </p>
          </Tooltip>
          <p className="text-[0.72rem] tabular-nums text-slate-500">
            {done}/{steps.length} {steps.length === 1 ? 'tappa' : 'tappe'}
          </p>
        </div>
      </div>

      {steps.length === 0 ? (
        <p className="text-[0.78rem] italic text-slate-500">Percorso senza tappe</p>
      ) : (
        <PathStepDots steps={steps} />
      )}

      <div className="flex min-w-0 items-center justify-between gap-2">
        <AssignmentStatusBadge status={assignment.status} />
        {current ? (
          current.due_at ? (
            <StepDeadline step={current} compact className="min-w-0 truncate" />
          ) : (
            <Tooltip content={`${current.position}. ${stepTarget(current)}`} truncateOnly>
              <span className="min-w-0 truncate text-[0.72rem] text-slate-500">
                {current.position}. {stepTarget(current)}
              </span>
            </Tooltip>
          )
        ) : steps.length > 0 ? (
          <span className="text-[0.72rem] text-emerald-400">Tutte superate</span>
        ) : null}
      </div>
    </article>
  )
}
