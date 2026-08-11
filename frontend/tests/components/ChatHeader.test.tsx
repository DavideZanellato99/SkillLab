import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Avatar, ConversationEvaluation } from '../../src/services/api'
import ChatHeader from '../../src/components/ChatHeader'

const avatar = {
  id: 'a-1',
  name: 'Cliente arrabbiato',
  image_url: '/static/avatars/a-1.png',
} as Avatar

const valutazione = (over: Partial<ConversationEvaluation> = {}): ConversationEvaluation =>
  ({
    id: 'e-1',
    conversation_id: 'c-1',
    overall_score: 6.4,
    final_score: 8.5,
    summary: 'Buona gestione',
    criteria: [],
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    ...over,
  }) as ConversationEvaluation

function renderHeader(
  over: { title?: string | null; evaluation?: ConversationEvaluation | null } = {},
) {
  const onOpenDetail = vi.fn()
  render(
    <ChatHeader
      avatar={avatar}
      title={over.title ?? null}
      evaluation={over.evaluation ?? null}
      onOpenDetail={onOpenDetail}
    />,
  )
  return onOpenDetail
}

describe('ChatHeader', () => {
  it('dice con chi si sta parlando', () => {
    renderHeader()

    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
  })

  it('mostra il titolo della conversazione aperta', () => {
    renderHeader({ title: 'Clienti 3' })

    expect(screen.getByText('Clienti 3')).toBeInTheDocument()
  })

  it('non lascia una riga vuota quando nessuna conversazione è aperta', () => {
    renderHeader()

    expect(screen.queryByText('Clienti 3')).not.toBeInTheDocument()
  })

  /* Il numero sulla pastiglia è il voto finale, correzione del docente
   * inclusa: qui e nella pagella deve comparire lo stesso, o la testata
   * direbbe una cosa e il dettaglio un'altra sulla stessa conversazione. */
  it('mostra il voto finale e non quello proposto dalla macchina', () => {
    renderHeader({ evaluation: valutazione() })

    const pastiglia = screen.getByRole('button', { name: /Valutazione/ })
    expect(pastiglia).toHaveTextContent('8,5')
    expect(pastiglia).not.toHaveTextContent('6,4')
  })

  it('non mostra nessuna pastiglia su una conversazione non valutata', () => {
    renderHeader({ title: 'Clienti 3' })

    expect(screen.queryByRole('button', { name: /Valutazione/ })).not.toBeInTheDocument()
  })

  it('apre il dettaglio della valutazione', async () => {
    const onOpenDetail = renderHeader({ evaluation: valutazione() })

    await userEvent.click(screen.getByRole('button', { name: /Valutazione/ }))

    expect(onOpenDetail).toHaveBeenCalledOnce()
  })
})
