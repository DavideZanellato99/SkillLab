import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const aggiorna = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
vi.mock('../../src/hooks/useAdminUsers', () => ({ useUpdateUser: () => aggiorna }))

import type { AdminUser } from '../../src/services/admin'
import { SYSTEM_ACCOUNT_SUB } from '../../src/services/auth'
import UserEditModal from '../../src/components/UserEditModal'

/* La modifica di un account, che è quasi sempre una modifica di niente: si
 * apre la scheda per guardarla e si richiude. Salvare una scheda intatta
 * scriverebbe comunque chi l'ha toccata e quando, e lascerebbe nel registro
 * attività la traccia di una modifica che non c'è stata. */

const organizationOptions = [
  { value: 'org-1', label: 'Banca Esempio' },
  { value: 'org-2', label: 'Altra Banca' },
]

function utente(over: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u-1',
    cognito_sub: 'sub-1',
    email: 'mario@example.com',
    nome: 'Mario',
    cognome: 'Rossi',
    ruolo: 'user',
    status: 'active',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    created_by_email: 'sistema',
    updated_by_email: 'sistema',
    ...over,
  } as AdminUser
}

function renderModal(over: Partial<AdminUser> = {}, isSelf = false) {
  const onUpdated = vi.fn()
  render(
    <UserEditModal
      user={utente(over)}
      isSelf={isSelf}
      organizationOptions={organizationOptions}
      onClose={vi.fn()}
      onUpdated={onUpdated}
    />,
  )
  return { onUpdated }
}

const salva = () => screen.getByRole('button', { name: 'Salva Modifiche' })

beforeEach(() => {
  aggiorna.mutateAsync.mockReset()
  aggiorna.mutateAsync.mockResolvedValue(utente({ nome: 'Marione' }))
  aggiorna.isPending = false
  aggiorna.error = null
})

describe('UserEditModal', () => {
  it('non lascia salvare una scheda intatta, e dice perché', () => {
    renderModal()

    expect(salva()).toBeDisabled()
    expect(screen.getByText('Cambia un campo per abilitare il salvataggio.')).toBeInTheDocument()
  })

  it('abilita il salvataggio appena un campo cambia', async () => {
    renderModal()

    await userEvent.type(screen.getByLabelText('Nome'), 'ne')

    expect(salva()).toBeEnabled()
    expect(
      screen.queryByText('Cambia un campo per abilitare il salvataggio.'),
    ).not.toBeInTheDocument()
  })

  /* Gli spazi ai bordi il server li toglie comunque: aggiungerne uno non è
   * una modifica da salvare. */
  it('non considera modifica uno spazio in più', async () => {
    renderModal()

    await userEvent.type(screen.getByLabelText('Cognome'), ' ')

    expect(salva()).toBeDisabled()
  })

  it('salva quello che è cambiato', async () => {
    const { onUpdated } = renderModal()

    await userEvent.clear(screen.getByLabelText('Nome'))
    await userEvent.type(screen.getByLabelText('Nome'), 'Marione')
    await userEvent.click(salva())

    expect(aggiorna.mutateAsync).toHaveBeenCalledWith({
      userId: 'u-1',
      payload: {
        nome: 'Marione',
        cognome: 'Rossi',
        ruolo: 'user',
        organization_id: 'org-1',
      },
    })
    expect(onUpdated).toHaveBeenCalledOnce()
  })

  /* Cambiare organizzazione è una modifica come le altre, e passa dalla
   * tendina invece che da un campo di testo. */
  it('vede anche il cambio di organizzazione', async () => {
    renderModal()

    await userEvent.click(screen.getByLabelText('Organizzazione'))
    await userEvent.click(screen.getByRole('option', { name: 'Altra Banca' }))

    expect(salva()).toBeEnabled()
  })

  it('non lascia toccare il ruolo del proprio account, e lo scrive', () => {
    renderModal({}, true)

    expect(screen.getByLabelText('Ruolo del sistema')).toBeDisabled()
    expect(
      screen.getByText('Non puoi modificare il ruolo del tuo stesso account.'),
    ).toBeInTheDocument()
  })

  it("non lascia toccare il ruolo dell'account di sistema", () => {
    renderModal({ cognito_sub: SYSTEM_ACCOUNT_SUB })

    expect(screen.getByLabelText('Ruolo del sistema')).toBeDisabled()
  })
})
