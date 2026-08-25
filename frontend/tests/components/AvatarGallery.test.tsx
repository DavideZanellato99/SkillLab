import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stato = vi.hoisted(() => ({
  avatars: {
    data: [] as unknown[],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  categories: [] as unknown[],
  chiamate: { quante: 0 },
}))
vi.mock('../../src/hooks/useAvatars', () => ({
  useAvatars: () => {
    stato.chiamate.quante += 1
    return stato.avatars
  },
  useCategories: () => ({ data: stato.categories }),
}))

const sessione = vi.hoisted(() => ({ ruolo: 'user' }))
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', ruolo: sessione.ruolo } }),
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
  own_sessions: 0,
  last_session_at: null,
  ...over,
})

const collega = avatar({
  id: 'a-2',
  name: 'Collega scettico',
  category: 'Colleghi',
  category_id: 'cat-2',
  description: 'Non crede nel nuovo processo',
})

function renderGallery() {
  render(
    <MemoryRouter>
      <AvatarGallery />
    </MemoryRouter>,
  )
}

const cerca = (testo: string) =>
  userEvent.type(screen.getByRole('textbox', { name: 'Cerca un avatar' }), testo)

beforeEach(() => {
  stato.avatars = {
    data: [avatar(), collega],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }
  stato.categories = [
    { id: 'cat-1', name: 'Clienti', color: 'violet' },
    { id: 'cat-2', name: 'Colleghi', color: 'cyan' },
  ]
  stato.chiamate.quante = 0
  sessione.ruolo = 'user'
})

describe('AvatarGallery', () => {
  it('mostra gli avatar del catalogo', () => {
    renderGallery()

    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Collega scettico' })).toBeInTheDocument()
  })

  it('offre un filtro per ogni categoria, più "tutti"', () => {
    renderGallery()

    const gruppo = screen.getByRole('radiogroup', { name: 'Categoria degli avatar' })
    expect(gruppo).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Tutti/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Clienti/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Colleghi/ })).toBeInTheDocument()
  })

  /* Il numero accanto alla categoria dice quanto c'è dentro: è quello con
   * cui si decide se vale la pena aprirla, e si sa senza chiedere niente al
   * server perché il catalogo è già tutto in memoria. */
  it('dice quanti avatar contiene ogni categoria', () => {
    renderGallery()

    expect(screen.getByRole('radio', { name: /^Tutti\s*2$/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Clienti\s*1$/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Colleghi\s*1$/ })).toBeInTheDocument()
  })

  /* Filtrare non è una domanda al server: il catalogo si legge una volta e
   * la scelta si applica sui dati che ci sono già. */
  it('filtra per categoria senza rileggere il catalogo', async () => {
    renderGallery()
    const lettureIniziali = stato.chiamate.quante

    await userEvent.click(screen.getByRole('radio', { name: /Colleghi/ }))

    expect(screen.getByRole('heading', { name: 'Collega scettico' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cliente arrabbiato' })).not.toBeInTheDocument()
    // Il componente si ridisegna, ma la lettura resta la stessa voce di cache
    expect(stato.chiamate.quante).toBeGreaterThan(lettureIniziali)
    expect(screen.getByRole('radio', { name: /Colleghi/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('torna al catalogo intero', async () => {
    renderGallery()

    await userEvent.click(screen.getByRole('radio', { name: /Colleghi/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Tutti/ }))

    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Collega scettico' })).toBeInTheDocument()
  })

  /* Si cerca anche nello scenario e nella categoria: chi scrive «addebito»
   * sta cercando una situazione, non un nome. */
  it('cerca per nome, scenario e categoria', async () => {
    renderGallery()

    await cerca('addebito')

    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Collega scettico' })).not.toBeInTheDocument()
  })

  it('ignora accenti e maiuscole nella ricerca', async () => {
    renderGallery()

    await cerca('COLLEGA')

    expect(screen.getByRole('heading', { name: 'Collega scettico' })).toBeInTheDocument()
  })

  it('cerca dentro la categoria scelta', async () => {
    renderGallery()

    await userEvent.click(screen.getByRole('radio', { name: /Clienti/ }))
    await cerca('collega')

    expect(screen.getByText('Nessun avatar corrisponde a questa ricerca')).toBeInTheDocument()
  })

  it('mostra i segnaposto mentre il catalogo arriva', () => {
    stato.avatars = { ...stato.avatars, data: [], isLoading: true }
    const { container } = render(
      <MemoryRouter>
        <AvatarGallery />
      </MemoryRouter>,
    )

    expect(container.querySelectorAll('.animate-shimmer').length).toBeGreaterThan(0)
  })
})

/* Tre motivi diversi per una griglia vuota, e tre frasi diverse: le prime
 * due chi guarda le risolve sul momento, e il riquadro gli porge il gesto. */
describe('quando non resta niente da mostrare', () => {
  it('offre di azzerare una ricerca senza risultati', async () => {
    renderGallery()
    await cerca('inesistente')

    expect(screen.getByText('Nessun avatar corrisponde a questa ricerca')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Azzera la ricerca' }))

    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
  })

  it('offre di tornare al catalogo da una categoria vuota', async () => {
    stato.avatars = { ...stato.avatars, data: [avatar()] }
    renderGallery()

    await userEvent.click(screen.getByRole('radio', { name: /Colleghi/ }))
    expect(screen.getByText('Nessun avatar in questa categoria')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Mostra tutto il catalogo' }))
    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
  })

  /* Catalogo vuoto davvero: non c'è nessun filtro da annullare, e l'unica
   * cosa utile è portare chi lo può riempire dove si riempie. */
  it('manda il super admin alla gestione avatar', () => {
    stato.avatars = { ...stato.avatars, data: [] }
    sessione.ruolo = 'super_admin'
    renderGallery()

    expect(screen.getByText('Il catalogo degli avatar è ancora vuoto')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vai alla gestione avatar' })).toHaveAttribute(
      'href',
      '/app/admin/avatars',
    )
  })

  it('a chi si allena non propone niente da gestire', () => {
    stato.avatars = { ...stato.avatars, data: [] }
    renderGallery()

    expect(screen.getByText('Il catalogo degli avatar è ancora vuoto')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /gestione avatar/i })).not.toBeInTheDocument()
  })
})

/* Un guasto di rete si racconta in due modi, perché sono due situazioni
 * diverse: con lo schermo vuoto e con il catalogo già lì. */
describe('quando il catalogo non arriva', () => {
  it('lo dice e offre di riprovare, se non c’è niente a schermo', async () => {
    const refetch = vi.fn()
    stato.avatars = { ...stato.avatars, data: [], isError: true, refetch }
    renderGallery()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Impossibile caricare il catalogo degli avatar.',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  /* Il catalogo letto prima resta a schermo: si avvisa soltanto che
   * potrebbe non essere l'ultima parola. */
  it('avvisa senza togliere il catalogo già letto', async () => {
    stato.avatars = { ...stato.avatars, isError: true }
    renderGallery()

    expect(screen.getByText('Aggiornamento non riuscito')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Chiudi/ }))
    expect(screen.queryByText('Aggiornamento non riuscito')).not.toBeInTheDocument()
  })
})
