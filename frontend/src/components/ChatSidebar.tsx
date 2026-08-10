/* La colonna di sinistra della chat: chi è l'avatar, come aprire una
 * conversazione nuova, e l'elenco di quelle già avute.
 *
 * L'elenco è sempre completo, senza filtri: la ricerca vive nel pannello
 * espanso, dove c'è lo spazio per mostrare anche l'anteprima di ogni
 * conversazione. */

import { Link } from 'react-router'

import type { Avatar, ChatConversationSummary } from '../services/api'
import { getAvatarImageUrl } from '../services/api'
import AvatarBadges from './AvatarBadges'
import { formatDate } from './chatFormat'
import Tooltip from './Tooltip'
import { TrashIcon } from './icons'

interface ChatSidebarProps {
  avatar: Avatar
  conversations: ChatConversationSummary[]
  currentConversationId: string | null
  /** Su schermo stretto la colonna scorre via: questo dice se è a vista. */
  isOpen: boolean
  canDelete: boolean
  /** Id in corso di rinomina, se la riga interessata sta qui e non nel pannello. */
  renamingId: string | null
  renameValue: string
  onRenameValueChange: (value: string) => void
  onStartRename: (conversation: ChatConversationSummary, e: React.MouseEvent) => void
  onCommitRename: (conversation: ChatConversationSummary) => void
  onCancelRename: () => void
  onSelect: (conversationId: string) => void
  onDelete: (conversationId: string, e: React.MouseEvent) => void
  onNewConversation: () => void
  onExpand: () => void
}

export default function ChatSidebar({
  avatar,
  conversations,
  currentConversationId,
  isOpen,
  canDelete,
  renamingId,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onSelect,
  onDelete,
  onNewConversation,
  onExpand,
}: ChatSidebarProps) {
  return (
    <aside
      className={`flex w-80 min-w-80 animate-slide-in-left flex-col overflow-y-auto border-r border-white/6 bg-gray-900/50 backdrop-blur-2xl max-[900px]:fixed max-[900px]:bottom-0 max-[900px]:left-0 max-[900px]:top-16 max-[900px]:z-40 max-[900px]:transition-transform max-[480px]:w-full max-[480px]:min-w-full ${
        isOpen ? 'max-[900px]:translate-x-0' : 'max-[900px]:-translate-x-full'
      }`}
      id="chat-sidebar"
    >
      <div className="border-b border-white/6 p-8 text-center">
        <div className="mx-auto mb-4 h-[100px] w-[100px] overflow-hidden rounded-3xl border-2 border-white/6 shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition hover:scale-105 hover:border-violet-600 hover:shadow-[0_0_30px_rgba(124,58,237,0.3)]">
          <img
            className="h-full w-full object-cover"
            src={getAvatarImageUrl(avatar.image_url)}
            alt={avatar.name}
          />
        </div>
        <h2 className="mb-1 font-heading text-xl font-bold text-slate-100">{avatar.name}</h2>
        <AvatarBadges
          category={avatar.category}
          categoryColor={avatar.category_color}
          difficulty={avatar.difficulty}
          center
        />
        <p className="text-[0.8rem] leading-normal text-slate-500">{avatar.description}</p>
      </div>

      <button
        className="mx-4 mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400"
        onClick={onNewConversation}
        id="new-conversation-btn"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Nuova conversazione
      </button>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">
            Conversazioni
          </h3>
          <Tooltip content="Espandi le conversazioni">
            <button
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-slate-500 transition hover:bg-violet-600/12 hover:text-violet-400"
              onClick={onExpand}
              aria-label="Espandi le conversazioni"
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
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </Tooltip>
        </div>
        {conversations.length === 0 ? (
          <p className="py-6 text-center text-[0.8rem] italic text-slate-500">
            Nessuna conversazione presente
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-1">
            {conversations.map((conv) => {
              const isActive = currentConversationId === conv.id
              const isRenaming = renamingId === conv.id
              return (
                <li
                  key={conv.id}
                  className={`group/conv flex cursor-pointer items-center gap-2 rounded-lg p-2 transition ${
                    isActive ? 'border-l-2 border-violet-600 bg-violet-600/10' : 'hover:bg-white/8'
                  }`}
                  onClick={() => !isRenaming && onSelect(conv.id)}
                >
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        className="w-full rounded-md border border-violet-600/50 bg-gray-900/80 px-2 py-1 text-[0.8rem] text-slate-100 outline-none transition focus:border-violet-500"
                        value={renameValue}
                        maxLength={120}
                        autoFocus
                        placeholder="Nome della conversazione"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onRenameValueChange(e.target.value)}
                        onBlur={() => onCommitRename(conv)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            onCommitRename(conv)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            onCancelRename()
                          }
                        }}
                      />
                    ) : (
                      <span
                        className={`block truncate text-[0.8rem] ${isActive ? 'text-slate-100' : 'text-slate-400'}`}
                      >
                        {conv.title}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[0.68rem] text-slate-500">
                      {formatDate(conv.updated_at)} · {conv.message_count} msg
                    </span>
                  </div>
                  {!isRenaming && (
                    <button
                      className="shrink-0 cursor-pointer rounded-lg border-none bg-transparent p-1 text-slate-500 opacity-0 transition hover:bg-violet-600/12 hover:text-violet-400 focus-visible:opacity-100 group-hover/conv:opacity-100 max-[900px]:opacity-100"
                      onClick={(e) => onStartRename(conv, e)}
                      aria-label="Rinomina conversazione"
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
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                  )}
                  {canDelete && !isRenaming && (
                    <button
                      className="shrink-0 cursor-pointer rounded-lg border-none bg-transparent p-1 text-slate-500 opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover/conv:opacity-100"
                      onClick={(e) => onDelete(conv.id, e)}
                      aria-label="Elimina conversazione"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Link
        to="/app"
        className="flex items-center gap-2 border-t border-white/6 px-6 py-4 text-[0.85rem] font-medium text-slate-400 no-underline transition hover:bg-white/8 hover:text-slate-100"
        id="back-to-gallery"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Torna alla Gallery
      </Link>
    </aside>
  )
}
