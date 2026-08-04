import type { SimulationAttempt, SimulationAnswerResult } from '../services/simulations'
import Badge from './Badge'
import { formatElapsed, formatScore, optionLabel, scoreBadgeTone } from './simulationFormat'

/* L'esito di un test consegnato: il voto in cima e poi, domanda per domanda,
 * cosa era stato risposto, quanto è valso e cosa dice il documento.
 *
 * I punti stanno accanto a ogni domanda insieme al tempo, e non solo nel
 * totale: una risposta giusta che ha preso 0,4 è la sola cosa che spiega un
 * sei con otto risposte esatte, e senza il tempo lì accanto sembrerebbe un
 * errore di correzione.
 *
 * Le spiegazioni ci sono anche sulle domande andate bene. Chi ha indovinato
 * senza esserne sicuro è esattamente la persona che deve leggerle, e non c'è
 * modo di distinguerla da chi sapeva.
 *
 * Lo stesso esito lo rilegge chi l'ha svolto e chi lo corregge, quindi il
 * "tu" non può essere scritto nel componente: con `own` a false le stesse
 * righe parlano di una terza persona. */

function AnswerRow({ answer, own }: { answer: SimulationAnswerResult; own: boolean }) {
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
        {/* I punti presi e, quando c'è, in quanto tempo. Il tempo manca sui
            tentativi consegnati prima che contasse, e lì non si scrive. */}
        <span className="shrink-0 text-right">
          <span
            className={`font-heading text-sm font-bold tabular-nums ${
              answer.points > 0 ? 'text-slate-200' : 'text-slate-600'
            }`}
          >
            {formatScore(answer.points)}
          </span>
          {answer.elapsed_ms !== null && (
            <span className="block text-[0.7rem] text-slate-500">
              in {formatElapsed(answer.elapsed_ms)}
            </span>
          )}
        </span>
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
                <span className="shrink-0 text-xs opacity-70">
                  {own ? 'la tua risposta' : 'risposta data'}
                </span>
              )}
              {isCorrect && <span className="shrink-0 text-xs opacity-70">corretta</span>}
            </li>
          )
        })}
      </ul>

      {blank && (
        <p className="mb-3 text-xs italic text-slate-500">
          {own ? 'Hai lasciato questa domanda in bianco.' : 'Domanda lasciata in bianco.'}
        </p>
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
  /** Falso quando a rileggere il test è un altro, non chi l'ha svolto. */
  own?: boolean
}

export default function SimulationResult({ attempt, actions, own = true }: SimulationResultProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-slate-400">Risultato</p>
          <p className="font-heading text-2xl font-bold text-slate-100">
            {attempt.correct_count} risposte corrette su {attempt.question_count}
          </p>
          {/* Perché il voto non è semplicemente le corrette in decimi: i
              punti sono meno delle risposte esatte ogni volta che una di
              quelle è arrivata con calma. */}
          <p className="mt-1 text-[0.8rem] text-slate-500">
            {formatScore(attempt.earned_points)} punti su {attempt.question_count}, perché una
            risposta vale meno man mano che passa il tempo
          </p>
        </div>
        <Badge tone={scoreBadgeTone(attempt.score)} className="!px-4 !py-1.5 !text-base">
          {formatScore(attempt.score)}
        </Badge>
      </div>

      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}

      <ul className="flex list-none flex-col gap-3">
        {attempt.answers.map((answer) => (
          <AnswerRow key={answer.question_id} answer={answer} own={own} />
        ))}
      </ul>
    </div>
  )
}
