/* La fascia dei filtri dei percorsi di training: l'organizzazione di cui si
 * stanno guardando percorsi e assegnazioni.
 *
 * Sta sotto l'intestazione come in ogni altro elenco dell'applicazione, e non
 * più accanto al titolo: là era stretta fra il testo e il bottone «Nuovo
 * Percorso», cioè fra due cose che filtri non sono, e su schermo stretto
 * finiva in mezzo a un'azione andata a capo.
 *
 * Vale per entrambe le linguette, e per questo sta sopra la barra che le
 * porta: è di chi si sta parlando, non un modo di guardare una delle due.
 * La vede il solo super admin, che è l'unico ad amministrare più di
 * un'organizzazione. */

import FiltersBar, { FilterField } from './FiltersBar'
import ResetFiltersButton from './ResetFiltersButton'
import Select from './Select'
import type { SelectOption } from './Select'

interface TrainingFiltersProps {
  value: string
  organizationOptions: SelectOption[]
  onChange: (organizationId: string) => void
  onReset: () => void
}

export default function TrainingFilters({
  value,
  organizationOptions,
  onChange,
  onReset,
}: TrainingFiltersProps) {
  return (
    <FiltersBar>
      <FilterField label="Organizzazione" htmlFor="training-org-filter">
        <Select
          id="training-org-filter"
          className="min-w-[220px]"
          value={value}
          onChange={onChange}
          options={[{ value: '', label: 'Tutte le organizzazioni' }, ...organizationOptions]}
        />
      </FilterField>
      {value && <ResetFiltersButton onClick={onReset} />}
    </FiltersBar>
  )
}
