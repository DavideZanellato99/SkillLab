import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AdminUser } from '../../src/services/admin'
import UserRow from '../../src/components/UserRow'

/* Le protezioni della riga: il proprio account e quello di sistema non si
 * toccano. Il primo perché ci si taglierebbe fuori da soli, il secondo
 * perché è la via di servizio che resta quando tutto il resto non funziona.
 *
 * Sono regole che il backend impone comunque, ma se la riga le ignorasse
 * l'amministratore proverebbe l'azione e otterrebbe un rifiuto che sembra un
 * guasto. */

function user(over: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u-1',
    cognito_sub: 'sub-1',
    email: 'mario@example.com',
    nome: 'Mario',
    cognome: 'Rossi',
    role_id: 'r-1',
    ruolo: 'user',
    status: 'active',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    last_login_at: '2026-03-01T10:00:00Z',
    last_activity_at: '2026-03-01T11:00:00Z',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    created_by_email: 'sistema',
    updated_by_email: 'sistema',
    ...over,
  } as AdminUser
}

function renderRow(over: Partial<AdminUser> = {}, isSelf = false) {
  const handlers = {
    onView: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onResend: vi.fn(),
    onChangeStatus: vi.fn(),
  }
  render(
    <table>
      <tbody>
        <UserRow user={user(over)} isSelf={isSelf} {...handlers} />
      </tbody>
    </table>,
  )
  return handlers
}

describe('UserRow', () => {
  it('apre il dettaglio con un clic sulla riga', async () => {
    const { onView } = renderRow()
    await userEvent.click(screen.getByText('Mario Rossi'))
    expect(onView).toHaveBeenCalledOnce()
  })

  it('le azioni non aprono anche il dettaglio della riga sotto di loro', async () => {
    const { onEdit, onView } = renderRow()
    await userEvent.click(screen.getByRole('button', { name: /Modifica/ }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onView).not.toHaveBeenCalled()
  })

  it('non lascia eliminare il proprio account', () => {
    renderRow({}, true)
    expect(screen.getByRole('button', { name: /Elimina/ })).toBeDisabled()
  })

  it("non lascia eliminare l'account di sistema", () => {
    renderRow({ cognito_sub: 'mock-admin' })
    expect(screen.getByRole('button', { name: /Elimina/ })).toBeDisabled()
  })

  it('un account qualunque si può eliminare', () => {
    renderRow()
    expect(screen.getByRole('button', { name: /Elimina/ })).toBeEnabled()
  })

  it('segnala un invito mai usato invece di lasciare la data vuota', () => {
    renderRow({ last_login_at: null })
    expect(screen.getByText('Mai Acceduto')).toBeInTheDocument()
  })
})
