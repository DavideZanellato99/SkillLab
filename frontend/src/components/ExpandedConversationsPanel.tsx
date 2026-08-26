/* Pannello espanso delle conversazioni: la stessa lista della sidebar ma con
 * spazio per anteprima, badge del canale e stato di ogni conversazione, più
 * una ricerca. È una modale a sé, mostrata solo quando è aperta; ChatPage le
 * passa la lista e i gestori (apri, rinomina, elimina, nuova). */

import type React from 'react'
import type { ChatConversationSummary } from '../services/api'
import ConversationModeBadge from './ConversationModeBadge'
import SearchInput from './SearchInput'
import Tooltip from './Tooltip'
import { TrashIcon, CloseIcon } from './icons'
import ModalShell from './ModalShell'
import { formatDate } from './dateFormat'

interface ExpandedConversationsPanelProps {
  avatarImageUrl: string
  avatarName: string
  /** Tutte le conversazioni (per il conteggio in intestazione). */
  conversations: ChatConversationSummary[]
  /** Sottoinsieme già filtrato dalla ricerca (le righe mostrate). */
  visibleConversations: ChatConversationSummary[]
  search: string
  onSearchChange: (value: string) => void
  currentConversationId: string | null
  canDelete: boolean
  renamingId: string | null
  renameValue: string
  onRenameValueChange: (value: string) => void
  onStartRename: (conv: ChatConversationSummary, e: React.MouseEvent) => void
  onCommitRename: (conv: ChatConversationSummary) => void
  onCancelRename: () => void
  onOpen: (conversationId: string) => void
  onDelete: (conversationId: string, e: React.MouseEvent) => void
  /** Apre una nuova conversazione e chiude il pannello. */
  onNewConversation: () => void
  onClose: () => void
}

export default function ExpandedConversationsPanel({
  avatarImageUrl,
  avatarName,
  conversations,
  visibleConversations,
  search,
  onSearchChange,
  currentConversationId,
  canDelete,
  renamingId,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onOpen,
  onDelete,
  onNewConversation,
  onClose,
}: ExpandedConversationsPanelProps) {
  return (
    <ModalShell
      onClose={onClose}
      size="xl"
      padding="none"
      layout="tall"
      hideClose
      label={`Conversazioni con ${avatarName}`}
    >
      {/* Panel header */}
      <div className="flex items-center gap-4 border-b border-white/6 px-8 py-6 max-[480px]:px-5 max-[480px]:py-4">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/6">
          <img className="h-full w-full object-cover" src={avatarImageUrl} alt={avatarName} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-bold text-slate-100">Conversazioni</h2>
          <p className="truncate text-[0.78rem] text-slate-500">
            {conversations.length === 1
              ? `1 conversazione con ${avatarName}`
              : `${conversations.length} conversazioni con ${avatarName}`}
          </p>
        </div>
        <button
          className="shrink-0 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100"
          onClick={onClose}
          aria-label="Chiudi"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* La casella è quella di tutta l'app, non una copia disegnata qui:
          questa aveva la lente più grande e non aveva la crocetta che svuota,
          cioè due modi diversi di cercare a due centimetri l'uno dall'altro
          (la colonna ha la stessa). */}
      {conversations.length > 0 && (
        <div className="border-b border-white/6 px-8 py-4 max-[480px]:px-5">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="Cerca per nome o contenuto..."
            ariaLabel="Cerca fra le conversazioni"
          />
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-8 py-5 max-[480px]:px-5">
        {visibleConversations.length === 0 ? (
          <p className="py-12 text-center text-[0.85rem] italic text-slate-500">
            {search
              ? 'Nessuna conversazione corrisponde alla ricerca'
              : 'Nessuna conversazione presente'}
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {visibleConversations.map((conv) => {
              const isActive = currentConversationId === conv.id
              const isRenaming = renamingId === conv.id
              return (
                <li
                  key={conv.id}
                  className={`group/conv flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition ${
                    isActive
                      ? 'border-violet-600/50 bg-violet-600/10'
                      : 'border-white/6 bg-white/2 hover:-translate-y-px hover:border-violet-600/40 hover:bg-white/6'
                  }`}
                  onClick={() => !isRenaming && onOpen(conv.id)}
                >
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        className="w-full rounded-lg border border-violet-600/50 bg-gray-900/80 px-3 py-1.5 text-[0.9rem] text-slate-100 outline-none transition focus:border-violet-500"
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
                            // Esc qui rinuncia al titolo, non chiude il
                            // pannello: si ferma prima di arrivargli.
                            e.stopPropagation()
                            onCancelRename()
                          }
                        }}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`truncate text-[0.92rem] font-semibold ${isActive ? 'text-slate-100' : 'text-slate-300'}`}
                        >
                          {conv.title}
                        </span>
                        <ConversationModeBadge mode={conv.mode} />
                        {conv.ended_at ? (
                          <span className="shrink-0 rounded-full border border-white/6 bg-white/5 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-slate-500">
                            Terminata
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-emerald-400">
                            Aperta
                          </span>
                        )}
                      </div>
                    )}
                    {conv.last_message_preview && !isRenaming && (
                      <p className="mt-1 truncate text-[0.8rem] text-slate-500">
                        {conv.last_message_preview}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.7rem] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {formatDate(conv.updated_at)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        {conv.message_count} messaggi
                      </span>
                    </div>
                  </div>

                  {!isRenaming && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Tooltip content="Rinomina Conversazione">
                        <button
                          className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 opacity-0 transition hover:bg-violet-600/12 hover:text-violet-400 focus-visible:opacity-100 group-hover/conv:opacity-100 max-[900px]:opacity-100"
                          onClick={(e) => onStartRename(conv, e)}
                          aria-label="Rinomina Conversazione"
                        >
                          <svg
                            width="15"
                            height="15"
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
                      </Tooltip>
                      {canDelete && (
                        <Tooltip content="Elimina Conversazione">
                          <button
                            className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 opacity-0 transition hover:bg-red-500/10 hover:text-red-500 focus-visible:opacity-100 group-hover/conv:opacity-100 max-[900px]:opacity-100"
                            onClick={(e) => onDelete(conv.id, e)}
                            aria-label="Elimina Conversazione"
                          >
                            <TrashIcon size={15} />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Panel footer */}
      <div className="border-t border-white/6 px-8 py-4 max-[480px]:px-5">
        <button
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400"
          onClick={onNewConversation}
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
          Nuova Conversazione
        </button>
      </div>
    </ModalShell>
  )
}
