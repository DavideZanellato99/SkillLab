import { useState } from 'react'
import { useMyAttempts } from '../hooks/useSimulations'
import type { SimulationDetail } from '../services/simulations'
import Badge from './Badge'
import PrimaryButton from './PrimaryButton'
import SimulationAttemptModal from './SimulationAttemptModal'
import Tooltip from './Tooltip'
import {
  QUESTION_SECONDS,
  STEP_SECONDS,
  formatDateTime,
  formatScore,
  scoreBadgeTone,
} from './simulationFormat'

/* Quello che si legge prima di cominciare: le regole del test e i propri
 * tentativi passati.
 *
 * Esiste per il cronometro. Con le domande tutte in pagina si poteva entrare,
 * guardare e decidere dopo; ora il tempo della prima domanda parte da solo, e
 * farlo partire su una pagina appena aperta sarebbe rubare secondi a chi sta
 * ancora leggendo il titolo. Qui il test comincia quando lo si dice.
 *
 * Le regole sono scritte prima e non scoperte durante: che non si torni
 * indietro e che il tempo scaduto valga come sbagliata cambia il modo di
 * rispondere, quindi si sanno alla prima domanda e non alla terza. */

/** Quanti tentativi stanno nella barra prima di doverli chiedere tutti. */
const ATTEMPTS_PREVIEW = 5

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[0.9rem] leading-relaxed text-slate-300">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden />
      <span>{children}</span>
    </li>
  )
}

export default function SimulationIntro({
  simulation,
  onStart,
}: {
  simulation: SimulationDetail
  onStart: () => void
}) {
  const { data: attempts = [] } = useMyAttempts(simulation.id)
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const total = simulation.questions.length
  const shown = showAll ? attempts : attempts.slice(0, ATTEMPTS_PREVIEW)

  return (
    <>
      <div className="rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md">
        <h2 className="mb-4 font-heading text-base font-semibold text-slate-100">Come funziona</h2>
        <ul className="flex list-none flex-col gap-2.5">
          <Rule>
            {total} domande a risposta multipla, una alla volta: la successiva compare quando hai
            risposto alla precedente.
          </Rule>
          <Rule>
            Hai {QUESTION_SECONDS} secondi per ogni domanda. Allo scadere si passa avanti con la
            risposta che hai selezionato, o in bianco se non ne hai scelta nessuna.
          </Rule>
          <Rule>
            <span className="text-slate-100">Conta anche quanto ci metti.</span> Una risposta giusta
            vale un punto se arriva subito, e un decimo in meno ogni {STEP_SECONDS} secondi che
            passano, fino a un minimo di 0,1. Una risposta sbagliata vale zero comunque.
          </Rule>
          <Rule>
            Non si torna indietro su una domanda già consegnata, e in bianco vale come sbagliata.
          </Rule>
          <Rule>
            Come è andata lo scopri alla fine: il riepilogo mostra le risposte corrette, le tue e
            cosa dice il documento, domanda per domanda.
          </Rule>
        </ul>

        <div className="mt-6 border-t border-white/6 pt-5">
          <PrimaryButton onClick={onStart}>
            {attempts.length > 0 ? 'Riprova il test' : 'Inizia il test'}
          </PrimaryButton>
        </div>
      </div>

      {attempts.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-white/6 bg-gray-900/60 px-5 py-3 backdrop-blur-md">
          <span className="mr-1 text-xs font-medium tracking-wide text-slate-400">
            Tentativi passati
          </span>
          {shown.map((attempt) => (
            <Tooltip key={attempt.id} content="Rivedi questo test">
              <button
                type="button"
                onClick={() => setOpenAttemptId(attempt.id)}
                className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/6 bg-white/2 px-2.5 py-1.5 text-xs text-slate-500 transition hover:border-violet-600/50 hover:bg-violet-600/8 hover:text-slate-300"
              >
                <Badge tone={scoreBadgeTone(attempt.score)}>{formatScore(attempt.score)}</Badge>
                {formatDateTime(attempt.created_at)}
              </button>
            </Tooltip>
          ))}
          {!showAll && attempts.length > ATTEMPTS_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="cursor-pointer rounded-xl px-2 py-1.5 text-xs font-medium text-violet-400 transition hover:text-violet-300"
            >
              Mostra tutti ({attempts.length})
            </button>
          )}
        </div>
      )}

      {openAttemptId && (
        <SimulationAttemptModal
          attemptId={openAttemptId}
          own
          onClose={() => setOpenAttemptId(null)}
        />
      )}
    </>
  )
}
