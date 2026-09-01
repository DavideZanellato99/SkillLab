/* La barra dei filtri della gestione utenti: organizzazione, ruolo, stato,
 * accesso, più il pulsante che li azzera tutti.
 *
 * I filtri girano sul server, quindi coprono l'intero elenco e non solo la
 * finestra già caricata: qui è solo il pannello che li sceglie.
 *
 * Anche la ricerca è un filtro, benché la casella stia dentro la tabella:
 * «Azzera Filtri» riporta l'elenco completo, quindi comprende pure quella e
 * compare anche quando è l'unica cosa attiva. Restringere il pulsante alle
 * sole tendine voleva dire azzerare e vedere ancora un elenco filtrato. */

import type { UserStatus } from '../services/auth'
import { ROLE_OPTIONS, STATUS_LABELS } from './adminUsersConfig'
import FiltersBar, { FilterField } from './FiltersBar'
import ResetFiltersButton from './ResetFiltersButton'
import Select from './Select'

const ACCESS_OPTIONS = [
  { value: '', label: 'Qualsiasi accesso' },
  { value: 'never', label: 'Mai acceduto' },
  { value: 'done', label: 'Ha già acceduto' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'Tutti gli stati' },
  ...(Object.keys(STATUS_LABELS) as UserStatus[]).map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
  })),
]

export interface UsersFiltersValue {
  organizationId: string
  ruolo: string
  status: string
  access: string
}

interface UsersFiltersProps {
  value: UsersFiltersValue
  organizationOptions: { value: string; label: string }[]
  /** Se c'è una ricerca in corso nella casella della tabella. */
  isSearching: boolean
  onChange: (patch: Partial<UsersFiltersValue>) => void
  onReset: () => void
}

export default function UsersFilters({
  value,
  organizationOptions,
  isSearching,
  onChange,
  onReset,
}: UsersFiltersProps) {
  const hasFilters = Boolean(
    value.organizationId || value.ruolo || value.status || value.access || isSearching,
  )

  return (
    <FiltersBar>
      <FilterField label="Organizzazione" htmlFor="users-org-filter">
        <Select
          id="users-org-filter"
          className="min-w-[220px]"
          value={value.organizationId}
          onChange={(organizationId) => onChange({ organizationId })}
          options={[{ value: '', label: 'Tutte le organizzazioni' }, ...organizationOptions]}
        />
      </FilterField>
      <FilterField label="Ruolo" htmlFor="users-role-filter">
        <Select
          id="users-role-filter"
          className="min-w-[180px]"
          value={value.ruolo}
          onChange={(ruolo) => onChange({ ruolo })}
          options={[{ value: '', label: 'Tutti i ruoli' }, ...ROLE_OPTIONS]}
        />
      </FilterField>
      <FilterField label="Stato" htmlFor="users-status-filter">
        <Select
          id="users-status-filter"
          className="min-w-[160px]"
          value={value.status}
          onChange={(status) => onChange({ status })}
          options={STATUS_OPTIONS}
        />
      </FilterField>
      <FilterField label="Accesso" htmlFor="users-access-filter">
        <Select
          id="users-access-filter"
          className="min-w-[180px]"
          value={value.access}
          onChange={(access) => onChange({ access })}
          options={ACCESS_OPTIONS}
        />
      </FilterField>
      {hasFilters && <ResetFiltersButton onClick={onReset} />}
    </FiltersBar>
  )
}
