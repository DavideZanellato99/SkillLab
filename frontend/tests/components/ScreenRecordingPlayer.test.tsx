import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ScreenRecordingPlayer from '../../src/components/ScreenRecordingPlayer'
import type { ScreenRecordingInfo } from '../../src/services/simulations'

/* I tre stati che chi corregge deve distinguere a colpo d'occhio: c'è, era
 * prevista e non è arrivata, non era prevista. E il video che si muove solo
 * quando qualcuno preme. */

const info = (over: Partial<ScreenRecordingInfo> = {}): ScreenRecordingInfo => ({
  attempt_id: 'att-1',
  mime_type: 'video/webm',
  duration_ms: 187_000,
  size_bytes: 22 * 1024 * 1024,
  interrupted: false,
  created_at: '2026-03-01T09:00:00',
  ...over,
})

let fetchMock: ReturnType<typeof vi.fn>

describe('ScreenRecordingPlayer', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['video'], { type: 'video/webm' }),
      headers: new Headers({ 'content-type': 'video/webm' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:video'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('non compare su un tentativo che non prevedeva la registrazione', () => {
    const { container } = render(
      <ScreenRecordingPlayer attemptId="att-1" expected={false} info={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('dice quando la registrazione era prevista e non è arrivata', () => {
    render(<ScreenRecordingPlayer attemptId="att-1" expected info={null} />)

    expect(screen.getByText('Non pervenuta')).toBeInTheDocument()
    expect(screen.getByText(/il caricamento non è mai arrivato/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offre il video con durata e peso, senza scaricarlo', () => {
    render(<ScreenRecordingPlayer attemptId="att-1" expected info={info()} />)

    expect(
      screen.getByRole('button', { name: /Guarda la registrazione · 3:07 · 22\.0 MB/ }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('scarica il video solo quando si preme, e poi lo mostra', async () => {
    render(<ScreenRecordingPlayer attemptId="att-1" expected info={info()} />)

    await userEvent.click(screen.getByRole('button', { name: /Guarda la registrazione/ }))

    await waitFor(() =>
      expect(screen.getByLabelText('Registrazione dello schermo durante il test')).toHaveAttribute(
        'src',
        'blob:video',
      ),
    )
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/simulations/attempts/att-1/screen-recording',
    )
    expect(screen.getByRole('link', { name: /Scarica il Video/ })).toHaveAttribute(
      'download',
      'schermo-att-1.webm',
    )
  })

  it("segnala l'interruzione prima ancora di guardare il video", () => {
    render(<ScreenRecordingPlayer attemptId="att-1" expected info={info({ interrupted: true })} />)

    expect(screen.getByText('Interrotta prima della consegna')).toBeInTheDocument()
    expect(screen.getByText(/consegnato in quel momento/)).toBeInTheDocument()
  })
})
