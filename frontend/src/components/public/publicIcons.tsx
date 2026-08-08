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

export function ChatIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Glyph>
  )
}

export function MicIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </Glyph>
  )
}

export function PersonIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Glyph>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

export function TrendingUpIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
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

export function DashboardIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
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

export function BellIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Glyph>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Glyph>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Glyph>
  )
}

export function BuildingIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <line x1="9" y1="9" x2="9" y2="9.01" />
      <line x1="9" y1="12" x2="9" y2="12.01" />
      <line x1="9" y1="15" x2="9" y2="15.01" />
    </Glyph>
  )
}

export function DocumentIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
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

/* I quattro tipi di test: il pallino da scegliere, la matita, i passi da
 * rimettere in fila, le due colonne unite da un ponte. */
export function ChoiceIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="5" cy="7" r="2.5" />
      <circle cx="5" cy="17" r="2.5" />
      <line x1="11" y1="7" x2="20" y2="7" />
      <line x1="11" y1="17" x2="20" y2="17" />
    </Glyph>
  )
}

export function WriteIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </Glyph>
  )
}

export function OrderIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <polyline points="3 9 5 7 7 9" />
      <polyline points="3 15 5 17 7 15" />
    </Glyph>
  )
}

export function MatchIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="2" y="4" width="6" height="5" rx="1" />
      <rect x="2" y="15" width="6" height="5" rx="1" />
      <rect x="16" y="4" width="6" height="5" rx="1" />
      <rect x="16" y="15" width="6" height="5" rx="1" />
      <path d="M8 6.5h8" />
      <path d="M8 17.5h8" />
    </Glyph>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Glyph>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </Glyph>
  )
}

export function SparkIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8.5 13.4 11 16 12l-2.6 1L12 15.5 10.6 13 8 12l2.6-1z" />
    </Glyph>
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </Glyph>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <polyline points="20 6 9 17 4 12" />
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
