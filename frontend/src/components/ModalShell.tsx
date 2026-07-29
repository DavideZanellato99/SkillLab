/* La scatola di ogni modale dell'app: lo sfondo scurito, il pannello e il
 * bottone di chiusura in alto a destra. Erano ricopiati in undici punti, e
 * la costante `overlayCls` con dentro quelle dieci classi era stata
 * ridichiarata in otto file diversi.
 *
 * Quello che resta a chi la usa è solo la misura del pannello e come si
 * comporta in altezza; sfondo, bordo, ombra, animazione e chiusura sono
 * qui e sono gli stessi per tutte.
 *
 * Durante un'azione in corso (`locked`) né lo sfondo né la X chiudono:
 * un'operazione che sta scrivendo sul server non va interrotta a metà. */

import type { ReactNode } from 'react'
import { CloseIcon } from './icons'

const SIZES = {
  /** Conferme e form brevi */
  sm: 'max-w-[420px]',
  /** Dettaglio in sola lettura di una riga */
  md: 'max-w-[520px]',
  /** Referti e valutazioni */
  lg: 'max-w-[640px]',
  /** Schede lunghe da compilare, come quella di un avatar */
  sheet: 'max-w-[780px]',
  /** Pannelli con elenchi e anteprime */
  xl: 'max-w-[860px]',
  /** Trascrizioni affiancate al loro referto */
  full: 'max-w-[1100px]',
} as const

const PADDINGS = {
  lg: 'p-12 max-[480px]:p-8',
  md: 'p-10 max-[480px]:p-6',
  sm: 'p-8 max-[480px]:p-5',
  /** Il pannello disegna le proprie fasce, che vanno da bordo a bordo */
  none: '',
} as const

const LAYOUTS = {
  /** Il pannello cresce col contenuto e scorre tutto insieme */
  scroll: 'max-h-[90vh] overflow-y-auto overflow-x-hidden',
  /** Colonna con parti fisse: scorre solo quello che sta in mezzo */
  column: 'flex max-h-[90vh] flex-col overflow-hidden',
  /** Come `column` ma di altezza costante: un elenco che si filtra non
   *  deve far crescere e rimpicciolire la finestra a ogni tasto premuto */
  tall: 'flex h-[85vh] flex-col overflow-hidden',
} as const

const panelBaseCls =
  'relative m-auto w-full animate-modal-in rounded-3xl border border-white/6 bg-gray-900/95 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl'

const closeBtnCls =
  'absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100'

interface ModalShellProps {
  onClose: () => void
  /** Azione in corso: la modale non si può chiudere. */
  locked?: boolean
  size?: keyof typeof SIZES
  padding?: keyof typeof PADDINGS
  layout?: keyof typeof LAYOUTS
  /** Sopra le altre modali, per quelle che si aprono da dentro una modale. */
  elevated?: boolean
  /** Nascondi la X: il pannello ne mette una sua nella propria fascia. */
  hideClose?: boolean
  closeLabel?: string
  children: ReactNode
}

export default function ModalShell({
  onClose,
  locked = false,
  size = 'sm',
  padding = 'lg',
  layout = 'scroll',
  elevated = false,
  hideClose = false,
  closeLabel = 'Chiudi',
  children,
}: ModalShellProps) {
  return (
    <div
      className={`fixed inset-0 ${elevated ? 'z-[300] bg-black/70' : 'z-[200] bg-black/60'} flex animate-fade-in items-center justify-center p-4 backdrop-blur-lg [animation-duration:0.2s]`}
      onClick={() => !locked && onClose()}
    >
      <div
        className={`${panelBaseCls} ${SIZES[size]} ${LAYOUTS[layout]} ${PADDINGS[padding]}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideClose && (
          <button
            className={closeBtnCls}
            onClick={onClose}
            disabled={locked}
            aria-label={closeLabel}
          >
            <CloseIcon size={18} />
          </button>
        )}
        {children}
      </div>
    </div>
  )
}

interface ModalHeaderProps {
  /** Icona 24x24 nel riquadro in cima. */
  icon: ReactNode
  /** Classi del riquadro dietro l'icona: è lì che sta l'accento. */
  iconWrapperCls: string
  title: string
  description?: ReactNode
  /** Spazio sotto l'intestazione, es. `mb-8` in una modale lunga. */
  className?: string
}

/** Intestazione centrata delle modali di conferma e dei form: icona nel suo
 *  riquadro colorato, titolo, e la frase che dice cosa sta per succedere. */
export function ModalHeader({
  icon,
  iconWrapperCls,
  title,
  description,
  className = 'mb-6',
}: ModalHeaderProps) {
  return (
    <div className={`text-center ${className}`}>
      <div
        className={`mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl ${iconWrapperCls}`}
      >
        {icon}
      </div>
      <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">
        {title}
      </h2>
      {description && <p className="text-[0.85rem] text-slate-500">{description}</p>}
    </div>
  )
}
