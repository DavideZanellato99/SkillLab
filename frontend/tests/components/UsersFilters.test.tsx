import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import UsersFilters from '../../src/components/UsersFilters'
import type { UsersFiltersValue } from '../../src/components/UsersFilters'

/* I filtri girano sul server e coprono tutto l'elenco, non la sola finestra
 * già caricata: da qui esce solo la scelta. Quello che conta è che ogni
 * campo cambi il proprio valore e nessun altro, altrimenti restringere per
 * ruolo azzererebbe l'organizzazione senza dirlo. */

const empty: UsersFiltersValue = { organizationId: '', ruolo: '', status: '', access: '' }
const organizationOptions = [{ value: 'org-1', label: 'Banca Esempio' }]

function renderFilters(value: UsersFiltersValue = empty, isSearching = false) {
  const onChange = vi.fn()
  const onReset = vi.fn()
  render(
    <UsersFilters
      value={value}
      organizationOptions={organizationOptions}
      isSearching={isSearching}
      onChange={onChange}
      onReset={onReset}
    />,
  )
  return { onChange, onReset }
}

async function scegli(campo: string, opzione: string) {
  await userEvent.click(screen.getByRole('combobox', { name: campo }))
  await userEvent.click(screen.getByRole('option', { name: opzione }))
}

describe('UsersFilters', () => {
  it('cambia un filtro alla volta', async () => {
    const { onChange } = renderFilters()
    await scegli('Ruolo', 'Amministratore organizzazione')
    expect(onChange).toHaveBeenCalledWith({ ruolo: 'organization_admin' })
  })

  it('distingue "mai acceduto" da "ha già acceduto"', async () => {
    const { onChange } = renderFilters()
    await scegli('Accesso', 'Mai acceduto')
    expect(onChange).toHaveBeenCalledWith({ access: 'never' })
  })

  it("offre di azzerare solo quando c'è qualcosa da azzerare", async () => {
    renderFilters()
    expect(screen.queryByRole('button', { name: 'Azzera Filtri' })).not.toBeInTheDocument()

    const { onReset } = renderFilters({ ...empty, status: 'suspended' })
    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  /* La casella di ricerca sta nella tabella, ma è un filtro come gli altri:
   * se azzerare non la comprendesse, si premerebbe «Azzera Filtri» per
   * ritrovarsi davanti un elenco ancora filtrato. */
  it('si offre di azzerare anche quando a filtrare è solo la ricerca', () => {
    renderFilters(empty, true)
    expect(screen.getByRole('button', { name: 'Azzera Filtri' })).toBeInTheDocument()
  })
})
