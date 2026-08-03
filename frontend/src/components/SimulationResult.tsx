import type { SimulationAttempt, SimulationAnswerResult } from '../services/simulations'
import Badge from './Badge'
import { formatScore, optionLabel, scoreBadgeTone } from './simulationFormat'

/* L'esito di un test consegnato: il voto in cima e poi, domanda per domanda,
 * cosa era stato risposto e cosa dice il documento.
 *
 * Le spiegazioni ci sono anche sulle domande andate bene. Chi ha indovinato
 * senza esserne sicuro è esattamente la persona che deve leggerle, e non c'è
 * modo di distinguerla da chi sapeva. */

function AnswerRow({ answer }: { answer: SimulationAnswerResult }) {
  const blank = answer.selected_option === null
  return (
    <li className="rounded-2xl border border-white/6 bg-gray-900/60 p-5 backdrop-blur-md">
      <div className="mb-3 flex items-start gap-3">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            answer.is_correct ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-300'
          }`}
          aria-hidden
        >
          {answer.is_correct ? '✓' : '✕'}
        </span>
        <p className="flex-1 text-[0.95rem] font-medium leading-relaxed text-slate-100">
          <span className="mr-1 text-slate-500">{answer.position}.</span>
          {answer.text}
        </p>
      </div>

      <ul className="mb-3 flex list-none flex-col gap-1.5">
        {answer.options.map((option, index) => {
          const isCorrect = index === answer.correct_option
          const isChosen = index === answer.selected_option
          return (
            <li
              key={index}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[0.85rem] ${
                isCorrect
                  ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-200'
                  : isChosen
                    ? 'border-red-500/30 bg-red-500/8 text-red-200'
                    : 'border-white/6 bg-white/2 text-slate-400'
              }`}
            >
              <span className="font-semibold">{optionLabel(index)}</span>
              <span className="flex-1">{option}</span>
              {isChosen && !isCorrect && (
                <span className="shrink-0 text-xs opacity-70">la tua risposta</span>
              )}
              {isCorrect && <span className="shrink-0 text-xs opacity-70">corretta</span>}
            </li>
          )
        })}
      </ul>

      {blank && (
        <p className="mb-3 text-xs italic text-slate-500">Hai lasciato questa domanda in bianco.</p>
      )}

      {answer.explanation && (
        <div className="rounded-xl border border-white/6 bg-white/3 px-4 py-3">
          <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400">Perché</p>
          <p className="text-[0.85rem] leading-relaxed text-slate-300">{answer.explanation}</p>
        </div>
      )}

      {answer.sources.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-xs font-medium text-violet-400 transition hover:text-violet-300">
            Cosa dice il documento
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {answer.sources.map((source, index) => (
              <blockquote
                key={index}
                className="whitespace-pre-line border-l-2 border-violet-600/40 bg-white/2 px-4 py-2 text-xs leading-relaxed text-slate-400"
              >
                {source}
              </blockquote>
            ))}
          </div>
        </details>
      )}
    </li>
  )
}

interface SimulationResultProps {
  attempt: SimulationAttempt
  /** Azioni sotto il riepilogo, es. "Riprova" e "Torna all'elenco". */
  actions?: React.ReactNode
}

export default function SimulationResult({ attempt, actions }: SimulationResultProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-slate-400">Risultato</p>
          <p className="font-heading text-2xl font-bold text-slate-100">
            {attempt.correct_count} risposte corrette su {attempt.question_count}
          </p>
        </div>
        <Badge tone={scoreBadgeTone(attempt.score)} className="!px-4 !py-1.5 !text-base">
          {formatScore(attempt.score)}
        </Badge>
      </div>

      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}

      <ul className="flex list-none flex-col gap-3">
        {attempt.answers.map((answer) => (
          <AnswerRow key={answer.question_id} answer={answer} />
        ))}
      </ul>
    </div>
  )
}
