import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import AvatarBadges from '../../src/components/AvatarBadges'

describe('AvatarBadges', () => {
  it('mostra la categoria', () => {
    render(<AvatarBadges category="Clienti" categoryColor="violet" difficulty={null} />)

    expect(screen.getByText('Clienti')).toBeInTheDocument()
  })

  /* La difficoltà è un campo della scheda persona che può restare vuoto, e
   * quando è vuoto non si scrive niente: una targhetta "Difficoltà: " senza
   * numero direbbe che il dato manca invece che non si applica. */
  it('non mostra nessuna targhetta di difficoltà quando la scheda non la dice', () => {
    render(<AvatarBadges category="Clienti" categoryColor="violet" difficulty={null} />)

    expect(screen.queryByText(/Difficoltà/)).not.toBeInTheDocument()
  })

  it("mostra il grado di difficoltà quando c'è", () => {
    render(<AvatarBadges category="Clienti" categoryColor="violet" difficulty="8/10" />)

    expect(screen.getByText(/Difficoltà: 8\/10/)).toBeInTheDocument()
  })

  it('spiega cosa vuol dire il grado di difficoltà', async () => {
    render(<AvatarBadges category="Clienti" categoryColor="violet" difficulty="8/10" />)

    await userEvent.hover(screen.getByText(/Difficoltà: 8\/10/))

    expect(screen.getByRole('tooltip')).toHaveTextContent('Grado di difficoltà dello scenario')
  })
})
