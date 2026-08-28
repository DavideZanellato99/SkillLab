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
 * un'operazione che sta scrivendo sul server non va interrotta a metà.
 *
 * Il pannello esce in fondo alla pagina attraverso un portal, come il
 * tooltip. Serve alle modali che si aprono da dentro un'altra modale, cioè
 * alle conferme di eliminazione della trascrizione e del tentativo: il
 * pannello che le ospita sfoca lo sfondo, e un antenato che sfoca diventa il
 * riferimento di tutto quello che sta dentro, quindi una schermata intera
 * aperta lì resterebbe confinata a quel riquadro. Chi la monta già a livello
 * di pagina non se ne accorge: era già lì che finiva.
 *
 * ── Da tastiera ──
 *
 * Una modale copre tutto quello che non è lei, e finché resta aperta è
 * l'unica cosa con cui si può parlare. Quello che con il mouse è ovvio (si
 * clicca fuori e si chiude, si clicca dentro e si lavora lì) da tastiera va
 * detto, altrimenti il fuoco resta sulla pagina dietro al velo: si apre
 * «Elimina Utente» e il Tab successivo finisce sulla riga sotto, che non si
 * vede nemmeno.
 *
 * Quindi `role="dialog"` e `aria-modal` per dire cos'è, il nome preso dal
 * titolo che il pannello disegna già (vedi `useModalTitleId`, in
 * `modalTitle.ts`), il fuoco che entra all'apertura e torna da dov'era venuto
 * alla chiusura, il Tab che gira dentro invece di uscire, ed Esc che chiude
 * come la X.
 *
 * Esc si ferma qui e non risale: una conferma aperta sopra un'altra modale
 * chiude se stessa e lascia aperta quella sotto. Per la stessa ragione le
 * tendine e i menu che si chiudono con Esc lo fermano a loro volta, sennò
 * chiudere una tendina chiuderebbe anche la modale che la contiene. */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './icons'
import { ModalTitleContext, useModalTitleId } from './modalTitle'
import type { ModalTitle } from './modalTitle'

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
  'relative m-auto w-full animate-modal-in rounded-3xl border border-white/6 bg-gray-900/95 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] outline-none backdrop-blur-2xl max-[480px]:rounded-2xl'

const closeBtnCls =
  'absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100'

/* Quello che può ricevere il fuoco dentro il pannello, nell'ordine in cui il
 * Tab ci passa. `[tabindex="-1"]` resta fuori di proposito: sono il pannello
 * stesso e le righe di tabella che si aprono, cioè cose che il fuoco riceve
 * ma che nel giro del Tab non entrano. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* Nascosto non vuol dire assente: il campo che sceglie un file sta dietro al
 * bottone che lo apre, con `display: none`, e mandarci il fuoco vorrebbe dire
 * perderlo, perché il browser non lo dà a ciò che non si vede. */
function isVisible(el: HTMLElement): boolean {
  const style = getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

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
  /** Come si chiama questa finestra, per chi non la vede: serve alle modali
   *  che si intestano da sé, senza `ModalHeader` né `DetailModal`. */
  label?: string
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
  label,
  children,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [hasTitle, setHasTitle] = useState(false)
  const titleContext = useMemo<ModalTitle>(() => ({ id: titleId, declare: setHasTitle }), [titleId])

  /* Il fuoco entra nel pannello all'apertura e alla chiusura torna da dove
     era partito: senza, chi apre una modale da tastiera resta con il fuoco
     sul bottone dietro al velo, e chiudendola ripartirebbe dall'inizio della
     pagina. Sul pannello e non sul primo campo, perché il primo campo di una
     conferma è «Annulla» e il fuoco su un bottone fa premere Invio a chi
     voleva solo leggere. `isConnected` perché quello che ha aperto la modale
     a volte non c'è più, come la riga appena eliminata. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const panel = panelRef.current
    /* Solo i tasti nati dentro il proprio pannello. Una modale aperta da
       dentro un'altra esce da un portal suo, ma nell'albero di React resta
       figlia di chi l'ha aperta: senza questo controllo i suoi tasti
       passerebbero anche di qui, e il Tab in fondo alla conferma
       riporterebbe il fuoco nella modale di sotto. */
    if (!panel || !panel.contains(event.target as Node)) return

    if (event.key === 'Escape') {
      // Fermato comunque, anche mentre l'azione è in corso: quella sotto non
      // deve chiudersi al posto di questa.
      event.stopPropagation()
      if (!locked) onClose()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      isVisible,
    )

    // Un pannello di sola lettura, senza nemmeno la X: il fuoco resta su di lui
    if (focusable.length === 0) {
      event.preventDefault()
      panel.focus({ preventScroll: true })
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    // All'indietro dal pannello stesso si uscirebbe: il giro riprende dal fondo
    const leaving = event.shiftKey ? active === first || active === panel : active === last
    if (!leaving) return
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }

  return createPortal(
    <div
      className={`fixed inset-0 ${elevated ? 'z-[300] bg-black/70' : 'z-[200] bg-black/60'} flex animate-fade-in items-center justify-center p-4 backdrop-blur-lg [animation-duration:0.2s]`}
      onClick={() => !locked && onClose()}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-label={hasTitle ? undefined : label}
        tabIndex={-1}
        className={`${panelBaseCls} ${SIZES[size]} ${LAYOUTS[layout]} ${PADDINGS[padding]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalTitleContext.Provider value={titleContext}>
          {!hideClose && (
            <button
              type="button"
              className={closeBtnCls}
              onClick={onClose}
              disabled={locked}
              aria-label={closeLabel}
            >
              <CloseIcon size={18} />
            </button>
          )}
          {children}
        </ModalTitleContext.Provider>
      </div>
    </div>,
    document.body,
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
  const titleId = useModalTitleId()

  return (
    <div className={`text-center ${className}`}>
      <div
        className={`mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl ${iconWrapperCls}`}
      >
        {icon}
      </div>
      <h2
        id={titleId}
        className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl"
      >
        {title}
      </h2>
      {description && <p className="text-[0.85rem] text-slate-500">{description}</p>}
    </div>
  )
}
