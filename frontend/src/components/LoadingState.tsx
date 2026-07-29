/* Stato di caricamento condiviso: spinner centrato con la frase che dice
 * cosa si sta aspettando. Era ricopiato in dieci punti dell'app, dove
 * cambiava solo il testo, e le tre spaziature qui sotto erano già le tre
 * che si erano formate da sole.
 *
 * Lo Spinner è decorativo (aria-hidden), quindi è questo contenitore a
 * fare da `role="status"`: chi usa uno screen reader sente la frase. */

import Spinner from './Spinner'

type LoadingVariant = 'page' | 'modal' | 'panel'

const VARIANTS: Record<LoadingVariant, string> = {
  /** Corpo di una pagina che sta caricando i suoi dati */
  page: 'flex flex-col items-center justify-center gap-4 p-16 text-slate-500',
  /** Dentro una modale, dove i bordi sono già dati dalla modale stessa */
  modal: 'flex flex-col items-center justify-center gap-4 py-12 text-slate-500',
  /** Pannello che deve riempire l'altezza disponibile */
  panel: 'flex flex-1 flex-col items-center justify-center gap-3 p-12 text-slate-500',
}

interface LoadingStateProps {
  /** Cosa si sta aspettando, es. "Caricamento avatar..." */
  message: string
  variant?: LoadingVariant
}

export default function LoadingState({ message, variant = 'page' }: LoadingStateProps) {
  return (
    <div className={VARIANTS[variant]} role="status">
      <Spinner />
      {/* Nelle pagine il testo resta alla misura di base, negli spazi
       * stretti di modali e pannelli scende a text-sm. */}
      <p className={variant === 'page' ? undefined : 'text-sm'}>{message}</p>
    </div>
  )
}
