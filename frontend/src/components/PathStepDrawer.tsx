import { useEffect } from 'react'
import type { StepProgress } from '../services/training'
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
 * togliere da qualunque parte si stia guardando. */

export default function PathStepDrawer({
  step,
  total,
  onClose,
}: {
  step: StepProgress
  total: number
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div
        className="animate-fade-in fixed inset-0 z-30 bg-night/70 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        aria-label="Dettaglio della Tappa"
        className="animate-slide-in-bottom fixed inset-x-0 bottom-0 z-40 max-h-[78dvh] overflow-y-auto overscroll-contain p-3 lg:animate-slide-in-right lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-4 lg:z-30 lg:max-h-[calc(100%-2rem)] lg:w-[356px] lg:p-0"
      >
        <PathStepPanel step={step} total={total} onClose={onClose} />
      </aside>
    </>
  )
}
