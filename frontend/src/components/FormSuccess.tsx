/* Banner di conferma dei form: icona + messaggio, il gemello verde di
 * FormError. Prima era il componente locale SuccessBox di ProfilePage,
 * estratto qui perché la coppia errore/conferma va tenuta insieme: chi
 * aggiunge un form nuovo trova entrambi i banner nello stesso posto.
 *
 * Stesse due misure del gemello (vedi bannerStyles): `form` dentro una
 * modale, `page` in cima a una schermata. Il verde invece è lo stesso nelle
 * due misure, quindi qui non serve una tabella di tinte come nel rosso. */

import type { BannerVariant } from './bannerStyles'
import { bannerBaseCls, bannerSizeCls } from './bannerStyles'

const successToneCls = 'items-center border-emerald-500/30 bg-emerald-500/10 text-emerald-400'

export default function FormSuccess({
  message,
  variant = 'form',
}: {
  message: string
  variant?: BannerVariant
}) {
  const iconSize = variant === 'page' ? 18 : 16
  return (
    <div className={`${bannerBaseCls} ${bannerSizeCls[variant]} ${successToneCls}`} role="status">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      <span>{message}</span>
    </div>
  )
}
