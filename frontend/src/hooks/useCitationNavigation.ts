/* Dalle citazioni della valutazione al punto della trascrizione di cui
 * parlano.
 *
 * Le pastiglie "Messaggio n" della pagella devono poter raggiungere la riga
 * che le ha originate, quindi ogni bolla lascia qui il proprio nodo del DOM
 * mentre è montata. L'evidenziazione dura pochi secondi e il suo timer è uno
 * solo: due citazioni cliccate di seguito non devono spegnersi a vicenda. */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ChatMessage, EvaluationCitation } from '../services/api'

const HIGHLIGHT_MS = 2500

export function useCitationNavigation(messages: ChatMessage[]) {
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  /* Tiene (o toglie) il nodo di una bolla: MessageBubble lo passa quando si
   * monta e passa null quando se ne va. */
  const registerMessageNode = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
  }, [])

  /* L'indice di una citazione è la posizione, a partire da 1, nella
   * trascrizione valutata, che è lo stesso ordine dei messaggi salvati:
   * l'id è l'àncora principale, l'indice quella di riserva (le bolle di una
   * chiamata appena chiusa possono ancora avere id locali). */
  const resolveCitation = useCallback(
    (citation: EvaluationCitation): ChatMessage | null =>
      messages.find((m) => m.id === citation.message_id) ?? messages[citation.index - 1] ?? null,
    [messages],
  )

  const flashMessage = useCallback((message: ChatMessage) => {
    nodes.current.get(message.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(message.id)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setHighlightedMessageId(null), HIGHLIGHT_MS)
  }, [])

  return { highlightedMessageId, registerMessageNode, resolveCitation, flashMessage }
}
