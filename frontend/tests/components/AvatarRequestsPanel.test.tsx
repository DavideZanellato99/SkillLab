import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* L'elenco delle richieste nella galleria di un organization admin: cosa
 * elenca, quando non c'è, e cosa succede a una richiesta che si toglie di
 * mezzo. La modale con il form ha i suoi test, e il pulsante che la apre sta
 * nella pagina: qui basta sapere che la conferma di invio arriva sullo
 * schermo. */

const stato = vi.hoisted(() => ({
  richieste: [] as unknown[],
}))
const rimuovi = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
vi.mock('../../src/hooks/useAvatarRequests', () => ({
  useAvatarRequests: () => ({ data: stato.richieste }),
  useDeleteAvatarRequest: () => rimuovi,
}))
vi.mock('../../src/components/AvatarRequestModal', () => ({
  default: ({ onSent }: { onSent: (r: unknown) => void }) => (
    <div>
      modale di richiesta
      <button onClick={() => onSent({ first_name: 'Luisa', last_name: 'Bianchi' })}>invia</button>
    </div>
  ),
}))

import type { AvatarRequest } from '../../src/services/avatarRequests'
import AvatarRequestsPanel from '../../src/components/AvatarRequestsPanel'

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
  stato.richieste = []
  rimuovi.mutateAsync.mockReset()
  rimuovi.mutateAsync.mockResolvedValue({ message: 'Richiesta per Giovanni Salemmi rimossa.' })
  rimuovi.reset.mockReset()
  rimuovi.error = null
})

describe('AvatarRequestsPanel', () => {
  it('senza richieste non compare', () => {
    render(<AvatarRequestsPanel isRequesting={false} onCloseRequest={() => {}} />)

    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('elenca le richieste in attesa e quelle rifiutate, non le pubblicate', () => {
    stato.richieste = [
      richiesta(),
      richiesta({
        id: 'r-2',
        first_name: 'Luisa',
        last_name: 'Bianchi',
        status: 'rejected',
        rejection_reason: 'Troppo simile a Rossi.',
      }),
      richiesta({ id: 'r-3', first_name: 'Mario', last_name: 'Verdi', status: 'published' }),
    ]
    render(<AvatarRequestsPanel isRequesting={false} onCloseRequest={() => {}} />)

    expect(screen.getByText('Giovanni Salemmi')).toBeInTheDocument()
    expect(screen.getByText('In attesa')).toBeInTheDocument()
    expect(screen.getByText('Luisa Bianchi')).toBeInTheDocument()
    expect(screen.getByText('Rifiutata')).toBeInTheDocument()
    expect(screen.getByText('Motivo: Troppo simile a Rossi.')).toBeInTheDocument()
    expect(screen.queryByText('Mario Verdi')).not.toBeInTheDocument()
  })

  it('conferma l’invio dalla modale e chiude', async () => {
    const chiudi = vi.fn()
    render(<AvatarRequestsPanel isRequesting onCloseRequest={chiudi} />)
    expect(screen.getByText('modale di richiesta')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'invia' }))

    expect(chiudi).toHaveBeenCalled()
    expect(screen.getByText(/Richiesta per Luisa Bianchi inviata/)).toBeInTheDocument()
  })

  it('ritira una richiesta in attesa dopo la conferma', async () => {
    stato.richieste = [richiesta()]
    render(<AvatarRequestsPanel isRequesting={false} onCloseRequest={() => {}} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Ritira la richiesta per Giovanni Salemmi' }),
    )
    expect(screen.getByText('Ritira la Richiesta')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ritira' }))

    expect(rimuovi.mutateAsync).toHaveBeenCalledWith('r-1')
    expect(await screen.findByText('Richiesta per Giovanni Salemmi rimossa.')).toBeInTheDocument()
  })

  it('una richiesta rifiutata si rimuove, non si ritira', async () => {
    stato.richieste = [richiesta({ status: 'rejected', rejection_reason: 'No.' })]
    render(<AvatarRequestsPanel isRequesting={false} onCloseRequest={() => {}} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Rimuovi la richiesta per Giovanni Salemmi' }),
    )

    expect(screen.getByText('Rimuovi la Richiesta')).toBeInTheDocument()
  })
})
