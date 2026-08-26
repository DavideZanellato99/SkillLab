import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AvatarCategoriesModal from '../../src/components/AvatarCategoriesModal'

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

  /* Il cestino non cancella: apre una conferma. Qui la cancellazione è vera
   * e non l'archiviazione di un avatar, quindi un dito fuori posto su una
   * riga alta due centimetri non deve poter far sparire niente. */
  it('chiede conferma prima di eliminare, e senza conferma non chiama il server', async () => {
    renderModal()
    await screen.findByText('Clienti')

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Clienti' }))

    expect(await screen.findByRole('dialog', { name: 'Elimina Categoria' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })

  /* Il conteggio è quello dell'ultima lettura, quindi la conferma avvisa ma
   * non si spegne: a contare gli avatar nel momento giusto è il server. */
  it('avvisa che la categoria è in uso senza impedire di provarci', async () => {
    renderModal()
    await screen.findByText('Clienti')

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Clienti' }))

    const conferma = await screen.findByRole('dialog', { name: 'Elimina Categoria' })
    expect(conferma).toHaveTextContent('risulta usata da 3 avatar')
    expect(screen.getByRole('button', { name: 'Elimina Categoria' })).toBeEnabled()
  })

  it('riporta il rifiuto del server quando la categoria è ancora in uso', async () => {
    renderModal()
    await screen.findByText('Clienti')

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Clienti' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Elimina Categoria' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(IN_USE_DETAIL))
    // La riga è ancora al suo posto: il nome da solo non basta a dirlo,
    // perché adesso compare anche dentro la conferma rimasta aperta.
    expect(screen.getByRole('button', { name: 'Modifica Clienti' })).toBeInTheDocument()
  })
})
