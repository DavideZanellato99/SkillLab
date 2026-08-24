/* La voce del sito pubblico dentro la navbar.
 *
 * È una sola, perché prima dell'accesso di pagine ce n'è una sola: la
 * presentazione. Resta comunque una voce e non solo il logo, che riporta
 * alla pagina iniziale senza dirlo, e da una barra di navigazione vuota non
 * si capisce dove si è.
 *
 * Una voce sola sta in fila a qualunque larghezza, quindi qui non serve
 * nessuna forma compatta. La forma, accesa o spenta, è quella delle voci di
 * dentro: sono la stessa barra, e due definizioni finirebbero per non
 * somigliarsi più. */

import { Link, useLocation } from 'react-router'
import { navLinkClasses } from '../navLinkStyles'

/* Non porta un contenitore proprio: quello è della navbar, che decide anche
   a che larghezza la voce sparisce. */
export function PublicNavLinks() {
  const { pathname } = useLocation()
  const isActive = pathname === '/'

  return (
    <Link to="/" className={navLinkClasses(isActive)} aria-current={isActive ? 'page' : undefined}>
      Home
    </Link>
  )
}
