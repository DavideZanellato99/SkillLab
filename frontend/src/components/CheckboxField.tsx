import type { ReactNode } from 'react'

/* Una casella con la sua etichetta e, sotto, la frase che dice cosa succede
 * spuntandola.
 *
 * L'etichetta e la spiegazione stanno insieme dentro la stessa `label`,
 * quindi si spunta premendo su tutta la riga e non solo sul quadratino: una
 * casella che si coglie solo al millimetro è una casella che si manca. La
 * spiegazione è parte del campo e non un tooltip, perché quello che una
 * spunta fa a chi la subisce si legge prima di metterla, non passandoci
 * sopra col mouse. */

interface CheckboxFieldProps {
  id: string
  label: ReactNode
  /** Cosa comporta la spunta, in una o due frasi. */
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export default function CheckboxField({
  id,
  label,
  description,
  checked,
  onChange,
  disabled = false,
  className = '',
}: CheckboxFieldProps) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition ${
        checked
          ? 'border-violet-600/30 bg-violet-600/8'
          : 'border-white/6 bg-slate-800/50 hover:border-white/12'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-slate-100">{label}</span>
        {description && (
          <span className="text-xs leading-relaxed text-slate-500">{description}</span>
        )}
      </span>
    </label>
  )
}
