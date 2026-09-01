import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import FiltersBar, { FilterField } from '../../src/components/FiltersBar'

/* La fascia dei filtri e il campo con la sua etichetta sopra. Il riquadro era
 * ricopiato in sei barre, e le etichette scritte a mano in due di quelle
 * copie avevano già perso la spaziatura delle altre.
 *
 * Quello che conta qui è il legame fra l'etichetta e il comando che nomina:
 * dove il comando è un campo lo dichiara una `label`, e dove è un gruppo di
 * pastiglie no, perché un `radiogroup` si nomina col proprio `ariaLabel` e
 * una `label` che punta a un gruppo non lo nomina affatto. */

describe('FilterField', () => {
  it('lega l’etichetta al campo che nomina', () => {
    render(
      <FiltersBar>
        <FilterField label="Organizzazione" htmlFor="org">
          <input id="org" />
        </FilterField>
      </FiltersBar>,
    )

    expect(screen.getByLabelText('Organizzazione')).toBe(screen.getByRole('textbox'))
  })

  /* Senza un campo da nominare l'etichetta resta una scritta: serve a
     incolonnare il gruppo con gli altri comandi della fascia, mentre il nome
     vero lo porta il gruppo. */
  it('sopra un gruppo di pastiglie è una scritta e non una label', () => {
    const { container } = render(
      <FiltersBar>
        <FilterField label="Periodo">
          <div role="radiogroup" aria-label="Periodo" />
        </FilterField>
      </FiltersBar>,
    )

    expect(screen.getByText('Periodo').tagName).toBe('SPAN')
    expect(container.querySelector('label')).toBeNull()
  })

  /* La barra in cima a un pezzo di pagina porta il filetto che la separa da
     quello che sta guardando, quella sotto un'intestazione no: senza la
     variante, la seconda copia del riquadro sarebbe tornata subito. */
  it('la variante di sezione si separa con un filetto', () => {
    const { container: page } = render(<FiltersBar>filtri</FiltersBar>)
    const { container: section } = render(<FiltersBar variant="section">filtri</FiltersBar>)

    expect(page.firstElementChild?.className).not.toContain('border-b')
    expect(section.firstElementChild?.className).toContain('border-b')
  })
})
