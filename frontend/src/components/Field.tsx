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

/* Un campo dentro una barra di filtri, che è un campo che deve anche sapersi
 * stringere. Le barre stanno in fila su uno schermo da scrivania e vanno a
 * capo sotto: da lì in giù i campi si dividono la riga a due per volta
 * invece di restare alla propria misura, che lasciava mezza riga vuota
 * accanto all'ultimo di ogni capo. */
export const filterFieldCls = `${fieldCls} max-md:flex-1 max-md:basis-[45%]`

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

/* Un campo che porta il proprio bordo, senza il riquadro: lo usano gli input
 * che non stanno dentro `TextInput` (una data, un numero, un titolo) e le aree
 * di testo. È lo stesso vestito di `Select` e di `SearchSelect`, perché due
 * campi affiancati nello stesso form con due fondi diversi si leggono come due
 * cose diverse quando sono la stessa. */
export const formInputCls =
  'rounded-xl border border-white/6 bg-slate-800/50 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-white/12 focus:border-violet-600 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)] disabled:cursor-not-allowed disabled:opacity-50'

/** Un'area di testo, che il riquadro non contiene: il bordo è già suo. */
export const textareaCls = `w-full resize-y ${formInputCls}`

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
