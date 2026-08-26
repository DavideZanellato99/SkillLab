import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Il dettaglio in sola lettura di un avatar: cosa dice della voce, e da dove
 * si passa alla scheda modificabile.
 *
 * La voce era un identificativo di trentasei caratteri, che non dice con che
 * voce parla il personaggio: il nome sta soltanto nel catalogo del fornitore,
 * e qui si controlla che ci arrivi. */

const catalogo = vi.hoisted(() => ({
  data: undefined as { id: string; name: string }[] | undefined,
  isSuccess: false,
}))
vi.mock('../../src/hooks/useAdminAvatars', () => ({
  useVoices: () => catalogo,
}))

import type { AdminAvatar } from '../../src/services/admin'
import AvatarDetailModal from '../../src/components/AvatarDetailModal'

const avatar = (over: Partial<AdminAvatar> = {}): AdminAvatar =>
  ({
    id: 'av-1',
    name: 'Mario Rossi',
    image_url: '/static/avatars/mario.png',
    category: 'Clienti',
    category_id: 'cat-1',
    category_color: 'orange',
    description: 'Cliente irritato',
    voice_id: 'b34ba556-0000',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    conversation_count: 3,
    deleted_at: null,
    profile: { NOME: 'Mario', COGNOME: 'Rossi' },
    created_at: '2026-01-01T10:00:00Z',
    created_by_email: 'sistema',
    updated_at: '2026-01-01T10:00:00Z',
    updated_by_email: 'sistema',
    ...over,
  }) as AdminAvatar

function renderModal(over: Partial<AdminAvatar> = {}, onEdit?: () => void) {
  render(<AvatarDetailModal avatar={avatar(over)} onClose={() => {}} onEdit={onEdit} />)
}

describe('AvatarDetailModal', () => {
  beforeEach(() => {
    catalogo.data = [{ id: 'b34ba556-0000', name: 'Sofia' }]
    catalogo.isSuccess = true
  })

  it('dice con che voce parla, non solo il suo identificativo', () => {
    renderModal()

    expect(screen.getByText('Sofia')).toBeInTheDocument()
    // L'identificativo resta: è quello che si incolla altrove
    expect(screen.getByText('b34ba556-0000')).toBeInTheDocument()
  })

  it('dice che la voce non è più in catalogo quando il fornitore non la porta più', () => {
    catalogo.data = [{ id: 'un-altra', name: 'Giulia' }]

    renderModal()

    expect(screen.getByText('Non più nel catalogo delle voci')).toBeInTheDocument()
    expect(screen.getByText('b34ba556-0000')).toBeInTheDocument()
  })

  /* Finché il catalogo non è arrivato l'identificativo da solo è comunque la
   * verità: dire "non è in catalogo" prima di averlo letto sarebbe falso. */
  it("non dichiara niente sulla voce finché il catalogo non c'è", () => {
    catalogo.data = undefined
    catalogo.isSuccess = false

    renderModal()

    expect(screen.queryByText('Non più nel catalogo delle voci')).not.toBeInTheDocument()
    expect(screen.getByText('b34ba556-0000')).toBeInTheDocument()
  })

  it('per un avatar senza voce dice che userà quella predefinita', () => {
    renderModal({ voice_id: null })

    expect(screen.getByText('Voce Predefinita')).toBeInTheDocument()
  })

  it('porta alla scheda modificabile senza tornare a cercare la matita', async () => {
    const onEdit = vi.fn()
    renderModal({}, onEdit)

    await userEvent.click(screen.getByRole('button', { name: 'Modifica Avatar' }))

    expect(onEdit).toHaveBeenCalledOnce()
  })

  /* Un avatar archiviato è il documento di ciò su cui gli studenti si sono
   * allenati: si ripristina e poi si modifica, e il server dice lo stesso con
   * un 409. Offrire qui la modifica sarebbe una porta che non si apre. */
  it('non offre la modifica di un avatar archiviato', () => {
    renderModal({ deleted_at: '2026-02-01T10:00:00Z' }, vi.fn())

    expect(screen.queryByRole('button', { name: 'Modifica Avatar' })).not.toBeInTheDocument()
    expect(screen.getByText('Archiviato')).toBeInTheDocument()
  })
})
