import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* La pagina della galleria: a chi compare il pulsante con cui si chiede un
 * avatar al super admin, e la modale che apre. Testata, galleria e modale
 * hanno i loro test. */

const sessione = vi.hoisted(() => ({ ruolo: 'user' }))
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', ruolo: sessione.ruolo } }),
}))
vi.mock('../../src/components/Header', () => ({
  default: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}))
vi.mock('../../src/components/AvatarGallery', () => ({
  default: () => <div>galleria</div>,
}))
vi.mock('../../src/components/AvatarRequestModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>chiudi la modale</button>
  ),
}))

import HomePage from '../../src/components/HomePage'

beforeEach(() => {
  sessione.ruolo = 'user'
})

describe('HomePage', () => {
  it('a chi amministra la propria organizzazione offre di chiedere un avatar', async () => {
    sessione.ruolo = 'organization_admin'
    render(<HomePage />)

    expect(screen.getByText('galleria')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chiudi la modale' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Richiedi un Avatar' }))
    expect(screen.getByRole('button', { name: 'chiudi la modale' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'chiudi la modale' }))
    expect(screen.queryByRole('button', { name: 'chiudi la modale' })).not.toBeInTheDocument()
  })

  it('a chi si allena non lo offre', () => {
    render(<HomePage />)

    expect(screen.queryByRole('button', { name: 'Richiedi un Avatar' })).not.toBeInTheDocument()
  })

  it('al super admin non lo offre', () => {
    sessione.ruolo = 'super_admin'
    render(<HomePage />)

    expect(screen.queryByRole('button', { name: 'Richiedi un Avatar' })).not.toBeInTheDocument()
  })
})
