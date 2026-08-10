/* La barra dei filtri della gestione utenti: organizzazione, ruolo, stato,
 * accesso, più il pulsante che li azzera tutti.
 *
 * I filtri girano sul server, quindi coprono l'intero elenco e non solo la
 * finestra già caricata: qui è solo il pannello che li sceglie. */

import type { UserStatus } from '../services/auth'
import { ROLE_OPTIONS, STATUS_LABELS } from './adminUsersConfig'
import { fieldCls, labelCls } from './Field'
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
  onChange: (patch: Partial<UsersFiltersValue>) => void
  onReset: () => void
}

export default function UsersFilters({
  value,
  organizationOptions,
  onChange,
  onReset,
}: UsersFiltersProps) {
  // La ricerca testuale non conta: vive dentro la tabella e ha già il suo
  // modo di essere svuotata.
  const hasFilters = Boolean(value.organizationId || value.ruolo || value.status || value.access)

  return (
    <div className="mb-8 flex flex-wrap items-end gap-4">
      <div className={fieldCls}>
        <label className={labelCls} htmlFor="users-org-filter">
          Organizzazione
        </label>
        <Select
          id="users-org-filter"
          className="min-w-[220px]"
          value={value.organizationId}
          onChange={(organizationId) => onChange({ organizationId })}
          options={[{ value: '', label: 'Tutte le organizzazioni' }, ...organizationOptions]}
        />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} htmlFor="users-role-filter">
          Ruolo
        </label>
        <Select
          id="users-role-filter"
          className="min-w-[180px]"
          value={value.ruolo}
          onChange={(ruolo) => onChange({ ruolo })}
          options={[{ value: '', label: 'Tutti i ruoli' }, ...ROLE_OPTIONS]}
        />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} htmlFor="users-status-filter">
          Stato
        </label>
        <Select
          id="users-status-filter"
          className="min-w-[160px]"
          value={value.status}
          onChange={(status) => onChange({ status })}
          options={STATUS_OPTIONS}
        />
      </div>
      <div className={fieldCls}>
        <label className={labelCls} htmlFor="users-access-filter">
          Accesso
        </label>
        <Select
          id="users-access-filter"
          className="min-w-[180px]"
          value={value.access}
          onChange={(access) => onChange({ access })}
          options={ACCESS_OPTIONS}
        />
      </div>
      {hasFilters && (
        <button
          type="button"
          className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
          onClick={onReset}
        >
          Azzera filtri
        </button>
      )}
    </div>
  )
}
