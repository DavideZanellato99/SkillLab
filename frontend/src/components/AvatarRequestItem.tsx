/* Una richiesta di avatar come la vede chi l'ha mandata: chi è, a che punto
 * è, e aprendola tutto il resto, dove andrà, cosa gli è successo, quando è
 * partita e il motivo se è stata rifiutata.
 *
 * Le richieste pubblicate non passano di qui: l'avatar è in galleria e
 * parla da sé. Restano quelle in attesa, che si possono ritirare, e quelle
 * rifiutate, che si tolgono di mezzo una volta letto il motivo.
 *
 * Chiusa, la riga dice solo nome e stato: è quello che serve per scorrere
 * l'elenco e trovare la richiesta che si cerca. Il resto si apre dalla
 * freccia, in un elenco di voci e valori come il pannello del registro
 * attività; non sta scritto per intero come nella riga del super admin, lì
 * è il testo su cui si decide, qui è quello che si è scritto da soli e si
 * rilegge ogni tanto. Sempre aperto, con più richieste in attesa la modale
 * diventava una colonna di paragrafi.
 *
 * `min-w-0` e `break-words` sui valori: in una colonna flex un figlio non si
 * stringe sotto il proprio contenuto, e un tipo di scenario o una
 * problematica scritti senza spazi uscivano dal riquadro. */

import { useState } from 'react'

import type { AvatarRequest } from '../services/avatarRequests'
import { AVATAR_REQUEST_STATUS_CLASSES, AVATAR_REQUEST_STATUS_LABELS } from './avatarRequestStatus'
import Badge from './Badge'
import { formatDate } from './dateFormat'
import IconButton from './IconButton'
import { ChevronDownIcon, TrashIcon } from './icons'

interface AvatarRequestItemProps {
  request: AvatarRequest
  onRemove: (request: AvatarRequest) => void
}

export default function AvatarRequestItem({ request, onRemove }: AvatarRequestItemProps) {
  const isPending = request.status === 'pending'
  const name = `${request.first_name} ${request.last_name}`
  const [expanded, setExpanded] = useState(false)
  const detailsId = `avatar-request-details-${request.id}`

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-white/6 bg-white/4 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="break-words font-semibold text-slate-100">{name}</span>
          <Badge tone={AVATAR_REQUEST_STATUS_CLASSES[request.status]}>
            {AVATAR_REQUEST_STATUS_LABELS[request.status]}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            label={expanded ? `Nascondi i dettagli di ${name}` : `Mostra i dettagli di ${name}`}
            tooltip={expanded ? 'Nascondi i dettagli' : 'Mostra i dettagli'}
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((open) => !open)}
          >
            <ChevronDownIcon className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </IconButton>
          <IconButton
            tone="danger"
            label={
              isPending ? `Ritira la richiesta per ${name}` : `Rimuovi la richiesta per ${name}`
            }
            tooltip={isPending ? 'Ritira la richiesta' : 'Rimuovi'}
            onClick={() => onRemove(request)}
          >
            <TrashIcon />
          </IconButton>
        </div>
      </div>
      {expanded && (
        <dl
          id={detailsId}
          className="grid min-w-0 grid-cols-[max-content_1fr] gap-x-6 gap-y-2 border-t border-white/6 pt-3 text-[0.8rem]"
        >
          <dt className="text-slate-500">Categoria</dt>
          <dd className="min-w-0 break-words text-slate-300">{request.category}</dd>
          <dt className="text-slate-500">Tipo di scenario</dt>
          <dd className="min-w-0 break-words text-slate-300">{request.scenario_type}</dd>
          <dt className="text-slate-500">Problematica</dt>
          <dd className="min-w-0 whitespace-pre-line break-words text-slate-300">
            {request.problem}
          </dd>
          <dt className="text-slate-500">Inviata il</dt>
          <dd className="min-w-0 text-slate-300">{formatDate(request.created_at)}</dd>
          {request.status === 'rejected' && request.rejection_reason && (
            <>
              <dt className="text-slate-500">Motivo del rifiuto</dt>
              <dd className="min-w-0 whitespace-pre-line break-words text-red-300">
                {request.rejection_reason}
              </dd>
            </>
          )}
        </dl>
      )}
    </li>
  )
}
