/* La testata della chat: con chi si sta parlando e, quando esiste, il voto
 * della conversazione aperta.
 *
 * Il numero sulla pastiglia è il voto finale, correzione del docente
 * inclusa: qui e nella pagella deve comparire lo stesso. */

import type { Avatar, ConversationEvaluation } from '../services/api'
import { getAvatarImageUrl } from '../services/api'
import Tooltip from './Tooltip'

interface ChatHeaderProps {
  avatar: Avatar
  /** Titolo della conversazione aperta, se ce n'è una. */
  title: string | null
  evaluation: ConversationEvaluation | null
  onOpenDetail: () => void
}

export default function ChatHeader({ avatar, title, evaluation, onOpenDetail }: ChatHeaderProps) {
  return (
    <header className="flex min-h-16 items-center justify-between border-b border-white/6 bg-gray-900/40 px-8 py-4 backdrop-blur-lg max-[480px]:px-4 max-[480px]:py-2">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/6">
          <img
            className="h-full w-full object-cover"
            src={getAvatarImageUrl(avatar.image_url)}
            alt={avatar.name}
          />
        </div>
        <div className="min-w-0">
          <h2 className="font-heading text-base font-bold text-slate-100">{avatar.name}</h2>
          {title && <p className="truncate text-[0.72rem] text-slate-500">{title}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {evaluation && (
          <Tooltip content="Rivedi la valutazione della conversazione">
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-400 transition hover:-translate-y-px hover:bg-cyan-500/20"
              onClick={onOpenDetail}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Valutazione ·{' '}
              {evaluation.final_score.toLocaleString('it-IT', { maximumFractionDigits: 1 })}
              /10
            </button>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
