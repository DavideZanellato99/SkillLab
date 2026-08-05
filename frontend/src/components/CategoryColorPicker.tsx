/* Le tinte fra cui si sceglie il colore di una categoria.
 *
 * Un elenco chiuso di pastiglie invece di un selettore di colore libero: le
 * classi che le disegnano sono scritte a mano (vedi categoryStyles), quindi
 * un colore fuori da qui uscirebbe senza sfondo. Si vede subito com'è la
 * targhetta, che è il posto dove il colore andrà a finire. */

import { CATEGORY_COLORS, categoryBadgeClasses } from './categoryStyles'

interface CategoryColorPickerProps {
  value: string
  onChange: (color: string) => void
  disabled?: boolean
}

export default function CategoryColorPicker({
  value,
  onChange,
  disabled = false,
}: CategoryColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colore della categoria">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          disabled={disabled}
          onClick={() => onChange(color)}
          className={`h-7 w-7 cursor-pointer rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${categoryBadgeClasses(color)} ${
            value === color ? 'border-slate-100' : 'border-white/10 hover:border-white/30'
          }`}
        />
      ))}
    </div>
  )
}
