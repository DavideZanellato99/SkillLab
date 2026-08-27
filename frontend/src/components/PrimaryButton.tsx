/* Il bottone principale dell'app: gradiente viola/ciano, usato per l'azione
 * che apre qualcosa in testa a una pagina e per il submit dei form. Le due
 * forme erano ricopiate in una dozzina di punti, ognuna con la propria
 * versione dell'ombra e del sollevamento all'hover.
 *
 * Il margine non fa parte del bottone e resta a chi lo usa (`className`):
 * è la distanza dal campo che gli sta sopra, non un tratto del bottone. */

import type { ButtonHTMLAttributes, ReactNode } from 'react'

const baseCls =
  'flex cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60'

const VARIANTS = {
  /** Azione in testa a una pagina ("Nuovo Utente"): si stacca dallo sfondo */
  action:
    'px-6 py-2 shadow-[0_4px_12px_rgba(124,58,237,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(124,58,237,0.4)]',
  /** Conferma di un form: occupa tutta la larghezza del form */
  submit:
    'w-full px-4 py-2 hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] active:translate-y-0',
} as const

/* Le stesse classi per un elemento che bottone non è: l'azione principale di
 * una schermata a volte è andare da qualche parte, e un `Link` di react-router
 * deve restare un link (tasto centrale, «apri in una scheda nuova») pur avendo
 * l'aspetto dell'azione che apre. */
export const primaryActionCls = `${baseCls} ${VARIANTS.action} no-underline`

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
  /** Icona a sinistra dell'etichetta. */
  icon?: ReactNode
  children: ReactNode
}

export default function PrimaryButton({
  variant = 'action',
  icon,
  className = '',
  children,
  ...props
}: PrimaryButtonProps) {
  return (
    <button type="button" className={`${baseCls} ${VARIANTS[variant]} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  )
}
