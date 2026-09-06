/* L'area centrale della chat: le bolle della conversazione, oppure la
 * presentazione dell'avatar quando non è ancora stato detto niente.
 *
 * Scorre da sola in fondo a ogni messaggio nuovo e mentre l'avatar sta
 * componendo: la riga appena arrivata deve restare quella che si vede. */

import { useEffect, useRef } from 'react'

import type { Avatar, ChatMessage, MessageAnnotation } from '../services/api'
import { getAvatarImageUrl } from '../services/api'
import ChatWelcome from './ChatWelcome'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'

interface ChatMessagesProps {
  avatar: Avatar
  messages: ChatMessage[]
  isLoadingConversation: boolean
  /** L'avatar sta componendo la risposta scritta. */
  isReplying: boolean
  /** Id della bolla che sta crescendo con la risposta in arrivo, se c'è. */
  streamingReplyId: string | null
  highlightedMessageId: string | null
  registerMessageNode: (id: string, node: HTMLDivElement | null) => void
  annotationsByMessage: Map<string, MessageAnnotation>
}

export default function ChatMessages({
  avatar,
  messages,
  isLoadingConversation,
  isReplying,
  streamingReplyId,
  highlightedMessageId,
  registerMessageNode,
  annotationsByMessage,
}: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const avatarImageUrl = getAvatarImageUrl(avatar.image_url)

  /* Lo scorrimento segue due cose diverse, e con due andature diverse.
   *
   * Un messaggio nuovo, o i puntini che annunciano la risposta, è un salto:
   * scorre morbido, perché compare un pezzo di conversazione che prima non
   * c'era. La risposta che arriva a frammenti è invece la stessa riga che si
   * allunga, e va seguita di scatto: un'animazione morbida ripartiva da capo
   * a ogni frammento, cioè centinaia di volte per risposta, e ognuna costava
   * un ricalcolo del layout senza mai arrivare in fondo. */
  const messageCount = messages.length
  const lastContent = messages[messages.length - 1]?.content

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messageCount, isReplying])

  useEffect(() => {
    if (streamingReplyId === null) return
    endRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [lastContent, streamingReplyId])

  return (
    <div
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-8 max-[900px]:p-4"
      id="chat-messages"
    >
      {messages.length === 0 && !isLoadingConversation && <ChatWelcome avatar={avatar} />}

      {isLoadingConversation && (
        <div className="flex justify-center p-8">
          <TypingIndicator />
        </div>
      )}

      {messages.map((msg, index) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          index={index}
          avatarImageUrl={avatarImageUrl}
          avatarName={avatar.name}
          isHighlighted={msg.id === highlightedMessageId}
          registerNode={registerMessageNode}
          annotation={annotationsByMessage.get(msg.id) ?? null}
        />
      ))}

      {/* L'avatar che compone la risposta scritta: solo finché non arriva il
          primo frammento, poi tocca alla bolla che cresce */}
      {isReplying && streamingReplyId === null && (
        <div className="flex max-w-[75%] animate-message-in gap-2 self-start">
          <div className="mt-1 h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/6">
            <img className="h-full w-full object-cover" src={avatarImageUrl} alt={avatar.name} />
          </div>
          <div className="rounded-2xl rounded-bl-[4px] border border-white/6 bg-slate-800/70 px-6 py-3 backdrop-blur-md">
            <TypingIndicator />
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  )
}
