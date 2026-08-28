/* Il filo che lega il pannello di `ModalShell` al titolo che ci sta dentro.
 *
 * Sta in un file suo e non dentro `ModalShell` perché quel file esporta
 * componenti, e il ricaricamento a caldo di Vite smette di funzionare su un
 * file che esporta anche altro. */

import { createContext, useContext, useEffect } from 'react'

export interface ModalTitle {
  /** L'id da mettere sul titolo, perché il pannello possa indicarlo come proprio nome. */
  id: string | undefined
  /** Da chiamare quando quel titolo c'è davvero, e di nuovo quando sparisce. */
  declare: (exists: boolean) => void
}

export const ModalTitleContext = createContext<ModalTitle>({ id: undefined, declare: () => {} })

/**
 * L'id da mettere sul titolo della modale che si sta disegnando.
 *
 * Lo usano i due modi in cui una modale si intesta, `ModalHeader` e
 * l'intestazione di `DetailModal`: la scatola non può cercarsi il titolo da
 * sola, perché è chi ci sta dentro a sapere quale delle sue scritte lo sia.
 * Chi disegna un'intestazione tutta sua chiama questo hook allo stesso modo,
 * oppure passa `label` alla scatola.
 *
 * Fuori da una modale torna `undefined` e non fa niente: `ModalHeader` è un
 * componente come gli altri e deve poter vivere anche altrove.
 */
export function useModalTitleId(): string | undefined {
  const { id, declare } = useContext(ModalTitleContext)
  useEffect(() => {
    declare(true)
    return () => declare(false)
  }, [declare])
  return id
}
