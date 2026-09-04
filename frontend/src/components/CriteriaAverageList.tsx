/* Le medie per criterio di un quadro d'insieme, dal più basso.
 *
 * Dal più basso perché è l'ordine in cui si guardano: quello che si cerca è
 * dove si perdono punti. Le etichette arrivano dal server insieme ai numeri e
 * non da una copia scritta qui: sono le stesse della valutazione, e due
 * elenchi si allontanerebbero al primo criterio che cambia nome.
 *
 * Sta in un file suo perché lo stesso disegno serve ai due quadri, quello di
 * una persona e quello di un percorso: sono la stessa media letta su insiemi
 * di prove diversi, e due impaginati la farebbero sembrare due cose diverse.
 * Lo scarto invece esiste solo sul primo, dove c'è una versione precedente da
 * cui sottrarre, e qui manca da sé perché il campo arriva vuoto.
 */

import type { DebriefingCriterionAverage } from '../services/admin'
import { Delta } from './scoreCharts'
import { formatScore, scoreBadgeTone } from './simulationFormat'

/** Il riquadro di cui sono fatte le sezioni di un quadro d'insieme. */
export const debriefingCardCls = 'rounded-xl border border-white/6 bg-white/3 p-4'

export default function CriteriaAverageList({
  averages,
  title,
}: {
  averages: DebriefingCriterionAverage[]
  /** Su quali prove sono state calcolate: cambia fra i due quadri. */
  title: string
}) {
  if (averages.length === 0) return null
  const sorted = [...averages].sort((a, b) => a.average - b.average)

  return (
    <div className={debriefingCardCls}>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
        {title}
      </h4>
      <ul className="flex list-none flex-col gap-1.5">
        {sorted.map((criterion) => (
          <li key={criterion.key} className="flex items-center justify-between gap-4">
            <span className="text-[0.85rem] text-slate-300">{criterion.label}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {criterion.delta !== null && <Delta value={criterion.delta} />}
              <span
                className={`rounded-full px-2 py-0.5 text-[0.8rem] font-semibold ${scoreBadgeTone(criterion.average)}`}
              >
                {formatScore(criterion.average)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
