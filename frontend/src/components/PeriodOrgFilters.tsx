/* La fascia dei filtri di dashboard e report attività: il periodo delle prove
 * e l'organizzazione a cui appartengono.
 *
 * Un componente solo per le due pagine perché è la stessa coppia sulla stessa
 * materia: sono i due filtri che il server capisce, cioè quelli che decidono
 * quali righe arrivano, e chi passa da una schermata all'altra li ritrova
 * dove li ha lasciati. Scritti due volte erano finiti in due posti diversi,
 * accanto al titolo di là e dentro la barra della tabella di qua.
 *
 * Il periodo resta un gruppo di pastiglie e non una tendina: sono quattro
 * scelte, si cambiano di continuo e quella accesa va letta senza aprire
 * niente. L'organizzazione è una tendina perché le organizzazioni sono
 * quante sono. */

import FilterTabs from './FilterTabs'
import FiltersBar, { FilterField } from './FiltersBar'
import ResetFiltersButton from './ResetFiltersButton'
import Select from './Select'
import type { SelectOption } from './Select'
import { PERIOD_OPTIONS } from './reportFormat'
import type { PeriodValue } from './reportFormat'

interface PeriodOrgFiltersProps {
  /** Radice degli id dei campi, che lega ogni etichetta al suo comando. */
  idPrefix: string
  period: PeriodValue
  onPeriodChange: (period: PeriodValue) => void
  /* Le organizzazioni fra cui scegliere, senza la voce che le comprende
   * tutte: la mette il componente, così la stessa frase non viene scritta in
   * modi diversi nelle due pagine. Assenti per chi ne amministra una sola,
   * che vedrebbe una tendina con dentro sempre la stessa parola. */
  organizationOptions?: SelectOption[]
  organizationId?: string
  onOrganizationChange?: (organizationId: string) => void
  /** Se c'è una ricerca in corso nella casella della tabella qui sotto. */
  isSearching?: boolean
  onReset: () => void
}

export default function PeriodOrgFilters({
  idPrefix,
  period,
  onPeriodChange,
  organizationOptions,
  organizationId = '',
  onOrganizationChange,
  isSearching = false,
  onReset,
}: PeriodOrgFiltersProps) {
  const showOrg = Boolean(organizationOptions && onOrganizationChange)
  /* Anche la ricerca è un filtro, benché la casella stia dentro la tabella:
     «Azzera Filtri» riporta l'elenco completo, quindi comprende pure quella e
     compare anche quando è l'unica cosa attiva. È la stessa regola della
     gestione utenti e del registro attività. */
  const hasFilters = period !== 'all' || Boolean(organizationId) || isSearching

  return (
    <FiltersBar>
      <FilterField label="Periodo">
        <FilterTabs<PeriodValue>
          value={period}
          onChange={onPeriodChange}
          options={[...PERIOD_OPTIONS]}
          ariaLabel="Periodo"
        />
      </FilterField>
      {showOrg && (
        <FilterField label="Organizzazione" htmlFor={`${idPrefix}-org-filter`}>
          <Select
            id={`${idPrefix}-org-filter`}
            className="min-w-[220px]"
            value={organizationId}
            onChange={(value) => onOrganizationChange?.(value)}
            options={[
              { value: '', label: 'Tutte le organizzazioni' },
              ...(organizationOptions ?? []),
            ]}
          />
        </FilterField>
      )}
      {hasFilters && <ResetFiltersButton onClick={onReset} />}
    </FiltersBar>
  )
}
