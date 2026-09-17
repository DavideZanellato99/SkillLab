/* Le richieste già mandate, dentro la modale da cui se ne manda una nuova.
 *
 * Gli avatar li crea il super admin, ma è l'organizzazione a sapere di quale
 * cliente ha bisogno: glielo chiede dal pulsante nell'angolo della fascia,
 * e qui vede a che punto è la domanda. Le richieste pubblicate non
 * compaiono, perché l'avatar è già nella griglia; restano quelle in attesa e
 * quelle rifiutate con il loro motivo, finché chi le ha mandate non le
 * toglie di mezzo.
 *
 * Stava in un riquadro suo in cima alla galleria, sopra la ricerca, e
 * spingeva in basso il catalogo ogni volta che c'era una richiesta aperta.
 * Nella modale invece si legge nel momento in cui serve: prima di chiederne
 * un'altra, e subito dopo averla chiesta, che è dove compare.
 *
 * La conferma di rimozione si apre sopra la modale (`elevated`), come la
 * cancellazione di una categoria da dentro la sua anagrafica. Il messaggio
 * di conferma lo mostra la modale, che ha un banner solo per l'invio e per
 * il ritiro: chi lo legge sta guardando lo stesso punto. */

import { useState } from 'react'

import { useDeleteAvatarRequest } from '../hooks/useAvatarRequests'
import type { AvatarRequest } from '../services/avatarRequests'
import { errorMessage } from '../services/errors'
import AvatarRequestItem from './AvatarRequestItem'
import ConfirmModal from './ConfirmModal'
import { TrashIcon } from './icons'

interface AvatarRequestsListProps {
  /** Le richieste in attesa e quelle rifiutate: le pubblicate non passano di qui. */
  requests: AvatarRequest[]
  onRemoved: (message: string) => void
}

export default function AvatarRequestsList({ requests, onRemoved }: AvatarRequestsListProps) {
  const deleteMutation = useDeleteAvatarRequest()
  const [removing, setRemoving] = useState<AvatarRequest | null>(null)

  const handleConfirmRemove = async () => {
    if (!removing) return
    try {
      const result = await deleteMutation.mutateAsync(removing.id)
      setRemoving(null)
      onRemoved(result.message)
    } catch {
      // Il messaggio è nella mutation, la conferma resta aperta a mostrarlo
    }
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {requests.map((request) => (
          <AvatarRequestItem
            key={request.id}
            request={request}
            onRemove={(target) => {
              deleteMutation.reset()
              setRemoving(target)
            }}
          />
        ))}
      </ul>

      {removing && (
        <ConfirmModal
          elevated
          icon={<TrashIcon size={24} stroke="#ef4444" />}
          iconWrapperCls="border border-red-500/25 bg-red-500/10"
          title={removing.status === 'pending' ? 'Ritira la Richiesta' : 'Rimuovi la Richiesta'}
          description={
            removing.status === 'pending' ? (
              <>
                La richiesta per{' '}
                <strong className="text-slate-100">
                  {removing.first_name} {removing.last_name}
                </strong>{' '}
                viene ritirata e il super admin non la vedrà più. Potrai inviarne un'altra in
                qualsiasi momento.
              </>
            ) : (
              <>
                La richiesta rifiutata per{' '}
                <strong className="text-slate-100">
                  {removing.first_name} {removing.last_name}
                </strong>{' '}
                viene rimossa dall'elenco.
              </>
            )
          }
          error={errorMessage(deleteMutation.error, 'Errore durante la rimozione.') || undefined}
          confirmLabel={removing.status === 'pending' ? 'Ritira' : 'Rimuovi'}
          pendingLabel="Rimozione..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={deleteMutation.isPending}
          onConfirm={handleConfirmRemove}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}
