/* La galleria: la testata che presenta il catalogo, e il catalogo stesso.
 * I due pezzi leggono gli stessi dati dalla stessa cache.
 *
 * Lo stato che sta qui in mezzo è uno solo, se la modale della richiesta è
 * aperta: il pulsante che la apre sta nell'angolo della fascia, l'elenco
 * delle richieste e la modale stessa stanno nel pannello sotto, e i due si
 * parlano attraverso la pagina.
 *
 * Sta in un file suo e non dentro App perché è la pagina di una rotta come
 * tutte le altre, e come tutte le altre arriva su richiesta: dentro App
 * sarebbe finita nel primo file, cioè addosso anche a chi sta leggendo il
 * sito pubblico e una galleria non la vedrà mai (vedi `lazyPages`). */

import { useState } from 'react'

import { useAuth } from '../hooks/useAuth'
import { isOrganizationAdmin } from '../services/auth'
import AvatarGallery from './AvatarGallery'
import AvatarRequestsPanel from './AvatarRequestsPanel'
import Header from './Header'
import { GalleryContainer } from './PageLayout'
import PrimaryButton from './PrimaryButton'
import { PlusIcon } from './icons'

export default function HomePage() {
  const { user } = useAuth()
  /* Solo un organization admin chiede avatar: chi si allena non ha un
   * catalogo da far crescere, e il super admin non ha nessuno a cui chiedere. */
  const canRequest = isOrganizationAdmin(user)
  const [isRequesting, setIsRequesting] = useState(false)

  return (
    <>
      <Header
        actions={
          canRequest && (
            <PrimaryButton icon={<PlusIcon />} onClick={() => setIsRequesting(true)}>
              Richiedi un Avatar
            </PrimaryButton>
          )
        }
      />
      <GalleryContainer>
        {canRequest && (
          <AvatarRequestsPanel
            isRequesting={isRequesting}
            onCloseRequest={() => setIsRequesting(false)}
          />
        )}
        <AvatarGallery />
      </GalleryContainer>
    </>
  )
}
