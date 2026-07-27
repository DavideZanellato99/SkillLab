/* Configurazione statica della pagina di gestione utenti: opzioni, etichette,
 * badge di stato, icone del menu kebab e la mappa delle azioni di stato
 * (sospendi / riattiva / disabilita). Sono soli dati e markup senza logica,
 * tenuti fuori da AdminPage per non appesantirla. */

import type { ReactNode } from 'react'
import type { DataTableColumn } from './DataTable'
import type { RoleName, UserStatus } from '../services/auth'

export const ROLE_OPTIONS: { value: RoleName; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'organization_admin', label: 'Organization Admin' },
  { value: 'super_admin', label: 'Super Admin' },
]

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Attivo',
  suspended: 'Sospeso',
  disabled: 'Disabilitato',
}

export const STATUS_BADGE_CLASSES: Record<UserStatus, string> = {
  active: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  suspended: 'border border-amber-500/30 bg-amber-500/10 text-amber-400',
  disabled: 'border border-red-500/30 bg-red-500/10 text-red-400',
}

export const USER_COLUMNS: DataTableColumn[] = [
  { key: 'utente', label: 'Utente' },
  { key: 'organizzazione', label: 'Organizzazione' },
  { key: 'ruolo', label: 'Ruolo' },
  { key: 'stato', label: 'Stato' },
  { key: 'creazione', label: 'Data Creazione' },
  { key: 'azioni', label: 'Azioni', align: 'right' },
]

/* Icone 14x14 delle voci del menu kebab */
export const suspendIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="10" y1="15" x2="10" y2="9" />
    <line x1="14" y1="15" x2="14" y2="9" />
  </svg>
)
export const reactivateIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)
export const disableIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
)
export const resendIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
)

/* Sospensione, riattivazione e disabilitazione sono azioni distinte: ognuna
 * ha la propria voce di menu e la propria modale di conferma, con copy e
 * accento dedicati. La chiave è lo stato verso cui si sta passando. */
export interface StatusAction {
  title: string
  iconWrapperCls: string
  icon: ReactNode
  description: (email: string) => ReactNode
  confirmLabel: string
  pendingLabel: string
  confirmCls: string
  /** Participio usato nel messaggio di conferma in cima alla pagina */
  successVerb: string
}

export const STATUS_ACTIONS: Record<UserStatus, StatusAction> = {
  active: {
    title: 'Riattiva Account',
    iconWrapperCls: 'border border-emerald-500/25 bg-emerald-500/10',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#10b981"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    description: (email) => (
      <>
        L'account di <strong className="text-slate-100">{email}</strong> torna attivo: l'utente
        potrà accedere di nuovo con le credenziali che possiede già.
      </>
    ),
    confirmLabel: 'Riattiva Account',
    pendingLabel: 'Riattivazione...',
    confirmCls:
      'border border-emerald-500/35 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
    successVerb: 'riattivato',
  },
  suspended: {
    title: 'Sospendi Account',
    iconWrapperCls: 'border border-amber-500/25 bg-amber-500/10',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="10" y1="15" x2="10" y2="9" />
        <line x1="14" y1="15" x2="14" y2="9" />
      </svg>
    ),
    description: (email) => (
      <>
        Blocchi temporaneamente l'accesso di <strong className="text-slate-100">{email}</strong>: il
        login viene impedito e le sessioni aperte chiuse subito. La sospensione è reversibile, puoi
        riattivare l'account quando vuoi.
      </>
    ),
    confirmLabel: 'Sospendi Account',
    pendingLabel: 'Sospensione...',
    confirmCls: 'border border-amber-500/35 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20',
    successVerb: 'sospeso',
  },
  disabled: {
    title: 'Disabilita Account',
    iconWrapperCls: 'border border-red-500/25 bg-red-500/10',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ef4444"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    ),
    description: (email) => (
      <>
        Disabiliti in modo definitivo <strong className="text-slate-100">{email}</strong>: il login
        viene bloccato, le sessioni aperte chiuse subito e l'account non potrà più essere
        riattivato.
      </>
    ),
    confirmLabel: 'Disabilita Definitivamente',
    pendingLabel: 'Disabilitazione...',
    confirmCls:
      'border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]',
    successVerb: 'disabilitato definitivamente',
  },
}
