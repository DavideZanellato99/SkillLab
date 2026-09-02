/* Il velo della guida introduttiva, il ritaglio sull'elemento di cui si sta
 * parlando, e il riquadro che lo spiega.
 *
 * Qui c'è solo il disegno: quale passo si sta leggendo e cosa succede ai
 * pulsanti lo decide `TutorialTour`, il calcolo di dove va il riquadro sta in
 * `tutorialPlacement` e la misura dell'elemento in `useAnchorRect`.
 *
 * Il buio non è un pannello scuro con un foro ritagliato: è l'ombra di un
 * rettangolo grande quanto l'elemento, larga quanto basta a coprire qualunque
 * schermo. L'elemento vero resta visibile perché sotto quel rettangolo non c'è
 * niente, e non ne viene disegnata una copia: la guida indica il pulsante che
 * poi si andrà davvero a premere.
 *
 * Sotto a tutto c'è un velo trasparente che raccoglie i click. La guida si
 * sfoglia con i propri pulsanti e non toccando quello che illumina: un click
 * a vuoto sull'elemento sotto porterebbe altrove a metà spiegazione, e un
 * click che chiude la guida per sbaglio la fa sparire per sempre, perché
 * dopo la chiusura non torna da sola. */

import { useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAnchorRect } from '../hooks/useAnchorRect'
import { placeBox, SPOTLIGHT_PADDING } from './tutorialPlacement'

interface TutorialSpotlightProps {
  /** Il selettore dell'elemento da illuminare, assente per un passo che
   *  parla della piattaforma e non di un punto dello schermo. */
  anchor?: string
  /** L'id del titolo dentro il riquadro, per chi non lo vede. */
  labelledBy: string
  children: ReactNode
}

export default function TutorialSpotlight({
  anchor,
  labelledBy,
  children,
}: TutorialSpotlightProps) {
  const rect = useAnchorRect(anchor, true)
  const boxRef = useRef<HTMLDivElement>(null)

  /* La finestra che cambia misura non sposta l'elemento illuminato (quello
     lo rimisura `useAnchorRect` da sé) ma sposta il riquadro, che sul passo
     senza ancora sta al centro di una finestra che ora è di un'altra
     grandezza. */
  const [, remeasure] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    window.addEventListener('resize', remeasure)
    return () => window.removeEventListener('resize', remeasure)
  }, [])

  /* Prima che il browser dipinga, e senza array di dipendenze: il riquadro va
     riposizionato tutte le volte che si ridisegna, cioè quando l'elemento si
     è spostato e quando il passo è cambiato portandosi dietro un testo di
     un'altra altezza. Le coordinate finiscono sul nodo invece che in uno
     stato, come fa il tooltip: sono il risultato di una misura presa dal
     nodo stesso, e passare da uno stato vorrebbe dire un secondo render per
     ogni pixel di scorrimento. */
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const { top, left } = placeBox(
      rect,
      { width: box.width, height: box.height },
      { width: window.innerWidth, height: window.innerHeight },
    )
    el.style.top = `${top}px`
    el.style.left = `${left}px`
  })

  return createPortal(
    <>
      {/* Raccoglie i click, e basta: nessuna chiusura per sbaglio. */}
      <div className="fixed inset-0 z-[400]" aria-hidden="true" />

      {rect ? (
        <div
          className="pointer-events-none fixed z-[401] rounded-xl shadow-[0_0_0_9999px_rgba(2,6,23,0.78)] ring-2 ring-violet-500/70 transition-[top,left,width,height] duration-200"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
          }}
          aria-hidden="true"
        />
      ) : (
        /* Nessun elemento da illuminare: il buio è pieno, e il riquadro sta
           al centro. È il benvenuto, il commiato, e ogni passo la cui voce
           su questo schermo non è in fila. */
        <div className="pointer-events-none fixed inset-0 z-[401] bg-night/80" aria-hidden="true" />
      )}

      {/* Fuori dallo schermo al primo giro: le coordinate arrivano
          dall'effetto qui sopra, che gira prima che il browser dipinga. */}
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        style={{ top: -9999, left: 0 }}
        className="fixed z-[402] w-[360px] max-w-[calc(100vw-24px)] animate-modal-in rounded-2xl border border-white/8 bg-gray-900/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.12)] backdrop-blur-2xl transition-[top,left] duration-200 max-[480px]:p-5"
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
