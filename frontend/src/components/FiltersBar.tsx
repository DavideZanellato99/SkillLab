/* La fascia dei filtri di una schermata: sta sotto l'intestazione e sopra
 * quello che restringe.
 *
 * È un posto solo per tutta l'applicazione, ed è il punto di questo file. Il
 * filtro per organizzazione stava in tre posti diversi a seconda di quando la
 * pagina era stata scritta: in questa fascia negli elenchi di gestione,
 * accanto al titolo nella dashboard e nei percorsi, dentro la barra della
 * tabella nel report attività. Dashboard e report attività, che hanno la
 * stessa identica coppia di filtri e si aprono dallo stesso menu, li
 * mostravano in due punti diversi dello schermo.
 *
 * La regola adesso è una: i filtri che dicono quale elenco si sta guardando
 * stanno qui, l'intestazione porta solo l'azione principale, e la ricerca
 * resta nella barra della tabella perché cerca dentro l'elenco già scelto.
 *
 * Il riquadro era ricopiato in sei barre con la stessa riga di classi: sei
 * copie sono sei fasce che prima o poi non si allineano più. */

import type { ReactNode } from 'react'
import { filterFieldCls, labelCls } from './Field'

/* Due posti, due misure. `page` è la fascia sotto l'intestazione di una
 * schermata, che dallo spazio sotto è separata dal bianco. `section` è la
 * barra in cima a un pezzo di pagina, dove il filetto sotto dice che finisce
 * il restringere e comincia quello che si sta guardando: senza, in mezzo a
 * una colonna di contenuto, i comandi si leggerebbero come la prima riga di
 * quel contenuto. */
const VARIANTS = {
  page: 'mb-8',
  section: 'mb-5 border-b border-white/6 pb-5',
} as const

interface FiltersBarProps {
  variant?: keyof typeof VARIANTS
  children: ReactNode
}

export default function FiltersBar({ variant = 'page', children }: FiltersBarProps) {
  return <div className={`flex flex-wrap items-end gap-4 ${VARIANTS[variant]}`}>{children}</div>
}

interface FilterFieldProps {
  /** Cosa si sta scegliendo, scritto sopra il comando. */
  label: string
  /* L'id del comando, quando è un campo che una `label` può nominare. I
   * gruppi di pastiglie non lo sono: sono un `radiogroup`, che si nomina con
   * il proprio `ariaLabel`, e per loro l'etichetta qui sopra è solo la scritta
   * che li allinea agli altri campi della fascia. */
  htmlFor?: string
  /** Come il campo si prende lo spazio della fascia (una larghezza, un `flex-1`). */
  className?: string
  children: ReactNode
}

export function FilterField({ label, htmlFor, className = '', children }: FilterFieldProps) {
  return (
    <div className={`${filterFieldCls} ${className}`}>
      {htmlFor ? (
        <label className={labelCls} htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className={labelCls}>{label}</span>
      )}
      {children}
    </div>
  )
}
