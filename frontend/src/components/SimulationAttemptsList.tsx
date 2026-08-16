import { useState } from 'react'
import { useMyAttempts } from '../hooks/useSimulations'
import Badge from './Badge'
import SimulationAttemptModal from './SimulationAttemptModal'
import { formatDateTime, formatScore, scoreBadgeTone } from './simulationFormat'

/* I propri tentativi su un test, sotto le regole, uno per riga.
 *
 * Erano una fila di pillole con dentro voto e data, e con più di due o tre
 * diventavano una striscia da leggere di traverso: le date si accavallavano,
 * i voti finivano a distanze diverse e confrontare due prove voleva dire
 * cercarle. In righe le stesse tre cose stanno sempre nella stessa colonna,
 * quindi scendere con l'occhio lungo i voti dice da solo se si sta migliorando.
 *
 * Le corrette compaiono qui e non nella pillola, dove non ci stavano: un 6 con
 * otto risposte giuste e un 6 con sei sono due prove diverse, ed è la
 * differenza fra l'aver risposto piano e il non aver saputo.
 *
 * Le stesse righe della dashboard e del report attività, senza il cestino:
 * quello che qui si può fare a un proprio tentativo è rileggerlo.
 *
 * In un file suo perché la schermata delle regole parla di come funziona il
 * test, e questo è com'è andata finora. */

/** Quanti tentativi si vedono prima di doverli chiedere tutti. */
const ATTEMPTS_PREVIEW = 5

const rowCls =
  'flex w-full cursor-pointer items-center gap-x-6 gap-y-1 rounded-xl border border-white/6 bg-white/3 px-4 py-2.5 text-left transition hover:border-violet-600/30 hover:bg-violet-600/8 max-sm:flex-wrap'

export default function SimulationAttemptsList({ simulationId }: { simulationId: string }) {
  const { data: attempts = [] } = useMyAttempts(simulationId)
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  if (attempts.length === 0) return null

  const shown = showAll ? attempts : attempts.slice(0, ATTEMPTS_PREVIEW)

  return (
    <>
      <div className="mt-6 rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md">
        <h2 className="mb-4 font-heading text-base font-semibold text-slate-100">
          Tentativi Passati
        </h2>

        <ul className="flex list-none flex-col gap-2">
          {shown.map((attempt) => (
            <li key={attempt.id}>
              {/* Che la riga si apra lo dice l'evidenziazione al passaggio del
                  mouse, come le schede dell'elenco. A chi legge con la voce
                  quel colore non arriva, e l'etichetta dice cosa succede. */}
              <button
                type="button"
                className={rowCls}
                aria-label={`Rivedi il tentativo del ${formatDateTime(attempt.created_at)}`}
                onClick={() => setOpenAttemptId(attempt.id)}
              >
                <span className="flex-1 text-[0.85rem] text-slate-300">
                  {formatDateTime(attempt.created_at)}
                </span>
                <span className="min-w-[110px] text-right text-xs tabular-nums text-slate-400">
                  {attempt.correct_count}/{attempt.question_count} corrette
                </span>
                <Badge tone={scoreBadgeTone(attempt.score)} className="min-w-[42px] text-center">
                  {formatScore(attempt.score)}
                </Badge>
              </button>
            </li>
          ))}
        </ul>

        {!showAll && attempts.length > ATTEMPTS_PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-3 cursor-pointer text-xs font-medium text-violet-400 transition hover:text-violet-300"
          >
            Mostra tutti ({attempts.length})
          </button>
        )}
      </div>

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
