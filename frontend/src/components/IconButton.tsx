/* Il bottoncino quadrato delle azioni di una riga: modifica, elimina,
 * ripristina, ascolta. Erano cinque copie identiche della stessa stringa di
 * classi in cinque pagine, ognuna col proprio `Tooltip` attorno scritto a
 * mano, e la tinta dell'hover ricopiata a ogni uso.
 *
 * Il tooltip fa parte del bottone e non gli sta attorno: un'icona senza
 * etichetta non si spiega da sola, quindi qui non si può dimenticare. Su un
 * bottone disabilitato viene avvolto in uno span (`wrap`), altrimenti il
 * motivo del blocco non comparirebbe proprio a chi ne ha bisogno: un
 * elemento `disabled` non emette eventi del mouse. */

import type { ButtonHTMLAttributes, ReactNode } from 'react'

import Tooltip from './Tooltip'

export const iconActionCls =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition disabled:cursor-not-allowed disabled:opacity-40'

/* Le quattro tinte con cui un'azione si accende al passaggio del mouse. Non
 * escono da qui: fuori si sceglie il `tone`, non la classe. */
const ICON_ACTION_TONES = {
  edit: 'hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400',
  danger: 'hover:border-red-500 hover:bg-red-500/10 hover:text-red-500',
  restore: 'hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400',
  play: 'hover:border-cyan-500 hover:bg-cyan-500/10 hover:text-cyan-400',
} as const

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  tone?: keyof typeof ICON_ACTION_TONES
  /** Cosa fa il bottone: è insieme il tooltip e il nome accessibile. */
  label: string
  /** Testo del tooltip, quando deve dire più dell'etichetta (per esempio il
   * motivo per cui l'azione è bloccata). */
  tooltip?: ReactNode
  children: ReactNode
}

export default function IconButton({
  tone = 'edit',
  label,
  tooltip,
  className = '',
  disabled,
  children,
  ...props
}: IconButtonProps) {
  return (
    <Tooltip content={tooltip ?? label} wrap={disabled}>
      <button
        type="button"
        className={`${iconActionCls} ${ICON_ACTION_TONES[tone]} ${className}`}
        aria-label={label}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  )
}
