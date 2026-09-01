import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import AvatarsFilters, { STATUS_ARCHIVED } from '../../src/components/AvatarsFilters'

/* La barra della gestione avatar, che era scritta dentro la pagina: da lì
 * arrivava un «Azzera Filtri» ricopiato a mano invece del pulsante di tutti.
 * Qui contano le due scelte e quando il pulsante si fa vedere. */

const organizationOptions = [{ value: 'org-1', label: 'Banca Esempio' }]

function renderFilters({
  organizationId = '',
  status = 'active',
  archivedCount = 0,
  isSearching = false,
} = {}) {
  const onOrganizationChange = vi.fn()
  const onStatusChange = vi.fn()
  const onReset = vi.fn()
  render(
    <AvatarsFilters
      organizationId={organizationId}
      status={status}
      organizationOptions={organizationOptions}
      archivedCount={archivedCount}
      isSearching={isSearching}
      onOrganizationChange={onOrganizationChange}
      onStatusChange={onStatusChange}
      onReset={onReset}
    />,
  )
  return { onOrganizationChange, onStatusChange, onReset }
}

async function scegli(campo: string, opzione: string) {
  await userEvent.click(screen.getByRole('combobox', { name: campo }))
  await userEvent.click(screen.getByRole('option', { name: opzione }))
}

describe('AvatarsFilters', () => {
  it('cambia una scelta alla volta', async () => {
    const { onOrganizationChange, onStatusChange } = renderFilters()

    await scegli('Organizzazione', 'Banca Esempio')

    expect(onOrganizationChange).toHaveBeenCalledWith('org-1')
    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it("passa dal catalogo all'archivio", async () => {
    const { onStatusChange } = renderFilters()

    await scegli('Stato', 'Archiviati')

    expect(onStatusChange).toHaveBeenCalledWith(STATUS_ARCHIVED)
  })

  /* Quanti ne tiene l'archivio si legge senza aprirlo, ed è contato dentro
   * l'organizzazione che si sta guardando. */
  it("porta accanto alla voce quanti ne tiene l'archivio", async () => {
    renderFilters({ archivedCount: 3 })

    await userEvent.click(screen.getByRole('combobox', { name: 'Stato' }))

    expect(screen.getByRole('option', { name: 'Archiviati (3)' })).toBeInTheDocument()
  })

  /* Il catalogo è il punto di partenza, non un filtro: con quello acceso non
   * c'è ancora niente da azzerare. */
  it("offre di azzerare solo quando c'è qualcosa da azzerare", async () => {
    renderFilters()
    expect(screen.queryByRole('button', { name: 'Azzera Filtri' })).not.toBeInTheDocument()

    const { onReset } = renderFilters({ status: STATUS_ARCHIVED })
    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('si offre di azzerare anche quando a filtrare è solo la ricerca', () => {
    renderFilters({ isSearching: true })

    expect(screen.getByRole('button', { name: 'Azzera Filtri' })).toBeInTheDocument()
  })
})
