/* Spinner di caricamento condiviso: raccoglie le tre varianti usate in tutta
 * l'app, prima duplicate a mano (come stringa inline o come costante
 * `spinnerCls` ricopiata in ogni pagina):
 *
 * - "page":   overlay grande viola, per lo stato di caricamento di una schermata
 * - "button": piccolo bianco, dentro un bottone in attesa
 * - "small":  piccolo viola, inline accanto a un testo
 *
 * È puramente decorativo (aria-hidden): quando serve, il testo di stato lo
 * fornisce chi lo usa (es. "Salvataggio...").
 */

type SpinnerVariant = 'page' | 'button' | 'small'

const VARIANTS: Record<SpinnerVariant, string> = {
  page: 'h-10 w-10 border-[3px] border-violet-600/15 border-t-violet-600',
  button: 'h-4 w-4 border-2 border-white/30 border-t-white',
  small: 'h-3.5 w-3.5 border-2 border-violet-600/25 border-t-violet-600',
}

interface SpinnerProps {
  variant?: SpinnerVariant
  /** Classi extra (es. margini) unite a quelle della variante. */
  className?: string
}

export default function Spinner({ variant = 'page', className = '' }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full ${VARIANTS[variant]} ${className}`}
    />
  )
}
