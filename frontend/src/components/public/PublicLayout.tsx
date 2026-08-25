/* L'impaginazione comune alle pagine pubbliche: il contenuto e sotto il
 * footer.
 *
 * Ci sta anche il ritorno in cima a ogni cambio di pagina. Senza, chi legge
 * la fine del simulatore e passa alla valutazione atterra a metà pagina, che
 * è il modo in cui una navigazione a più pagine sembra rotta. L'ancora dentro
 * la stessa pagina resta esclusa, perché lì lo scorrimento è quello che la
 * persona ha appena chiesto. */

import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import PublicFooter from './PublicFooter'
import { mainContentCls, mainContentProps } from '../mainContent'

export default function PublicLayout() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) return
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname, hash])

  return (
    <>
      <main {...mainContentProps} className={`${mainContentCls} flex-1`}>
        <Outlet />
      </main>
      <PublicFooter />
    </>
  )
}
