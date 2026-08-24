import { useRef } from 'react'
import type { InputHTMLAttributes } from 'react'

import { ChevronDownIcon, ChevronUpIcon } from './icons'

/* Un campo numerico con le frecce disegnate da noi.
 *
 * Quelle del browser sono l'unico pezzo di interfaccia dell'applicazione che
 * non abbiamo mai vestito: due triangolini grigi di sistema, larghi quanto
 * decide il browser, che in Chrome compaiono solo passandoci sopra e in
 * Firefox stanno sempre lì. Su un fondo scuro sono una macchia chiara
 * attaccata al bordo, e cambiano forma da un browser all'altro dentro campi
 * che per il resto sono identici ovunque.
 *
 * Le native le spegne una regola sola in index.css, valida per tutti i campi
 * numerici: da lì in poi un `<input type="number">` scritto a mano resta
 * senza frecce, ed è il motivo per cui i campi numerici passano tutti di qui.
 *
 * A muovere il valore è `stepUp`/`stepDown` del campo stesso, non un conto
 * nostro: sono le stesse funzioni che stanno dietro le frecce native e dietro
 * le frecce della tastiera, quindi rispettano `min`, `max` e `step` senza che
 * dobbiamo rifare quella logica (mezzo punto alla volta, mai sopra il dieci,
 * mai sotto l'uno). Da campo vuoto il browser parte dal minimo.
 *
 * Il valore lo consegniamo già letto, come stringa: chi chiama lo tratta
 * come tratta l'`onChange` di un campo di testo, e la stringa vuota resta
 * distinguibile dallo zero (vedi PathStepCriteria, dove sono due cose
 * diverse).
 *
 * I bottoni stanno sopra il bordo del campo, non dentro una riga di flex:
 * così ogni campo tiene il vestito che aveva (sfondo, bordo, testo centrato)
 * e le frecce si appoggiano allo spazio del padding a destra, che per questo
 * deve restare largo almeno quanto loro.
 *
 * La larghezza però va sul riquadro e non sul campo (`wrapperClassName`, con
 * il campo a `w-full`): dentro una colonna di flex un riquadro senza
 * larghezza sua si allarga quanto l'etichetta sopra, e le frecce, che si
 * ancorano al riquadro, finirebbero fuori dal bordo del campo. */

interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  /** Il valore del campo, già letto: stringa vuota quando il campo è vuoto. */
  onValueChange: (value: string) => void
  /** Classi del riquadro attorno al campo: la larghezza va qui. */
  wrapperClassName?: string
}

const stepBtnCls =
  'flex flex-1 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 text-slate-500 transition hover:bg-white/10 hover:text-slate-100 active:bg-white/16 disabled:cursor-not-allowed disabled:opacity-0'

export default function NumberInput({
  onValueChange,
  wrapperClassName = '',
  className = '',
  disabled,
  ...props
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const step = (direction: 'up' | 'down') => {
    const el = inputRef.current
    if (!el) return
    if (direction === 'up') el.stepUp()
    else el.stepDown()
    onValueChange(el.value)
    // Il fuoco resta sul campo: chi ha cliccato una freccia sta scegliendo un
    // numero, e la freccia successiva la vuole dare da tastiera.
    el.focus()
  }

  return (
    <div className={`relative inline-flex ${wrapperClassName}`}>
      <input
        {...props}
        ref={inputRef}
        type="number"
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
        className={className}
      />
      {/* Le frecce non entrano nel giro del tab e non le legge il lettore di
          schermo: il campo si muove già con le frecce della tastiera, e due
          fermate in più su ogni numero sarebbero solo strada in più. */}
      <div aria-hidden className="absolute inset-y-1 right-1 flex w-4 flex-col gap-px">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => step('up')}
          className={stepBtnCls}
        >
          <ChevronUpIcon size={11} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => step('down')}
          className={stepBtnCls}
        >
          <ChevronDownIcon size={11} />
        </button>
      </div>
    </div>
  )
}
