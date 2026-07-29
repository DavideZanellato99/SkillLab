/* I mattoni dei form: l'etichetta sopra il campo e il campo di testo col
 * suo bordo. Le quattro stringhe di classi qui sotto erano ridichiarate,
 * identiche, in sei file diversi (AdminPage, AvatarAdminPage, Navbar,
 * OrganizationsPage, ProfilePage, AuditLogsPage) per una quarantina di
 * campi in tutto.
 *
 * Le classi sono esportate oltre ai componenti perché non tutti i campi
 * contengono un <input>: dove dentro il riquadro ci vanno un <textarea>,
 * un <Select> o un campo data, la pagina usa <Field> per l'etichetta e si
 * mette dentro quello che le serve. */

import type { InputHTMLAttributes, ReactNode } from 'react'

export const fieldCls = 'flex flex-col gap-1.5'
export const labelCls = 'text-xs font-medium tracking-wide text-slate-400'

/** Il riquadro attorno al campo, che si accende quando il campo ha il fuoco. */
export const inputWrapperCls =
  'flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/50 px-4 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]'

/** Il campo vero e proprio: senza bordo suo, perché il bordo è del riquadro. */
export const inputCls =
  'flex-1 border-none bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50'

/* Variante del riquadro che fa da `group` alle proprie icone: le icone con
 * `litIconCls` si accendono insieme al bordo quando il campo ha il fuoco.
 * La usa la modale di accesso, dove ogni campo ha la sua icona. */
export const litInputWrapperCls = `group ${inputWrapperCls}`
export const litIconCls =
  'shrink-0 text-slate-500 transition-colors group-focus-within:text-violet-400'

/** Un'area di testo, che il riquadro non contiene: il bordo è già suo. */
export const textareaCls =
  'w-full resize-y rounded-xl border border-white/6 bg-slate-800/50 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-600 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)] disabled:cursor-not-allowed disabled:opacity-50'

/* I campi che stanno dentro una card, e non in un form, hanno il fondo
 * chiaro delle card invece di quello scuro dei form: si appoggiano a un
 * pannello già scuro, e col fondo dei form sparirebbero dentro. Li usano
 * TrainingPage, TrainerReviewPanel e MessageAnnotationEditor. */
export const cardInputCls =
  'rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-600 focus:bg-violet-600/8'

interface FieldProps {
  /** Etichetta sopra il campo; assente per i campi che si spiegano da soli. */
  label?: ReactNode
  /** id del campo che l'etichetta descrive. */
  htmlFor?: string
  /** Nota sotto il campo, per dire come va compilato. */
  hint?: ReactNode
  className?: string
  children: ReactNode
}

export default function Field({ label, htmlFor, hint, className = '', children }: FieldProps) {
  return (
    <div className={`${fieldCls} ${className}`}>
      {label && (
        <label className={labelCls} htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint}
    </div>
  )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Icona dentro il riquadro, a sinistra del testo. */
  icon?: ReactNode
  /** Cosa sta a destra del testo: un'unità di misura, un bottone occhio. */
  suffix?: ReactNode
  /** L'icona si accende insieme al riquadro quando il campo ha il fuoco. */
  litIcon?: boolean
  /** Classi del riquadro, non del campo (es. una larghezza). */
  wrapperClassName?: string
}

export function TextInput({
  icon,
  suffix,
  litIcon = false,
  wrapperClassName = '',
  className = '',
  ...props
}: TextInputProps) {
  return (
    <div className={`${litIcon ? 'group ' : ''}${inputWrapperCls} ${wrapperClassName}`}>
      {icon}
      <input className={`${inputCls} ${className}`} {...props} />
      {suffix}
    </div>
  )
}
