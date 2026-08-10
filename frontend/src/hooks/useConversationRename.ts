/* Rinominare una conversazione scrivendo sul suo titolo, nella barra
 * laterale o nel pannello espanso.
 *
 * Il titolo è obbligatorio: un nome vuoto viene scartato e resta quello di
 * prima. Esc smonta il campo, e smontarlo scatena anche il suo blur: senza
 * il flag qui sotto, annullare finirebbe per salvare. */

import { useCallback, useRef, useState } from 'react'

import { useRenameConversation } from './useConversations'

interface RenamableConversation {
  id: string
  title: string
}

export function useConversationRename() {
  const mutation = useRenameConversation()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const cancelled = useRef(false)

  const start = useCallback((conversation: RenamableConversation, e: React.MouseEvent) => {
    e.stopPropagation()
    cancelled.current = false
    setRenamingId(conversation.id)
    setRenameValue(conversation.title)
  }, [])

  const commit = useCallback(
    (conversation: RenamableConversation) => {
      if (cancelled.current) return
      const title = renameValue.trim()
      setRenamingId(null)
      if (title && title !== conversation.title) {
        mutation.mutate({ conversationId: conversation.id, title })
      }
    },
    [renameValue, mutation],
  )

  const cancel = useCallback(() => {
    cancelled.current = true
    setRenamingId(null)
  }, [])

  return { renamingId, renameValue, setRenameValue, start, commit, cancel, mutation }
}
