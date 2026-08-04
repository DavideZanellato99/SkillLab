import { useAttempt } from '../hooks/useSimulations'
import ModalShell from './ModalShell'
import LoadingState from './LoadingState'
import FormError from './FormError'
import SimulationResult from './SimulationResult'
import { formatDateTime } from './simulationFormat'

/* Un test consegnato, riletto per intero: le domande come sono state viste,
 * cosa è stato risposto, cosa era giusto e il passaggio del documento che lo
 * dice.
 *
 * Lo apre chi corregge, dalla dashboard, e chi ha svolto il test, dalla
 * pagina della simulazione: è `own` a dire quale dei due, e cambia due cose,
 * la persona in cui l'esito è scritto e l'intestazione, perché a chi rilegge
 * il proprio tentativo il nome e l'indirizzo sono i suoi. Il resto è identico
 * apposta: un docente che corregge deve leggere esattamente la pagina che
 * leggerà chi ha sbagliato, altrimenti sta commentando una cosa che non ha
 * visto.
 *
 * Il tentativo si ricarica dal server invece di arrivare dalla riga già in
 * pagina: nel report e nell'elenco dei propri tentativi ci sono il voto e i
 * conteggi, le risposte no, e sono quelle il motivo per cui si apre. */

export default function SimulationAttemptModal({
  attemptId,
  onClose,
  own = false,
}: {
  attemptId: string
  onClose: () => void
  /** Vero quando a rileggere il test è chi lo ha svolto. */
  own?: boolean
}) {
  const { data: attempt, isLoading, error } = useAttempt(attemptId)

  return (
    <ModalShell onClose={onClose} size="full" padding="none" layout="column">
      {isLoading ? (
        <LoadingState message="Caricamento del test..." variant="modal" />
      ) : error || !attempt ? (
        <div className="p-8">
          <FormError
            message={
              error instanceof Error ? error.message : 'Impossibile caricare questo tentativo.'
            }
          />
        </div>
      ) : (
        <>
          <header className="border-b border-white/6 px-8 py-5 pr-16">
            <h2 className="font-heading text-xl font-bold text-slate-100">
              {attempt.simulation_title}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              {!own && (
                <>
                  <span>{attempt.user_name}</span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{attempt.user_email}</span>
                  <span aria-hidden>·</span>
                </>
              )}
              <span>{formatDateTime(attempt.created_at)}</span>
            </p>
          </header>

          <div className="flex-1 overflow-y-auto px-8 py-5">
            <SimulationResult attempt={attempt} own={own} />
          </div>
        </>
      )}
    </ModalShell>
  )
}
