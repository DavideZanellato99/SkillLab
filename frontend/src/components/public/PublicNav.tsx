/* La voce del sito pubblico dentro la navbar.
 *
 * È una sola, perché prima dell'accesso di pagine ce n'è una sola: la
 * presentazione. Resta comunque una voce e non solo il logo, che riporta
 * alla pagina iniziale senza dirlo, e da una barra di navigazione vuota non
 * si capisce dove si è.
 *
 * Una voce sola sta in fila a qualunque larghezza, quindi qui non serve
 * nessuna forma compatta. */

import { Link, useLocation } from 'react-router'

const linkCls =
  'relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.85rem] font-medium no-underline transition'
const activeCls =
  "bg-violet-600/10 text-slate-100 after:absolute after:-bottom-px after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-sm after:bg-gradient-to-r after:from-violet-600 after:to-cyan-500 after:content-['']"
const idleCls = 'text-slate-400 hover:bg-white/8 hover:text-slate-100'

/* Non porta un contenitore proprio: quello è della navbar, che decide anche
   a che larghezza la voce sparisce. */
export function PublicNavLinks() {
  const { pathname } = useLocation()

  return (
    <Link to="/" className={`${linkCls} ${pathname === '/' ? activeCls : idleCls}`}>
      Home
    </Link>
  )
}
