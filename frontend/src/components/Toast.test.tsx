import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import Toast from './Toast'

describe('Toast', () => {
  it('renders the title and message', () => {
    render(<Toast title="Fatto" message="Avatar salvato" type="success" onClose={() => {}} />)
    expect(screen.getByText('Fatto')).toBeInTheDocument()
    expect(screen.getByText('Avatar salvato')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    render(<Toast title="Errore" message="Qualcosa è andato storto" type="error" onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi notifica' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
