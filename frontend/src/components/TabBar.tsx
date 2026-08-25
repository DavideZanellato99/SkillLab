import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { tabId, tabPanelId } from './tabIds'

/* Le linguette con cui si sceglie cosa guardare, quando due contenuti non
 * possono stare uno sotto l'altro perché sono due cose diverse e non due
 * pezzi della stessa.
 *
 * Diverse dal segmented control dei filtri, ed è voluto: quello restringe
 * quello che si sta guardando, queste cambiano l'oggetto del discorso.
 *
 * Da tastiera si scorrono con le frecce e non con Tab, come vuole il pattern
 * ARIA: dentro il gruppo si ferma solo la linguetta accesa, e Tab esce verso
 * il contenuto invece di attraversare una per una anche le altre. Con tre o
 * quattro linguette la differenza è di pochi tasti; il punto è che chi
 * ascolta la pagina sente un gruppo di alternative e non una fila di
 * pulsanti sciolti.
 *
 * `panelBase` lega le linguette al contenuto che comandano. È facoltativo
 * perché il legame regge solo se il contenuto porta il proprio `TabPanel`:
 * un `aria-controls` che punta a un id inesistente dice una cosa falsa, ed è
 * peggio del non dirla. */

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
  panelBase,
  className = '',
}: {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  /** La radice degli id, quando il contenuto sotto è reso da `TabPanel`. */
  panelBase?: string
  className?: string
}) {
  const buttons = useRef(new Map<T, HTMLButtonElement>())

  /* Le frecce cambiano la linguetta e ci portano il fuoco, che è quello che
     serve perché il contenuto cambi sotto mentre si scorre. Home e Fine per
     le due estremità, e le frecce girano: da fondo fila la destra torna in
     testa, perché fermarsi in silenzio si legge come un tasto rotto. */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }
    const current = items.findIndex((item) => item.value === value)
    let next = -1
    if (event.key in steps) {
      next = (current + steps[event.key] + items.length) % items.length
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = items.length - 1
    }
    if (next === -1 || next === current) return
    event.preventDefault()
    const target = items[next].value
    onChange(target)
    buttons.current.get(target)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`flex items-center gap-1 ${className}`}
    >
      {items.map((item) => {
        const isActive = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={panelBase ? tabId(panelBase, item.value) : undefined}
            aria-selected={isActive}
            aria-controls={panelBase ? tabPanelId(panelBase, item.value) : undefined}
            /* Solo la linguetta accesa si raggiunge con Tab: le altre si
               scorrono con le frecce, ed è quello che le rende un gruppo
               invece di quattro fermate. */
            tabIndex={isActive ? 0 : -1}
            ref={(node) => {
              if (node) buttons.current.set(item.value, node)
              else buttons.current.delete(item.value)
            }}
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

/** Il contenuto comandato da una linguetta.
 *
 *  Il fuoco ci può atterrare (`tabIndex`) perché chi arriva dalle frecce
 *  esce dal gruppo con un Tab solo e si trova già dentro quello che ha
 *  scelto, invece di ricominciare dalla barra. */
export function TabPanel({
  base,
  value,
  children,
}: {
  base: string
  value: string
  children: ReactNode
}) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(base, value)}
      aria-labelledby={tabId(base, value)}
      tabIndex={0}
      className="outline-none"
    >
      {children}
    </div>
  )
}
