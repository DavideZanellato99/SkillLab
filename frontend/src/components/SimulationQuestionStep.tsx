import { useEffect, useRef, useState } from 'react'
import type { SimulationQuestion } from '../services/simulations'
import PrimaryButton from './PrimaryButton'
import {
  GRACE_SECONDS,
  QUESTION_SECONDS,
  formatClock,
  formatScore,
  optionLabel,
  pointsAfter,
  spelledClock,
} from './simulationFormat'

/* Una domanda alla volta, con i suoi cinque minuti e mezzo.
 *
 * Il componente non sa niente del test: riceve una domanda, raccoglie una
 * risposta e la consegna una volta sola, o perché è stato premuto il pulsante
 * o perché il tempo è finito. Chi lo usa gli dà `key={question.id}`, così
 * ogni domanda lo rimonta da capo e il cronometro riparte pulito: azzerarlo a
 * mano dentro un effetto significherebbe tenere allineati due stati che il
 * rimontaggio allinea da solo.
 *
 * Il tempo residuo si calcola da una scadenza assoluta e non scalando un
 * contatore a ogni battito: una scheda in secondo piano riceve meno battiti
 * del previsto, e un contatore scalato regalerebbe secondi a chi cambia
 * finestra.
 *
 * Nessun riscontro sulla risposta: giusto o sbagliato si sanno alla fine,
 * tutti insieme, perché sapere di aver sbagliato la seconda mentre si legge
 * la terza cambia come si risponde alle otto che restano. Quanto varrebbe si
 * vede invece subito: resta fermo a un punto per tutta la grazia e poi scende
 * di un decimo ogni dieci secondi, ed è la regola del punteggio, che decide
 * un voto e quindi va guardata mentre agisce, non scoperta nel riepilogo.
 *
 * La barra porta il segno di dove finisce la grazia: senza, i primi quattro
 * minuti e l'ultimo minuto e mezzo si assomigliano, e sono la parte in cui
 * non si perde niente e quella in cui si perde a ogni respiro. */

/* Ogni quanto si ridisegna il tempo che resta. Quattro volte al secondo: la
 * barra scende senza scatti e il numero non salta mai un secondo. */
const TICK_MS = 250

/* Sotto questa soglia il tempo si colora, prima di ambra e poi di rosso.
 * L'ambra si accende esattamente dove finisce la grazia, perché è lì che il
 * tempo comincia a costare: prima non costa niente, e colorarlo metterebbe
 * fretta senza motivo. Il rosso è l'ultimo tratto, dove ogni dieci secondi
 * valgono un decimo di quello che resta da prendere. */
const WARN_MS = (QUESTION_SECONDS - GRACE_SECONDS) * 1000
const URGENT_MS = 20_000

function timeTone(remaining: number): { text: string; bar: string } {
  if (remaining <= URGENT_MS) return { text: 'text-red-300', bar: 'bg-red-500' }
  if (remaining <= WARN_MS) return { text: 'text-amber-400', bar: 'bg-amber-500' }
  return { text: 'text-slate-300', bar: 'bg-gradient-to-r from-violet-600 to-cyan-500' }
}

interface SimulationQuestionStepProps {
  question: SimulationQuestion
  /** La posizione nel test, da 1, come si legge a schermo. */
  number: number
  total: number
  isLast: boolean
  /**
   * La domanda è finita: l'opzione scelta (null se il tempo è scaduto senza
   * una scelta) e quanto ci è voluto, che è quello che ne decide i punti.
   */
  onAnswer: (selected: number | null, elapsedMs: number) => void
}

export default function SimulationQuestionStep({
  question,
  number,
  total,
  isLast,
  onAnswer,
}: SimulationQuestionStepProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(QUESTION_SECONDS * 1000)

  /* Da qui si misurano sia il tempo che resta sia quello impiegato, che è la
   * stessa cosa vista dai due capi: un solo istante di partenza, così i
   * secondi che si vedono scendere e quelli che valgono punti non possono
   * raccontare due storie diverse. */
  const startedAt = useRef(Date.now())
  const deadline = useRef(startedAt.current + QUESTION_SECONDS * 1000)
  /* La risposta letta allo scadere del tempo: dentro l'intervallo lo stato
   * sarebbe quello del render in cui l'effetto è partito. */
  const selectedRef = useRef<number | null>(null)
  /* Il tempo può finire nello stesso istante in cui si preme il pulsante:
   * consegnare due volte la stessa domanda farebbe saltare un avanzamento. */
  const answered = useRef(false)
  /* Il cronometro parte una volta sola e si porta dietro la `onAnswer` di
   * quel momento: tenuta in un ref, allo scadere chiama sempre l'ultima. */
  const notify = useRef(onAnswer)
  useEffect(() => {
    notify.current = onAnswer
  })

  const answer = (choice: number | null) => {
    if (answered.current) return
    answered.current = true
    notify.current(choice, Date.now() - startedAt.current)
  }

  /* Un solo cronometro per tutta la vita del componente, che è la vita di una
   * domanda: le dipendenze sono vuote apposta, quello che serve dentro
   * l'intervallo sta nei ref proprio per non doverlo far ripartire. */
  useEffect(() => {
    const id = setInterval(() => {
      const left = deadline.current - Date.now()
      setRemaining(left > 0 ? left : 0)
      if (left <= 0) {
        clearInterval(id)
        answer(selectedRef.current)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  const pick = (index: number) => {
    if (answered.current) return
    selectedRef.current = index
    setSelected(index)
  }

  const tone = timeTone(remaining)
  const worth = pointsAfter(QUESTION_SECONDS * 1000 - remaining)

  return (
    <div className="rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-xs font-medium tracking-wide text-slate-400">
          Domanda {number} di {total}
        </span>
        <span className="flex items-baseline gap-2">
          {/* Quanto vale rispondere adesso: scende con il tempo, ed è il
              motivo per cui il tempo si guarda. Vale se la risposta è
              giusta, quindi si legge come un massimo e non come un acquisito. */}
          <span className="text-xs text-slate-500">
            vale <span className="font-semibold text-slate-400">{formatScore(worth)}</span>
          </span>
          <span
            role="timer"
            className={`font-heading text-lg font-bold tabular-nums ${tone.text}`}
            aria-label={`Tempo rimasto: ${spelledClock(remaining / 1000)}`}
          >
            {formatClock(remaining)}
          </span>
        </span>
      </div>

      {/* Il tempo che resta, disegnato: il numero dice quanto, la barra dice
          quanto in fretta sta finendo, e la seconda si legge senza guardarla.
          Il segno è dove finisce la grazia: quando la barra si ritira sotto
          di lui, il punteggio comincia a scendere. */}
      <div className="relative mb-5 h-1 overflow-hidden rounded-full bg-white/8">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${tone.bar}`}
          style={{ width: `${(remaining / (QUESTION_SECONDS * 1000)) * 100}%` }}
        />
        <span
          className="absolute inset-y-0 w-px bg-white/25"
          style={{ left: `${(WARN_MS / (QUESTION_SECONDS * 1000)) * 100}%` }}
          aria-hidden
        />
      </div>

      <fieldset>
        <legend className="mb-4 text-[1.05rem] font-medium leading-relaxed text-slate-100">
          {question.text}
        </legend>
        <div className="flex flex-col gap-1.5">
          {question.options.map((option, index) => {
            const chosen = selected === index
            return (
              /* Il pallino vero è nascosto e l'alternativa si accende da sola
                 quando è scelta, ma il fuoco della tastiera non è la scelta:
                 chi entra nel gruppo con il tabulatore, prima di aver scelto
                 niente, non vedrebbe dove si trova. L'anello lo dice, e sta
                 sull'etichetta perché è lei la cosa che si vede. */
              <label
                key={index}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-[0.9rem] transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet-500/40 ${
                  chosen
                    ? 'border-violet-600 bg-violet-600/12 text-slate-100'
                    : 'border-white/6 bg-white/2 text-slate-400 hover:border-white/12 hover:bg-white/5'
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  checked={chosen}
                  onChange={() => pick(index)}
                  className="sr-only"
                />
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-bold ${
                    chosen
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : 'border-white/15 text-slate-500'
                  }`}
                  aria-hidden
                >
                  {optionLabel(index)}
                </span>
                <span className="flex-1 leading-relaxed">{option}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/6 pt-5">
        <span className="text-xs text-slate-500">
          {selected === null
            ? 'Allo scadere del tempo la domanda resta in bianco ed equivale a una risposta errata'
            : 'La selezione è modificabile fino alla conferma, e allo scadere del tempo viene registrata al punteggio minimo'}
        </span>
        <PrimaryButton onClick={() => answer(selected)}>
          {isLast ? 'Consegna il Test' : selected === null ? 'Salta la Domanda' : 'Avanti'}
        </PrimaryButton>
      </div>
    </div>
  )
}
