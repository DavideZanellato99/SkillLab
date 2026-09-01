import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import OrganizationsFilters from '../../src/components/OrganizationsFilters'

/* Un filtro solo, ma nella fascia di tutti e con il pulsante di tutti: era
 * scritto dentro la pagina, con «Azzera Filtri» ricopiato a mano. */

function renderFilters(value = '', isSearching = false) {
  const onChange = vi.fn()
  const onReset = vi.fn()
  render(
    <OrganizationsFilters
      value={value}
      isSearching={isSearching}
      onChange={onChange}
      onReset={onReset}
    />,
  )
  return { onChange, onReset }
}

describe('OrganizationsFilters', () => {
  it('restringe alle sospese', async () => {
    const { onChange } = renderFilters()

    await userEvent.click(screen.getByRole('combobox', { name: 'Stato' }))
    await userEvent.click(screen.getByRole('option', { name: 'Sospesa' }))

    expect(onChange).toHaveBeenCalledWith('suspended')
  })

  it("offre di azzerare solo quando c'è qualcosa da azzerare", async () => {
    renderFilters()
    expect(screen.queryByRole('button', { name: 'Azzera Filtri' })).not.toBeInTheDocument()

    const { onReset } = renderFilters('suspended')
    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  /* La casella di ricerca sta nella tabella, ma è un filtro come l'altro: se
   * azzerare non la comprendesse, si premerebbe il pulsante per ritrovarsi
   * davanti un elenco ancora ristretto. */
  it('si offre di azzerare anche quando a filtrare è solo la ricerca', () => {
    renderFilters('', true)

    expect(screen.getByRole('button', { name: 'Azzera Filtri' })).toBeInTheDocument()
  })
})
