/* Una riga della tabella utenti: chi è, dove sta, com'è messo il suo account
 * e cosa ci si può fare sopra.
 *
 * Le azioni sono divise per peso: modifica ed elimina stanno in chiaro,
 * quelle sullo stato dell'account e il rinvio delle credenziali nel menu
 * kebab. Ognuna può essere bloccata, e quando lo è il tooltip dice perché:
 * un bottone spento senza motivo è un vicolo cieco. */

import type { AdminUser } from '../services/admin'
import type { UserStatus } from '../services/auth'
import { getInitials, ROLE_BADGE_CLASSES, ROLE_LABELS } from '../services/auth'
import {
  disableIcon,
  NEVER_ACCESSED_BADGE_CLASSES,
  reactivateIcon,
  resendIcon,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  suspendIcon,
} from './adminUsersConfig'
import Badge from './Badge'
import { Td, Tr } from './DataTable'
import IconButton from './IconButton'
import KebabMenu from './KebabMenu'
import type { KebabMenuItem } from './KebabMenu'
import Tooltip from './Tooltip'
import { PencilIcon, TrashIcon } from './icons'
import { formatDate, formatDateTime, formatRelativeDay, NEVER_ACCESSED_LABEL } from './lastAccess'

interface UserRowProps {
  user: AdminUser
  /** True se la riga è l'account di chi sta guardando. */
  isSelf: boolean
  onView: (user: AdminUser) => void
  onEdit: (user: AdminUser) => void
  onDelete: (user: AdminUser) => void
  onResend: (user: AdminUser) => void
  onChangeStatus: (user: AdminUser, target: UserStatus) => void
}

export default function UserRow({
  user,
  isSelf,
  onView,
  onEdit,
  onDelete,
  onResend,
  onChangeStatus,
}: UserRowProps) {
  const isSystemAccount = user.cognito_sub.startsWith('mock-')
  /* Il proprio account e quello di sistema sono intoccabili: il primo
   * perché ci si taglierebbe fuori da soli, il secondo perché è la via di
   * servizio che resta quando tutto il resto non funziona. */
  const isProtected = isSelf || isSystemAccount
  const isActive = user.status === 'active'

  const statusBlockedReason = isSelf
    ? 'Non puoi modificare lo stato del tuo stesso account'
    : "Non è possibile modificare lo stato dell'account di sistema"

  const resendBlockedReason = isSelf
    ? 'Non puoi rinviare le credenziali del tuo stesso account'
    : isSystemAccount
      ? "Non è possibile rinviare le credenziali dell'account di sistema"
      : user.status === 'disabled'
        ? "L'account è disabilitato definitivamente"
        : "L'account è sospeso: riattivalo prima di rinviare le credenziali"

  const menuItems: KebabMenuItem[] = []
  // La disabilitazione è definitiva: su un account già disabilitato non
  // resta alcuna transizione di stato possibile.
  if (user.status !== 'disabled') {
    const toggleTarget: UserStatus = user.status === 'suspended' ? 'active' : 'suspended'
    menuItems.push({
      key: 'toggle',
      label: toggleTarget === 'active' ? 'Riattiva Account' : 'Sospendi Account',
      icon: toggleTarget === 'active' ? reactivateIcon : suspendIcon,
      disabled: isProtected,
      disabledReason: statusBlockedReason,
      onSelect: () => onChangeStatus(user, toggleTarget),
    })
    menuItems.push({
      key: 'disable',
      label: 'Disabilita Account',
      icon: disableIcon,
      danger: true,
      disabled: isProtected,
      disabledReason: statusBlockedReason,
      onSelect: () => onChangeStatus(user, 'disabled'),
    })
  }
  menuItems.push({
    key: 'resend',
    label: 'Rinvia Credenziali',
    icon: resendIcon,
    disabled: isProtected || !isActive,
    disabledReason: resendBlockedReason,
    onSelect: () => onResend(user),
  })

  const fullName = user.nome && user.cognome ? `${user.nome} ${user.cognome}` : '—'

  return (
    <Tr className={`cursor-pointer ${isActive ? '' : 'opacity-60'}`} onClick={() => onView(user)}>
      <Td>
        <div className="flex items-center gap-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-bold text-white">
            {getInitials(user.nome, user.cognome, user.email)}
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-slate-100">{fullName}</span>
            <span className="text-[0.75rem] text-slate-500">{user.email}</span>
          </div>
        </div>
      </Td>
      <Td>
        {user.organization_name ? (
          <span className="text-[0.85rem] text-slate-300">{user.organization_name}</span>
        ) : (
          <span className="text-[0.75rem] italic text-slate-500">Nessuna (super admin)</span>
        )}
      </Td>
      <Td>
        <Badge tone={ROLE_BADGE_CLASSES[user.ruolo] ?? ''}>
          {ROLE_LABELS[user.ruolo] ?? user.ruolo}
        </Badge>
      </Td>
      <Td>
        <Badge tone={STATUS_BADGE_CLASSES[user.status] ?? ''}>
          {STATUS_LABELS[user.status] ?? user.status}
        </Badge>
      </Td>
      <Td>
        {user.last_login_at ? (
          <Tooltip content={formatDateTime(user.last_login_at)}>
            <span className="text-[0.85rem] text-slate-400">
              {formatRelativeDay(user.last_login_at)}
            </span>
          </Tooltip>
        ) : (
          <Tooltip content="L'invito è stato inviato ma l'utente non ha mai effettuato l'accesso.">
            <Badge tone={NEVER_ACCESSED_BADGE_CLASSES}>{NEVER_ACCESSED_LABEL}</Badge>
          </Tooltip>
        )}
      </Td>
      <Td>
        <span className="text-[0.85rem] text-slate-500">{formatDate(user.created_at)}</span>
      </Td>
      <Td onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-2">
          <IconButton
            label={`Modifica ${user.email}`}
            tooltip="Modifica Utente"
            onClick={() => onEdit(user)}
          >
            <PencilIcon />
          </IconButton>
          <IconButton
            tone="danger"
            label={`Elimina ${user.email}`}
            tooltip={
              isSelf
                ? 'Non puoi eliminare il tuo stesso account'
                : isSystemAccount
                  ? "Non è possibile eliminare l'account di sistema"
                  : 'Elimina Utente'
            }
            disabled={isProtected}
            onClick={() => onDelete(user)}
          >
            <TrashIcon />
          </IconButton>
          <Tooltip wrap content="Altre azioni">
            <KebabMenu label={`Altre azioni per ${user.email}`} items={menuItems} />
          </Tooltip>
        </div>
      </Td>
    </Tr>
  )
}
