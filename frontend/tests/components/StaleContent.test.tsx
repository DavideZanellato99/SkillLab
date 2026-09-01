import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import StaleContent from '../../src/components/StaleContent'

/* Le righe di prima mentre arriva la risposta a una domanda nuova. Era
 * ricopiato in tre pagine e nelle tre copie era già diverso: due attenuavano
 * al 60% e lasciavano le righe cliccabili, la terza al 50% e le spegneva. */

describe('StaleContent', () => {
  it('mostra il contenuto senza toccarlo quando è quello giusto', () => {
    render(
      <StaleContent isStale={false}>
        <button type="button">Apri</button>
      </StaleContent>,
    )

    const contenitore = screen.getByRole('button', { name: 'Apri' }).parentElement
    expect(contenitore).not.toHaveAttribute('aria-busy')
    expect(contenitore?.className).not.toContain('opacity-60')
  })

  /* Non cliccabile e non solo attenuato: un clic su una riga vecchia apre il
     dettaglio di qualcosa che sta per essere sostituito. E `aria-busy` perché
     chi la pagina non la guarda deve sapere che non è ancora la risposta. */
  it('attenua e spegne quello che sta per essere sostituito', () => {
    render(
      <StaleContent isStale>
        <button type="button">Apri</button>
      </StaleContent>,
    )

    const contenitore = screen.getByRole('button', { name: 'Apri' }).parentElement
    expect(contenitore).toHaveAttribute('aria-busy', 'true')
    expect(contenitore?.className).toContain('opacity-60')
    expect(contenitore?.className).toContain('pointer-events-none')
  })
})
