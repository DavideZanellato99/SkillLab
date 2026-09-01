import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createUser = vi.fn()
vi.mock('../../src/hooks/useAdminUsers', () => ({
  useCreateUser: () => ({
    mutateAsync: createUser,
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
}))

import UserCreateModal from '../../src/components/UserCreateModal'

/* La regola che il server non conosce: un utente che non è super admin deve
 * appartenere a un'organizzazione. Il backend la impone a modo suo, ma se il
 * form la lasciasse passare l'amministratore vedrebbe un errore generico al
 * posto del campo da riempire. */

const organizationOptions = [{ value: 'org-1', label: 'Banca Esempio' }]

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderModal(options = organizationOptions) {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(
    <UserCreateModal organizationOptions={options} onClose={onClose} onCreated={onCreated} />,
    { wrapper },
  )
  return { onClose, onCreated }
}

async function compila() {
  await userEvent.type(screen.getByLabelText('Email'), 'nuovo@utente.it')
  await userEvent.type(screen.getByLabelText('Nome'), 'Mario')
  await userEvent.type(screen.getByLabelText('Cognome'), 'Rossi')
}

/* Il Select dell'app non è una <select> del browser (vedi Select.tsx): si
 * apre e si sceglie, come farebbe chi lo usa. */
async function scegli(campo: string, opzione: string) {
  await userEvent.click(screen.getByRole('combobox', { name: campo }))
  await userEvent.click(screen.getByRole('option', { name: opzione }))
}

describe('UserCreateModal', () => {
  beforeEach(() => {
    createUser.mockReset()
  })

  it('non crea un utente senza organizzazione, e dice quale campo manca', async () => {
    renderModal()
    await compila()
    await userEvent.click(screen.getByRole('button', { name: 'Crea Utente' }))

    expect(screen.getByRole('alert')).toHaveTextContent("Seleziona l'organizzazione")
    expect(createUser).not.toHaveBeenCalled()
  })

  it('crea un super admin senza organizzazione, che è la sua condizione normale', async () => {
    createUser.mockResolvedValue({ email: 'nuovo@utente.it' })
    const { onCreated } = renderModal()
    await compila()

    await scegli('Ruolo del sistema', 'Super admin')
    await userEvent.click(screen.getByRole('button', { name: 'Crea Utente' }))

    expect(createUser).toHaveBeenCalledWith({
      email: 'nuovo@utente.it',
      nome: 'Mario',
      cognome: 'Rossi',
      ruolo: 'super_admin',
      organization_id: null,
    })
    expect(onCreated).toHaveBeenCalledOnce()
  })

  it('nasconde il campo organizzazione quando il ruolo è super admin', async () => {
    renderModal()
    expect(screen.getByRole('combobox', { name: 'Organizzazione' })).toBeInTheDocument()

    await scegli('Ruolo del sistema', 'Super admin')
    expect(screen.queryByRole('combobox', { name: 'Organizzazione' })).not.toBeInTheDocument()
  })

  it('avverte quando non esiste ancora nessuna organizzazione', () => {
    // Senza questo avviso il campo sarebbe una tendina vuota senza spiegazione
    renderModal([])
    expect(screen.getByText(/creane una prima di aggiungere utenti/)).toBeInTheDocument()
  })
})
