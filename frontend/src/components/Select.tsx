import { useState, useEffect, useRef, useId } from 'react'

/* Dropdown custom riutilizzabile, in linea con lo stile del sito: pulsante
 * con lo stile degli input e tendina scura stilizzata (come il menu utente
 * della navbar). Pattern ARIA "select-only combobox": la label resta
 * esterna, associata tramite l'id del pulsante. */

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  disabled?: boolean
  /** Testo mostrato sul pulsante quando nulla è selezionato (non è un'opzione della lista) */
  placeholder?: string
  /** Classi extra sul wrapper (es. larghezza) */
  className?: string
}

/* Distanza fra pulsante e tendina, e respiro minimo dal bordo che ritaglia */
const GAP = 6
const EDGE = 8
const MAX_LIST_HEIGHT = 240
const MIN_LIST_HEIGHT = 120

/* Il rettangolo oltre il quale la tendina verrebbe ritagliata: il primo
 * antenato che non ha overflow visibile (un modale scrollabile, un box con
 * overflow-hidden), altrimenti il viewport. */
function clipBounds(el: HTMLElement) {
  let top = 0
  let bottom = window.innerHeight
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY, overflowX } = getComputedStyle(node)
    if (overflowY === 'visible' && overflowX === 'visible') continue
    const rect = node.getBoundingClientRect()
    top = Math.max(top, rect.top)
    bottom = Math.min(bottom, rect.bottom)
  }
  return { top, bottom }
}

export default function Select({
  id,
  value,
  onChange,
  options,
  disabled = false,
  placeholder,
  className = '',
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  /* Sopra o sotto il pulsante, e quanto alta: deciso sullo spazio reale */
  const [placement, setPlacement] = useState({ up: false, maxHeight: MAX_LIST_HEIGHT })
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const listboxId = useId()

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  // Chiudi al click fuori dal componente
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isOpen])

  /* La tendina deve restare sempre in sovrimpressione e per intero: se sotto
   * non c'è spazio si ribalta sopra, e in ogni caso si accorcia allo spazio
   * disponibile invece di finire tagliata. Ricalcolato anche a ogni scroll o
   * resize, perché il contenitore può muoversi mentre è aperta. */
  useEffect(() => {
    if (!isOpen) return
    const measure = () => {
      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const bounds = clipBounds(root)
      const below = bounds.bottom - rect.bottom - GAP - EDGE
      const above = rect.top - bounds.top - GAP - EDGE
      const up = below < MIN_LIST_HEIGHT && above > below
      const space = up ? above : below
      setPlacement({ up, maxHeight: Math.max(MIN_LIST_HEIGHT, Math.min(MAX_LIST_HEIGHT, space)) })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [isOpen])

  // Tieni visibile l'opzione attiva mentre si naviga con la tastiera
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, activeIndex])

  const open = () => {
    if (disabled) return
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setIsOpen(true)
  }

  const pick = (opt: SelectOption) => {
    onChange(opt.value)
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (!isOpen) open()
        else if (activeIndex >= 0) pick(options[activeIndex])
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!isOpen) open()
        else setActiveIndex((i) => Math.min(options.length - 1, i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!isOpen) open()
        else setActiveIndex((i) => Math.max(0, i - 1))
        break
      case 'Home':
        if (isOpen) {
          e.preventDefault()
          setActiveIndex(0)
        }
        break
      case 'End':
        if (isOpen) {
          e.preventDefault()
          setActiveIndex(options.length - 1)
        }
        break
      case 'Escape':
        if (isOpen) {
          e.preventDefault()
          setIsOpen(false)
        }
        break
      case 'Tab':
        setIsOpen(false)
        break
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
        }
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={handleKeyDown}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border bg-slate-800/50 py-2 pl-4 pr-3 text-left text-sm text-slate-100 outline-none transition focus-visible:border-violet-600 focus-visible:shadow-[0_0_0_3px_rgba(124,58,237,0.1)] disabled:cursor-not-allowed disabled:opacity-50 ${
          isOpen
            ? 'border-violet-600 shadow-[0_0_0_3px_rgba(124,58,237,0.1)]'
            : 'border-white/6 hover:border-white/12'
        }`}
      >
        <span className={`truncate ${selected ? '' : 'text-slate-500'}`}>
          {selected?.label ?? placeholder ?? '—'}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-violet-400' : 'text-slate-500'
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute left-0 right-0 z-50 animate-menu-in overflow-y-auto rounded-xl border border-white/6 bg-gray-900/95 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.06)] backdrop-blur-2xl ${
            placement.up ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'
          }`}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            return (
              <li
                key={opt.value}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={isSelected}
                onPointerMove={() => setActiveIndex(i)}
                onClick={() => pick(opt)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-[0.85rem] transition ${
                  i === activeIndex ? 'bg-white/8 text-slate-100' : 'text-slate-300'
                } ${isSelected ? 'font-semibold' : ''}`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-violet-400"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
