import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AdminAvatar } from '../../src/services/admin'
import AvatarRow from '../../src/components/AvatarRow'

const avatar = (over: Partial<AdminAvatar> = {}): AdminAvatar =>
  ({
    id: 'a-1',
    name: 'Cliente arrabbiato',
    image_url: '/static/avatars/a-1.png',
    category: 'Clienti',
    category_id: 'cat-1',
    category_color: 'violet',
    description: 'Chiama per un addebito',
    difficulty: '8/10',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    conversation_count: 12,
    deleted_at: null,
    profile: {},
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    ...over,
  }) as AdminAvatar

function renderRow(over: Partial<AdminAvatar> = {}, isRestoring = false) {
  const azioni = {
    onView: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onRestore: vi.fn(),
  }
  render(
    <table>
      <tbody>
        <AvatarRow avatar={avatar(over)} isRestoring={isRestoring} {...azioni} />
      </tbody>
    </table>,
  )
  return azioni
}

describe('AvatarRow', () => {
  it("dice chi è l'avatar, di chi è e quanto ha lavorato", () => {
    renderRow()

    expect(screen.getByText('Cliente arrabbiato')).toBeInTheDocument()
    expect(screen.getByText('Chiama per un addebito')).toBeInTheDocument()
    expect(screen.getByText('Banca Esempio')).toBeInTheDocument()
    expect(screen.getByText('Clienti')).toBeInTheDocument()
    expect(screen.getByText('8/10')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  /* La difficoltà è un campo che può restare vuoto: al suo posto va un
   * trattino, non uno zero, che sarebbe un grado di difficoltà. */
  it('mette un trattino dove la scheda non dice la difficoltà', () => {
    renderRow({ difficulty: null })

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('apre la scheda con un clic sulla riga', async () => {
    const { onView } = renderRow()

    await userEvent.click(screen.getByText('Cliente arrabbiato'))

    expect(onView).toHaveBeenCalledOnce()
  })

  it('le azioni non aprono anche la scheda sotto di loro', async () => {
    const { onEdit, onDelete, onView } = renderRow()

    await userEvent.click(screen.getByRole('button', { name: 'Modifica Cliente arrabbiato' }))
    await userEvent.click(screen.getByRole('button', { name: 'Elimina Cliente arrabbiato' }))

    expect(onEdit).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onView).not.toHaveBeenCalled()
  })
})

/* Un avatar archiviato ha una sola azione, tornare in catalogo: la sua
 * scheda è il documento di ciò su cui gli studenti si sono allenati, e
 * modificarla o rieliminarla riscriverebbe quel documento. */
describe('avatar archiviato', () => {
  const archiviato = { deleted_at: '2026-02-01T10:00:00Z' }

  it('si riconosce e dice da quando', () => {
    renderRow(archiviato)

    expect(screen.getByText('Archiviato')).toBeInTheDocument()
    expect(screen.getByText('Archiviato il 01/02/2026')).toBeInTheDocument()
  })

  it('offre solo il ripristino', () => {
    renderRow(archiviato)

    expect(
      screen.getByRole('button', { name: 'Ripristina Cliente arrabbiato' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Modifica Cliente arrabbiato' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Elimina Cliente arrabbiato' }),
    ).not.toBeInTheDocument()
  })

  it("riporta l'avatar in catalogo", async () => {
    const { onRestore } = renderRow(archiviato)

    await userEvent.click(screen.getByRole('button', { name: 'Ripristina Cliente arrabbiato' }))

    expect(onRestore).toHaveBeenCalledOnce()
  })

  /* Il ripristino in corso blocca solo la riga che si sta ripristinando: con
   * un flag condiviso si spegnerebbero tutte, e sembrerebbe che l'intera
   * tabella stia aspettando. */
  it('blocca solo la riga che si sta ripristinando', () => {
    renderRow(archiviato, true)

    expect(screen.getByRole('button', { name: 'Ripristina Cliente arrabbiato' })).toBeDisabled()
  })
})
