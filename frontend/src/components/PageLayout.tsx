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

export function PageContainer({ width = 'default', children }: PageContainerProps) {
  return <div className={`mx-auto w-full ${WIDTHS[width]} px-6 py-12 max-md:px-4`}>{children}</div>
}

interface PageHeaderProps {
  title: ReactNode
  description: ReactNode
  /** Bottone o filtro allineato a destra del titolo. */
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="mb-1 font-heading text-3xl font-bold text-slate-100">{title}</h1>
        <p className="text-[0.95rem] text-slate-500">{description}</p>
      </div>
      {actions}
    </header>
  )
}
