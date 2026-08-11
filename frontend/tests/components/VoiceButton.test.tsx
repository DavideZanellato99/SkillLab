/* Il microfono non si apre prima dell'avviso.
 *
 * È l'unica proprietà che conta di questo componente ai fini dell'art. 13, e
 * l'unica che una modale può perdere in silenzio: basta che qualcuno sposti
 * la chiamata a `connect()` un rigo più su e l'avviso diventa decorativo,
 * senza che niente si rompa a schermo.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import VoiceButton from '../../src/components/VoiceButton'

const connect = vi.fn().mockResolvedValue(undefined)
const startVoiceSession = vi.fn().mockResolvedValue({
  session_id: 'sess-1',
  conversation_id: 'conv-1',
})

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'utente-1' } }),
}))

vi.mock('../../src/services/voice', () => ({
  startVoiceSession: (...args: unknown[]) => startVoiceSession(...args),
  uploadRecording: vi.fn(),
}))

vi.mock('../../src/services/ringtone', () => ({
  startRingback: () => ({ stop: vi.fn() }),
}))

vi.mock('../../src/services/voiceCall', () => ({
  VoiceCall: class {
    connect = connect
    start = vi.fn()
    disconnect = vi.fn()
    recording = vi.fn().mockResolvedValue(null)
  },
}))

/* Deve restare allineata a VoiceButton.RING_DURATION_MS: il REC arriva
 * quando lo squillo finisce, non prima. */
const RING_DURATION_MS = 4000

const props = {
  avatarId: 'avatar-1',
  conversationId: null,
  onConversationId: vi.fn(),
  onTranscript: vi.fn(),
  onError: vi.fn(),
  onSessionEnd: vi.fn(),
  onActiveChange: vi.fn(),
}

// L'etichetta usa l'apostrofo tipografico: cercata per regex, non a lettera
const callButton = () => screen.getByRole('button', { name: /^Chiama l/ })

describe('VoiceButton, avviso di registrazione', () => {
  beforeEach(() => {
    localStorage.clear()
    connect.mockClear()
    startVoiceSession.mockClear()
  })

  it('mostra l’avviso e NON apre il microfono al primo click', async () => {
    render(<VoiceButton {...props} />)

    await userEvent.click(callButton())

    expect(screen.getByText('Questa chiamata viene registrata')).toBeInTheDocument()
    expect(connect).not.toHaveBeenCalled()
    expect(startVoiceSession).not.toHaveBeenCalled()
  })

  it('annullando, la chiamata non parte', async () => {
    render(<VoiceButton {...props} />)

    await userEvent.click(callButton())
    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }))

    expect(screen.queryByText('Questa chiamata viene registrata')).not.toBeInTheDocument()
    expect(connect).not.toHaveBeenCalled()
  })

  it('dopo la conferma la chiamata parte', async () => {
    render(<VoiceButton {...props} />)

    await userEvent.click(callButton())
    await userEvent.click(screen.getByRole('button', { name: /Ho capito/ }))

    await waitFor(() => expect(connect).toHaveBeenCalledOnce())
  })

  it('non ripropone l’avviso a chi lo ha già letto', async () => {
    render(<VoiceButton {...props} />)
    await userEvent.click(callButton())
    await userEvent.click(screen.getByRole('button', { name: /Ho capito/ }))
    await waitFor(() => expect(connect).toHaveBeenCalledOnce())

    // Riaggancia e richiama: l'avviso è già stato letto da questo utente
    connect.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Riaggancia' }))
    await userEvent.click(callButton())

    expect(screen.queryByText('Questa chiamata viene registrata')).not.toBeInTheDocument()
    await waitFor(() => expect(connect).toHaveBeenCalledOnce())
  })

  it('mostra il REC solo da chiamata connessa, non durante lo squillo', async () => {
    render(<VoiceButton {...props} />)
    expect(screen.queryByText('Registrazione in corso')).not.toBeInTheDocument()

    await userEvent.click(callButton())
    await userEvent.click(screen.getByRole('button', { name: /Ho capito/ }))

    // Mentre squilla il microfono è aperto ma il recorder non è partito
    await waitFor(() => expect(screen.getByText('Sta squillando...')).toBeInTheDocument())
    expect(screen.queryByText('Registrazione in corso')).not.toBeInTheDocument()

    // Il REC arriva quando la registrazione parte davvero, a squillo finito
    await waitFor(() => expect(screen.getByText('Registrazione in corso')).toBeInTheDocument(), {
      timeout: RING_DURATION_MS + 2000,
    })
  })
})
