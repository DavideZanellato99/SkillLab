/* Le forme grigie che stanno al posto delle tessere finché il catalogo non
 * arriva.
 *
 * Non è un giro di manovella in più: una griglia che compare già nella sua
 * misura non fa saltare la pagina quando i dati atterrano, e dice che si sta
 * aspettando qualcosa invece di lasciare il vuoto. Vale per tutte e due le
 * gallerie, che hanno la stessa griglia (`galleryLayout`).
 *
 * `withImage` è l'unica differenza fra le due: la tessera di un avatar si
 * apre con il ritratto quadrato, quella di un test è tutta testo, e uno
 * scheletro che promette un'immagine dove poi non c'è ne fa comparire una
 * che non arriva mai. */

import { galleryGridCls, shimmerCls } from './galleryLayout'

export default function GallerySkeleton({
  count = 6,
  withImage = false,
}: {
  count?: number
  /** Vero dove la tessera si apre con un ritratto. */
  withImage?: boolean
}) {
  return (
    <div className={galleryGridCls} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-3xl border border-white/6 bg-gray-900/60">
          {withImage && <div className={`aspect-square ${shimmerCls}`} />}
          <div className="p-6">
            <div className={`mb-2 h-3 w-3/5 rounded-md ${shimmerCls}`} />
            <div className={`mb-2 h-3 w-4/5 rounded-md ${shimmerCls}`} />
            <div className={`mb-2 h-3 rounded-md ${shimmerCls}`} />
          </div>
        </div>
      ))}
    </div>
  )
}
