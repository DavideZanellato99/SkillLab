/* La galleria: la testata che presenta il catalogo, e il catalogo stesso.
 * Niente stato da tenere qui in mezzo, i due pezzi leggono gli stessi dati
 * dalla stessa cache.
 *
 * Sta in un file suo e non dentro App perché è la pagina di una rotta come
 * tutte le altre, e come tutte le altre arriva su richiesta: dentro App
 * sarebbe finita nel primo file, cioè addosso anche a chi sta leggendo il
 * sito pubblico e una galleria non la vedrà mai (vedi `lazyPages`). */

import AvatarGallery from './AvatarGallery'
import Header from './Header'
import { GalleryContainer } from './PageLayout'

export default function HomePage() {
  return (
    <>
      <Header />
      <GalleryContainer>
        <AvatarGallery />
      </GalleryContainer>
    </>
  )
}
