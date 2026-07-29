/* Una bolla della trascrizione: messaggio dell'operatore (a destra) o
 * dell'avatar (a sinistra, con la sua foto). Le emotion tag dei messaggi
 * dell'operatore sono staccate dal testo e mostrate come chip.
 *
 * `registerNode` consegna al genitore il nodo DOM della bolla: gli serve per
 * scorrere fino al messaggio citato da una valutazione ed evidenziarlo.
 *
 * Sotto la bolla può comparire la nota che il docente ha appuntato su quel
 * messaggio: è lì che va letta, accanto alla riga di cui parla. */

import type { ChatMessage, MessageAnnotation } from '../services/api'
import MessageEmotions, { splitEmotionTag } from './MessageEmotions'
import { formatTime } from './chatFormat'

interface MessageBubbleProps {
  message: ChatMessage
  /** Posizione nella lista: alimenta lo sfalsamento dell'animazione d'entrata. */
  index: number
  avatarImageUrl: string
  avatarName: string
  /** Evidenziata (bordo ciano) quando è il messaggio citato appena raggiunto. */
  isHighlighted: boolean
  registerNode: (id: string, node: HTMLDivElement | null) => void
  /** La nota del docente su questo messaggio, quando ce n'è una. */
  annotation?: MessageAnnotation | null
}

export default function MessageBubble({
  message,
  index,
  avatarImageUrl,
  avatarName,
  isHighlighted,
  registerNode,
  annotation = null,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const { text, emotions } = isUser
    ? splitEmotionTag(message.content)
    : { text: message.content, emotions: [] }

  return (
    <div
      ref={(node) => registerNode(message.id, node)}
      className={`flex max-w-[75%] animate-message-in gap-2 max-[900px]:max-w-[90%] ${
        isUser ? 'flex-row-reverse self-end' : 'self-start'
      }`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {!isUser && (
        <div className="mt-1 h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/6">
          <img className="h-full w-full object-cover" src={avatarImageUrl} alt={avatarName} />
        </div>
      )}
      <div className="min-w-0">
        <div
          className={`relative rounded-2xl px-6 py-4 leading-relaxed transition-shadow duration-300 ${
            isUser
              ? 'rounded-br-[4px] bg-gradient-to-br from-violet-600 to-violet-700 text-white'
              : 'rounded-bl-[4px] border border-white/6 bg-slate-800/70 text-slate-100 backdrop-blur-md'
          } ${
            isHighlighted
              ? 'shadow-[0_0_0_2px_rgba(34,211,238,0.7),0_0_24px_rgba(34,211,238,0.35)]'
              : ''
          }`}
        >
          <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
          <MessageEmotions emotions={emotions} />
          <span
            className={`mt-1 block text-[0.65rem] opacity-60 ${isUser ? 'text-right text-white/70' : 'text-slate-500'}`}
          >
            {formatTime(message.created_at)}
          </span>
        </div>
        {annotation && (
          <div className="mt-1.5 rounded-xl border border-violet-500/25 bg-violet-500/8 px-3 py-2">
            <span className="mb-0.5 block text-[0.68rem] font-semibold uppercase tracking-wide text-violet-300">
              Nota di {annotation.reviewer_name}
            </span>
            <p className="whitespace-pre-wrap break-words text-[0.8rem] leading-relaxed text-slate-300">
              {annotation.note}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
