import { useEffect, useRef } from 'react'
import type { StepProgress } from '../services/training'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import PathStepPanel from './PathStepPanel'

/* La tappa scelta, aperta di lato sopra la mappa.
 *
 * La mappa prende tutta la pagina e il riquadro arriva solo quando si sceglie
 * una tappa: prima il pannello occupava una colonna fissa anche quando non
 * c'era niente da chiedergli, e il sentiero viveva in un terzo di schermo, che
 * è poco per un disegno che si guarda per capire dove si è.
 *
 * Il riquadro si posa sul bordo destro della mappa e non al centro dello
 * schermo, perché non è un discorso a parte: è la risposta a un nodo che
 * resta lì da vedere, e sceglierne un altro cambia la risposta senza chiudere
 * niente. Sotto lo schermo largo diventa un foglio che sale dal basso, dove
 * una colonna di lato non ci starebbe, e lì il velo dietro serve a dire che
 * per tornare alla mappa basta toccare fuori.
 *
 * A chiudere sono tre gesti che vogliono dire la stessa cosa, il bottone, il
 * tasto Esc e il velo, perché un riquadro che copre qualcosa deve potersi
 * togliere da qualunque parte si stia guardando.
 *
 * L'Esc arriva dall'hook che lo porta a tutto ciò che si apre sopra la pagina
 * senza essere una modale, invece che da un listener scritto qui: era la
 * stessa dozzina di righe dei due menu della barra.
 *
 * **Il fuoco entra nel riquadro all'apertura e torna al nodo alla chiusura.**
 * Su schermo stretto il riquadro è un foglio con un velo dietro, cioè copre
 * tutto quello che non è lui: chi naviga da tastiera restava sul nodo, dietro
 * al velo, e per leggere quello che aveva appena aperto doveva attraversare a
 * Tab il resto della mappa. Il fuoco si riporta a mano perché all'hook non
 * viene passato nessun pulsante: quale nodo l'abbia aperto lo sa questo
 * riquadro, che se lo ricorda al montaggio, e non la mappa.
 *
 * Quello che non fa è trattenere il fuoco, e non è una dimenticanza: un
 * riquadro che chiude la strada da tastiera è una promessa che vale finché è
 * una modale, e questo lo è solo sotto una certa larghezza. Sopra è una
 * colonna appoggiata accanto al sentiero, dove proseguire con Tab e trovarsi
 * sulla tappa successiva è quello che ci si aspetta. */

export default function PathStepDrawer({
  step,
  total,
  onClose,
}: {
  step: StepProgress
  total: number
  onClose: () => void
}) {
  // Sempre aperto: il riquadro nasce quando si sceglie una tappa e muore
  // quando la si toglie, quindi se è montato è perché è aperto.
  useCloseOnEscape(true, onClose)

  const panelRef = useRef<HTMLElement>(null)

  /* Solo al montaggio: scegliendo un'altra tappa il riquadro resta quello e
     cambia contenuto, e riportare il fuoco qui a ogni nodo toccato lo
     strapperebbe di mano a chi sta girando per la mappa. Il nodo di partenza
     resta quello da cui il riquadro è stato aperto, che è il posto da cui si
     era guardando. Senza scorrimento: il foglio arriva già a schermo, e su
     schermo largo la mappa salterebbe sotto al pannello. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  return (
    <>
      <div
        className="animate-fade-in fixed inset-0 z-30 bg-night/70 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        aria-label="Dettaglio della Tappa"
        className="animate-slide-in-bottom fixed inset-x-0 bottom-0 z-40 max-h-[78dvh] overflow-y-auto overscroll-contain p-3 outline-none lg:animate-slide-in-right lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-4 lg:z-30 lg:max-h-[calc(100%-2rem)] lg:w-[356px] lg:p-0"
      >
        <PathStepPanel step={step} total={total} onClose={onClose} />
      </aside>
    </>
  )
}
