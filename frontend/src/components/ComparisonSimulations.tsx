import { useMemo, useState } from 'react'
import type { SimulationComparisonAttempt } from '../services/comparison'
import ComparisonEmpty from './ComparisonEmpty'
import ComparisonFilterBar, { ComparisonWarnings } from './ComparisonFilterBar'
import ComparisonOpenButton from './ComparisonOpenButton'
import ComparisonTimeline from './ComparisonTimeline'
import ComparisonVerdict from './ComparisonVerdict'
import SimulationAttemptModal from './SimulationAttemptModal'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import { KIND_FILTERS, kindLabel } from './simulationFormat'
import type { KindFilter } from './simulationFormat'
import {
  ANY,
  assignRole,
  filterOptions,
  matchesFilter,
  NO_PAIR,
  resolvePair,
  survivingFilter,
} from './comparisonFilters'
import type { Pair } from './comparisonFilters'
import { cardCls, formatScore, scoreTextColor } from './scoreFormat'
import { formatDate } from './lastAccess'

/* La metà scritta del confronto: due test consegnati, uno accanto all'altro.
 *
 * Si sceglie fra le prove che i due filtri lasciano passare, il tipo e il
 * test: i quattro tipi si correggono con quattro scale diverse, quindi un
 * dieci preso a crocette e un dieci preso a risposte scritte non sono lo
 * stesso dieci.
 *
 * Cambia cosa c'è sotto il verdetto. Là i sei criteri di una valutazione, qui
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

/** Una delle due prove: quale test era, di che tipo e quante ne ha prese.
 *
 *  Il voto grande sta nel verdetto, come nella metà parlata: qui resta in
 *  piccolo accanto al nome del test, insieme alle cose che il verdetto non
 *  riassume. */
function AttemptPanel({
  role,
  attempt,
  onOpen,
}: {
  role: string
  attempt: SimulationComparisonAttempt
  onOpen: () => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/6 bg-gray-900/60 p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/6 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400">
          {role}
        </span>
        <span className="text-[0.85rem] text-slate-200">{attempt.simulation_title}</span>
        <SimulationKindBadge kind={attempt.simulation_kind} />
        <SimulationSourceBadge source={attempt.simulation_source} />
        <span className={`text-[0.85rem] font-bold ${scoreTextColor(attempt.score)}`}>
          {formatScore(attempt.score)}
        </span>
      </div>
      <p className="text-[0.72rem] text-slate-500">{formatDate(attempt.attempted_at)}</p>
      {/* Il voto in decimi nasconde quante domande erano: dieci su dieci e
          due su due sono lo stesso numero e non la stessa prova. */}
      <p className="mt-2 text-[0.72rem] text-slate-500">
        {attempt.correct_count} risposte corrette su {attempt.question_count}
      </p>

      {/* Il dettaglio domanda per domanda qui sopra dice solo se una domanda
          è andata bene o male, e solo per quelle capitate in tutte e due le
          prove: cosa fosse stato risposto, e cosa diceva il documento, stanno
          nel tentativo per intero. */}
      <ComparisonOpenButton
        label="Apri il tentativo"
        ariaLabel={`Apri il tentativo su ${attempt.simulation_title} del ${formatDate(attempt.attempted_at)}`}
        onClick={onOpen}
      />
    </div>
  )
}

export default function ComparisonSimulations({
  attempts,
  isOwn,
}: {
  attempts: SimulationComparisonAttempt[]
  /** Vero quando le prove sono di chi sta guardando: un tentativo aperto da
   *  chi l'ha svolto non porta il nome di nessun altro, e non si butta via. */
  isOwn: boolean
}) {
  /* Come per le conversazioni: prima si restringe, poi si sceglie, e i due
   * filtri partono aperti. */
  const [kindFilter, setKindFilter] = useState<KindFilter>(ANY)
  const [pickedSimulationId, setPickedSimulationId] = useState(ANY)
  const [picked, setPicked] = useState<Pair>(NO_PAIR)
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null)

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

  const idOf = (a: SimulationComparisonAttempt) => a.attempt_id
  const { leftId, rightId } = resolvePair(filtered, idOf, picked)

  const left = useMemo(() => filtered.find((a) => idOf(a) === leftId) ?? null, [filtered, leftId])
  const right = useMemo(
    () => filtered.find((a) => idOf(a) === rightId) ?? null,
    [filtered, rightId],
  )

  const entries = filtered.map((a) => ({
    id: a.attempt_id,
    when: a.attempted_at,
    title: a.simulation_title,
    score: a.score,
    badge: <SimulationKindBadge kind={a.simulation_kind} iconOnly />,
  }))

  const sameSimulation = !!left && !!right && left.simulation_id === right.simulation_id

  /* Le domande capitate in tutte e due le prove, appaiate per id. Appaiarle
   * sulla posizione le farebbe sembrare la stessa domanda solo perché sono
   * arrivate per terze, e con l'estrazione a caso non lo sono quasi mai. Una
   * domanda riscritta dopo il primo tentativo cambia id ed esce dal confronto
   * per la stessa ragione: sono due domande diverse.
   *
   * In cima quelle il cui esito è cambiato, che sono la ragione per cui un
   * test si rifà: nell'ordine del primo tentativo, che è comunque l'ordine di
   * una fila che l'altro non ha avuto, le tre righe che dicono qualcosa
   * finivano sparse fra sette che ripetono un esito già noto. Dentro i due
   * gruppi l'ordine resta quello del primo tentativo. */
  const questionRows = useMemo<QuestionRow[]>(() => {
    if (!left || !right || !sameSimulation) return []
    const rightById = new Map(right.answers.map((a) => [a.question_id, a]))
    const rows = left.answers.flatMap((answer) => {
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
    const changed = (row: QuestionRow) => row.left !== row.right
    return [...rows.filter(changed), ...rows.filter((row) => !changed(row))]
  }, [left, right, sameSimulation])

  const recovered = questionRows.filter((r) => !r.left && r.right).length
  const lost = questionRows.filter((r) => r.left && !r.right).length

  /* Cosa è cambiato fra le domande, in una riga sotto il voto: è il motivo
   * per cui uno stesso test si rifà, e il voto da solo non lo dice. Fra due
   * test diversi non c'è niente da dire qui, e a dirlo c'è già l'avviso. */
  const questionSummary = (() => {
    if (!sameSimulation) return null
    if (questionRows.length === 0) {
      return 'Le due prove non hanno domande in comune: a ogni tentativo le domande sono estratte a caso'
    }
    if (recovered === 0 && lost === 0) {
      return `Le ${questionRows.length} domande in comune hanno avuto lo stesso esito nelle due prove`
    }
    const changes = [
      recovered > 0
        ? `${recovered} ${recovered === 1 ? 'domanda recuperata' : 'domande recuperate'}`
        : '',
      lost > 0 ? `${lost} ${lost === 1 ? 'domanda persa' : 'domande perse'}` : '',
    ].filter(Boolean)
    return `${changes.join(', ')}, su ${questionRows.length} in comune`
  })()

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
          un contesto di impilamento e la tendina del Select ci resta dentro. */}
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

        <ComparisonTimeline
          label="Test consegnati"
          entries={entries}
          leftId={leftId}
          rightId={rightId}
          onAssign={(role, id) => setPicked(assignRole({ leftId, rightId }, role, id))}
        />

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
          <ComparisonVerdict
            before={{
              score: left.score,
              caption: `${formatDate(left.attempted_at)} · ${left.correct_count} su ${left.question_count}`,
            }}
            after={{
              score: right.score,
              caption: `${formatDate(right.attempted_at)} · ${right.correct_count} su ${right.question_count}`,
            }}
          >
            {questionSummary}
          </ComparisonVerdict>

          {sameSimulation && questionRows.length > 0 && (
            <div className={`${cardCls} mb-6`}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-300">Domanda per domanda</h2>
                {/* I due segni di ogni riga vanno intestati una volta sola:
                    senza, si legge una coppia di crocette senza sapere quale
                    prova è quale. */}
                <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">
                  Prima → Dopo
                </span>
              </div>
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

          {/* Il contesto in fondo, come nell'altra metà: di quali due prove si
              stava parlando, per chi ha già letto di quanto e su cosa. */}
          <h2 className="mb-3 text-sm font-semibold text-slate-300">I due test</h2>
          <div className="grid grid-cols-2 items-start gap-6 max-md:grid-cols-1">
            <AttemptPanel
              role="Prima"
              attempt={left}
              onOpen={() => setOpenAttemptId(left.attempt_id)}
            />
            <AttemptPanel
              role="Dopo"
              attempt={right}
              onOpen={() => setOpenAttemptId(right.attempt_id)}
            />
          </div>
        </>
      )}

      {/* Come nella metà parlata, il tentativo si apre nella schermata che lo
          sa già mostrare: le domande come sono state viste, cosa è stato
          risposto e il passaggio del documento che dice qual era la risposta
          giusta. Niente `onDeleted`, perché il confronto non è una schermata
          di amministrazione dei tentativi. */}
      {openAttemptId && (
        <SimulationAttemptModal
          attemptId={openAttemptId}
          own={isOwn}
          onClose={() => setOpenAttemptId(null)}
        />
      )}
    </>
  )
}
