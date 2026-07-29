/* La targhetta in maiuscoletto con cui l'app dice a che categoria, ruolo o
 * stato appartiene una riga. La forma (pillola, misure, peso, spaziatura
 * delle lettere) è sempre la stessa e sta qui; il colore arriva da chi la
 * usa, perché è quello a portare il significato: ROLE_BADGE_CLASSES per i
 * ruoli, STATUS_BADGE_CLASSES per gli stati, categoryBadgeClasses per le
 * categorie degli avatar.
 *
 * `inline-block w-fit` è nella base perché la targhetta si stringe sul
 * proprio testo sia in una cella di tabella sia dentro una colonna flex,
 * i due posti da cui viene usata. */

import type { ReactNode } from 'react'

const baseCls =
  'inline-block w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider'

interface BadgeProps {
  /** Classi di colore che danno il significato (bordo, sfondo, testo). */
  tone: string
  /** Solo posizionamento, es. `mt-1` o `shrink-0`. */
  className?: string
  children: ReactNode
}

export default function Badge({ tone, className = '', children }: BadgeProps) {
  return <span className={`${baseCls} ${tone} ${className}`}>{children}</span>
}
