/* La barra in fondo alla chat, da cui si raggiunge l'avatar. Ha tre stati e
 * mai due insieme:
 *
 *  - conversazione chiusa: la trascrizione è definitiva e il backend rifiuta
 *    di riaprirla, quindi resta solo ricominciare (e riascoltare, se era una
 *    telefonata);
 *  - chat scritta in corso: la casella di scrittura, e il pulsante rosso
 *    tondo che la chiude, nello stesso posto in cui durante una chiamata sta
 *    quello per riagganciare;
 *  - a riposo: Chiama, e Chatta quando non c'è una trascrizione aperta da
 *    continuare. */

import type { RefObject } from 'react'

import type { Avatar, ChatMessage, ConversationMode } from '../services/api'
import CallRecordingPlayer from './CallRecordingPlayer'
import type { CallRecordingPlayerHandle } from './CallRecordingPlayer'
import Tooltip from './Tooltip'
import VoiceButton from './VoiceButton'

interface ChatDockProps {
  avatar: Avatar
  avatarId: string | undefined
  conversationId: string | null
  mode: ConversationMode | null
  isClosed: boolean
  isChatMode: boolean
  /** Chatta apre sempre una conversazione nuova, quindi non sempre si può. */
  canStartChat: boolean
  voiceActive: boolean
  recordingPlayerRef: RefObject<CallRecordingPlayerHandle | null>
  chat: {
    input: string
    setInput: (value: string) => void
    inputRef: RefObject<HTMLTextAreaElement | null>
    isSending: boolean
    isEnding: boolean
    start: () => void
    send: () => void
    end: () => void
  }
  onNewConversation: () => void
  onVoiceConversationId: (id: string) => void
  onVoiceTranscript: (message: ChatMessage) => void
  onVoiceError: (message: string | null) => void
  onVoiceSessionEnd: () => void
  onVoiceActiveChange: (active: boolean) => void
}

export default function ChatDock({
  avatar,
  avatarId,
  conversationId,
  mode,
  isClosed,
  isChatMode,
  canStartChat,
  voiceActive,
  recordingPlayerRef,
  chat,
  onNewConversation,
  onVoiceConversationId,
  onVoiceTranscript,
  onVoiceError,
  onVoiceSessionEnd,
  onVoiceActiveChange,
}: ChatDockProps) {
  return (
    <div
      className="flex flex-col items-center gap-2 border-t border-white/6 bg-gray-900/30 px-8 py-6 backdrop-blur-lg max-[900px]:px-4"
      id="voice-dock"
    >
      {isClosed ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="flex items-center gap-2 text-xs text-slate-500">
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
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Questa conversazione è terminata e non può essere ripresa.
          </p>
          {/* Una telefonata lascia una registrazione, una chat no */}
          {mode === 'voice' && conversationId && (
            <CallRecordingPlayer ref={recordingPlayerRef} conversationId={conversationId} />
          )}
          <button
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400"
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
            Ricomincia con {avatar.name}
          </button>
        </div>
      ) : isChatMode ? (
        <div className="flex w-full max-w-[860px] flex-col gap-2">
          <div className="flex items-end gap-4">
            <div className="flex min-w-0 flex-1 items-end gap-2 rounded-2xl border border-white/6 bg-slate-800/50 px-4 py-2 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]">
              <textarea
                ref={chat.inputRef}
                className="max-h-32 flex-1 resize-none border-none bg-transparent py-2 text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
                rows={1}
                maxLength={2000}
                value={chat.input}
                placeholder={`Scrivi a ${avatar.name}...`}
                onChange={(e) => {
                  chat.setInput(e.target.value)
                  // Cresce con il testo, fino alla max-height qui sopra
                  e.target.style.height = 'auto'
                  e.target.style.height = `${e.target.scrollHeight}px`
                }}
                onKeyDown={(e) => {
                  // Invio manda, Maiusc+Invio va a capo
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    chat.send()
                  }
                }}
              />
              <Tooltip content="Invia il Messaggio">
                <button
                  className="mb-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border-none bg-gradient-to-br from-violet-600 to-violet-700 text-white shadow-[0_4px_12px_rgba(124,58,237,0.35)] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  onClick={chat.send}
                  disabled={!chat.input.trim() || chat.isSending}
                  aria-label="Invia il Messaggio"
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
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </Tooltip>
            </div>
            <Tooltip content="Termina la Chat">
              <button
                className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-red-500/90 text-white shadow-[0_8px_24px_rgba(239,68,68,0.4)] transition hover:scale-[1.08] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                onClick={chat.end}
                disabled={chat.isEnding}
                id="end-chat-btn"
                aria-label="Termina la Chat"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </Tooltip>
          </div>
          <p className="text-center text-xs text-slate-500">
            {chat.isSending ? (
              <>{avatar.name} sta scrivendo...</>
            ) : chat.isEnding ? (
              <>Chiusura della chat in corso...</>
            ) : (
              <>
                Invio invia il messaggio, Shift+Invio va a capo · Il pulsante rosso termina la
                conversazione
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-4">
            {avatarId && (
              <VoiceButton
                avatarId={avatarId}
                conversationId={conversationId}
                onConversationId={onVoiceConversationId}
                onTranscript={onVoiceTranscript}
                onError={onVoiceError}
                onSessionEnd={onVoiceSessionEnd}
                onActiveChange={onVoiceActiveChange}
              />
            )}
            {canStartChat && (
              <Tooltip content="Avvia una conversazione scritta con l’avatar">
                <button
                  className="flex h-16 cursor-pointer items-center justify-center gap-2.5 rounded-full border-none bg-gradient-to-br from-violet-600 to-violet-700 px-8 text-base font-semibold text-white shadow-[0_8px_24px_rgba(124,58,237,0.35)] transition hover:scale-[1.05] hover:shadow-[0_10px_28px_rgba(124,58,237,0.5)]"
                  onClick={chat.start}
                  id="chat-btn"
                  aria-label="Chatta con l’Avatar"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Chatta
                </button>
              </Tooltip>
            )}
          </div>
          <p className="text-center text-xs text-slate-500">
            {voiceActive ? (
              <>Chiamata in corso · il pulsante rosso termina la chiamata</>
            ) : canStartChat ? (
              <>Chiama {avatar.name} al telefono, oppure prosegui in chat</>
            ) : (
              <>Premi Chiama per telefonare a {avatar.name}</>
            )}
          </p>
          {/* Trasparenza continua (art. 13): l'avviso completo si legge una
           * volta sola, questa riga sta sempre sotto il pulsante. Durante la
           * chiamata sparisce perché al suo posto lampeggia il REC del
           * VoiceButton. */}
          {!voiceActive && (
            <p className="text-center text-[0.7rem] text-slate-600">
              Le chiamate vengono registrate, trascritte e valutate automaticamente.
            </p>
          )}
        </>
      )}
    </div>
  )
}
