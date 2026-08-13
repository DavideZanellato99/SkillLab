import type { ReactNode } from 'react'
import { Delta } from './scoreCharts'
import { cardCls, formatScore, scoreTextColor } from './scoreFormat'

/* La risposta della schermata, in cima ai risultati: da quanto a quanto, e di
 * quanto.
 *
 * Prima questo numero non esisteva: c'erano due voti dentro le rispettive card
 * e una targhetta piccola nell'angolo di quella di destra, quindi la domanda
 * per cui si apre la pagina, "sono migliorato", si leggeva sottraendo due
 * numeri distanti fra loro. Qui la sottrazione è già fatta e sta dove cade
 * l'occhio, e il resto della pagina diventa il perché di quel numero.
 *
 * I due voti restano scritti accanto alla variazione: da soli, "+1,5" non dice
 * se si è passati da quattro a cinque e mezzo o da otto e mezzo a dieci, che
 * sono due miglioramenti diversi. */

function Side({ role, score, caption }: { role: string; score: number; caption: ReactNode }) {
  return (
    <div className="text-center">
      <p className="mb-1 text-[0.66rem] font-semibold uppercase tracking-wider text-slate-500">
        {role}
      </p>
      <p className="font-heading text-4xl font-bold">
        <span className={scoreTextColor(score)}>{formatScore(score)}</span>
        <span className="text-base font-normal text-slate-500"> / 10</span>
      </p>
      <p className="mt-1 text-[0.72rem] text-slate-500">{caption}</p>
    </div>
  )
}

export default function ComparisonVerdict({
  before,
  after,
  children,
}: {
  before: { score: number; caption: ReactNode }
  after: { score: number; caption: ReactNode }
  /** Cosa è cambiato sotto il voto: i criteri, o le domande. */
  children?: ReactNode
}) {
  return (
    <div className={`${cardCls} mb-6`}>
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
        <Side role="Prima" score={before.score} caption={before.caption} />
        {/* La freccia è il verso della lettura, non un dato: chi ascolta la
            pagina ha già "prima" e "dopo" scritti sopra i due voti. */}
        <span aria-hidden className="font-heading text-2xl text-slate-600">
          →
        </span>
        <Side role="Dopo" score={after.score} caption={after.caption} />
        <Delta value={after.score - before.score} size="lg" />
      </div>

      {children && (
        <p className="mt-5 border-t border-white/6 pt-4 text-center text-[0.85rem] text-slate-400">
          {children}
        </p>
      )}
    </div>
  )
}
