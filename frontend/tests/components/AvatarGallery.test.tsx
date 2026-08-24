import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stato = vi.hoisted(() => ({
  avatars: { data: [] as unknown[], isLoading: false, isError: false },
  categories: [] as unknown[],
  chiesto: { categoryId: null as string | null },
}))
vi.mock('../../src/hooks/useAvatars', () => ({
  useAvatars: (categoryId: string | null) => {
    stato.chiesto.categoryId = categoryId
    return stato.avatars
  },
  useCategories: () => ({ data: stato.categories }),
}))

import type { Avatar } from '../../src/services/api'
import AvatarGallery from '../../src/components/AvatarGallery'

const avatar = (over: Partial<Avatar> = {}): Avatar => ({
  id: 'a-1',
  name: 'Cliente arrabbiato',
  image_url: '/static/avatars/a-1.png',
  category: 'Clienti',
  category_id: 'cat-1',
  category_color: 'violet',
  description: 'Chiama per un addebito',
  created_at: '2026-01-01T10:00:00Z',
  selection_count: 0,
  ...over,
})

function renderGallery() {
  const onStatsUpdate = vi.fn()
  render(
    <MemoryRouter>
      <AvatarGallery onStatsUpdate={onStatsUpdate} />
    </MemoryRouter>,
  )
  return onStatsUpdate
}

beforeEach(() => {
  stato.avatars = { data: [avatar()], isLoading: false, isError: false }
  stato.categories = [
    { id: 'cat-1', name: 'Clienti', color: 'violet' },
    { id: 'cat-2', name: 'Colleghi', color: 'cyan' },
  ]
  stato.chiesto.categoryId = null
})

describe('AvatarGallery', () => {
  it('mostra gli avatar del catalogo', () => {
    renderGallery()

    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
  })

  it('offre un filtro per ogni categoria, più "tutti"', () => {
    renderGallery()

    expect(screen.getByRole('button', { name: 'Tutti' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clienti' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Colleghi' })).toBeInTheDocument()
  })

  /* Filtra per id e non per nome: una categoria si può rinominare mentre la
   * galleria è aperta, il suo id no. */
  it('filtra per id della categoria', async () => {
    renderGallery()

    await userEvent.click(screen.getByRole('button', { name: 'Colleghi' }))

    expect(stato.chiesto.categoryId).toBe('cat-2')
  })

  it('torna al catalogo intero', async () => {
    renderGallery()

    await userEvent.click(screen.getByRole('button', { name: 'Colleghi' }))
    await userEvent.click(screen.getByRole('button', { name: 'Tutti' }))

    expect(stato.chiesto.categoryId).toBeNull()
  })

  /* I conteggi salgono in testata: è lei a mostrarli, e senza questo
   * l'intestazione della home resterebbe a zero. */
  it('passa i conteggi a chi disegna la testata', () => {
    const onStatsUpdate = renderGallery()

    expect(onStatsUpdate).toHaveBeenCalledWith(1, 2)
  })

  it('mostra i segnaposto mentre il catalogo arriva', () => {
    stato.avatars = { data: [], isLoading: true, isError: false }
    const { container } = render(
      <MemoryRouter>
        <AvatarGallery onStatsUpdate={vi.fn()} />
      </MemoryRouter>,
    )

    expect(container.querySelectorAll('.animate-shimmer').length).toBeGreaterThan(0)
  })

  it('dice quando una categoria non ha nessun avatar', () => {
    stato.avatars = { data: [], isLoading: false, isError: false }
    renderGallery()

    expect(screen.getByText('Nessun avatar presente in questa categoria')).toBeInTheDocument()
  })

  /* Un errore di rete lo dice un avviso a scomparsa e non una schermata di
   * errore: il catalogo può essere già a schermo dalla lettura precedente. */
  it('avvisa quando il catalogo non arriva', () => {
    stato.avatars = { data: [], isLoading: false, isError: true }
    renderGallery()

    expect(screen.getByText('Errore di connessione')).toBeInTheDocument()
    expect(screen.getByText(/Verifica la connessione e riprova/)).toBeInTheDocument()
  })

  it("lascia chiudere l'avviso", async () => {
    stato.avatars = { data: [], isLoading: false, isError: true }
    renderGallery()

    await userEvent.click(screen.getByRole('button', { name: /Chiudi/ }))

    expect(screen.queryByText('Errore di connessione')).not.toBeInTheDocument()
  })
})
