/* Banner d'errore dei form e delle modali di conferma: icona + messaggio,
 * stesso stile in tutta l'area admin. Prima era il componente locale ErrorBox
 * di AdminPage, estratto qui perché lo condividono form e ConfirmModal.
 *
 * Due misure, non due componenti: `form` sta dentro una modale o un form,
 * `page` è la fascia in cima a una schermata, che era ricopiata riga per riga
 * in cinque pagine. È lo stesso banner, e chi cambia il rosso lo cambia una
 * volta sola. */

import type { BannerVariant } from './bannerStyles'
import { bannerBaseCls, bannerSizeCls } from './bannerStyles'

const errorToneCls: Record<BannerVariant, string> = {
  form: 'items-start border-red-500/25 bg-red-500/10 text-red-300',
  page: 'items-center border-red-500/30 bg-red-500/10 text-red-300',
}

export default function FormError({
  message,
  variant = 'form',
}: {
  message: string
  variant?: BannerVariant
}) {
  const iconSize = variant === 'page' ? 18 : 16
  return (
    <div
      className={`${bannerBaseCls} ${bannerSizeCls[variant]} ${errorToneCls[variant]}`}
      role="alert"
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={variant === 'page' ? 'shrink-0' : 'mt-px shrink-0 text-red-500'}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  )
}
