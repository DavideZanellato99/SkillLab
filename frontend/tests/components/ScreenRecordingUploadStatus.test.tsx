import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ScreenRecordingUploadStatus from '../../src/components/ScreenRecordingUploadStatus'

/* Dopo la consegna il video sale da solo: chi ha finito il test deve leggere
 * se sta salendo, se è salito, o se non è salito e può riprovare. */

const base = {
  interrupted: false,
  empty: false,
  isPending: false,
  isSuccess: false,
  error: '',
  onRetry: vi.fn(),
}

describe('ScreenRecordingUploadStatus', () => {
  it('dice di non chiudere la pagina finché il video sale', () => {
    render(<ScreenRecordingUploadStatus {...base} isPending />)
    expect(screen.getByText(/non chiudere la pagina/)).toBeInTheDocument()
  })

  it('conferma il caricamento riuscito', () => {
    render(<ScreenRecordingUploadStatus {...base} isSuccess />)
    expect(screen.getByText('Registrazione caricata insieme al tentativo.')).toBeInTheDocument()
  })

  it('su un errore offre di riprovare senza perdere il test', async () => {
    const onRetry = vi.fn()
    render(<ScreenRecordingUploadStatus {...base} error="Rete assente" onRetry={onRetry} />)

    expect(screen.getByText('Rete assente')).toBeInTheDocument()
    expect(screen.getByText(/Il test è stato consegnato, la registrazione no/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Riprova il Caricamento' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it("spiega l'interruzione e il video mancante", () => {
    render(<ScreenRecordingUploadStatus {...base} interrupted empty />)

    expect(screen.getByText(/è stata interrotta/)).toBeInTheDocument()
    expect(screen.getByText(/non ha prodotto nessuna registrazione/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
