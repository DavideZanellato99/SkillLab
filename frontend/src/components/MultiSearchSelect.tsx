import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { SearchSelectOption } from './SearchSelect'
import { matchesSearch } from './tableSearch'

/* Scelta di più voci da un elenco lungo: si cerca scrivendo e si spunta
 * quello che serve, mentre le voci scelte restano marcate in elenco.
 *
 * Un componente a parte da `SearchSelect` e non una sua variante: là la
 * scelta è una e diventa una chip che prende il posto del campo, qui le
 * scelte sono quante se ne vogliono e il campo resta dov'è per cercare la
 * prossima. Sono due comportamenti diversi in ogni ramo, e tenerli in un
 * componente solo avrebbe voluto dire un `if` per riga. Lo stile e il pattern
 * ARIA restano quelli, perché sul lato di chi guarda sono lo stesso comando.
 *
 * **Quello che si è scelto non si ripete qui.** Il campo non porta targhette
 * con i nomi: chi lo usa sta comandando qualcosa che si vede subito sotto (le
 * barre di un grafico, le righe di un elenco), e riscrivere lì gli stessi
 * nomi sarebbe la stessa cosa detta due volte a un centimetro di distanza. Da
 * qui si disfa una scelta ricliccandola in elenco o con il backspace a campo
 * vuoto, e le si azzera tutte con il comando accanto al campo. */

export default function MultiSearchSelect({
  id,
  values,
  onChange,
  options,
  placeholder,
  align = 'left',
  className = '',
}: {
  id?: string
  /** Le voci scelte. Elenco vuoto vuol dire nessuna scelta. */
  values: string[]
  onChange: (values: string[]) => void
  options: SearchSelectOption[]
  placeholder?: string
  /* Da che parte si apre la lista dei suggerimenti. Conta dove il campo è
   * appoggiato al bordo destro di una scheda, come nel confronto fra utenti:
   * lì una lista che si allarga verso destra uscirebbe dal riquadro. */
  align?: 'left' | 'right'
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listboxId = useId()

  const visible = useMemo(
    () => options.filter((o) => matchesSearch(query, o.label, o.sub)),
    [options, query],
  )

  // Chiudi al click fuori dal componente
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isOpen])

  const toggle = (option: SearchSelectOption) => {
    onChange(
      values.includes(option.value)
        ? values.filter((value) => value !== option.value)
        : [...values, option.value],
    )
    /* La lista resta aperta e la ricerca scritta: chi sta componendo un
       confronto ne sceglie tre o quattro di fila, e richiudere dopo ognuna
       vorrebbe dire riaprire e riscrivere ogni volta. */
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
          setActiveIndex(0)
        } else {
          setActiveIndex((i) => Math.min(visible.length - 1, i + 1))
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (isOpen) setActiveIndex((i) => Math.max(0, i - 1))
        break
      case 'Enter':
        if (isOpen && activeIndex >= 0 && visible[activeIndex]) {
          e.preventDefault()
          toggle(visible[activeIndex])
        }
        break
      case 'Escape':
        if (isOpen) {
          e.preventDefault()
          // Si ferma qui, come nelle altre tendine: dentro una modale
          // chiuderebbe la finestra invece della sola lista.
          e.stopPropagation()
          setIsOpen(false)
        }
        break
      case 'Backspace':
        // Campo vuoto: toglie l'ultima scelta, come in ogni campo a tag
        if (query === '' && values.length > 0) onChange(values.slice(0, -1))
        break
      case 'Tab':
        setIsOpen(false)
        break
    }
  }

  return (
    <div ref={rootRef} className={`relative flex items-center gap-2 ${className}`}>
      <div className="relative flex-1">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
          }
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
            setActiveIndex(0)
          }}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-xl border border-white/6 bg-slate-800/50 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-white/12 focus:border-violet-600 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]"
        />

        {isOpen && (
          <ul
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            /* Larga almeno quanto il campo e, dove serve, quanto il nome più
               lungo: si sta scegliendo fra persone che si somigliano, e i
               puntini arriverebbero proprio sul pezzo che le distingue. Il
               tetto sta sopra la misura del campo, altrimenti sarebbe lui a
               decidere e i nomi tornerebbero a tagliarsi. */
            className={`absolute ${
              align === 'right' ? 'right-0' : 'left-0'
            } top-[calc(100%+6px)] z-50 max-h-60 w-max min-w-full max-w-[min(34rem,90vw)] animate-menu-in overflow-y-auto rounded-xl border border-white/6 bg-gray-900/95 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.06)] backdrop-blur-2xl`}
          >
            {visible.length === 0 ? (
              <li className="px-3 py-2 text-[0.85rem] italic text-slate-500">Nessun risultato</li>
            ) : (
              visible.map((opt, i) => {
                const isSelected = values.includes(opt.value)
                return (
                  <li
                    key={opt.value}
                    id={`${listboxId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    onPointerMove={() => setActiveIndex(i)}
                    onClick={() => toggle(opt)}
                    className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-[0.85rem] transition ${
                      i === activeIndex ? 'bg-white/8 text-slate-100' : 'text-slate-300'
                    } ${isSelected ? 'font-semibold text-violet-300' : ''}`}
                  >
                    <span className="min-w-0 break-words">
                      {/* La spunta sta prima del nome e non dopo: le voci
                            scelte si riconoscono scorrendo la colonna di
                            sinistra, dove l'occhio già passa */}
                      {isSelected ? '✓ ' : ''}
                      {opt.label}
                    </span>
                    {opt.sub && (
                      <span className="shrink-0 text-xs font-normal text-slate-500">{opt.sub}</span>
                    )}
                  </li>
                )
              })
            )}
          </ul>
        )}
      </div>
      {/* Niente targhette con i nomi scelti: chi si sta guardando lo dicono
          già le barre qui sotto, e una fila di chip sopra di loro ripeteva
          gli stessi nomi due volte a un centimetro di distanza. Una scelta si
          disfa dall'elenco, ricliccandola, o con il backspace a campo vuoto.
          Resta il comando per azzerarle tutte, che è l'unica cosa che da lì
          non si può fare in un gesto solo. */}
      {values.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="shrink-0 cursor-pointer border-none bg-transparent text-xs font-medium text-slate-400 transition hover:text-slate-200"
        >
          Azzera
        </button>
      )}
    </div>
  )
}
