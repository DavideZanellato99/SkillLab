import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import MessageBubble from '../../src/components/MessageBubble'
import type { ChatMessage } from '../../src/services/api'

const userMsg: ChatMessage = {
  id: 'm1',
  role: 'user',
  content: 'Buongiorno, come posso aiutarla?',
  created_at: '2026-03-05T09:05:00Z',
}

const assistantMsg: ChatMessage = {
  id: 'm2',
  role: 'assistant',
  content: 'Ho un problema con la fattura.',
  created_at: '2026-03-05T09:06:00Z',
}

describe('MessageBubble', () => {
  it('renders the message text', () => {
    render(
      <MessageBubble
        message={userMsg}
        index={0}
        avatarImageUrl="/x.png"
        avatarName="Mario"
        isHighlighted={false}
        registerNode={() => {}}
      />,
    )
    expect(screen.getByText('Buongiorno, come posso aiutarla?')).toBeInTheDocument()
  })

  it('shows the avatar image only for assistant messages', () => {
    const { rerender } = render(
      <MessageBubble
        message={assistantMsg}
        index={0}
        avatarImageUrl="/x.png"
        avatarName="Mario"
        isHighlighted={false}
        registerNode={() => {}}
      />,
    )
    expect(screen.getByRole('img', { name: 'Mario' })).toBeInTheDocument()

    rerender(
      <MessageBubble
        message={userMsg}
        index={0}
        avatarImageUrl="/x.png"
        avatarName="Mario"
        isHighlighted={false}
        registerNode={() => {}}
      />,
    )
    expect(screen.queryByRole('img', { name: 'Mario' })).not.toBeInTheDocument()
  })

  it('registers its DOM node under the message id', () => {
    const registerNode = vi.fn()
    render(
      <MessageBubble
        message={userMsg}
        index={0}
        avatarImageUrl="/x.png"
        avatarName="Mario"
        isHighlighted={false}
        registerNode={registerNode}
      />,
    )
    expect(registerNode).toHaveBeenCalledWith('m1', expect.any(HTMLElement))
  })
})
