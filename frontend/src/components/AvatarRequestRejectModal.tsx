/* Il rifiuto di una richiesta di avatar, con il motivo.
 *
 * Il motivo è obbligatorio e non di cortesia: lo legge chi ha chiesto, nella
 * campanella e nel proprio elenco, ed è quello che gli dice cosa cambiare
 * per riprovare. Un rifiuto senza motivo è una porta chiusa in faccia. */

import { useState } from 'react'

import { useRejectAvatarRequest } from '../hooks/useAvatarRequests'
import type { AvatarRequest } from '../services/avatarRequests'
import { errorMessage } from '../services/errors'
import ConfirmModal from './ConfirmModal'
import { fieldCls, labelCls, textareaCls } from './Field'
import { CloseIcon } from './icons'

interface AvatarRequestRejectModalProps {
  request: AvatarRequest
  onClose: () => void
  onRejected: (message: string) => void
}

export default function AvatarRequestRejectModal({
  request,
  onClose,
  onRejected,
}: AvatarRequestRejectModalProps) {
  const rejectMutation = useRejectAvatarRequest()
  const [reason, setReason] = useState('')
  const name = `${request.first_name} ${request.last_name}`

  const handleConfirm = async () => {
    try {
      await rejectMutation.mutateAsync({ requestId: request.id, reason: reason.trim() })
      onRejected(
        `Richiesta per ${name} rifiutata: ${request.organization_name} riceverà il motivo.`,
      )
    } catch {
      // Il messaggio è nella mutation, la conferma resta aperta a mostrarlo
    }
  }

  return (
    <ConfirmModal
      icon={<CloseIcon size={24} stroke="#ef4444" />}
      iconWrapperCls="border border-red-500/25 bg-red-500/10"
      title="Rifiuta la Richiesta"
      description={
        <>
          La richiesta per <strong className="text-slate-100">{name}</strong> di{' '}
          <strong className="text-slate-100">{request.organization_name}</strong> viene chiusa senza
          creare l'avatar. Chi l'ha inviata leggerà il motivo.
        </>
      }
      error={errorMessage(rejectMutation.error, 'Errore durante il rifiuto.') || undefined}
      confirmLabel="Rifiuta"
      pendingLabel="Rifiuto..."
      confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
      isPending={rejectMutation.isPending}
      confirmDisabled={reason.trim() === ''}
      onConfirm={handleConfirm}
      onClose={onClose}
    >
      <div className={`${fieldCls} mb-4`}>
        <label className={labelCls} htmlFor="avatar-request-reject-reason">
          Motivo (visibile a chi ha inviato la richiesta)
        </label>
        <textarea
          id="avatar-request-reject-reason"
          className={textareaCls}
          rows={3}
          maxLength={500}
          placeholder="Es. Uno scenario molto simile esiste già in galleria con Mario Rossi."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={rejectMutation.isPending}
        />
      </div>
    </ConfirmModal>
  )
}
