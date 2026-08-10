/* La chat scritta con l'avatar: lo stesso roleplay della telefonata, senza
 * riconoscimento vocale e senza voce di sintesi.
 *
 * Il messaggio dell'operatore compare subito e la risposta cresce dentro una
 * bolla sua dal primo frammento in poi. Le due bolle nascono con id
 * provvisori, sostituiti da quelli veri quando il server ha scritto lo
 * scambio; se lo streaming si interrompe non è stato scritto nulla, quindi
 * tutte e due vengono tolte e il testo torna nella casella, pronto da
 * rimandare. */

import { useCallback, useRef, useState } from 'react'

import type { ChatMessage } from '../services/api'
import { useEndChatConversation, useSendChatMessage } from './useConversations'

interface UseTextChatOptions {
  avatarId: string | undefined
  conversationId: string | null
  setConversationId: (updater: (prev: string | null) => string | null) => void
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void
  setError: (message: string | null) => void
  /** La chat è stata chiusa: da qui parte la valutazione, come per una chiamata. */
  onEnded: (conversationId: string) => void
}

export function useTextChat({
  avatarId,
  conversationId,
  setConversationId,
  setMessages,
  setError,
  onEnded,
}: UseTextChatOptions) {
  const sendMutation = useSendChatMessage()
  const endMutation = useEndChatConversation()

  /* Una chat è viva in questa sessione. Vale dal primo messaggio in poi (e
   * dal pulsante Chatta, che ne apre una prima che esista un id): mette in
   * pausa la risincronizzazione dal database esattamente come fa una
   * chiamata. */
  const [started, setStarted] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  /* Id della bolla dell'avatar che cresce con la risposta; null prima del
   * primo frammento (i puntini coprono quell'attesa) e a riposo. */
  const [streamingReplyId, setStreamingReplyId] = useState<string | null>(null)

  /** Torna alla scelta del canale: chiamata o chat. */
  const reset = useCallback(() => {
    setStarted(false)
    setInput('')
  }, [])

  // Apre la casella di scrittura. La conversazione la crea il server col
  // primo messaggio, quindi fino ad allora non c'è niente da registrare.
  const start = useCallback(() => {
    setError(null)
    setStarted(true)
    // Aspetta che la casella sia montata prima di darle il fuoco
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [setError])

  const send = useCallback(() => {
    const content = input.trim()
    if (!content || sendMutation.isPending || !avatarId) return

    setInput('')
    setError(null)
    setStarted(true)
    // La casella era cresciuta con un testo che non contiene più; inviare
    // col pulsante le ha anche tolto il fuoco
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.focus()
    }

    const pendingId = `chat-${crypto.randomUUID()}`
    const streamId = `stream-${crypto.randomUUID()}`
    let streamStarted = false
    setMessages((prev) => [
      ...prev,
      { id: pendingId, role: 'user', content, created_at: new Date().toISOString() },
    ])

    sendMutation.mutate(
      {
        avatarId,
        conversationId,
        content,
        onDelta: (text) => {
          if (!streamStarted) {
            streamStarted = true
            setStreamingReplyId(streamId)
            setMessages((prev) => [
              ...prev,
              {
                id: streamId,
                role: 'assistant',
                content: text,
                created_at: new Date().toISOString(),
              },
            ])
          } else {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamId ? { ...msg, content: msg.content + text } : msg,
              ),
            )
          }
        },
      },
      {
        onSuccess: (exchange) => {
          setStreamingReplyId(null)
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === pendingId
                ? exchange.user_message
                : msg.id === streamId
                  ? exchange.assistant_message
                  : msg,
            ),
          )
          setConversationId((prev) => prev ?? exchange.conversation_id)
        },
        onError: (err) => {
          // Il server non ha scritto niente: si tolgono il messaggio e la
          // risposta a metà, e il testo torna nella casella per riprovare
          setStreamingReplyId(null)
          setMessages((prev) => prev.filter((msg) => msg.id !== pendingId && msg.id !== streamId))
          setInput(content)
          setError(
            err instanceof Error
              ? `Impossibile inviare il messaggio: ${err.message}`
              : 'Impossibile inviare il messaggio.',
          )
        },
      },
    )
  }, [avatarId, conversationId, input, sendMutation, setConversationId, setError, setMessages])

  /* Chiudere la chat equivale a riagganciare: la trascrizione diventa
   * definitiva e il valutatore la giudica. */
  const end = useCallback(() => {
    if (!conversationId) {
      // Non è mai stato inviato niente: non c'è nessuna conversazione da chiudere
      reset()
      return
    }
    endMutation.mutate(conversationId, {
      onSuccess: () => {
        reset()
        onEnded(conversationId)
      },
      onError: (err) => {
        setError(
          err instanceof Error
            ? `Impossibile terminare la chat: ${err.message}`
            : 'Impossibile terminare la chat.',
        )
      },
    })
  }, [conversationId, endMutation, onEnded, reset, setError])

  return {
    started,
    input,
    setInput,
    inputRef,
    streamingReplyId,
    isSending: sendMutation.isPending,
    isEnding: endMutation.isPending,
    start,
    send,
    end,
    reset,
  }
}
