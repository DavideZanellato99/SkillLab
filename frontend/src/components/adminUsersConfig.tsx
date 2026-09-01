/* Configurazione statica della pagina di gestione utenti: opzioni, etichette,
 * badge di stato, icone del menu kebab e la mappa delle azioni di stato
 * (sospendi / riattiva / disabilita). Sono soli dati e markup senza logica,
 * tenuti fuori da AdminPage per non appesantirla. */

import type { ReactNode } from 'react'
import type { DataTableColumn } from './DataTable'
import type { AdminUser } from '../services/admin'
import type { RoleName, UserStatus } from '../services/auth'
import { SuspendIcon, ReactivateIcon, DisableIcon, ResendIcon } from './icons'

/* I ruoli sono elencati dal più ampio al più ristretto, così l'ordine del
 * menu a tendina rispecchia la gerarchia dei permessi. */
export const ROLE_OPTIONS: { value: RoleName; label: string }[] = [
  { value: 'super_admin', label: 'Super admin' },
  { value: 'organization_admin', label: 'Amministratore organizzazione' },
  { value: 'user', label: 'Utente' },
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

/* Un account mai usato non è "vecchio", è un invito rimasto in sospeso: ha
 * un badge suo invece di una data, con lo stesso ambra delle sospensioni
 * perché è anch'esso qualcosa che richiede un intervento dell'admin. */
export const NEVER_ACCESSED_BADGE_CLASSES =
  'border border-amber-500/30 bg-amber-500/10 text-amber-400'

/* Le percentuali sommano a 100. Le tre colonne di targhette (ruolo, stato,
 * ultimo accesso) sono larghe quanto la loro pillola più lunga, perché una
 * targhetta spezzata su due righe si legge peggio di una colonna generosa.
 *
 * Le sei colonne ordinabili sono quelle che il server sa ordinare (vedi
 * routers/admin.USER_SORT_COLUMNS), e la chiave è la stessa da una parte e
 * dall'altra: l'elenco arriva a finestre di duecento righe, quindi l'ordine
 * non lo può fare la tabella su quello che ha in mano. Le azioni restano
 * fuori, perché non portano un dato. */
export const USER_COLUMNS: DataTableColumn<AdminUser>[] = [
  { key: 'utente', label: 'Utente', width: '20%', sortable: true },
  { key: 'organizzazione', label: 'Organizzazione', width: '12%', sortable: true },
  { key: 'ruolo', label: 'Ruolo', width: '15%', sortable: true },
  { key: 'stato', label: 'Stato', width: '14%', sortable: true },
  { key: 'ultimo_accesso', label: 'Ultimo Accesso', width: '14%', sortable: true },
  { key: 'creazione', label: 'Data Creazione', width: '11%', sortable: true },
  { key: 'azioni', label: 'Azioni', width: '14%' },
]

/* Icone delle voci del menu kebab, alla misura di default (14px) */
export const suspendIcon = <SuspendIcon />
export const reactivateIcon = <ReactivateIcon />
export const disableIcon = <DisableIcon />
export const resendIcon = <ResendIcon />

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
    icon: <ReactivateIcon size={24} stroke="#10b981" />,
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
    icon: <SuspendIcon size={24} stroke="#f59e0b" />,
    description: (email) => (
      <>
        L'accesso di <strong className="text-slate-100">{email}</strong> viene sospeso
        temporaneamente: il login viene impedito e le sessioni aperte chiuse immediatamente. La
        sospensione è reversibile in qualsiasi momento.
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
    icon: <DisableIcon size={24} stroke="#ef4444" />,
    description: (email) => (
      <>
        L'account <strong className="text-slate-100">{email}</strong> viene disabilitato in modo
        definitivo: il login viene bloccato, le sessioni aperte chiuse immediatamente e l'account
        non potrà più essere riattivato.
      </>
    ),
    confirmLabel: 'Disabilita Definitivamente',
    pendingLabel: 'Disabilitazione...',
    confirmCls:
      'border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]',
    successVerb: 'disabilitato definitivamente',
  },
}
