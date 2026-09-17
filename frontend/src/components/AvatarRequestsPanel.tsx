/* L'elenco delle richieste, nella galleria di chi amministra un tenant.
 *
 * Gli avatar li crea il super admin, ma è l'organizzazione a sapere di quale
 * cliente ha bisogno: glielo chiede dal pulsante nell'angolo della fascia,
 * e qui vede a che punto è la domanda. Le richieste pubblicate non
 * compaiono, perché l'avatar è già nella griglia qui sotto; restano quelle
 * in attesa e quelle rifiutate con il loro motivo, finché chi le ha mandate
 * non le toglie di mezzo. Quando non ce n'è nessuna il pannello non c'è:
 * un riquadro con un titolo e niente sotto direbbe solo che è vuoto.
 *
 * La modale della richiesta vive qui, e non accanto al pulsante che la apre,
 * perché la conferma dell'invio va letta dove poi compare la richiesta.
 * Lo stato aperto/chiuso arriva dalla pagina, che lo condivide col pulsante.
 *
 * Solo un organization admin lo vede: chi si allena non ha un catalogo da
 * far crescere, e il super admin non ha nessuno a cui chiedere. */

import { useState } from 'react'

import { useAvatarRequests, useDeleteAvatarRequest } from '../hooks/useAvatarRequests'
import { useFlashMessage } from '../hooks/useFlashMessage'
import type { AvatarRequest } from '../services/avatarRequests'
import { errorMessage } from '../services/errors'
import AvatarRequestItem from './AvatarRequestItem'
import AvatarRequestModal from './AvatarRequestModal'
import ConfirmModal from './ConfirmModal'
import FormSuccess from './FormSuccess'
import { cardCls } from './scoreFormat'
import { TrashIcon } from './icons'

interface AvatarRequestsPanelProps {
  isRequesting: boolean
  onCloseRequest: () => void
}

export default function AvatarRequestsPanel({
  isRequesting,
  onCloseRequest,
}: AvatarRequestsPanelProps) {
  const { data: requests = [] } = useAvatarRequests()
  const deleteMutation = useDeleteAvatarRequest()
  const { message: successMsg, flash: flashSuccess } = useFlashMessage()

  const [removing, setRemoving] = useState<AvatarRequest | null>(null)

  const open = requests.filter((r) => r.status !== 'published')

  const handleConfirmRemove = async () => {
    if (!removing) return
    try {
      const result = await deleteMutation.mutateAsync(removing.id)
      setRemoving(null)
      flashSuccess(result.message)
    } catch {
      // Il messaggio è nella mutation, la conferma resta aperta a mostrarlo
    }
  }

  return (
    <>
      {/* Anche con l'elenco vuoto, finché c'è una conferma da leggere: è
          il caso dell'ultima richiesta appena ritirata. */}
      {(open.length > 0 || successMsg) && (
        <section
          className={`${cardCls} mb-10 animate-fade-in-up [animation-delay:0.25s]`}
          aria-labelledby="avatar-requests-title"
        >
          <h2 id="avatar-requests-title" className="font-heading text-lg font-bold text-slate-100">
            Richieste di pubblicazione
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Gli avatar chiesti al super admin: quelli in attesa e quelli rifiutati, con il motivo.
          </p>

          {successMsg && (
            <div className="mt-5">
              <FormSuccess message={successMsg} variant="page" />
            </div>
          )}

          {open.length > 0 && (
            <ul className="mt-5 flex flex-col gap-2">
              {open.map((request) => (
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
          )}
        </section>
      )}

      {isRequesting && (
        <AvatarRequestModal
          onClose={onCloseRequest}
          onSent={(sent) => {
            onCloseRequest()
            flashSuccess(
              `Richiesta per ${sent.first_name} ${sent.last_name} inviata: riceverai una notifica quando l'avatar sarà pubblicato.`,
            )
          }}
        />
      )}

      {removing && (
        <ConfirmModal
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
