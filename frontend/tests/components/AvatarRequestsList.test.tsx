import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* L'elenco delle richieste dentro la modale di un organization admin: cosa
 * elenca e cosa succede a una richiesta che si toglie di mezzo. Quali
 * richieste ci finiscono lo decide la modale, che ha i suoi test: qui
 * arrivano già scelte. */

const rimuovi = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
vi.mock('../../src/hooks/useAvatarRequests', () => ({
  useDeleteAvatarRequest: () => rimuovi,
}))

import type { AvatarRequest } from '../../src/services/avatarRequests'
import AvatarRequestsList from '../../src/components/AvatarRequestsList'

const richiesta = (over: Partial<AvatarRequest> = {}): AvatarRequest => ({
  id: 'r-1',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  category: 'Clienti',
  first_name: 'Giovanni',
  last_name: 'Salemmi',
  scenario_type: 'Reclamo',
  problem: 'Vede due addebiti uguali sulla carta.',
  status: 'pending',
  avatar_id: null,
  rejection_reason: null,
  resolved_at: null,
  created_at: '2026-03-01T10:00:00Z',
  created_by_email: 'admin@banca.it',
  updated_at: '2026-03-01T10:00:00Z',
  updated_by_email: 'admin@banca.it',
  ...over,
})

beforeEach(() => {
  rimuovi.mutateAsync.mockReset()
  rimuovi.mutateAsync.mockResolvedValue({ message: 'Richiesta per Giovanni Salemmi rimossa.' })
  rimuovi.reset.mockReset()
  rimuovi.error = null
})

describe('AvatarRequestsList', () => {
  it('chiusa, una riga dice solo nome e stato', () => {
    render(
      <AvatarRequestsList
        requests={[
          richiesta(),
          richiesta({
            id: 'r-2',
            first_name: 'Luisa',
            last_name: 'Bianchi',
            status: 'rejected',
            rejection_reason: 'Troppo simile a Rossi.',
          }),
        ]}
        onRemoved={() => {}}
      />,
    )

    expect(screen.getByText('Giovanni Salemmi')).toBeInTheDocument()
    expect(screen.getByText('In attesa')).toBeInTheDocument()
    expect(screen.getByText('Luisa Bianchi')).toBeInTheDocument()
    expect(screen.getByText('Rifiutata')).toBeInTheDocument()
    expect(screen.queryByText('Reclamo')).not.toBeInTheDocument()
    expect(screen.queryByText('Troppo simile a Rossi.')).not.toBeInTheDocument()
    expect(screen.queryByText('Vede due addebiti uguali sulla carta.')).not.toBeInTheDocument()
  })

  it('aprendola compaiono categoria, scenario, problematica, data e motivo del rifiuto', async () => {
    render(
      <AvatarRequestsList
        requests={[richiesta({ status: 'rejected', rejection_reason: 'Troppo simile a Rossi.' })]}
        onRemoved={() => {}}
      />,
    )

    const toggle = screen.getByRole('button', { name: 'Mostra i dettagli di Giovanni Salemmi' })
    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Clienti')).toBeInTheDocument()
    expect(screen.getByText('Reclamo')).toBeInTheDocument()
    expect(screen.getByText('Vede due addebiti uguali sulla carta.')).toBeInTheDocument()
    expect(screen.getByText('Inviata il')).toBeInTheDocument()
    expect(screen.getByText('Troppo simile a Rossi.')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Nascondi i dettagli di Giovanni Salemmi' }),
    )
    expect(screen.queryByText('Reclamo')).not.toBeInTheDocument()
  })

  it('una richiesta in attesa aperta non ha la voce del motivo', async () => {
    render(<AvatarRequestsList requests={[richiesta()]} onRemoved={() => {}} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Mostra i dettagli di Giovanni Salemmi' }),
    )

    expect(screen.queryByText('Motivo del rifiuto')).not.toBeInTheDocument()
  })

  it('ritira una richiesta in attesa dopo la conferma e consegna il messaggio', async () => {
    const onRemoved = vi.fn()
    render(<AvatarRequestsList requests={[richiesta()]} onRemoved={onRemoved} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Ritira la richiesta per Giovanni Salemmi' }),
    )
    expect(screen.getByText('Ritira la Richiesta')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ritira' }))

    expect(rimuovi.mutateAsync).toHaveBeenCalledWith('r-1')
    expect(onRemoved).toHaveBeenCalledWith('Richiesta per Giovanni Salemmi rimossa.')
    expect(screen.queryByText('Ritira la Richiesta')).not.toBeInTheDocument()
  })

  it('una richiesta rifiutata si rimuove, non si ritira', async () => {
    render(
      <AvatarRequestsList
        requests={[richiesta({ status: 'rejected', rejection_reason: 'No.' })]}
        onRemoved={() => {}}
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Rimuovi la richiesta per Giovanni Salemmi' }),
    )

    expect(screen.getByText('Rimuovi la Richiesta')).toBeInTheDocument()
  })
})
