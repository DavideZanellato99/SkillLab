/* Una voce in fila nella barra di navigazione.
 *
 * Il blocco di classi dello stato acceso era ricopiato per ogni voce, cinque
 * volte identico dentro Navbar e una sesta nella barra del sito pubblico:
 * cambiare la sottolineatura voleva dire cambiarla sei volte, e bastava
 * dimenticarne una perché una sezione si accendesse in modo diverso dalle
 * altre. Ora la forma è una sola e sta in `navLinkStyles`. */

import { Link } from 'react-router'
import { prefetchOnHover } from './lazyPages'
import type { NavEntry } from './navEntries'
import { navLinkClasses } from './navLinkStyles'

export default function NavbarLink({ entry, isActive }: { entry: NavEntry; isActive: boolean }) {
  const { Icon } = entry
  return (
    <Link
      to={entry.to}
      className={navLinkClasses(isActive)}
      /* Le pagine di amministrazione arrivano su richiesta, e il file parte
         di qui: fra il puntatore che entra nella voce e il click c'è il
         tempo che serve, e la pagina si apre senza attesa. Sulle sezioni
         che sono già nel primo file non fa niente (vedi `lazyPages`). */
      {...prefetchOnHover(entry.to)}
      /* Come la guida introduttiva ritrova questa voce per illuminarla
         (vedi `tutorialSteps`). Lo dichiara la voce, e non un elenco di
         selettori scritto altrove, così una sezione nuova è indicabile
         senza che nessuno se ne ricordi. */
      data-tour={entry.to}
      /* La voce accesa non è solo colorata: per chi legge con uno screen
         reader è questa la pagina in cui si trova. */
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon size={16} />
      {entry.label}
    </Link>
  )
}
