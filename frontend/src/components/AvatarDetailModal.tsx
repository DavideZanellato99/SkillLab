import DetailModal, { DetailField } from './DetailModal'
import AuthorshipFields from './AuthorshipFields'
import Badge from './Badge'
import { categoryBadgeClasses } from './categoryStyles'
import { formatDateTime } from './lastAccess'
import { ALL_PROFILE_KEYS, countFilled } from './avatarProfileConfig'
import { getAvatarImageUrl } from '../services/api'
import type { AdminAvatar } from '../services/admin'

/* Scheda di sola lettura di un avatar, aperta dal clic sulla riga della
 * tabella. È la stessa modale del dettaglio di un utente e di
 * un'organizzazione (DetailModal + DetailField): cambiano i campi, non il
 * modo di mostrarli.
 *
 * La scheda persona non viene ricopiata qui: si legge e si scrive nel form
 * di modifica, e duplicarla vorrebbe dire tenere allineati due posti. Qui
 * resta quanto è compilata, che è l'unica cosa che si vuole sapere prima di
 * decidere se aprirla. */

export default function AvatarDetailModal({
  avatar,
  onClose,
}: {
  avatar: AdminAvatar
  onClose: () => void
}) {
  const filled = countFilled(avatar.profile)
  const percent = Math.round((filled / ALL_PROFILE_KEYS.length) * 100)

  return (
    <DetailModal
      onClose={onClose}
      title={avatar.name}
      subtitle={avatar.organization_name}
      header={
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/6">
          <img
            className="h-full w-full object-cover"
            src={getAvatarImageUrl(avatar.image_url)}
            alt={avatar.name}
          />
        </div>
      }
    >
      <DetailField label="Stato">
        {avatar.deleted_at ? (
          <Badge tone="border border-amber-500/30 bg-amber-500/10 text-amber-400">Archiviato</Badge>
        ) : (
          <Badge tone="border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            In catalogo
          </Badge>
        )}
      </DetailField>
      {avatar.deleted_at && (
        <DetailField label="Archiviato il">{formatDateTime(avatar.deleted_at)}</DetailField>
      )}
      <DetailField label="Organizzazione">{avatar.organization_name}</DetailField>
      <DetailField label="Categoria">
        <Badge tone={categoryBadgeClasses(avatar.category_color)}>{avatar.category}</Badge>
      </DetailField>
      <DetailField label="Difficoltà">
        {avatar.difficulty ? (
          <span className="text-orange-400">{avatar.difficulty}</span>
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </DetailField>
      <DetailField label="Brief per l'operatore">
        {avatar.description || <span className="text-slate-500">Nessun brief</span>}
      </DetailField>
      <DetailField label="Voce">
        {avatar.voice_id ? (
          <span className="break-all font-mono text-[0.78rem] text-slate-300">
            {avatar.voice_id}
          </span>
        ) : (
          <span className="text-slate-500">Voce predefinita</span>
        )}
      </DetailField>
      <DetailField label="Conversazioni">{avatar.conversation_count}</DetailField>
      <DetailField label="Scheda persona">
        <div>{percent}% compilata</div>
        <div className="text-xs text-slate-500">
          {filled} campi su {ALL_PROFILE_KEYS.length}
        </div>
      </DetailField>
      <AuthorshipFields row={avatar} />
      <DetailField label="ID avatar" mono>
        {avatar.id}
      </DetailField>
    </DetailModal>
  )
}
