/* Una voce in fila nella barra di navigazione.
 *
 * Il blocco di classi dello stato acceso era ricopiato per ogni voce, cinque
 * volte identico dentro Navbar e una sesta nella barra del sito pubblico:
 * cambiare la sottolineatura voleva dire cambiarla sei volte, e bastava
 * dimenticarne una perché una sezione si accendesse in modo diverso dalle
 * altre. Ora la forma è una sola e sta in `navLinkStyles`. */

import { Link } from 'react-router'
import type { NavEntry } from './navEntries'
import { navLinkClasses } from './navLinkStyles'

export default function NavbarLink({ entry, isActive }: { entry: NavEntry; isActive: boolean }) {
  const { Icon } = entry
  return (
    <Link
      to={entry.to}
      className={navLinkClasses(isActive)}
      /* La voce accesa non è solo colorata: per chi legge con uno screen
         reader è questa la pagina in cui si trova. */
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon size={16} />
      {entry.label}
    </Link>
  )
}
