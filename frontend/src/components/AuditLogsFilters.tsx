/* La barra dei filtri del registro attività: organizzazione, azione e il
 * periodo, più il pulsante che li azzera tutti. Le tendine stanno nell'ordine
 * delle colonne che restringono, come in ogni barra di filtri dell'app.
 *
 * I filtri girano sul server, quindi coprono tutto il registro e non solo la
 * finestra già scaricata: qui è solo il pannello che li sceglie.
 *
 * Anche la ricerca è un filtro, benché la casella stia dentro la tabella, ed è
 * per questo che il pannello vuole sapere se è scritta: «Azzera Filtri»
 * riporta il registro intero, quindi comprende pure quella e compare anche
 * quando è l'unica cosa attiva. È la stessa regola della gestione utenti, che
 * qui era diversa: si premeva il pulsante e il registro restava filtrato.
 *
 * Le due date sono un giorno di calendario a testa, letto nell'ora di chi le
 * sceglie: da lì a un momento vero ci pensa il servizio, e i due estremi si
 * limitano a vicenda perché un intervallo rovesciato non è una domanda. */

import type { AuditLogsFiltersValue } from './auditFormat'
import { formInputCls } from './Field'
import FiltersBar, { FilterField } from './FiltersBar'
import ResetFiltersButton from './ResetFiltersButton'
import Select from './Select'

/* Il campo data porta il proprio bordo come ogni altro campo dell'app; in più
 * chiede al browser il calendario scuro, che altrimenti aprirebbe quello
 * chiaro di sistema in mezzo a una pagina scura. */
const dateInputCls = `${formInputCls} [color-scheme:dark]`

interface AuditLogsFiltersProps {
  value: AuditLogsFiltersValue
  actionOptions: { value: string; label: string }[]
  organizationOptions: { value: string; label: string }[]
  /** Se c'è una ricerca in corso nella casella della tabella. */
  isSearching: boolean
  onChange: (patch: Partial<AuditLogsFiltersValue>) => void
  onReset: () => void
}

export default function AuditLogsFilters({
  value,
  actionOptions,
  organizationOptions,
  isSearching,
  onChange,
  onReset,
}: AuditLogsFiltersProps) {
  const hasFilters = Boolean(
    value.action || value.organizationId || value.dateFrom || value.dateTo || isSearching,
  )

  return (
    <FiltersBar>
      {/* Nell'ordine delle colonne della tabella: prima l'organizzazione,
          poi l'azione. Le due date restano in fondo, che il periodo si
          sceglie una volta e le due tendine si cambiano di continuo. */}
      <FilterField label="Organizzazione" htmlFor="audit-org-filter">
        <Select
          id="audit-org-filter"
          className="min-w-[220px]"
          value={value.organizationId}
          onChange={(organizationId) => onChange({ organizationId })}
          options={[{ value: '', label: 'Tutte le organizzazioni' }, ...organizationOptions]}
        />
      </FilterField>
      <FilterField label="Azione" htmlFor="audit-action-filter">
        <Select
          id="audit-action-filter"
          className="min-w-[240px]"
          value={value.action}
          onChange={(action) => onChange({ action })}
          options={[{ value: '', label: 'Tutte le azioni' }, ...actionOptions]}
        />
      </FilterField>
      <FilterField label="Dal" htmlFor="audit-date-from">
        <input
          id="audit-date-from"
          type="date"
          className={dateInputCls}
          value={value.dateFrom}
          max={value.dateTo || undefined}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
        />
      </FilterField>
      <FilterField label="Al" htmlFor="audit-date-to">
        <input
          id="audit-date-to"
          type="date"
          className={dateInputCls}
          value={value.dateTo}
          min={value.dateFrom || undefined}
          onChange={(e) => onChange({ dateTo: e.target.value })}
        />
      </FilterField>
      {hasFilters && <ResetFiltersButton onClick={onReset} />}
    </FiltersBar>
  )
}
