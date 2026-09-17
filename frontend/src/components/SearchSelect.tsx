import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { matchesSearch } from './tableSearch'

/* Selezione tramite ricerca, per elenchi lunghi (es. filtro utente della
 * dashboard): campo di testo con suggerimenti filtrati mentre si digita;
 * la voce scelta diventa una chip con la ✕ per tornare a "nessun filtro"
 * (valore vuoto). Pattern ARIA "editable combobox" con listbox a comparsa,
 * stile in linea con Select.
 *
 * Le due varianti dicono che spazio prende la scelta. Sopra (`above`, il
 * default) la chip sta fuori dal flusso, a destra sulla riga dell'etichetta
 * che chi usa il campo scrive sopra di lui, e il campo resta lì pronto a
 * cercare di nuovo, largo sempre uguale: è per un campo con l'etichetta sopra
 * e una larghezza sua, come quello accanto al titolo del confronto e il
 * filtro utente della dashboard. Lo stesso posto del contatore di
 * `MultiSearchSelect`, che è l'altro campo del confronto. Come campo di un
 * form (`field`) la chip prende il posto del campo: è il valore di una
 * casella che ne vuole uno solo, e affiancare i due dentro una colonna di
 * tabella lascerebbe al campo di ricerca una fessura in cui non si legge
 * nulla.
 *
 * C'era una terza variante, con la chip accanto al campo: ogni scelta lo
 * restringeva, e un campo che cambia larghezza alla prima scelta si legge
 * come un altro campo. Sotto non poteva stare, perché i suggerimenti aperti
 * l'avrebbero coperta.
 *
 * **I nomi non si tagliano.** Chi cerca sta scegliendo fra cose che si
 * somigliano, e due avatar dello stesso reparto si distinguono spesso per
 * l'ultima parola: l'elenco dei suggerimenti si allarga quanto il nome più
 * lungo invece di stare nella larghezza del campo, e nella variante a campo
 * il nome scelto va a capo invece di finire in puntini. */

export interface SearchSelectOption {
  value: string
  label: string
  /** Riga secondaria nei suggerimenti, inclusa nel match (es. email) */
  sub?: string
}

interface SearchSelectProps {
  id?: string
  /** Valore selezionato; stringa vuota = nessuna selezione */
  value: string
  onChange: (value: string) => void
  options: SearchSelectOption[]
  placeholder?: string
  /** Testo muto mostrato al posto della chip quando non c'è selezione */
  emptyHint?: string
  /** 'above': la chip sta sopra il campo, a destra, sulla riga dell'etichetta.
   * 'field': la chip prende il posto del campo, che torna solo quando si
   * toglie la scelta. */
  variant?: 'above' | 'field'
  /** Classi extra sul wrapper (es. larghezza) */
  className?: string
}

export default function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  emptyHint,
  variant = 'above',
  className = '',
}: SearchSelectProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  /* Nella variante a campo il campo di ricerca non c'è mentre la scelta è
   * fatta: il fuoco va rimesso quando è tornato nella pagina, non nell'istante
   * in cui si toglie la chip. Un ref e non uno stato: non c'è niente da
   * ridisegnare, è il campo stesso a leggerlo quando compare. */
  const wantsFocus = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const attachInput = useCallback((el: HTMLInputElement | null) => {
    inputRef.current = el
    if (el && wantsFocus.current) {
      wantsFocus.current = false
      el.focus()
    }
  }, [])

  const listboxId = useId()

  const selected = options.find((o) => o.value === value)
  const visible = useMemo(
    () => options.filter((o) => matchesSearch(query, o.label, o.sub)),
    [options, query],
  )

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

  // Tieni visibile l'opzione attiva mentre si naviga con la tastiera
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, activeIndex])

  const pick = (opt: SearchSelectOption) => {
    onChange(opt.value)
    setQuery('')
    setIsOpen(false)
  }

  const clear = () => {
    onChange('')
    if (inputRef.current) inputRef.current.focus()
    else wantsFocus.current = true
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
          pick(visible[activeIndex])
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
        // Campo vuoto: cancella la selezione corrente (come le chip dei tag input)
        if (query === '' && value !== '') clear()
        break
      case 'Tab':
        setIsOpen(false)
        break
    }
  }

  const chip = selected && (
    <span
      /* Sopra il campo la chip è bassa: sta sulla riga dell'etichetta, che
         è una riga di testo piccolo, e con più imbottitura la sovrastava. */
      className={`flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 pl-3 pr-1.5 text-xs font-medium text-violet-300 ${
        variant === 'field' ? 'min-w-0 flex-1 py-1.5' : 'max-w-[240px] shrink-0 py-0.5'
      }`}
    >
      {/* Come campo di un form il nome scelto va a capo invece di finire in
          puntini: è il valore della casella, e mezzo nome non dice quale
          delle due cose simili si è scelta. Sopra il campo resta su una riga,
          perché lì la chip sta sulla riga dell'etichetta e crescendo in
          altezza salirebbe sopra di lei. */}
      <span className={variant === 'field' ? 'min-w-0 break-words' : 'truncate'}>
        {selected.label}
      </span>
      <button
        type="button"
        onClick={clear}
        aria-label={
          variant === 'field'
            ? `Cambia la scelta: ${selected.label}`
            : `Rimuovi filtro: ${selected.label}`
        }
        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-violet-400 transition hover:bg-violet-500/20 hover:text-violet-200"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </span>
  )

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {!(variant === 'field' && selected) && (
        <div className="relative">
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
            ref={attachInput}
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
              ref={listRef}
              id={listboxId}
              role="listbox"
              /* L'elenco è largo quanto il nome più lungo e non quanto il
                 campo: sta dentro una colonna di tabella, dove i nomi
                 finirebbero tutti in puntini proprio nel momento in cui si
                 sta scegliendo fra cose che si somigliano. Parte dal bordo
                 sinistro del campo e non oltre i 28rem, oltre i quali
                 uscirebbe dalla finestra su schermo stretto. */
              className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-60 w-max min-w-full max-w-[min(28rem,80vw)] animate-menu-in overflow-y-auto rounded-xl border border-white/6 bg-gray-900/95 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.06)] backdrop-blur-2xl"
            >
              {visible.length === 0 ? (
                <li className="px-3 py-2 text-[0.85rem] italic text-slate-500">Nessun risultato</li>
              ) : (
                visible.map((opt, i) => {
                  const isSelected = opt.value === value
                  return (
                    <li
                      key={opt.value}
                      id={`${listboxId}-${i}`}
                      role="option"
                      aria-selected={isSelected}
                      onPointerMove={() => setActiveIndex(i)}
                      onClick={() => pick(opt)}
                      className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-[0.85rem] transition ${
                        i === activeIndex ? 'bg-white/8 text-slate-100' : 'text-slate-300'
                      } ${isSelected ? 'font-semibold' : ''}`}
                    >
                      <span className="min-w-0 break-words">{opt.label}</span>
                      {opt.sub && (
                        <span className="shrink-0 text-xs font-normal text-slate-500">
                          {opt.sub}
                        </span>
                      )}
                    </li>
                  )
                })
              )}
            </ul>
          )}
        </div>
      )}

      {/* Sopra il campo, fuori dal flusso e ancorata al suo bordo alto con lo
          stesso margine di ogni campo fra etichetta e casella (`fieldCls`):
          il campo non si sposta quando la chip compare, e la chip sta sulla
          riga dell'etichetta, dall'altra parte. Come campo di un form la
          chip ha già preso il posto del campo qui sopra. */}
      {variant === 'above'
        ? (selected || emptyHint) && (
            <span className="absolute bottom-full right-0 mb-1.5 flex max-w-full items-center">
              {selected ? chip : <span className="text-xs text-slate-500">{emptyHint}</span>}
            </span>
          )
        : chip}
    </div>
  )
}
