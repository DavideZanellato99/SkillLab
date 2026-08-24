import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stato = vi.hoisted(() => ({
  avatars: { data: [] as unknown[], isLoading: false },
  categories: { data: [] as unknown[], isLoading: false },
  chiesto: { argomenti: [] as unknown[] },
}))
vi.mock('../../src/hooks/useAvatars', () => ({
  useAvatars: (...args: unknown[]) => {
    stato.chiesto.argomenti = args
    return stato.avatars
  },
  useCategories: () => stato.categories,
}))

import Header from '../../src/components/Header'

beforeEach(() => {
  stato.avatars = { data: new Array(12).fill({}), isLoading: false }
  stato.categories = { data: new Array(4).fill({}), isLoading: false }
  stato.chiesto.argomenti = []
})

describe('Header', () => {
  it('conta gli avatar e le categorie della galleria', () => {
    render(<Header />)

    // Il numero e la sua etichetta stanno insieme: un 12 da solo non dice
    // se sono avatar o categorie
    expect(screen.getByText('12').nextElementSibling).toHaveTextContent('Avatar')
    expect(screen.getByText('4').nextElementSibling).toHaveTextContent('Categorie')
  })

  /* Il numero è quello del catalogo intero e non della categoria scelta
   * sotto: la testata presenta il catalogo, e un conteggio che cala mentre
   * si filtra sembrerebbe dire che gli avatar sono spariti. La lettura è poi
   * la stessa della griglia, quindi è una sola voce di cache per entrambe. */
  it('conta il catalogo intero e non la categoria scelta', () => {
    render(<Header />)

    expect(stato.chiesto.argomenti).toEqual([])
  })

  /* Una galleria ancora vuota mostra zero e non uno spazio bianco: è una
   * risposta. */
  it('mostra zero su una galleria vuota', () => {
    stato.avatars = { data: [], isLoading: false }
    stato.categories = { data: [], isLoading: false }
    render(<Header />)

    expect(screen.getAllByText('0')).toHaveLength(2)
  })

  /* Mentre i numeri arrivano non si mostra zero: uno zero che dopo un
   * istante diventa dodici si legge come un catalogo vuoto. */
  it('mostra un segnaposto finché i numeri non si sanno', () => {
    stato.avatars = { data: [], isLoading: true }
    stato.categories = { data: [], isLoading: true }
    render(<Header />)

    expect(screen.getAllByText('…')).toHaveLength(2)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
