/* Un campo della scheda persona, disegnato secondo il suo tipo.
 *
 * Vale per tutti la stessa regola: si può sempre tornare a vuoto. Il prompt
 * legge le percentuali come intensità di un tratto, quindi uno 0% scritto al
 * posto di un campo lasciato in bianco non è la stessa cosa, dice al modello
 * che quel tratto è assente invece di non dirgli niente. */

import type { ProfileField } from './avatarProfileConfig'
import { inputToPercent, percentToInput } from './avatarProfileConfig'
import { fieldCls, inputCls, inputWrapperCls, labelCls, textareaCls } from './Field'
import Select from './Select'

interface ProfileFieldInputProps {
  field: ProfileField
  value: string
  onChange: (value: string) => void
  disabled: boolean
}

export default function ProfileFieldInput({
  field,
  value,
  onChange,
  disabled,
}: ProfileFieldInputProps) {
  const id = `pf-${field.key}`
  const label = (
    <label className={labelCls} htmlFor={id}>
      {field.label}
    </label>
  )
  const hint = field.hint && <p className="text-[0.7rem] text-slate-500">{field.hint}</p>

  if (field.kind === 'textarea') {
    return (
      <div className={`${fieldCls} col-span-2 max-[600px]:col-span-1`}>
        {label}
        <textarea
          id={id}
          className={textareaCls}
          rows={2}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        {hint}
      </div>
    )
  }

  if (field.kind === 'choice') {
    const options = field.options ?? []
    // Un valore salvato fuori elenco resta selezionabile: le schede vecchie
    // non devono perdere un dato solo perché oggi proponiamo altre parole.
    const extra = value && !options.includes(value) ? [value] : []
    return (
      <div className={fieldCls}>
        {label}
        <Select
          id={id}
          value={value}
          onChange={onChange}
          options={[
            { value: '', label: 'Non Applicabile' },
            ...[...options, ...extra].map((o) => ({ value: o, label: o })),
          ]}
          placeholder="Non Applicabile"
          disabled={disabled}
        />
        {hint}
      </div>
    )
  }

  if (field.kind === 'percent') {
    return (
      <div className={fieldCls}>
        {label}
        <div className={inputWrapperCls}>
          <input
            type="text"
            inputMode="numeric"
            id={id}
            className={inputCls}
            placeholder="es. 60"
            value={percentToInput(value)}
            onChange={(e) => onChange(inputToPercent(e.target.value))}
            disabled={disabled}
          />
          <span className="shrink-0 text-sm text-slate-500">%</span>
        </div>
        {hint}
      </div>
    )
  }

  return (
    <div className={fieldCls}>
      {label}
      <div className={inputWrapperCls}>
        <input
          type="text"
          id={id}
          className={inputCls}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      {hint}
    </div>
  )
}
