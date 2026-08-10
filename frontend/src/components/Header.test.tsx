import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Header from './Header'

describe('Header', () => {
  it('conta gli avatar e le categorie della galleria', () => {
    render(<Header totalAvatars={12} totalCategories={4} />)

    // Il numero e la sua etichetta stanno insieme: un 12 da solo non dice
    // se sono avatar o categorie
    expect(screen.getByText('12').nextElementSibling).toHaveTextContent('Avatar')
    expect(screen.getByText('4').nextElementSibling).toHaveTextContent('Categorie')
  })

  /* Una galleria ancora vuota mostra zero e non uno spazio bianco: è una
   * risposta, e sta anche nel primo istante prima che i dati arrivino. */
  it('mostra zero su una galleria ancora vuota', () => {
    render(<Header totalAvatars={0} totalCategories={0} />)

    expect(screen.getAllByText('0')).toHaveLength(2)
  })
})
