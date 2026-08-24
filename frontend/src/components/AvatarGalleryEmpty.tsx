/* Quello che si vede al posto della griglia quando non resta nessun avatar.
 *
 * Le ragioni sono tre e vanno dette come tre: la ricerca non ha trovato
 * niente, la categoria scelta è vuota, oppure il catalogo è vuoto davvero.
 * Le prime due chi guarda le risolve sul momento, e il riquadro gli porge il
 * gesto che le annulla; la terza no, e allora l'unica cosa utile è dire di
 * chi è il lavoro che manca. Prima era una frase sola, «Nessun avatar
 * presente in questa categoria», che nel catalogo vuoto mandava a cercare in
 * altre categorie che non esistevano. */

import { Link } from 'react-router'
import { SearchIcon, UsersIcon } from './icons'

const actionCls =
  'cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 no-underline transition hover:bg-white/8 hover:text-slate-100'

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
  return (
    <div className="animate-fade-in p-16 text-center max-md:p-8">
      <div className="mb-4 flex justify-center text-slate-600">
        {reason === 'catalog' ? <UsersIcon size={40} /> : <SearchIcon size={40} />}
      </div>

      <p className="text-lg text-slate-500">
        {reason === 'search' && 'Nessun avatar corrisponde a questa ricerca'}
        {reason === 'category' && 'Nessun avatar in questa categoria'}
        {reason === 'catalog' && 'Il catalogo degli avatar è ancora vuoto'}
      </p>

      <div className="mt-6 flex justify-center">
        {reason === 'search' && (
          <button className={actionCls} onClick={onClearSearch}>
            Azzera la ricerca
          </button>
        )}
        {reason === 'category' && (
          <button className={actionCls} onClick={onShowAll}>
            Mostra tutto il catalogo
          </button>
        )}
        {reason === 'catalog' && canManageAvatars && (
          <Link to="/app/admin/avatars" className={actionCls}>
            Vai alla gestione avatar
          </Link>
        )}
      </div>
    </div>
  )
}
