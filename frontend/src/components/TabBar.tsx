import type { ReactNode } from 'react'

/* Le linguette con cui si sceglie cosa guardare, quando due contenuti non
 * possono stare uno sotto l'altro perché sono due cose diverse e non due
 * pezzi della stessa.
 *
 * Diverse dal segmented control dei filtri, ed è voluto: quello restringe
 * quello che si sta guardando, queste cambiano l'oggetto del discorso. */

const tabCls =
  'cursor-pointer rounded-lg border-none bg-transparent px-3 py-1.5 text-[0.82rem] font-medium transition'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
}

export default function TabBar<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = '',
}: {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex items-center gap-1 ${className}`}>
      {items.map((item) => {
        const isActive = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${tabCls} ${
              isActive
                ? 'bg-violet-600/12 text-slate-100'
                : 'text-slate-400 hover:bg-white/8 hover:text-slate-100'
            }`}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
