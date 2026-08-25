/* La riga grigia che dice perché non c'è niente da disegnare.
 *
 * Il terzo della famiglia dei banner, dopo il rosso di `FormError` e il verde
 * di `FormSuccess`: non è un errore e non è una conferma, è una constatazione,
 * e quando compare al posto di un grafico serve a non far leggere lo zero come
 * un caricamento andato storto.
 *
 * Era nato dentro la metà scritta della dashboard e ricopiato a mano due volte
 * nell'altra metà, stesso riquadro e stesso cerchio con il punto
 * interrogativo: tre copie che si sarebbero scolorite ognuna per conto suo.
 *
 * Il punto finale non c'è, come negli stati vuoti: dice cosa manca, non è un
 * errore da spiegare. */

import type { ReactNode } from 'react'
import { bannerBaseCls } from './bannerStyles'

const noticeToneCls = 'items-center border-white/6 bg-slate-800/40 px-6 py-4 text-sm text-slate-400'

export default function Notice({
  children,
  className = '',
}: {
  children: ReactNode
  /** Solo il posto del banner nella pagina, come il margine sotto. */
  className?: string
}) {
  return (
    <div className={`${bannerBaseCls} ${noticeToneCls} ${className}`}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-slate-500"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span>{children}</span>
    </div>
  )
}
