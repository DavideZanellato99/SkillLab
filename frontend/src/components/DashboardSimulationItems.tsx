import { useSimulationItems } from '../hooks/useDashboards'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import ModalShell from './ModalShell'
import Notice from './Notice'
import { RateRow } from './scoreCharts'
import SimulationKindBadge from './SimulationKindBadge'
import type { SimulationKind } from '../services/simulations'

/* Le domande di un test, una per una, dalla più sbagliata.
 *
 * È il pezzo per cui esiste la vista dei contenuti: un test con la media a
 * cinque non dice se è difficile o se ha una domanda scritta male, e in una
 * media di dieci domande la seconda cosa non si vede. Qui si vede, e chi ha
 * scritto il test corregge quella domanda invece di rifare il test.
 *
 * Le risposte lasciate in bianco stanno accanto alla quota di esatte perché
 * dicono un'altra cosa: una domanda sbagliata da tutti è formulata male, una
 * lasciata in bianco da tutti non è stata capita, o è arrivata quando il
 * tempo era finito.
 *
 * Si carica aprendo la riga e non insieme all'elenco: le risposte stanno
 * nella fotografia di ogni tentativo, che è la colonna più pesante della
 * tabella. */

export default function DashboardSimulationItems({
  simulationId,
  simulationTitle,
  simulationKind,
  organizationId,
  days,
  onClose,
}: {
  simulationId: string
  simulationTitle: string
  simulationKind: SimulationKind
  /** Lo scope della dashboard: le domande si contano sugli stessi tentativi. */
  organizationId: string
  days?: number
  onClose: () => void
}) {
  const { data, isPending, error, refetch } = useSimulationItems(simulationId, organizationId, days)

  return (
    <ModalShell
      onClose={onClose}
      size="lg"
      padding="md"
      closeLabel="Chiudi analisi delle domande"
      label={`Domande di ${simulationTitle}`}
    >
      <header className="mb-6 pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-xl font-bold text-slate-100">{simulationTitle}</h2>
          <SimulationKindBadge kind={simulationKind} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Quante volte ogni domanda è stata data giusta, sui tentativi del periodo e
          dell’organizzazione selezionati. Dalla più sbagliata
        </p>
      </header>

      {isPending ? (
        <LoadingState message="Caricamento delle domande..." variant="modal" />
      ) : error || !data ? (
        <LoadError
          message={error instanceof Error ? error.message : 'Impossibile caricare le domande.'}
          onRetry={() => void refetch()}
        />
      ) : data.items.length === 0 ? (
        <Notice>
          Nessun tentativo consegnato nel periodo selezionato: le domande compariranno quando
          qualcuno svolgerà il test
        </Notice>
      ) : (
        <>
          {data.truncated && (
            <Notice className="mb-4">
              I tentativi su questo test sono troppi per essere letti in una volta: le quote sono
              calcolate sui più recenti
            </Notice>
          )}
          <p className="mb-3 text-xs text-slate-500">
            {data.attempts} {data.attempts === 1 ? 'tentativo' : 'tentativi'} · {data.items.length}{' '}
            {data.items.length === 1 ? 'domanda' : 'domande'}
          </p>
          <div className="flex flex-col gap-1.5">
            {data.items.map((item) => (
              <RateRow
                key={item.question_id}
                label={item.text || 'Domanda senza testo'}
                sub={`${item.correct} esatte su ${item.answers}${
                  item.unanswered > 0 ? ` · ${item.unanswered} in bianco` : ''
                }${item.avg_seconds !== null ? ` · ${Math.round(item.avg_seconds)} s in media` : ''}`}
                rate={item.correct_rate}
              />
            ))}
          </div>
        </>
      )}
    </ModalShell>
  )
}
