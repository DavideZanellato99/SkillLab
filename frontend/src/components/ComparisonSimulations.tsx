import { useMemo, useState } from 'react'
import type { SimulationComparisonAttempt } from '../services/comparison'
import ComparisonEmpty from './ComparisonEmpty'
import ComparisonFilterBar, { ComparisonWarnings } from './ComparisonFilterBar'
import Select from './Select'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import { KIND_FILTERS, kindLabel } from './simulationFormat'
import type { KindFilter } from './simulationFormat'
import { ANY, filterOptions, matchesFilter, pickPair, survivingFilter } from './comparisonFilters'
import { Delta } from './scoreCharts'
import { cardCls, formatScore, scoreTextColor } from './scoreFormat'
import { formatDate } from './lastAccess'

/* La metà scritta del confronto: due test consegnati, uno accanto all'altro.
 *
 * Si sceglie fra le prove che i due filtri lasciano passare, il tipo e il
 * test: i quattro tipi si correggono con quattro scale diverse, quindi un
 * dieci preso a crocette e un dieci preso a risposte scritte non sono lo
 * stesso dieci.
 *
 * Cambia cosa c'è sotto i due voti. Là i sei criteri di una valutazione, qui
 * le domande: rifare lo stesso test serve a sapere quali sbagli si sono
 * recuperati, e il voto da solo non lo dice. Il dettaglio compare solo fra due
 * prove sullo stesso test, perché domande diverse non si appaiano.
 *
 * E dallo stesso test escono domande diverse: ogni tentativo ne estrae dieci a
 * caso dal serbatoio, quindi due prove hanno in comune quello che il caso ha
 * fatto capitare in tutte e due. Solo quelle si confrontano. Una domanda vista
 * una volta sola non è né recuperata né persa, non è stata chiesta, e metterla
 * in tabella con una crocetta rossa dalla parte in cui non c'era racconterebbe
 * un errore che nessuno ha fatto. */

interface QuestionRow {
  key: string
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
          <SimulationSourceBadge source={attempt.simulation_source} />
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
  /* Come per le conversazioni: prima si restringe, poi si sceglie, e i due
   * filtri partono aperti. */
  const [kindFilter, setKindFilter] = useState<KindFilter>(ANY)
  const [pickedSimulationId, setPickedSimulationId] = useState(ANY)
  const [pickedLeftId, setPickedLeftId] = useState('')
  const [pickedRightId, setPickedRightId] = useState('')

  /* I test fra cui scegliere sono quelli del tipo scelto: un test a risposta
   * aperta, offerto mentre si guardano le crocette, non ha nessun tentativo
   * da mostrare. */
  const byKind = useMemo(
    () => attempts.filter((a) => matchesFilter(kindFilter, a.simulation_kind)),
    [attempts, kindFilter],
  )
  const simulationOptions = useMemo(
    () =>
      filterOptions(
        byKind,
        (a) => a.simulation_id,
        (a) => a.simulation_title,
        'Tutti i test',
      ),
    [byKind],
  )
  const simulationFilter = survivingFilter(simulationOptions, pickedSimulationId)

  const filtered = useMemo(
    () => byKind.filter((a) => matchesFilter(simulationFilter, a.simulation_id)),
    [byKind, simulationFilter],
  )

  const { leftId, rightId } = pickPair(filtered, (a) => a.attempt_id, pickedLeftId, pickedRightId)

  const left = useMemo(
    () => filtered.find((a) => a.attempt_id === leftId) ?? null,
    [filtered, leftId],
  )
  const right = useMemo(
    () => filtered.find((a) => a.attempt_id === rightId) ?? null,
    [filtered, rightId],
  )

  const attemptOptions = filtered.map((a) => ({ value: a.attempt_id, label: attemptLabel(a) }))

  const sameSimulation = !!left && !!right && left.simulation_id === right.simulation_id

  /* Le domande capitate in tutte e due le prove, appaiate per id. Appaiarle
   * sulla posizione le farebbe sembrare la stessa domanda solo perché sono
   * arrivate per terze, e con l'estrazione a caso non lo sono quasi mai. Una
   * domanda riscritta dopo il primo tentativo cambia id ed esce dal confronto
   * per la stessa ragione: sono due domande diverse.
   *
   * L'ordine è quello del primo dei due tentativi, che è l'unico ordine che
   * esiste: le posizioni dell'altro sono quelle di un'altra fila. */
  const questionRows = useMemo<QuestionRow[]>(() => {
    if (!left || !right || !sameSimulation) return []
    const rightById = new Map(right.answers.map((a) => [a.question_id, a]))
    return left.answers.flatMap((answer) => {
      const twin = rightById.get(answer.question_id)
      if (!twin) return []
      return [
        {
          key: answer.question_id,
          text: answer.text,
          left: answer.is_correct,
          right: twin.is_correct,
        },
      ]
    })
  }, [left, right, sameSimulation])

  const recovered = questionRows.filter((r) => !r.left && r.right).length
  const lost = questionRows.filter((r) => r.left && !r.right).length

  /* Due test diversi si possono confrontare, ma il voto dice quanto si sa di
   * quel documento, non quanto si sa in generale; e due tipi diversi sono
   * due correzioni diverse prima ancora che due documenti. */
  const warnings =
    left && right
      ? [
          left.simulation_id !== right.simulation_id
            ? `Il confronto riguarda due test diversi, ${left.simulation_title} e ${right.simulation_title}: i punteggi misurano la preparazione su due documenti distinti, non l'andamento nel tempo.`
            : '',
          left.simulation_kind !== right.simulation_kind
            ? `Il confronto riguarda due tipi di test diversi, ${kindLabel(left.simulation_kind)} e ${kindLabel(right.simulation_kind)}: i due voti nascono da due correzioni diverse e non sono direttamente comparabili.`
            : '',
        ].filter(Boolean)
      : []

  if (attempts.length === 0) {
    return <ComparisonEmpty>Nessun test tecnico da confrontare</ComparisonEmpty>
  }

  if (attempts.length === 1) {
    return (
      <ComparisonEmpty>
        È stato consegnato un solo test: ne serve un secondo per effettuare un confronto
      </ComparisonEmpty>
    )
  }

  return (
    <>
      {/* `relative z-20` per la stessa ragione dell'altra metà: il blur apre
          un contesto di impilamento e le tendine dei Select ci restano dentro. */}
      <div className={`${cardCls} relative z-20 mb-8`}>
        <ComparisonFilterBar
          kindLabel="Tipo di test"
          kindValue={kindFilter}
          kindOptions={KIND_FILTERS}
          onKindChange={setKindFilter}
          targetId="simulation-target"
          targetLabel="Test"
          targetValue={simulationFilter}
          targetOptions={simulationOptions}
          onTargetChange={setPickedSimulationId}
        />

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

        <ComparisonWarnings messages={warnings} />
      </div>

      {/* Come nell'altra metà: i filtri restano sopra anche quando non
          lasciano passare niente, così si allargano sul posto. */}
      {filtered.length < 2 && (
        <ComparisonEmpty>
          {filtered.length === 0
            ? 'Nessun test corrisponde ai filtri scelti'
            : 'I filtri scelti lasciano un solo test: ne serve un secondo per effettuare un confronto'}
        </ComparisonEmpty>
      )}

      {left && right && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-6 max-md:grid-cols-1">
            <AttemptPanel attempt={left} baseline={null} />
            <AttemptPanel attempt={right} baseline={left} />
          </div>

          {sameSimulation && questionRows.length === 0 && (
            <div className={cardCls}>
              <h2 className="text-sm font-semibold text-slate-300">Domanda per domanda</h2>
              <p className="text-xs text-slate-500">
                Le due prove non hanno domande in comune: le domande sono estratte a caso a ogni
                tentativo, e in questo caso non si sono sovrapposte
              </p>
            </div>
          )}

          {sameSimulation && questionRows.length > 0 && (
            <div className={cardCls}>
              <h2 className="text-sm font-semibold text-slate-300">Domanda per domanda</h2>
              {/* Quante sono capitate in tutte e due va detto prima dei segni:
                  senza, tre righe sotto due test da dieci domande sembrano
                  sette domande sparite. */}
              <p className="text-xs text-slate-500">
                {questionRows.length}{' '}
                {questionRows.length === 1
                  ? 'domanda presente in entrambe le prove'
                  : 'domande presenti in entrambe le prove'}
              </p>
              <p className="mb-4 text-xs text-slate-500">
                {recovered === 0 && lost === 0
                  ? 'Le risposte corrette ed errate coincidono nelle due prove'
                  : [
                      recovered > 0
                        ? `${recovered} ${recovered === 1 ? 'domanda recuperata' : 'domande recuperate'}`
                        : '',
                      lost > 0 ? `${lost} ${lost === 1 ? 'domanda persa' : 'domande perse'}` : '',
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
