/* Una riga della tabella avatar: chi è, di chi è e quante conversazioni ha
 * già sostenuto.
 *
 * Un avatar archiviato ha una sola azione, tornare in catalogo: la sua
 * scheda è il documento di ciò su cui gli studenti si sono allenati e resta
 * in sola lettura. */

import type { AdminAvatar } from '../services/admin'
import { getAvatarImageUrl } from '../services/api'
import Badge from './Badge'
import { categoryBadgeClasses } from './categoryStyles'
import { Td, Tr } from './DataTable'
import IconButton from './IconButton'
import Spinner from './Spinner'
import { PencilIcon, TrashIcon } from './icons'

const archivedDate = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

interface AvatarRowProps {
  avatar: AdminAvatar
  /** True mentre è questo avatar a essere ripristinato, non un altro. */
  isRestoring: boolean
  onView: (avatar: AdminAvatar) => void
  onEdit: (avatar: AdminAvatar) => void
  onDelete: (avatar: AdminAvatar) => void
  onRestore: (avatar: AdminAvatar) => void
}

export default function AvatarRow({
  avatar,
  isRestoring,
  onView,
  onEdit,
  onDelete,
  onRestore,
}: AvatarRowProps) {
  const isArchived = avatar.deleted_at !== null

  return (
    <Tr
      className={`cursor-pointer ${isArchived ? 'opacity-60' : ''}`}
      onClick={() => onView(avatar)}
    >
      {/* Come la colonna delle persone nella gestione utenti: l'intestazione
          resta al centro, i valori vanno a sinistra. Sono un'immagine, un
          nome e una descrizione, e incolonnati si scorrono con l'occhio
          invece di cercare ogni riga da capo. */}
      <Td align="left">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/6">
            <img
              className="h-full w-full object-cover"
              src={getAvatarImageUrl(avatar.image_url)}
              alt={avatar.name}
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-slate-100">{avatar.name}</span>
              {isArchived && (
                <Badge
                  tone="border border-amber-500/30 bg-amber-500/10 text-amber-400"
                  className="shrink-0"
                >
                  Archiviato
                </Badge>
              )}
            </div>
            {avatar.deleted_at ? (
              <span className="text-xs text-slate-500">
                Archiviato il {archivedDate(avatar.deleted_at)}
              </span>
            ) : (
              avatar.description && (
                <span className="max-w-[320px] truncate text-xs text-slate-500">
                  {avatar.description}
                </span>
              )
            )}
          </div>
        </div>
      </Td>
      <Td>
        <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-cyan-400">
          {avatar.organization_name}
        </span>
      </Td>
      <Td>
        <Badge tone={categoryBadgeClasses(avatar.category_color)}>{avatar.category}</Badge>
      </Td>
      <Td>
        <span className="inline-block min-w-8 rounded-full border border-white/6 bg-white/4 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-100">
          {avatar.conversation_count}
        </span>
      </Td>
      <Td onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-2">
          {isArchived ? (
            <IconButton
              tone="restore"
              label={`Ripristina ${avatar.name}`}
              tooltip="Ripristina avatar"
              onClick={() => onRestore(avatar)}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <Spinner variant="button" />
              ) : (
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
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <polyline points="3 3 3 8 8 8" />
                </svg>
              )}
            </IconButton>
          ) : (
            <>
              <IconButton
                label={`Modifica ${avatar.name}`}
                tooltip="Modifica avatar"
                onClick={() => onEdit(avatar)}
              >
                <PencilIcon />
              </IconButton>
              <IconButton
                tone="danger"
                label={`Elimina ${avatar.name}`}
                tooltip="Elimina Avatar"
                onClick={() => onDelete(avatar)}
              >
                <TrashIcon />
              </IconButton>
            </>
          )}
        </div>
      </Td>
    </Tr>
  )
}
