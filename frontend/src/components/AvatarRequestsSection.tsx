/* Le richieste di avatar in attesa, in cima alla gestione avatar.
 *
 * È la lista delle cose da fare del super admin: ogni riga è un'organizzazione
 * che aspetta un cliente nuovo per allenare i suoi. Da qui si apre la scheda
 * già precompilata con quello che la richiesta dice, o si rifiuta con un
 * motivo. Le richieste chiuse non stanno qui: pubblicate sono avatar nella
 * tabella sotto, rifiutate restano a chi le ha mandate col loro motivo.
 *
 * Quando non c'è niente in attesa la sezione non compare: una lista vuota in
 * cima a una pagina che ha altro da mostrare è solo spazio da scorrere. */

import { useAvatarRequests } from '../hooks/useAvatarRequests'
import type { AvatarRequest } from '../services/avatarRequests'
import AvatarRequestAdminRow from './AvatarRequestAdminRow'
import { cardCls } from './scoreFormat'

interface AvatarRequestsSectionProps {
  onFulfill: (request: AvatarRequest) => void
  onReject: (request: AvatarRequest) => void
}

export default function AvatarRequestsSection({ onFulfill, onReject }: AvatarRequestsSectionProps) {
  const { data: pending = [] } = useAvatarRequests({ status: 'pending' })

  if (pending.length === 0) return null

  return (
    <section className={`${cardCls} mb-6`} aria-labelledby="avatar-requests-admin-title">
      <h2
        id="avatar-requests-admin-title"
        className="font-heading text-lg font-bold text-slate-100"
      >
        Richieste in attesa{' '}
        <span className="ml-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-400">
          {pending.length}
        </span>
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Le organizzazioni che aspettano un avatar nuovo. Compila la scheda per pubblicarlo, o
        rifiuta la richiesta indicando il motivo.
      </p>
      <ul className="mt-5 flex flex-col gap-2">
        {pending.map((request) => (
          <AvatarRequestAdminRow
            key={request.id}
            request={request}
            onFulfill={onFulfill}
            onReject={onReject}
          />
        ))}
      </ul>
    </section>
  )
}
