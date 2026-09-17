import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* La pagina della galleria: a chi compare il pulsante con cui si chiede un
 * avatar al super admin, e il filo che lo lega alla modale nel pannello
 * sotto. Testata, galleria e pannello hanno i loro test. */

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
vi.mock('../../src/components/AvatarRequestsPanel', () => ({
  default: ({
    isRequesting,
    onCloseRequest,
  }: {
    isRequesting: boolean
    onCloseRequest: () => void
  }) => (
    <div>
      pannello delle richieste
      {isRequesting && <button onClick={onCloseRequest}>chiudi la modale</button>}
    </div>
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

    expect(screen.getByText('pannello delle richieste')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chiudi la modale' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Richiedi un Avatar' }))
    expect(screen.getByRole('button', { name: 'chiudi la modale' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'chiudi la modale' }))
    expect(screen.queryByRole('button', { name: 'chiudi la modale' })).not.toBeInTheDocument()
  })

  it('a chi si allena non lo offre', () => {
    render(<HomePage />)

    expect(screen.queryByRole('button', { name: 'Richiedi un Avatar' })).not.toBeInTheDocument()
    expect(screen.queryByText('pannello delle richieste')).not.toBeInTheDocument()
  })

  it('al super admin non lo offre', () => {
    sessione.ruolo = 'super_admin'
    render(<HomePage />)

    expect(screen.queryByRole('button', { name: 'Richiedi un Avatar' })).not.toBeInTheDocument()
    expect(screen.queryByText('pannello delle richieste')).not.toBeInTheDocument()
  })
})
