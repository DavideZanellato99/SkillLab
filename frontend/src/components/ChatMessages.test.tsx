import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Avatar, ChatMessage, MessageAnnotation } from '../services/api'
import ChatMessages from './ChatMessages'

const avatar = {
  id: 'a-1',
  name: 'Cliente arrabbiato',
  image_url: '/static/avatars/a-1.png',
  description: 'Chiama per un addebito che non riconosce',
} as Avatar

const messaggi: ChatMessage[] = [
  { id: 'm-1', role: 'user', content: 'Buongiorno', created_at: '2026-03-01T10:00:00Z' },
  { id: 'm-2', role: 'assistant', content: 'Mi dica', created_at: '2026-03-01T10:00:05Z' },
]

function renderMessages(over: Partial<Parameters<typeof ChatMessages>[0]> = {}) {
  render(
    <ChatMessages
      avatar={avatar}
      messages={messaggi}
      isLoadingConversation={false}
      isReplying={false}
      streamingReplyId={null}
      highlightedMessageId={null}
      registerMessageNode={vi.fn()}
      annotationsByMessage={new Map()}
      {...over}
    />,
  )
}

describe('ChatMessages', () => {
  it('mostra le bolle della conversazione', () => {
    renderMessages()

    expect(screen.getByText('Buongiorno')).toBeInTheDocument()
    expect(screen.getByText('Mi dica')).toBeInTheDocument()
  })

  /* A conversazione vuota si presenta l'avatar: è lì che si legge la
   * differenza fra la telefonata e la chat scritta, cioè prima di sceglierne
   * una, non dopo. */
  it("presenta l'avatar finché non è stato detto niente", () => {
    renderMessages({ messages: [] })

    expect(
      screen.getByRole('heading', { name: /Parla con Cliente arrabbiato/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/avvia una telefonata simulata/)).toBeInTheDocument()
    expect(screen.getByText(/in chat anziché al telefono/)).toBeInTheDocument()
  })

  /* Mentre la trascrizione sta arrivando non si presenta l'avatar: sarebbe
   * un invito a cominciare da capo una conversazione che esiste già. */
  it("non presenta l'avatar mentre la trascrizione si carica", () => {
    renderMessages({ messages: [], isLoadingConversation: true })

    expect(screen.queryByRole('heading', { name: /Parla con/ })).not.toBeInTheDocument()
  })

  it("mostra i puntini mentre l'avatar compone la risposta", () => {
    const { container } = render(
      <ChatMessages
        avatar={avatar}
        messages={messaggi}
        isLoadingConversation={false}
        isReplying
        streamingReplyId={null}
        highlightedMessageId={null}
        registerMessageNode={vi.fn()}
        annotationsByMessage={new Map()}
      />,
    )

    expect(container.querySelectorAll('.animate-typing-bounce').length).toBeGreaterThan(0)
  })

  /* Appena arriva il primo frammento i puntini lasciano il posto alla bolla
   * che cresce: tenerli accesi mostrerebbe l'avatar che scrive due volte. */
  it('spegne i puntini quando la risposta ha cominciato ad arrivare', () => {
    const { container } = render(
      <ChatMessages
        avatar={avatar}
        messages={messaggi}
        isLoadingConversation={false}
        isReplying
        streamingReplyId="m-3"
        highlightedMessageId={null}
        registerMessageNode={vi.fn()}
        annotationsByMessage={new Map()}
      />,
    )

    expect(container.querySelectorAll('.animate-typing-bounce')).toHaveLength(0)
  })

  it('appunta la nota del docente sulla riga di cui parla', () => {
    const nota: MessageAnnotation = {
      id: 'n-1',
      message_id: 'm-1',
      note: 'Qui potevi ascoltare di più',
      reviewer_name: 'Anna Rossi',
      created_at: '2026-03-02T10:00:00Z',
      updated_at: '2026-03-02T10:00:00Z',
    }
    renderMessages({ annotationsByMessage: new Map([['m-1', nota]]) })

    expect(screen.getByText('Qui potevi ascoltare di più')).toBeInTheDocument()
  })

  /* Ogni bolla lascia il proprio nodo alla pagella: è così che le pastiglie
   * "Messaggio n" ritrovano la riga da portare in vista. */
  it('registra il nodo di ogni bolla', () => {
    const registerMessageNode = vi.fn()
    renderMessages({ registerMessageNode })

    expect(registerMessageNode).toHaveBeenCalledWith('m-1', expect.anything())
    expect(registerMessageNode).toHaveBeenCalledWith('m-2', expect.anything())
  })
})
