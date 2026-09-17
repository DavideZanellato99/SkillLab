/* Una richiesta in attesa, come la legge il super admin: chi la manda, per
 * chi, e le due cose che si possono fare, compilare la scheda o rifiutare.
 *
 * La problematica sta per intero e non troncata: è il testo da cui la scheda
 * nasce, e chi decide se compilarla deve poterlo leggere qui senza aprire
 * niente. */

import type { AvatarRequest } from '../services/avatarRequests'
import { formatDate } from './dateFormat'
import IconButton from './IconButton'
import { CloseIcon, PencilIcon } from './icons'

interface AvatarRequestAdminRowProps {
  request: AvatarRequest
  onFulfill: (request: AvatarRequest) => void
  onReject: (request: AvatarRequest) => void
}

export default function AvatarRequestAdminRow({
  request,
  onFulfill,
  onReject,
}: AvatarRequestAdminRowProps) {
  const name = `${request.first_name} ${request.last_name}`

  return (
    <li className="flex items-start justify-between gap-4 rounded-xl border border-white/6 bg-white/4 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-100">{name}</span>
          <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-cyan-400">
            {request.organization_name}
          </span>
          <span className="text-xs text-slate-500">{request.category}</span>
        </div>
        <span className="text-xs text-slate-500">
          {request.scenario_type} · da {request.created_by_email} il{' '}
          {formatDate(request.created_at)}
        </span>
        <p className="mt-1 whitespace-pre-line text-[0.8rem] text-slate-300">{request.problem}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <IconButton
          label={`Compila la scheda di ${name}`}
          tooltip="Compila la scheda e pubblica"
          onClick={() => onFulfill(request)}
        >
          <PencilIcon />
        </IconButton>
        <IconButton
          tone="danger"
          label={`Rifiuta la richiesta per ${name}`}
          tooltip="Rifiuta la richiesta"
          onClick={() => onReject(request)}
        >
          <CloseIcon />
        </IconButton>
      </div>
    </li>
  )
}
