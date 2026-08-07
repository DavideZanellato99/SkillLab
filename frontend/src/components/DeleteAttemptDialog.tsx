import type { SimulationKind } from '../services/simulations'
import { useDeleteSimulationAttempt } from '../hooks/useSimulations'
import ConfirmModal from './ConfirmModal'
import { TrashIcon } from './icons'
import { formatDateTime, kindLabel } from './simulationFormat'

/* La conferma con cui si elimina un test consegnato, il gemello di
 * [DeleteConversationDialog](./DeleteConversationDialog.tsx): stessi due posti
 * da cui parte, cioè la riga del report attività e la schermata che apre il
 * tentativo per intero.
 *
 * Dice che sparisce il **tentativo** e non la simulazione, perché è tutta lì
 * la differenza fra le due prove: le risposte date e il voto preso se ne
 * vanno, il test resta lì da rifare. Chi conferma deve saperlo prima. */

export default function DeleteAttemptDialog({
  attemptId,
  simulationTitle,
  simulationKind,
  attemptedAt,
  elevated = false,
  onClose,
  onDeleted,
}: {
  attemptId: string
  simulationTitle: string
  simulationKind: SimulationKind
  attemptedAt: string
  /** Vero quando la conferma parte da dentro un'altra modale. */
  elevated?: boolean
  onClose: () => void
  /** Eliminato: chi ospita la conferma chiude anche quello che la mostrava. */
  onDeleted: () => void
}) {
  const mutation = useDeleteSimulationAttempt()

  const confirm = async () => {
    try {
      await mutation.mutateAsync(attemptId)
      onDeleted()
    } catch {
      // Il messaggio resta nella mutation, la conferma lo mostra
    }
  }

  return (
    <ConfirmModal
      icon={<TrashIcon size={24} stroke="#ef4444" />}
      iconWrapperCls="border border-red-500/25 bg-red-500/10"
      title="Elimina Tentativo"
      description={
        <>
          Stai per eliminare il tentativo su{' '}
          <strong className="text-slate-100">{simulationTitle}</strong> (
          {kindLabel(simulationKind).toLowerCase()}) del {formatDateTime(attemptedAt)}, con tutte le
          risposte date e il voto preso. La simulazione resta e si può rifare. L'operazione non è
          reversibile.
        </>
      }
      error={mutation.error instanceof Error ? mutation.error.message : undefined}
      confirmLabel="Elimina Definitivamente"
      pendingLabel="Eliminazione..."
      confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
      isPending={mutation.isPending}
      elevated={elevated}
      onConfirm={() => void confirm()}
      onClose={onClose}
    />
  )
}
