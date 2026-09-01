import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import PeriodOrgFilters from '../../src/components/PeriodOrgFilters'
import type { PeriodValue } from '../../src/components/reportFormat'

/* La fascia che dashboard e report attività hanno in comune: sono i due
 * filtri che il server capisce, cioè quelli che decidono quali righe
 * arrivano. Un componente solo perché le due pagine li mostravano in due
 * posti diversi dello schermo pur essendo la stessa coppia. */

const organizationOptions = [{ value: 'org-1', label: 'Banca Esempio' }]

function renderFilters({
  period = 'all' as PeriodValue,
  organizationId = '',
  showOrg = true,
  isSearching = false,
} = {}) {
  const onPeriodChange = vi.fn()
  const onOrganizationChange = vi.fn()
  const onReset = vi.fn()
  render(
    <PeriodOrgFilters
      idPrefix="prova"
      period={period}
      onPeriodChange={onPeriodChange}
      organizationOptions={showOrg ? organizationOptions : undefined}
      organizationId={organizationId}
      onOrganizationChange={showOrg ? onOrganizationChange : undefined}
      isSearching={isSearching}
      onReset={onReset}
    />,
  )
  return { onPeriodChange, onOrganizationChange, onReset }
}

describe('PeriodOrgFilters', () => {
  it('sceglie il periodo', async () => {
    const { onPeriodChange } = renderFilters()

    await userEvent.click(screen.getByRole('radio', { name: '30 giorni' }))

    expect(onPeriodChange).toHaveBeenCalledWith('30')
  })

  it("sceglie l'organizzazione", async () => {
    const { onOrganizationChange } = renderFilters()

    await userEvent.click(screen.getByRole('combobox', { name: 'Organizzazione' }))
    await userEvent.click(screen.getByRole('option', { name: 'Banca Esempio' }))

    expect(onOrganizationChange).toHaveBeenCalledWith('org-1')
  })

  /* La voce che le comprende tutte la mette il componente, non le due
   * pagine: scritta due volte, sarebbe finita in due modi diversi. */
  it('offre di tornare a tutte le organizzazioni', async () => {
    const { onOrganizationChange } = renderFilters({ organizationId: 'org-1' })

    await userEvent.click(screen.getByRole('combobox', { name: 'Organizzazione' }))
    await userEvent.click(screen.getByRole('option', { name: 'Tutte le organizzazioni' }))

    expect(onOrganizationChange).toHaveBeenCalledWith('')
  })

  /* Chi amministra una sola organizzazione vedrebbe una tendina con dentro
   * sempre la stessa parola. */
  it('nasconde le organizzazioni a chi ne ha una sola', () => {
    renderFilters({ showOrg: false })

    expect(screen.queryByRole('combobox', { name: 'Organizzazione' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sempre' })).toBeInTheDocument()
  })

  it("offre di azzerare solo quando c'è qualcosa da azzerare", async () => {
    renderFilters()
    expect(screen.queryByRole('button', { name: 'Azzera Filtri' })).not.toBeInTheDocument()

    const { onReset } = renderFilters({ period: '90' })
    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  /* La casella di ricerca sta nella tabella, ma è un filtro come gli altri:
   * se azzerare non la comprendesse, si premerebbe «Azzera Filtri» per
   * ritrovarsi davanti un elenco ancora filtrato. */
  it('si offre di azzerare anche quando a filtrare è solo la ricerca', () => {
    renderFilters({ isSearching: true })

    expect(screen.getByRole('button', { name: 'Azzera Filtri' })).toBeInTheDocument()
  })
})
