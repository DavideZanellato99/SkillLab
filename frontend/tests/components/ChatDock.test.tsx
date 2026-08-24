import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/components/VoiceButton', () => ({
  default: () => <button>Chiama</button>,
}))
vi.mock('../../src/components/CallRecordingPlayer', () => ({
  default: () => <div>Registrazione della Chiamata</div>,
}))

import ChatDock from '../../src/components/ChatDock'
import type { CallRecordingPlayerHandle } from '../../src/components/CallRecordingPlayer'
import type { Avatar } from '../../src/services/api'

/* La barra in fondo alla chat ha tre stati e non deve mai mostrarne due
 * insieme. Sbagliarli non dà nessun errore: dà un pulsante che riapre una
 * conversazione che il backend rifiuterà, o una casella di scrittura su una
 * trascrizione chiusa. */

const avatar = {
  id: 'av-1',
  name: 'Mario Rossi',
  image_url: '/static/avatars/mario.png',
  category: 'clienti',
  category_id: 'cat-1',
  category_color: 'orange',
  description: 'Cliente irritato',
  created_at: '2026-01-01T10:00:00Z',
  selection_count: 0,
} as Avatar

const chat = {
  input: '',
  setInput: vi.fn(),
  inputRef: createRef<HTMLTextAreaElement>(),
  isSending: false,
  isEnding: false,
  start: vi.fn(),
  send: vi.fn(),
  end: vi.fn(),
}

function renderDock(over: Partial<React.ComponentProps<typeof ChatDock>> = {}) {
  const props: React.ComponentProps<typeof ChatDock> = {
    avatar,
    avatarId: 'av-1',
    conversationId: null,
    mode: null,
    isClosed: false,
    isChatMode: false,
    canStartChat: true,
    voiceActive: false,
    recordingPlayerRef: createRef<CallRecordingPlayerHandle>(),
    chat: { ...chat },
    onNewConversation: vi.fn(),
    onVoiceConversationId: vi.fn(),
    onVoiceTranscript: vi.fn(),
    onVoiceError: vi.fn(),
    onVoiceSessionEnd: vi.fn(),
    onVoiceActiveChange: vi.fn(),
    ...over,
  }
  render(<ChatDock {...props} />)
  return props
}

describe('ChatDock a riposo', () => {
  it("offre entrambi i canali quando non c'è niente di aperto", () => {
    renderDock()
    expect(screen.getByRole('button', { name: 'Chiama' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chatta/ })).toBeInTheDocument()
  })

  it("nasconde Chatta quando c'è una trascrizione da continuare", () => {
    // Chatta apre sempre una conversazione nuova: proporlo qui vorrebbe dire
    // buttare via quella aperta senza dirlo
    renderDock({ canStartChat: false, conversationId: 'conv-1' })
    expect(screen.queryByRole('button', { name: /Chatta/ })).not.toBeInTheDocument()
  })

  it('ricorda che le chiamate vengono registrate, finché non se ne fa una', () => {
    renderDock()
    expect(screen.getByText(/vengono registrate/)).toBeInTheDocument()
  })

  it("durante la chiamata toglie quell'avviso, che lì lo dà il REC", () => {
    renderDock({ voiceActive: true, canStartChat: false })
    expect(screen.queryByText(/vengono registrate/)).not.toBeInTheDocument()
    expect(screen.getByText(/Chiamata in corso/)).toBeInTheDocument()
  })
})

describe('ChatDock in chat scritta', () => {
  it('mostra la casella e il pulsante che chiude', async () => {
    const props = renderDock({ isChatMode: true, conversationId: 'conv-1', mode: 'text' })

    expect(screen.getByPlaceholderText('Scrivi a Mario Rossi...')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Termina la Chat' }))
    expect(props.chat.end).toHaveBeenCalledOnce()
  })

  it('non lascia inviare una casella vuota', () => {
    renderDock({ isChatMode: true, conversationId: 'conv-1', mode: 'text' })
    expect(screen.getByRole('button', { name: 'Invia il Messaggio' })).toBeDisabled()
  })

  it('lascia inviare quando qualcosa è stato scritto', () => {
    renderDock({
      isChatMode: true,
      conversationId: 'conv-1',
      mode: 'text',
      chat: { ...chat, input: 'Buongiorno' },
    })
    expect(screen.getByRole('button', { name: 'Invia il Messaggio' })).toBeEnabled()
  })
})

describe('ChatDock a conversazione chiusa', () => {
  it('dice che è finita e offre solo di ricominciare', async () => {
    const props = renderDock({ isClosed: true, conversationId: 'conv-1', mode: 'text' })

    expect(screen.getByText(/non può essere ripresa/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Scrivi a/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Ricomincia/ }))
    expect(props.onNewConversation).toHaveBeenCalledOnce()
  })

  it('dopo una telefonata si può riascoltare la registrazione', () => {
    renderDock({ isClosed: true, conversationId: 'conv-1', mode: 'voice' })
    expect(screen.getByText('Registrazione della Chiamata')).toBeInTheDocument()
  })

  it("dopo una chat non c'è niente da riascoltare", () => {
    renderDock({ isClosed: true, conversationId: 'conv-1', mode: 'text' })
    expect(screen.queryByText('Registrazione della Chiamata')).not.toBeInTheDocument()
  })
})
