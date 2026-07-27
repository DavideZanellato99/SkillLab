import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ConfirmModal from './ConfirmModal'

const baseProps = {
  icon: <svg data-testid="icon" />,
  iconWrapperCls: 'border',
  title: 'Elimina Utente',
  description: 'Azione irreversibile',
  confirmLabel: 'Elimina',
  pendingLabel: 'Eliminazione...',
  confirmClassName: 'bg-red-500',
  isPending: false,
  onConfirm: () => {},
  onClose: () => {},
}

describe('ConfirmModal', () => {
  it('renders title, description and the confirm label', () => {
    render(<ConfirmModal {...baseProps} />)
    expect(screen.getByText('Elimina Utente')).toBeInTheDocument()
    expect(screen.getByText('Azione irreversibile')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeInTheDocument()
  })

  it('fires onConfirm and onClose from the two buttons', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmModal {...baseProps} onConfirm={onConfirm} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Elimina' }))
    expect(onConfirm).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows the pending label and locks every action while pending', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmModal {...baseProps} isPending onConfirm={onConfirm} onClose={onClose} />)

    expect(screen.getByText('Eliminazione...')).toBeInTheDocument()
    // Confirm, cancel and close are all disabled: nothing interrupts the action
    await userEvent.click(screen.getByRole('button', { name: /Eliminazione/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders an error banner when error is set', () => {
    render(<ConfirmModal {...baseProps} error="Qualcosa è andato storto" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Qualcosa è andato storto')
  })
})
