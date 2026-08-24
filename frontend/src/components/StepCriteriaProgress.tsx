import type { CriteriaTargets, StepCriterionTarget } from '../services/training'
import { formatScore } from './trainingFormat'

/* Le condizioni sui singoli criteri di una tappa, e a che punto sono.
 *
 * Una tappa può chiedere, oltre al voto complessivo, un minimo su singoli
 * criteri della valutazione, e allora le condizioni valgono tutte insieme e
 * sulla stessa conversazione. Senza questa riga chi si allena leggerebbe un
 * 8,5 su un obiettivo di 7 e una tappa ancora aperta, senza nessun modo di
 * sapere cosa manca: è il caso che questo componente esiste per raccontare.
 *
 * Il numero accanto alla soglia è il **meglio fatto criterio per criterio**,
 * anche su conversazioni diverse, quindi tutti verdi non vuol dire tappa
 * superata: quella la supera una conversazione che li raggiunge insieme. È
 * la stessa distinzione che il server fa fra il meglio per criterio e il
 * momento in cui la tappa è stata chiusa (vedi `training_progress`).
 *
 * Su una tappa ancora chiusa non c'è nessun numero da mostrare: le prove
 * fatte prima del suo turno non contano, e il trattino dice che il conto
 * comincia quando la tappa si apre.
 *
 * I nomi stanno per esteso, gli stessi che si leggono nel referto: sono
 * pochi, perché una tappa pone una condizione o due, e chi legge deve capire
 * cosa gli manca senza passare il mouse su un'abbreviazione. Il numero
 * accanto si legge "quanto ho fatto su quanto serve".
 *
 * Fuori è fatto di soli `span`, e non di un elenco: uno dei due posti che lo
 * mostrano è la fila delle tappe, dove questa riga sta dentro il testo di una
 * tappa, e un `ul` lì dentro sarebbe un blocco annidato dentro una riga di
 * testo. */

export default function StepCriteriaProgress({
  targets,
  best,
  locked = false,
}: {
  targets: StepCriterionTarget[]
  /** Il meglio per criterio; una chiave assente vuol dire nessun voto. */
  best: CriteriaTargets
  locked?: boolean
}) {
  if (targets.length === 0) return null

  return (
    <span className="flex flex-wrap gap-1.5">
      {targets.map((criterion) => {
        const score = locked ? undefined : best[criterion.key]
        const reached = score !== undefined && score >= criterion.target
        return (
          <span
            key={criterion.key}
            className="flex items-baseline gap-1.5 rounded-lg border border-white/6 bg-white/3 px-2 py-1 text-[0.72rem]"
          >
            <span className="text-slate-300">{criterion.label}</span>
            <span className="font-semibold tabular-nums">
              <span
                className={
                  score === undefined
                    ? 'text-slate-500'
                    : reached
                      ? 'text-emerald-400'
                      : 'text-orange-400'
                }
              >
                {score === undefined ? '—' : formatScore(score)}
              </span>
              <span className="text-slate-500">/{formatScore(criterion.target)}</span>
            </span>
          </span>
        )
      })}
    </span>
  )
}
