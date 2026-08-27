/* La testata della galleria: cosa sono gli avatar, e quanti ce n'è.
 *
 * I due numeri li legge da sé. Prima glieli passava la galleria, che li
 * calcolava sulla lista che aveva a schermo e li rimandava in su con una
 * callback: era un giro inutile (due render in più a ogni cambio di filtro)
 * e diceva la cosa sbagliata, perché scegliendo una categoria il numero
 * sotto "Avatar" calava, come se il catalogo si fosse rimpicciolito.
 *
 * Qui contano sempre il catalogo intero, che è quello che la testata sta
 * presentando: quanti ce n'è di quelli scelti lo dice la griglia sotto,
 * mostrandoli. Le due query sono le stesse della galleria e stanno nella
 * stessa cache, quindi non c'è nessuna chiamata in più.
 *
 * La fascia in sé è la stessa del simulatore tecnico e sta in
 * `GalleryHero`: qui restano solo i numeri e le parole, che sono la parte
 * che distingue le due schermate. */

import { useAvatars, useCategories } from '../hooks/useAvatars'
import GalleryHero from './GalleryHero'

export default function Header() {
  const { data: avatars = [], isLoading: loadingAvatars } = useAvatars()
  const { data: categories = [], isLoading: loadingCategories } = useCategories()

  return (
    <GalleryHero
      id="hero"
      className="px-8 pb-12 pt-16 max-md:px-4 max-md:pb-8 max-md:pt-12"
      title="Scegli il tuo"
      highlight="Avatar"
      description="Ogni avatar è un interlocutore simulato con personalità, emozioni e uno scenario da affrontare. Seleziona l'interlocutore con cui esercitarti e avvia la chiamata."
      stats={[
        { value: avatars.length, label: 'Avatar', isLoading: loadingAvatars },
        { value: categories.length, label: 'Categorie', isLoading: loadingCategories },
      ]}
    />
  )
}
