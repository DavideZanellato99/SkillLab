/* Un campo password: etichetta, icona, bottone occhio e, quando serve, il
 * motivo per cui quello che c'è scritto non va bene.
 *
 * Sono sei campi in tutto, tre nella modale di accesso e tre nella pagina del
 * profilo, e ognuno costava una trentina di righe ricopiate più un booleano
 * "mostra oppure no" nello stato del genitore, con il suo azzeramento da
 * ricordare a mano dopo ogni salvataggio riuscito. Il booleano è di questo
 * campo e non del modulo che lo ospita, quindi vive qui.
 *
 * L'occhio torna da solo a nascondere quando il campo si svuota: dopo un
 * cambio password andato a buon fine il genitore azzera i valori, e un campo
 * vuoto lasciato "in chiaro" mostrerebbe in chiaro la password successiva,
 * scritta da chi non ha chiesto di vederla. */

import { useEffect, useState, type ComponentType } from 'react'
import Field, { TextInput, litIconCls } from './Field'
import PasswordToggle from './PasswordToggle'
import type { IconProps } from './icons'

interface PasswordFieldProps {
  /** id del campo: lega l'etichetta, il bottone occhio e l'errore. */
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  /** L'icona dentro il riquadro, che si accende insieme al bordo. */
  Icon: ComponentType<IconProps>
  placeholder?: string
  autoComplete?: string
  minLength?: number
  required?: boolean
  disabled?: boolean
  /** Perché quello che c'è scritto non va bene: compare sotto il campo, dove
   *  si sta guardando, invece che in cima al modulo. */
  error?: string
  onBlur?: () => void
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  Icon,
  placeholder,
  autoComplete,
  minLength,
  required,
  disabled,
  error,
  onBlur,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!value) setVisible(false)
  }, [value])

  const errorId = `${id}-error`

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={
        error ? (
          <p id={errorId} role="alert" className="text-xs text-red-300">
            {error}
          </p>
        ) : undefined
      }
    >
      <TextInput
        type={visible ? 'text' : 'password'}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        litIcon
        icon={<Icon size={16} className={litIconCls} />}
        suffix={
          <PasswordToggle
            visible={visible}
            onToggle={() => setVisible((v) => !v)}
            disabled={disabled}
            controls={id}
          />
        }
      />
    </Field>
  )
}
