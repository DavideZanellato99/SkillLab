/* Le sezioni del sito pubblico, scritte una volta sola.
 *
 * Le leggono la navbar, il menu compatto e il footer: tre elenchi scritti a
 * mano avrebbero cominciato a divergere alla prima pagina aggiunta, e una
 * voce presente in fondo alla pagina ma non in cima è il modo in cui un sito
 * comincia a sembrare trascurato. */

export interface PublicSection {
  path: string
  label: string
  /** Una riga sola, usata nel menu compatto e nel footer. */
  description: string
}

/* L'ordine è quello in cui conviene leggerle: la pagina di atterraggio, poi
   la piattaforma nel suo insieme, poi le tre cose che sa fare.
   La home ha una voce come le altre, e non solo il logo: quello riporta alla
   pagina iniziale ma non lo dice, e da una barra di navigazione che elenca
   quattro sezioni su cinque non si capisce dove si è. */
export const PUBLIC_SECTIONS: PublicSection[] = [
  {
    path: '/',
    label: 'Home',
    description: 'Cosa offre la piattaforma, in sintesi',
  },
  {
    path: '/piattaforma',
    label: 'Piattaforma',
    description: 'Panoramica, ruoli e modalità di adozione',
  },
  {
    path: '/roleplay',
    label: 'Roleplay',
    description: 'Simulazioni telefoniche e scritte con interlocutori simulati',
  },
  {
    path: '/simulatore',
    label: 'Simulatore tecnico',
    description: 'Test di verifica sulle procedure aziendali',
  },
  {
    path: '/valutazione',
    label: 'Valutazione e analisi',
    description: 'Criteri, revisione, obiettivi formativi e cruscotti',
  },
]
