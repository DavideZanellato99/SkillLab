/* Quello che si vede al posto della griglia quando non resta nessun avatar.
 *
 * Le ragioni sono tre e vanno dette come tre: la ricerca non ha trovato
 * niente, la categoria scelta è vuota, oppure il catalogo è vuoto davvero.
 * Le prime due chi guarda le risolve sul momento, e il riquadro gli porge il
 * gesto che le annulla; la terza no, e allora l'unica cosa utile è dire di
 * chi è il lavoro che manca. Prima era una frase sola, «Nessun avatar
 * presente in questa categoria», che nel catalogo vuoto mandava a cercare in
 * altre categorie che non esistevano.
 *
 * Il riquadro in sé è quello delle gallerie (`GalleryEmpty`): qui restano le
 * tre ragioni, che sono la parte che parla di avatar. */

import GalleryEmpty from './GalleryEmpty'
import { SearchIcon, UsersIcon } from './icons'

export type EmptyReason = 'search' | 'category' | 'catalog'

interface AvatarGalleryEmptyProps {
  reason: EmptyReason
  /** Il super admin è l'unico che il catalogo lo può riempire. */
  canManageAvatars: boolean
  onClearSearch: () => void
  onShowAll: () => void
}

export default function AvatarGalleryEmpty({
  reason,
  canManageAvatars,
  onClearSearch,
  onShowAll,
}: AvatarGalleryEmptyProps) {
  if (reason === 'search') {
    return (
      <GalleryEmpty
        icon={<SearchIcon size={40} />}
        message="Nessun avatar corrisponde a questa ricerca"
        action={{ label: 'Azzera la ricerca', onClick: onClearSearch }}
      />
    )
  }
  if (reason === 'category') {
    return (
      <GalleryEmpty
        icon={<SearchIcon size={40} />}
        message="Nessun avatar in questa categoria"
        action={{ label: 'Mostra tutto il catalogo', onClick: onShowAll }}
      />
    )
  }
  return (
    <GalleryEmpty
      icon={<UsersIcon size={40} />}
      message="Il catalogo degli avatar è ancora vuoto"
      action={
        canManageAvatars
          ? { label: 'Vai alla gestione avatar', to: '/app/admin/avatars' }
          : undefined
      }
    />
  )
}
