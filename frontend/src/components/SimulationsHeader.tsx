/* La testata del simulatore: cosa sono i test tecnici, quanti ce n'è e di
 * quante tipologie diverse.
 *
 * È la gemella della testata della galleria ([Header](./Header.tsx)) e sta
 * fuori dal `main` come quella: la fascia presenta la schermata, il `main`
 * porta quello che ci si fa dentro. Anche i due numeri sono i suoi: là gli
 * avatar e le categorie in cui stanno, qui i test e le tipologie in cui si
 * risponde.
 *
 * Le tipologie sono quelle che il catalogo contiene davvero, cioè quante
 * pastiglie si troveranno sotto, non le quattro che il simulatore sa fare: il
 * numero della testata e la fila sotto devono raccontare la stessa cosa.
 *
 * I due numeri li legge da sé, con lo stesso hook della griglia sotto: la
 * query resta una sola nella cache di TanStack Query, quindi non c'è nessuna
 * chiamata in più, e farseli passare dalla griglia vorrebbe dire due render in
 * ogni cambio di filtro per un dato che si sa già.
 *
 * Contano sempre il catalogo intero, che è quello che la testata sta
 * presentando: quanti ne restano dopo una ricerca lo dice la griglia,
 * mostrandoli. */

import { useSimulations } from '../hooks/useSimulations'
import GalleryHero from './GalleryHero'

export default function SimulationsHeader() {
  const { data: simulations = [], isLoading } = useSimulations()
  const kinds = new Set(simulations.map((simulation) => simulation.kind)).size

  return (
    <GalleryHero
      id="simulations-hero"
      className="px-8 pb-12 pt-16 max-md:px-4 max-md:pb-8 max-md:pt-12"
      title="Metti alla prova la tua"
      highlight="Preparazione"
      description="Ogni test tecnico verifica la conoscenza delle procedure con domande estratte dal materiale di riferimento. Scegli il test e comincia quando vuoi."
      stats={[
        { value: simulations.length, label: 'Test', isLoading },
        { value: kinds, label: 'Tipologie', isLoading },
      ]}
    />
  )
}
