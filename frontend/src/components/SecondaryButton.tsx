/* Il bottone di contorno: quello che si preme quando non si sta facendo la
 * cosa principale della schermata. Annullare una conferma, azzerare i filtri,
 * aprire un'anagrafica di servizio, aggiungere una riga a un elenco.
 *
 * Gemello di `PrimaryButton`, e nasce per la stessa ragione: la sua riga di
 * classi era ricopiata in sette punti, e nelle sette copie era già diversa.
 * L'imbottitura orizzontale era px-4 dappertutto tranne che sul «Categorie»
 * della gestione avatar, che stava accanto a un bottone principale ed era
 * quindi visibilmente più largo del bottone che gli somigliava altrove; e la
 * trasparenza da spento era 50 in un file e 60 negli altri.
 *
 * Il margine non fa parte del bottone e resta a chi lo usa, come nel
 * principale. La misura dell'icona nemmeno, che qui le icone non sono sempre
 * la stessa: c'è chi ci mette un più e chi una freccia di caricamento. */

import type { ButtonHTMLAttributes, ReactNode } from 'react'

const baseCls =
  'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/6 bg-white/4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60'

const VARIANTS = {
  /** La misura normale: in una barra, in fondo a un pannello, in un elenco. */
  default: 'px-4',
  /** Accanto all'azione principale di una schermata, alla sua stessa misura. */
  action: 'px-6',
  /** Metà della coppia in fondo a una conferma: si divide la riga con l'altra. */
  pair: 'flex-1 px-4',
} as const

/** Le stesse classi per chi non può montare il componente, come un bottone
 *  che porta anche un bordo tratteggiato o una larghezza sua. */
export const secondaryButtonCls = `${baseCls} ${VARIANTS.default}`

/* Le classi della variante larga per un elemento che bottone non è: tornare a
 * un elenco è andare da qualche parte, e un `Link` di react-router deve
 * restare un link (tasto centrale, «apri in una scheda nuova») pur avendo
 * l'aspetto del comando che gli sta accanto. È il gemello di
 * `primaryActionCls`. */
export const secondaryActionCls = `${baseCls} ${VARIANTS.action} no-underline`

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
  /** Icona a sinistra dell'etichetta. */
  icon?: ReactNode
  children: ReactNode
}

export default function SecondaryButton({
  variant = 'default',
  icon,
  className = '',
  children,
  ...props
}: SecondaryButtonProps) {
  return (
    <button type="button" className={`${baseCls} ${VARIANTS[variant]} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  )
}
