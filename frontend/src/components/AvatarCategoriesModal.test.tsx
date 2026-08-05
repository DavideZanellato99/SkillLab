import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AvatarCategoriesModal from './AvatarCategoriesModal'

/* Il pezzo che nessun altro copre: il rifiuto del server quando si cancella
 * una categoria che qualcuno usa ancora.
 *
 * Il blocco vive nel backend e lì ha il suo test, ma se il messaggio non
 * arriva sullo schermo l'amministratore vede solo un'eliminazione che non
 * succede, e la riprova. Qui si controlla che la frase del server finisca
 * davanti a chi ha premuto, e che la categoria resti dov'era. */

const IN_USE_DETAIL =
  "La categoria 'Clienti' è usata da 3 avatar: spostali in un'altra categoria prima di eliminarla."

const organizations = [
  { id: 'org-1', name: 'Banca Esempio', slug: 'banca-esempio', status: 'active' },
]

const categories = [
  {
    id: 'cat-1',
    name: 'Clienti',
    color: 'orange',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    avatar_count: 3,
    created_at: '2026-01-01T10:00:00Z',
    created_by_email: 'sistema',
    updated_at: '2026-01-01T10:00:00Z',
    updated_by_email: 'sistema',
  },
]

const json = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response

let fetchMock: ReturnType<typeof vi.fn>

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AvatarCategoriesModal organizationId="org-1" onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe('AvatarCategoriesModal', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return json({ detail: IN_USE_DETAIL }, 409)
      if (String(url).includes('/api/admin/avatar-categories')) return json(categories)
      if (String(url).includes('/api/admin/organizations')) return json(organizations)
      return json([])
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('mostra le categorie del tenant con quanti avatar le usano', async () => {
    renderModal()

    expect(await screen.findByText('Clienti')).toBeInTheDocument()
    expect(screen.getByText('3 avatar')).toBeInTheDocument()
  })

  it('riporta il rifiuto del server quando la categoria è ancora in uso', async () => {
    renderModal()
    await screen.findByText('Clienti')

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Clienti' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(IN_USE_DETAIL))
    expect(screen.getByText('Clienti')).toBeInTheDocument()
  })
})
