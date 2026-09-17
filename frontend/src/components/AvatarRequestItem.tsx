/* Una richiesta di avatar come la vede chi l'ha mandata: chi è, dove andrà,
 * a che punto è, e il motivo se è stata rifiutata.
 *
 * Le richieste pubblicate non passano di qui: l'avatar è in galleria e
 * parla da sé. Restano quelle in attesa, che si possono ritirare, e quelle
 * rifiutate, che si tolgono di mezzo una volta letto il motivo. */

import type { AvatarRequest } from '../services/avatarRequests'
import { AVATAR_REQUEST_STATUS_CLASSES, AVATAR_REQUEST_STATUS_LABELS } from './avatarRequestStatus'
import Badge from './Badge'
import { formatDate } from './dateFormat'
import IconButton from './IconButton'
import { TrashIcon } from './icons'

interface AvatarRequestItemProps {
  request: AvatarRequest
  onRemove: (request: AvatarRequest) => void
}

export default function AvatarRequestItem({ request, onRemove }: AvatarRequestItemProps) {
  const isPending = request.status === 'pending'
  const name = `${request.first_name} ${request.last_name}`

  return (
    <li className="flex items-start justify-between gap-4 rounded-xl border border-white/6 bg-white/4 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-100">{name}</span>
          <Badge tone={AVATAR_REQUEST_STATUS_CLASSES[request.status]}>
            {AVATAR_REQUEST_STATUS_LABELS[request.status]}
          </Badge>
        </div>
        <span className="text-xs text-slate-500">
          {request.scenario_type} · {request.category} · inviata il {formatDate(request.created_at)}
        </span>
        {request.status === 'rejected' && request.rejection_reason && (
          <p className="mt-1 text-[0.8rem] text-red-300">Motivo: {request.rejection_reason}</p>
        )}
      </div>
      <IconButton
        tone="danger"
        label={isPending ? `Ritira la richiesta per ${name}` : `Rimuovi la richiesta per ${name}`}
        tooltip={isPending ? 'Ritira la richiesta' : 'Rimuovi'}
        onClick={() => onRemove(request)}
        className="shrink-0"
      >
        <TrashIcon />
      </IconButton>
    </li>
  )
}
