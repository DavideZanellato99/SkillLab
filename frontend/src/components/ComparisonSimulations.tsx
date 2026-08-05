import { useMemo, useState } from 'react'
import type { SimulationComparisonAttempt } from '../services/comparison'
import Select from './Select'
import SimulationKindBadge from './SimulationKindBadge'
import { Delta } from './scoreCharts'
import { cardCls, formatScore, scoreTextColor } from './scoreFormat'
import { formatDate } from './lastAccess'

/* La metà scritta del confronto: due test consegnati, uno accanto all'altro.
 *
 * Cambia cosa c'è sotto i due voti. Là i sei criteri di una valutazione, qui
 * le domande: rifare lo stesso test serve a sapere quali sbagli si sono
 * recuperati, e il voto da solo non lo dice. Il dettaglio compare solo fra due
 * prove sullo stesso test, perché domande diverse non si appaiano. */

interface QuestionRow {
  key: string
  position: number
  text: string
  left: boolean
  right: boolean
}

function attemptLabel(attempt: SimulationComparisonAttempt): string {
  return `${formatDate(attempt.attempted_at)} · ${attempt.simulation_title} · ${formatScore(
    attempt.score,
  )}/10`
}

/** Il segno di come è andata una domanda, verde o rosso. */
function Outcome({ correct }: { correct: boolean }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        correct ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-300'
      }`}
      aria-label={correct ? 'corretta' : 'sbagliata'}
    >
      {correct ? '✓' : '✕'}
    </span>
  )
}

/** Una colonna del confronto: il test con il suo voto e quante ne ha prese. */
function AttemptPanel({
  attempt,
  baseline,
}: {
  attempt: SimulationComparisonAttempt
  baseline: SimulationComparisonAttempt | null
}) {
  const delta = baseline ? attempt.score - baseline.score : null

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/6 bg-gray-900/60">
      <div className="flex flex-col items-center gap-1 border-b border-white/6 bg-white/4 px-6 py-5">
        {delta !== null && (
          <span className="absolute right-3 top-3">
            <Delta value={delta} />
          </span>
        )}
        <span className="flex items-center gap-2 px-4 text-center text-[0.78rem] text-slate-400">
          {attempt.simulation_title}
          <SimulationKindBadge kind={attempt.simulation_kind} />
        </span>
        <span className="text-[0.72rem] text-slate-500">{formatDate(attempt.attempted_at)}</span>
        <div className="mt-1 flex items-baseline gap-1">
          <span className={`font-heading text-4xl font-bold ${scoreTextColor(attempt.score)}`}>
            {formatScore(attempt.score)}
          </span>
          <span className="text-base text-slate-500">/ 10</span>
        </div>
        {/* Il voto in decimi nasconde quante domande erano: dieci su dieci e
            due su due sono lo stesso numero e non la stessa prova. */}
        <div className="flex h-5 items-center text-[0.72rem] text-slate-500">
          {attempt.correct_count} risposte corrette su {attempt.question_count}
        </div>
      </div>
    </div>
  )
}

export default function ComparisonSimulations({
  attempts,
}: {
  attempts: SimulationComparisonAttempt[]
}) {
  /* Come per le conversazioni: si propone il primo contro l'ultimo, e una
   * scelta che non appartiene più a questi tentativi torna al default. */
  const [pickedLeftId, setPickedLeftId] = useState('')
  const [pickedRightId, setPickedRightId] = useState('')

  const belongs = (id: string) => attempts.some((a) => a.attempt_id === id)
  const leftId = belongs(pickedLeftId)
    ? pickedLeftId
    : attempts.length > 1
      ? attempts[0].attempt_id
      : ''
  const rightId = belongs(pickedRightId)
    ? pickedRightId
    : attempts.length > 0
      ? attempts[attempts.length - 1].attempt_id
      : ''

  const left = useMemo(
    () => attempts.find((a) => a.attempt_id === leftId) ?? null,
    [attempts, leftId],
  )
  const right = useMemo(
    () => attempts.find((a) => a.attempt_id === rightId) ?? null,
    [attempts, rightId],
  )

  const attemptOptions = attempts.map((a) => ({ value: a.attempt_id, label: attemptLabel(a) }))

  const sameSimulation = !!left && !!right && left.simulation_id === right.simulation_id

  /* Le domande dell'uno e dell'altro, appaiate per id. Una domanda riscritta
   * dopo il primo tentativo cambia id e compare due volte: è la verità, sono
   * due domande diverse, e appaiarle sulla posizione le farebbe sembrare la
   * stessa dicendo che è stata recuperata. */
  const questionRows = useMemo<QuestionRow[]>(() => {
    if (!left || !right || !sameSimulation) return []
    const byId = new Map<string, QuestionRow>()
    for (const answer of left.answers) {
      byId.set(answer.question_id, {
        key: answer.question_id,
        position: answer.position,
        text: answer.text,
        left: answer.is_correct,
        right: false,
      })
    }
    for (const answer of right.answers) {
      const row = byId.get(answer.question_id)
      if (row) row.right = answer.is_correct
      else
        byId.set(answer.question_id, {
          key: answer.question_id,
          position: answer.position,
          text: answer.text,
          left: false,
          right: answer.is_correct,
        })
    }
    return [...byId.values()].sort((a, b) => a.position - b.position)
  }, [left, right, sameSimulation])

  const recovered = questionRows.filter((r) => !r.left && r.right).length
  const lost = questionRows.filter((r) => r.left && !r.right).length

  if (attempts.length === 0) {
    return (
      <p className="rounded-2xl border border-white/6 bg-white/4 p-12 text-center text-sm text-slate-500">
        Nessun test tecnico da confrontare
      </p>
    )
  }

  if (attempts.length === 1) {
    return (
      <p className="rounded-2xl border border-white/6 bg-white/4 p-12 text-center text-sm text-slate-500">
        C’è un solo test consegnato: serve una seconda prova per avere qualcosa da confrontare
      </p>
    )
  }

  return (
    <>
      {/* `relative z-20` per la stessa ragione dell'altra metà: il blur apre
          un contesto di impilamento e le tendine dei Select ci restano dentro. */}
      <div className={`${cardCls} relative z-20 mb-8`}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="sim-left">
              Primo test
            </label>
            <Select
              id="sim-left"
              value={leftId}
              onChange={setPickedLeftId}
              options={attemptOptions}
            />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="sim-right">
              Secondo test
            </label>
            <Select
              id="sim-right"
              value={rightId}
              onChange={setPickedRightId}
              options={attemptOptions}
            />
          </div>
        </div>

        {/* Due test diversi si possono confrontare, ma il voto dice quanto si
            sa di quel documento, non quanto si sa in generale. */}
        {left && right && !sameSimulation && (
          <p className="mt-4 rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-[0.8rem] text-orange-300">
            Stai confrontando due test diversi, {left.simulation_title} e {right.simulation_title}:
            i voti dicono quanto si sa di due documenti, non se si è migliorati.
          </p>
        )}
      </div>

      {left && right && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-6 max-md:grid-cols-1">
            <AttemptPanel attempt={left} baseline={null} />
            <AttemptPanel attempt={right} baseline={left} />
          </div>

          {sameSimulation && questionRows.length > 0 && (
            <div className={cardCls}>
              <h2 className="text-sm font-semibold text-slate-300">Domanda per domanda</h2>
              <p className="mb-4 text-xs text-slate-500">
                {recovered === 0 && lost === 0
                  ? 'Le stesse risposte giuste e le stesse sbagliate nelle due prove'
                  : [
                      recovered > 0
                        ? `${recovered} ${recovered === 1 ? 'domanda recuperata' : 'domande recuperate'}`
                        : '',
                      lost > 0
                        ? `${lost} ${lost === 1 ? 'persa per strada' : 'perse per strada'}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(', ')}
              </p>
              <div className="flex flex-col gap-2">
                {questionRows.map((row) => {
                  const changed = row.left !== row.right
                  return (
                    <div
                      key={row.key}
                      className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${
                        changed ? 'border-white/10 bg-white/4' : 'border-white/6 bg-white/2'
                      }`}
                    >
                      <p className="min-w-0 flex-1 text-[0.85rem] leading-relaxed text-slate-300">
                        <span className="mr-1 text-slate-500">{row.position}.</span>
                        {row.text}
                      </p>
                      <div className="flex shrink-0 items-center gap-3">
                        <Outcome correct={row.left} />
                        <span className="text-slate-600" aria-hidden>
                          →
                        </span>
                        <Outcome correct={row.right} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
