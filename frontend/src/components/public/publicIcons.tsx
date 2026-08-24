/* Le icone del sito pubblico.
 *
 * Stanno qui e non in [icons.tsx](../icons.tsx) perché dentro
 * l'applicazione non servono a niente: un telefono e uno scudo non compaiono
 * in nessuna tabella, e tenerle di là le avrebbe messe nel primo file che il
 * browser scarica anche a chi ha già la sessione aperta.
 *
 * Il disegno però resta quello dell'app: stessa griglia 24x24, stesso tratto
 * da 2, stessa base condivisa. Cambia solo la misura di partenza, perché qui
 * una icona vive dentro un riquadro e non dentro una voce di menu. */

import { IconBase } from '../icons'
import type { IconProps } from '../icons'

function Glyph({ size = 22, ...rest }: IconProps & { children: React.ReactNode }) {
  return <IconBase size={size} {...rest} />
}

export function PhoneIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </Glyph>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </Glyph>
  )
}

export function AwardIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </Glyph>
  )
}

export function ChartIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <line x1="12" y1="20" x2="12" y2="4" />
      <rect x="4" y="9" width="5" height="11" rx="1" />
      <rect x="15" y="5" width="5" height="15" rx="1" />
    </Glyph>
  )
}

export function TargetIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </Glyph>
  )
}

export function ChecklistIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M9 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-4" />
      <path d="m9 7 2 2 4-4" />
      <path d="M8 16h8" />
    </Glyph>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </Glyph>
  )
}
