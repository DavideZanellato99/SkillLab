/* Una tessera della galleria: la faccia, il nome, lo scenario in due righe e
 * quello che chi guarda ci ha già fatto.
 *
 * È un link e non un riquadro cliccabile. Era un `div` con `role="button"` e
 * la gestione a mano di Invio e barra spaziatrice, cioè un link rifatto per
 * intero e peggio: il tasto centrale non apriva niente, «apri in una scheda
 * nuova» non compariva nel menu, e trascinarlo sulla barra non salvava
 * l'indirizzo. Con un `Link` tutto questo torna gratis e il codice sparisce. */

import { useState } from 'react'
import { Link } from 'react-router'
import type { Avatar } from '../services/api'
import { getAvatarImageUrl } from '../services/api'
import Badge from './Badge'
import { categoryBadgeClasses } from './categoryStyles'
import { formatDate } from './chatFormat'
import { ChatIcon, MicIcon, UserIcon } from './icons'

interface AvatarCardProps {
  avatar: Avatar
  index: number
}

/* L'ingresso a cascata era `index * 0.08s`: con venti avatar l'ultimo
 * compariva dopo un secondo e mezzo, e chi cercava proprio quello guardava
 * uno spazio vuoto. Il ritardo si ferma dopo le prime file, che sono quelle
 * che l'occhio segue davvero. */
const MAX_STAGGERED = 8
const STAGGER_STEP_S = 0.05

export default function AvatarCard({ avatar, index }: AvatarCardProps) {
  /* Un ritratto che non arriva (file mancante, rete che cade a metà) lasciava
   * il testo alternativo su fondo scuro, che sembra una tessera rotta. */
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <Link
      to={`/app/chat/${avatar.id}`}
      className="group relative block animate-slide-in-bottom overflow-hidden rounded-3xl border border-white/6 bg-gray-900/60 no-underline backdrop-blur-xl transition hover:-translate-y-1.5 hover:scale-[1.02] hover:border-white/12 hover:bg-slate-800/70 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] active:scale-[0.99]"
      style={{ animationDelay: `${Math.min(index, MAX_STAGGERED) * STAGGER_STEP_S}s` }}
      id={`avatar-card-${avatar.id}`}
      aria-label={`Parla con ${avatar.name}`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-900 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-3/5 after:bg-gradient-to-t after:from-gray-900/60 after:via-gray-900/40 after:to-transparent after:content-['']">
        {imageFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-600/15 to-cyan-500/10 text-slate-600">
            <UserIcon size={64} />
          </div>
        ) : (
          <img
            className="h-full w-full object-cover transition-transform duration-[400ms] group-hover:scale-[1.08]"
            src={getAvatarImageUrl(avatar.image_url)}
            alt={avatar.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>

      <div className="relative p-6">
        <Badge tone={categoryBadgeClasses(avatar.category_color)} className="mb-2">
          {avatar.category}
        </Badge>
        <h3 className="mb-1 font-heading text-lg font-bold text-slate-100">{avatar.name}</h3>
        <p className="line-clamp-2 text-[0.82rem] leading-normal text-slate-500">
          {avatar.description}
        </p>
      </div>

      {/* Il proprio storico con questo interlocutore, che è quello che si
          cerca scorrendo il catalogo: da dove ricominciare, e cosa non si è
          ancora provato. Chi non l'ha mai affrontato non legge nessuno zero,
          perché una tessera nuova non ha niente da raccontare.

          Su una riga sua e non accanto all'invito: la tessera è larga 280px,
          e con la pastiglia a fianco restava meno di metà riga per una frase
          che porta un numero e una data, quindi la data spariva nei puntini
          proprio mentre era la cosa da leggere. */}
      {avatar.own_sessions > 0 && (
        <div className="relative flex items-center gap-1.5 px-6 pb-1 text-[0.75rem] text-slate-500">
          <ChatIcon size={13} className="shrink-0" />
          <span className="truncate">
            {avatar.own_sessions === 1 ? '1 sessione' : `${avatar.own_sessions} sessioni`}
            {avatar.last_session_at && `, ultima il ${formatDate(avatar.last_session_at)}`}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end px-6 pb-6 pt-2">
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/6 bg-white/4 px-4 py-1 text-[0.8rem] font-medium text-slate-500 transition group-hover:scale-105 group-hover:border-violet-600 group-hover:bg-violet-600/15 group-hover:text-violet-400">
          <MicIcon size={16} />
          {avatar.own_sessions > 0 ? 'Riprova' : 'Parla'}
        </span>
      </div>
    </Link>
  )
}
