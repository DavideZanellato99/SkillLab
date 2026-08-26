import DetailModal, { DetailField } from './DetailModal'
import AuthorshipFields from './AuthorshipFields'
import Badge from './Badge'
import PrimaryButton from './PrimaryButton'
import { categoryBadgeClasses } from './categoryStyles'
import { formatDateTime } from './lastAccess'
import { ALL_PROFILE_KEYS, countFilled } from './avatarProfileConfig'
import { useVoices } from '../hooks/useAdminAvatars'
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

interface AvatarDetailModalProps {
  avatar: AdminAvatar
  onClose: () => void
  /** Passa alla scheda modificabile. Manca per un avatar archiviato, che è
   *  in sola lettura finché non torna in catalogo. */
  onEdit?: () => void
}

export default function AvatarDetailModal({ avatar, onClose, onEdit }: AvatarDetailModalProps) {
  const filled = countFilled(avatar.profile)
  const percent = Math.round((filled / ALL_PROFILE_KEYS.length) * 100)

  /* Il catalogo voci solo se questo avatar ne ha una: un identificativo di
   * trentasei caratteri non dice con che voce parla il personaggio, e il
   * nome sta soltanto nel catalogo del fornitore. Si legge una volta per
   * sessione (vedi useVoices) ed è lo stesso elenco che apre il form. */
  const { data: voices, isSuccess: voicesLoaded } = useVoices(Boolean(avatar.voice_id))
  const voiceName = voices?.find((v) => v.id === avatar.voice_id)?.name
  const voiceLabel = voiceName ?? (voicesLoaded ? 'Non più nel catalogo delle voci' : '')

  const isArchived = avatar.deleted_at !== null

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
      footer={
        onEdit && !isArchived ? (
          <PrimaryButton variant="submit" onClick={onEdit}>
            Modifica Avatar
          </PrimaryButton>
        ) : undefined
      }
    >
      <DetailField label="Stato">
        {isArchived ? (
          <Badge tone="border border-amber-500/30 bg-amber-500/10 text-amber-400">Archiviato</Badge>
        ) : (
          <Badge tone="border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            In Catalogo
          </Badge>
        )}
      </DetailField>
      {avatar.deleted_at !== null && (
        <DetailField label="Archiviato il">{formatDateTime(avatar.deleted_at)}</DetailField>
      )}
      <DetailField label="Organizzazione">{avatar.organization_name}</DetailField>
      <DetailField label="Categoria">
        <Badge tone={categoryBadgeClasses(avatar.category_color)}>{avatar.category}</Badge>
      </DetailField>
      <DetailField label="Brief per l'Operatore">
        {avatar.description || <span className="text-slate-500">Nessun brief</span>}
      </DetailField>
      <DetailField label="Voce">
        {avatar.voice_id ? (
          <>
            {/* Il nome compare quando il catalogo è arrivato: finché non c'è,
                l'identificativo da solo è comunque la verità, e una scritta
                di attesa in una riga alta due centimetri sarebbe peggio. */}
            {voiceLabel && <div>{voiceLabel}</div>}
            <div className="break-all font-mono text-[0.7rem] text-slate-500">
              {avatar.voice_id}
            </div>
          </>
        ) : (
          <span className="text-slate-500">Voce Predefinita</span>
        )}
      </DetailField>
      <DetailField label="Conversazioni">{avatar.conversation_count}</DetailField>
      <DetailField label="Scheda Persona">
        <div>{percent}% compilata</div>
        <div className="text-xs text-slate-500">
          {filled} campi su {ALL_PROFILE_KEYS.length}
        </div>
      </DetailField>
      <AuthorshipFields row={avatar} />
      <DetailField label="ID Avatar" mono>
        {avatar.id}
      </DetailField>
    </DetailModal>
  )
}
