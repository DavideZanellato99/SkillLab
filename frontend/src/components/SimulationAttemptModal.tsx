import { useState } from 'react'
import { useAttempt } from '../hooks/useSimulations'
import { fetchAttemptPdf } from '../services/simulations'
import DeleteAttemptDialog from './DeleteAttemptDialog'
import ModalShell from './ModalShell'
import ModalDeleteButton from './ModalDeleteButton'
import LoadingState from './LoadingState'
import LoadError from './LoadError'
import SimulationResult from './SimulationResult'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import PdfDownloadButton from './PdfDownloadButton'
import { formatDateTime } from './simulationFormat'

/* Un test consegnato, riletto per intero: le domande come sono state viste,
 * cosa è stato risposto, cosa era giusto e il passaggio del documento che lo
 * dice.
 *
 * Lo apre chi corregge, dalla dashboard, e chi ha svolto il test, dalla
 * pagina della simulazione: è `own` a dire quale dei due, e cambia due cose,
 * la persona in cui l'esito è scritto e l'intestazione, perché a chi rilegge
 * il proprio tentativo il nome è il suo. Il resto è identico apposta: un
 * docente che corregge deve leggere esattamente la pagina che leggerà chi ha
 * sbagliato, altrimenti sta commentando una cosa che non ha visto.
 *
 * Il tentativo si ricarica dal server invece di arrivare dalla riga già in
 * pagina: nel report e nell'elenco dei propri tentativi ci sono il voto e i
 * conteggi, le risposte no, e sono quelle il motivo per cui si apre. */

export default function SimulationAttemptModal({
  attemptId,
  onClose,
  onDeleted,
  own = false,
}: {
  attemptId: string
  onClose: () => void
  /* Il tentativo si può anche buttare via, e il cestino compare solo se chi
   * ci ha portato qui passa questa funzione, come nel dettaglio di una
   * conversazione: la dashboard e il report attività sono schermate di
   * amministrazione, quindi chi le apre è un super admin o l'organization
   * admin di chi ha svolto il test, e il server rifiuta comunque un
   * tentativo fuori dalla propria organizzazione. Chi rilegge un test suo
   * non la passa, e non avrebbe l'endpoint per farlo.
   *
   * Serve a chiudere la schermata su un tentativo che non esiste più: gli
   * elenchi sotto si aggiornano da soli, questa no. */
  onDeleted?: () => void
  /** Vero quando a rileggere il test è chi lo ha svolto. */
  own?: boolean
}) {
  const { data: attempt, isLoading, error, refetch, isFetching } = useAttempt(attemptId)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const canDelete = !own && onDeleted !== undefined

  return (
    <ModalShell
      onClose={onClose}
      size="full"
      padding="none"
      layout="column"
      closeLabel="Chiudi dettaglio tentativo"
    >
      {isLoading ? (
        <LoadingState message="Caricamento del test..." variant="modal" />
      ) : error || !attempt ? (
        /* Con il comando per richiederlo, come nel dettaglio di una
           conversazione: un caricamento caduto è l'unica cosa a cui si può
           rimediare restando dov'è, e qui l'alternativa era chiudere la
           schermata e riaprirla. */
        <LoadError
          message={
            error instanceof Error ? error.message : 'Impossibile caricare questo tentativo.'
          }
          onRetry={() => void refetch()}
          isRetrying={isFetching}
          className="p-8"
        />
      ) : (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-white/6 px-8 py-5 pr-16">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-xl font-bold text-slate-100">
                  {attempt.simulation_title}
                </h2>
                {/* Il tipo in testa e non solo dentro le risposte: chi apre un
                  tentativo dalla dashboard deve sapere subito che prova sta
                  leggendo, prima di giudicare un voto. */}
                <SimulationKindBadge kind={attempt.simulation_kind} />
                <SimulationSourceBadge source={attempt.simulation_source} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                {!own && (
                  <>
                    <span className="truncate">{attempt.user_name}</span>
                    <span aria-hidden>·</span>
                  </>
                )}
                <span>{formatDateTime(attempt.created_at)}</span>
              </p>
            </div>
            {/* Le due cose che si fanno a un test già consegnato: portarsi
                via il referto e buttarlo. Nell'intestazione e non in fondo
                alle domande, che sono dieci e scorrono via. */}
            <div className="flex items-start gap-2">
              {canDelete && (
                <ModalDeleteButton
                  label="Elimina Tentativo"
                  onClick={() => setIsConfirmingDelete(true)}
                />
              )}
              <PdfDownloadButton
                fetchPdf={() => fetchAttemptPdf(attempt.id)}
                fileNameParts={
                  own
                    ? ['test', attempt.simulation_title]
                    : ['test', attempt.simulation_title, attempt.user_name]
                }
              />
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-8 py-5">
            <SimulationResult attempt={attempt} own={own} />
          </div>

          {/* La conferma sta sopra la schermata da cui è partita: è l'ultima
              cosa comparsa, e le risposte da cancellare restano lì dietro da
              rileggere finché non si preme. */}
          {isConfirmingDelete && (
            <DeleteAttemptDialog
              attemptId={attempt.id}
              simulationTitle={attempt.simulation_title}
              simulationKind={attempt.simulation_kind}
              attemptedAt={attempt.created_at}
              elevated
              onClose={() => setIsConfirmingDelete(false)}
              onDeleted={() => {
                setIsConfirmingDelete(false)
                onDeleted?.()
              }}
            />
          )}
        </>
      )}
    </ModalShell>
  )
}
