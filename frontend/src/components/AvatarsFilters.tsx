/* La barra dei filtri della gestione avatar: l'organizzazione e lo stato,
 * cioè se si sta guardando il catalogo o l'archivio, più il pulsante che li
 * azzera.
 *
 * Era scritta dentro la pagina, e nella copia il pulsante che azzera era una
 * riga di classi ricopiata a mano invece del `ResetFiltersButton` di tutti:
 * è il modo in cui due bottoni identici cominciano a non esserlo più.
 *
 * L'organizzazione viene prima perché prima è la sua colonna, come in ogni
 * barra dell'applicazione. Lo stato non ha una colonna, e per questo sta in
 * fondo: un avatar archiviato lo dice la riga stessa.
 *
 * Anche la ricerca è un filtro, benché la casella stia dentro la tabella:
 * «Azzera Filtri» riporta il catalogo completo, quindi comprende pure quella
 * e compare anche quando è l'unica cosa attiva. */

import FiltersBar, { FilterField } from './FiltersBar'
import ResetFiltersButton from './ResetFiltersButton'
import Select from './Select'
import type { SelectOption } from './Select'

/* Il catalogo e l'archivio sono due viste della stessa tabella, non due
 * pagine: l'eliminazione di un avatar è logica, e da qui ogni avatar
 * archiviato può tornare indietro. Le due parole le usa anche la pagina, per
 * dire quali righe restano e cosa scrivere quando non ne resta nessuna. */
export const STATUS_ACTIVE = 'active'
export const STATUS_ARCHIVED = 'archived'

const STATUS_OPTIONS = [
  { value: STATUS_ACTIVE, label: 'In catalogo' },
  { value: STATUS_ARCHIVED, label: 'Archiviati' },
  { value: '', label: 'Tutti' },
]

interface AvatarsFiltersProps {
  organizationId: string
  status: string
  organizationOptions: SelectOption[]
  /* Quanti ne tiene l'archivio dell'organizzazione che si sta guardando, per
   * il numero accanto alla voce: un totale di tutti i tenant accanto a una
   * tabella che ne mostra uno solo è un numero che non torna con le righe
   * che compaiono scegliendolo. */
  archivedCount: number
  /** Se c'è una ricerca in corso nella casella della tabella. */
  isSearching: boolean
  onOrganizationChange: (organizationId: string) => void
  onStatusChange: (status: string) => void
  onReset: () => void
}

export default function AvatarsFilters({
  organizationId,
  status,
  organizationOptions,
  archivedCount,
  isSearching,
  onOrganizationChange,
  onStatusChange,
  onReset,
}: AvatarsFiltersProps) {
  const hasFilters = Boolean(organizationId) || status !== STATUS_ACTIVE || isSearching

  return (
    <FiltersBar>
      <FilterField label="Organizzazione" htmlFor="avatars-org-filter">
        <Select
          id="avatars-org-filter"
          className="min-w-[220px]"
          value={organizationId}
          onChange={onOrganizationChange}
          options={[{ value: '', label: 'Tutte le organizzazioni' }, ...organizationOptions]}
        />
      </FilterField>
      <FilterField label="Stato" htmlFor="avatars-status-filter">
        <Select
          id="avatars-status-filter"
          className="min-w-[160px]"
          value={status}
          onChange={onStatusChange}
          options={STATUS_OPTIONS.map((o) =>
            o.value === STATUS_ARCHIVED && archivedCount
              ? { ...o, label: `${o.label} (${archivedCount})` }
              : o,
          )}
        />
      </FilterField>
      {hasFilters && <ResetFiltersButton onClick={onReset} />}
    </FiltersBar>
  )
}
