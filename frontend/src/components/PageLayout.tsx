/* Impaginazione condivisa delle schermate: il contenitore centrato e
 * l'intestazione con titolo, sottotitolo ed eventuale azione a destra.
 *
 * Erano ricopiati in nove pagine, e nelle nove copie il margine sotto
 * l'intestazione era finito a mb-8, mb-10 o mb-12 a seconda di quando la
 * pagina era stata scritta, con l'allineamento verticale dell'azione che
 * variava allo stesso modo. Nessuna delle due differenze voleva dire
 * qualcosa, quindi qui c'è un solo valore per entrambe: le intestazioni
 * dell'app sono la stessa intestazione. */

import type { ReactNode } from 'react'
import { mainContentCls, mainContentProps } from './mainContent'

/* Le larghezze sono nominate per quello che contengono, non per i pixel:
 * così una pagina nuova sceglie in base al proprio contenuto invece di
 * copiare il numero dalla pagina che le somiglia di più. */
const WIDTHS = {
  /** Tabelle e pagine di gestione: la misura normale dell'app */
  default: 'max-w-[1200px]',
  /** Tabelle con molte colonne, come il registro attività */
  wide: 'max-w-[1400px]',
  /** Contenuto affiancato in due colonne, come il confronto tra tentativi */
  split: 'max-w-[1100px]',
  /** Una sola colonna di campi, come il profilo */
  form: 'max-w-[720px]',
} as const

interface PageContainerProps {
  width?: keyof typeof WIDTHS
  children: ReactNode
}

/* È il `main` della schermata, non un contenitore qualunque: quattordici
 * pagine passano di qui, e senza un landmark chi legge con uno screen reader
 * non ha modo di saltare la barra per arrivare a quello che è venuto a fare.
 * È anche dove atterra il collegamento "Salta al contenuto" della barra. */
export function PageContainer({ width = 'default', children }: PageContainerProps) {
  return (
    <main
      {...mainContentProps}
      className={`${mainContentCls} mx-auto w-full ${WIDTHS[width]} px-6 py-12 max-md:px-4`}
    >
      {children}
    </main>
  )
}

/* Il `main` delle due gallerie, quella degli avatar e quella dei test.
 *
 * È lo stesso landmark di `PageContainer` con due differenze, che vengono
 * tutte e due dalla fascia che le sta sopra: sopra non ha imbottitura, perché
 * la fascia porta già la propria, e prende l'altezza che avanza, perché in
 * queste due schermate sotto la griglia non c'è nient'altro. Era scritto a
 * mano nella pagina della galleria, e il simulatore lo avrebbe ricopiato. */
export function GalleryContainer({ children }: { children: ReactNode }) {
  return (
    <main
      {...mainContentProps}
      className={`${mainContentCls} mx-auto w-full ${WIDTHS.wide} flex-1 px-6 pb-12 max-md:p-4`}
    >
      {children}
    </main>
  )
}

interface PageHeaderProps {
  title: ReactNode
  description: ReactNode
  /** Bottone o filtro allineato a destra del titolo. */
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-10 flex flex-wrap items-center justify-between gap-4 max-md:mb-6">
      {/* Il blocco del titolo entra nella riga con una base fissa, non con la
          larghezza del proprio testo, e questo decide quando l'azione va a
          capo.

          Il flex sceglie se andare a capo prima di restringere gli elementi,
          e li misura alla loro larghezza naturale: con `basis: auto` quella
          del blocco è la descrizione scritta tutta su una riga, quindi era la
          lunghezza di quel testo a mandare sotto il bottone. Nelle schermate
          con la descrizione scritta nel codice non si vedeva, perché la
          stessa frase dà sempre lo stesso esito; nel simulatore la
          descrizione è quella che ha scritto chi ha preparato il test, e il
          bottone «Torna all'Elenco» cambiava posto da una simulazione
          all'altra.

          Con una base di venti rem la riga va a capo quando lo spazio è
          davvero poco, cioè su uno schermo stretto, e non quando il testo è
          lungo. `flex-1` perché da lì in su il blocco si prende quello che
          avanza, e `min-w-0` perché possa anche scendere sotto la base invece
          di spingere l'azione fuori dalla riga. */}
      <div className="min-w-0 flex-1 basis-80">
        <h1 className="mb-1 font-heading text-3xl font-bold text-slate-100 max-md:text-2xl">
          {title}
        </h1>
        <p className="text-[0.95rem] text-slate-500">{description}</p>
      </div>
      {actions}
    </header>
  )
}
