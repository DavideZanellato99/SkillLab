/* La barra dei filtri della gestione organizzazioni: lo stato, più il
 * pulsante che lo azzera.
 *
 * Un filtro solo, ma nella stessa fascia degli altri elenchi
 * (`FiltersBar`) e con lo stesso pulsante di tutti (`ResetFiltersButton`):
 * era scritta dentro la pagina, e nella copia il pulsante era una riga di
 * classi ricopiata a mano, che è il modo in cui due bottoni identici
 * cominciano a non esserlo più.
 *
 * Anche la ricerca è un filtro, benché la casella stia dentro la tabella:
 * «Azzera Filtri» riporta l'elenco completo, quindi comprende pure quella e
 * compare anche quando è l'unica cosa attiva. */

import FiltersBar, { FilterField } from './FiltersBar'
import { STATUS_OPTIONS } from './organizationStatus'
import ResetFiltersButton from './ResetFiltersButton'
import Select from './Select'

interface OrganizationsFiltersProps {
  value: string
  /** Se c'è una ricerca in corso nella casella della tabella. */
  isSearching: boolean
  onChange: (status: string) => void
  onReset: () => void
}

export default function OrganizationsFilters({
  value,
  isSearching,
  onChange,
  onReset,
}: OrganizationsFiltersProps) {
  const hasFilters = Boolean(value || isSearching)

  return (
    <FiltersBar>
      <FilterField label="Stato" htmlFor="orgs-status-filter">
        <Select
          id="orgs-status-filter"
          className="min-w-[180px]"
          value={value}
          onChange={onChange}
          options={STATUS_OPTIONS}
        />
      </FilterField>
      {hasFilters && <ResetFiltersButton onClick={onReset} />}
    </FiltersBar>
  )
}
