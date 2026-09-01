/* L'utente in sola lettura, aperto dal clic sulla riga: tutto quello che
 * l'account porta con sé, comprese le due date che si somigliano e non sono
 * la stessa cosa (vedi sotto).
 *
 * In fondo c'è la strada per modificarlo: si guarda una scheda per decidere
 * se cambiare qualcosa, e senza quel bottone bisognava chiudere, ritrovare la
 * riga nella tabella e cercarle la matita. */

import type { AdminUser } from '../services/admin'
import { getInitials, ROLE_BADGE_CLASSES, ROLE_LABELS } from '../services/auth'
import {
  NEVER_ACCESSED_BADGE_CLASSES,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
} from './adminUsersConfig'
import AuthorshipFields from './AuthorshipFields'
import Badge from './Badge'
import DetailModal, { DetailField } from './DetailModal'
import { PencilIcon } from './icons'
import { formatDateTime, formatRelativeDay, NEVER_ACCESSED_LABEL } from './dateFormat'
import PrimaryButton from './PrimaryButton'

/** Data e ora estese, con quanto tempo fa è stata: "il 3 marzo (2 giorni fa)". */
const withRelative = (iso: string) => `${formatDateTime(iso)} (${formatRelativeDay(iso)})`

export default function UserDetailModal({
  user,
  onClose,
  onEdit,
}: {
  user: AdminUser
  onClose: () => void
  /** Passa alla modifica di questo account, chiudendo la scheda. */
  onEdit: () => void
}) {
  return (
    <DetailModal
      onClose={onClose}
      footer={
        <PrimaryButton variant="submit" icon={<PencilIcon />} onClick={onEdit}>
          Modifica Utente
        </PrimaryButton>
      }
      title={user.nome && user.cognome ? `${user.nome} ${user.cognome}` : user.email}
      subtitle={user.email}
      header={
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-sm font-bold text-white">
          {getInitials(user.nome, user.cognome, user.email)}
        </div>
      }
    >
      <DetailField label="Nome">{user.nome || '—'}</DetailField>
      <DetailField label="Cognome">{user.cognome || '—'}</DetailField>
      <DetailField label="Email">{user.email}</DetailField>
      <DetailField label="Organizzazione">
        {user.organization_name ?? (
          <span className="italic text-slate-500">Nessuna (super admin)</span>
        )}
      </DetailField>
      <DetailField label="Ruolo">
        <Badge tone={ROLE_BADGE_CLASSES[user.ruolo] ?? ''}>
          {ROLE_LABELS[user.ruolo] ?? user.ruolo}
        </Badge>
      </DetailField>
      <DetailField label="Stato">
        <Badge tone={STATUS_BADGE_CLASSES[user.status] ?? ''}>
          {STATUS_LABELS[user.status] ?? user.status}
        </Badge>
      </DetailField>
      <DetailField label="Ultimo Accesso">
        {user.last_login_at ? (
          withRelative(user.last_login_at)
        ) : (
          <Badge tone={NEVER_ACCESSED_BADGE_CLASSES}>{NEVER_ACCESSED_LABEL}</Badge>
        )}
      </DetailField>
      {/* L'accesso dice quando la sessione è nata, questa quando è stata
          usata l'ultima volta: su una sessione che si rinnova da sola le
          due date possono distare settimane. Conta solo quello che fa una
          persona, non il ricontrollo automatico della campanella, e si
          aggiorna a intervalli di pochi minuti: l'orario è preciso quanto
          basta a dire "adesso" e non va letto al secondo. */}
      <DetailField label="Ultima Attività">
        {user.last_activity_at ? withRelative(user.last_activity_at) : '—'}
      </DetailField>
      <AuthorshipFields row={user} />
      <DetailField label="ID Utente" mono>
        {user.id}
      </DetailField>
      <DetailField label="Cognito Sub" mono>
        {user.cognito_sub}
      </DetailField>
    </DetailModal>
  )
}
