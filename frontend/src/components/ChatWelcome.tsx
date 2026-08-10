/* Quello che si vede prima di dire la prima parola: chi è l'avatar e i due
 * modi per raggiungerlo, la telefonata e la chat scritta.
 *
 * Le due spiegazioni stanno qui e non in un tooltip dei pulsanti perché
 * sono la differenza fra le due prove, e va letta prima di sceglierne una. */

import type { Avatar } from '../services/api'
import { getAvatarImageUrl } from '../services/api'

export default function ChatWelcome({ avatar }: { avatar: Avatar }) {
  return (
    <div className="flex flex-1 animate-fade-in-up flex-col items-center justify-center p-12 text-center [animation-duration:0.5s]">
      <div className="mb-6 h-[120px] w-[120px] animate-float overflow-hidden rounded-3xl border-2 border-white/6 shadow-[0_0_30px_rgba(124,58,237,0.3)] [animation-duration:4s] max-[480px]:h-20 max-[480px]:w-20">
        <img
          className="h-full w-full object-cover"
          src={getAvatarImageUrl(avatar.image_url)}
          alt={avatar.name}
        />
      </div>
      <h3 className="mb-2 bg-gradient-to-br from-violet-600 to-cyan-500 bg-clip-text font-heading text-2xl font-bold text-transparent max-[480px]:text-xl">
        Parla con {avatar.name}
      </h3>
      <p className="mb-8 max-w-[500px] text-sm leading-relaxed text-slate-500">
        {avatar.description}
      </p>
      <div className="flex max-w-[520px] flex-col gap-3 rounded-2xl border border-violet-600/35 bg-violet-600/10 px-6 py-4 text-left text-slate-400">
        <p className="flex items-center gap-4 text-sm leading-normal">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-violet-400"
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <span>
            <strong className="font-semibold text-slate-100">Chiama</strong> avvia una telefonata
            simulata: attendi lo squillo e il cliente risponderà, con la trascrizione riportata qui
            in tempo reale.
          </span>
        </p>
        <p className="flex items-center gap-4 text-sm leading-normal">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-violet-400"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>
            <strong className="font-semibold text-slate-100">Chatta</strong> apre la stessa
            simulazione in forma scritta: stesso cliente e stesso scenario, in chat anziché al
            telefono.
          </span>
        </p>
      </div>
    </div>
  )
}
