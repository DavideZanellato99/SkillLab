/* La barra dei filtri della gestione simulazioni: il tipo di test, l'origine
 * delle domande e lo stato, nell'ordine delle colonne che restringono, più il
 * pulsante che li azzera.
 *
 * Sopra la tabella e non dentro, come nella gestione utenti: i filtri dicono
 * quale elenco si sta guardando, e questa è una cosa che si decide prima di
 * leggere le righe. Dentro la tabella le pastiglie stavano sulla stessa fascia
 * della ricerca, e con tre comandi invece di uno quella fascia diventava una
 * seconda barra di filtri messa in mezzo alle intestazioni.
 *
 * Anche la ricerca è un filtro, benché la casella resti dentro la tabella:
 * «Azzera Filtri» riporta l'elenco completo, quindi comprende pure quella e
 * compare anche quando è l'unica cosa attiva. È la stessa regola di
 * `UsersFilters`, e il pulsante è lo stesso. */

import { filterFieldCls, labelCls } from './Field'
import ResetFiltersButton from './ResetFiltersButton'
import Select from './Select'
import {
  ADMIN_KIND_OPTIONS,
  ADMIN_SOURCE_OPTIONS,
  ADMIN_STATUS_OPTIONS,
  NO_ADMIN_FILTERS,
} from './simulationFilters'
import type { AdminSimulationFilters } from './simulationFilters'

interface SimulationsFiltersProps {
  value: AdminSimulationFilters
  /** Se c'è una ricerca in corso nella casella della tabella. */
  isSearching: boolean
  onChange: (patch: Partial<AdminSimulationFilters>) => void
  onReset: () => void
}

export default function SimulationsFilters({
  value,
  isSearching,
  onChange,
  onReset,
}: SimulationsFiltersProps) {
  const hasFilters =
    value.status !== NO_ADMIN_FILTERS.status ||
    value.kind !== NO_ADMIN_FILTERS.kind ||
    value.source !== NO_ADMIN_FILTERS.source ||
    isSearching

  return (
    <div className="mb-8 flex flex-wrap items-end gap-4">
      {/* Nell'ordine delle colonne della tabella: il tipo e l'origine sono
          le due targhette della colonna "Tipo", lo stato è la colonna dopo.
          Chi cerca il comando lo trova dove sta la colonna che restringe. */}
      <div className={filterFieldCls}>
        <label className={labelCls} htmlFor="simulations-kind-filter">
          Tipo
        </label>
        <Select
          id="simulations-kind-filter"
          className="min-w-[180px]"
          value={value.kind}
          onChange={(kind) => onChange({ kind: kind as AdminSimulationFilters['kind'] })}
          options={ADMIN_KIND_OPTIONS}
        />
      </div>
      <div className={filterFieldCls}>
        <label className={labelCls} htmlFor="simulations-source-filter">
          Origine
        </label>
        <Select
          id="simulations-source-filter"
          className="min-w-[180px]"
          value={value.source}
          onChange={(source) => onChange({ source: source as AdminSimulationFilters['source'] })}
          options={ADMIN_SOURCE_OPTIONS}
        />
      </div>
      <div className={filterFieldCls}>
        <label className={labelCls} htmlFor="simulations-status-filter">
          Stato
        </label>
        <Select
          id="simulations-status-filter"
          className="min-w-[180px]"
          value={value.status}
          onChange={(status) => onChange({ status: status as AdminSimulationFilters['status'] })}
          options={ADMIN_STATUS_OPTIONS}
        />
      </div>
      {hasFilters && <ResetFiltersButton onClick={onReset} />}
    </div>
  )
}
