import type { ReactNode } from 'react'
import { fieldCls, labelCls } from './Field'

/* Il campo con cui le due sezioni del confronto scelgono chi guardare: di là
 * una persona, di qua quante se ne vogliono. È la stessa domanda («chi») nello
 * stesso posto, a destra del titolo, e il contorno è scritto una volta sola
 * perché due copie erano già andate per conto loro.
 *
 * `self-start` perché il campo si aggancia al bordo alto dell'intestazione e
 * non al suo centro: l'intestazione centra l'azione sul blocco del titolo, e
 * la descrizione di una sezione andava a capo mentre quella dell'altra stava
 * su una riga, quindi passando da una linguetta all'altra il campo saliva e
 * scendeva di mezza riga. Il titolo è alto uguale nelle due, e agganciato a
 * quello il campo sta fermo qualunque cosa ci sia scritto sotto.
 *
 * `relative z-30` perché i suggerimenti cadono sopra il pannello dei filtri,
 * che con il suo backdrop-blur apre un contesto di impilamento e gli
 * passerebbe davanti. */
export default function ComparisonPeopleField({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className={`${fieldCls} relative z-30 w-[380px] shrink-0 self-start max-lg:w-full`}>
      {/* L'etichetta e lo spazio sotto di lei sono quelli di ogni campo
          dell'app (`fieldCls`, `labelCls`), non una riga di classi scritta
          qui: in una copia avevano perso la spaziatura delle altre, e la
          chip e il contatore che stanno sulla riga dell'etichetta contano
          su quella misura. */}
      <label className={labelCls} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}
