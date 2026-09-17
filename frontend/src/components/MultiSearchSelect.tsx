import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon } from './icons'
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
 * nomi sarebbe la stessa cosa detta due volte a un centimetro di distanza.
 * Sopra il campo, a destra, stanno solo quante sono e il comando per
 * azzerarle tutte.
 *
 * **In elenco ogni voce ha una casella.** Una spunta scritta davanti al nome
 * diceva chi era scelto ma non che le altre si potevano scegliere insieme:
 * la casella vuota accanto a ogni voce dice che l'elenco è da spuntare, come
 * l'elenco delle persone nella finestra di assegnazione, e quella piena si
 * riconosce scorrendo la colonna di sinistra. È disegnata e non un
 * `<input>`: la voce è già l'opzione di un listbox a scelta multipla, e un
 * secondo comando dentro l'opzione sarebbe due cose da premere per una
 * scelta sola. Da qui si disfa una scelta ricliccandola in elenco o con il
 * backspace a campo vuoto.
 *
 * **In cima, se chi lo usa lo chiede, una riga che spunta tutti.** Con
 * `selectAllLabel` la lista comincia con una voce che sceglie tutte le voci
 * in una volta, e che è spuntata quando lo sono tutte: da lì si tolgono
 * anche tutte, come da «Azzera». Compare solo a ricerca vuota, perché con un
 * filtro scritto «tutti» direbbe una cosa e ne farebbe un'altra, e con la
 * ricerca si sta cercando qualcuno in particolare.
 *
 * **La lista sta in un portal, con `position: fixed`.** Il campo vive dentro
 * una scheda con `backdrop-blur`, che è un contesto di impilamento a sé: uno
 * `z-index` alto dentro la scheda non vale niente contro la scheda successiva,
 * e quando le barre sotto il campo erano poche la lista finiva sotto la scheda
 * dopo. Come nel `KebabMenu` la si rende quindi fuori dalla scheda, ancorata al
 * campo dopo averla misurata, e la si segue allo scroll e al resize. */

const GAP = 6
const EDGE_PAD = 8

/* La chiave della riga che spunta tutti. Le voci vere hanno per chiave il
   proprio valore, che è un id, e uno spazio non lo è mai. */
const SELECT_ALL_KEY = ' '

interface Row {
  key: string
  label: string
  sub?: string
  isSelected: boolean
  /** Le scelte dopo aver cliccato questa riga. */
  next: string[]
}

export default function MultiSearchSelect({
  id,
  values,
  onChange,
  options,
  placeholder,
  align = 'left',
  selectAllLabel,
  className = '',
}: {
  id?: string
  /** Le voci scelte. Elenco vuoto vuol dire nessuna scelta. */
  values: string[]
  onChange: (values: string[]) => void
  options: SearchSelectOption[]
  placeholder?: string
  /** Il testo della riga in cima che spunta tutte le voci. Senza, la riga
      non c'è. */
  selectAllLabel?: string
  /* Da che parte si apre la lista dei suggerimenti. Conta dove il campo è
   * appoggiato al bordo destro di una scheda, come nel confronto fra utenti:
   * lì una lista che si allarga verso destra uscirebbe dal riquadro. */
  align?: 'left' | 'right'
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const listboxId = useId()

  const visible = useMemo(
    () => options.filter((o) => matchesSearch(query, o.label, o.sub)),
    [options, query],
  )

  const allSelected = options.length > 0 && options.every((o) => values.includes(o.value))
  const showSelectAll = Boolean(selectAllLabel) && query === '' && options.length > 0

  /* Le righe della lista come si scorrono con le frecce: la riga che spunta
     tutti, se c'è, sta in cima e conta come le altre, così `activeIndex` e
     gli id delle opzioni contano una cosa sola. */
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = visible.map((opt) => ({
      key: opt.value,
      label: opt.label,
      sub: opt.sub,
      isSelected: values.includes(opt.value),
      next: values.includes(opt.value)
        ? values.filter((value) => value !== opt.value)
        : [...values, opt.value],
    }))
    if (showSelectAll) {
      list.unshift({
        key: SELECT_ALL_KEY,
        label: selectAllLabel ?? '',
        isSelected: allSelected,
        next: allSelected ? [] : options.map((o) => o.value),
      })
    }
    return list
  }, [visible, values, showSelectAll, selectAllLabel, allSelected, options])

  // Ancora la lista al campo: il bordo scelto con `align` combacia con quello
  // del campo, e la lista resta dentro la finestra. Il campo è largo sempre
  // uguale: quando il conteggio gli stava accanto lo restringeva, e la lista,
  // ancorata al bordo di prima, saltava di lato alla prima rimisurazione.
  // Misurabile solo dopo il primo render, fino ad allora è invisibile per
  // evitare lo sfarfallio. Si rimisura anche quando cambiano le voci
  // visibili, perché con esse cambia la larghezza della lista.
  const place = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.max(listRef.current?.offsetWidth ?? 0, rect.width)
    const left = align === 'right' ? rect.right - width : rect.left
    setPos({
      top: rect.bottom + GAP,
      left: Math.min(Math.max(EDGE_PAD, left), window.innerWidth - width - EDGE_PAD),
      minWidth: rect.width,
    })
  }, [align])
  useLayoutEffect(() => {
    if (isOpen) place()
  }, [isOpen, rows.length, place])

  // Chiudi al click fuori dal campo e dalla lista. Allo scroll o al resize
  // l'ancora si sposta e la lista (fixed) no, quindi la si riposiziona: qui
  // non si chiude come nel `KebabMenu`, perché chi sta scrivendo nel campo
  // non deve vedersi sparire i suggerimenti per un tocco alla rotella.
  //
  // L'ancora si sposta anche senza scroll e senza resize: ogni spunta
  // disegna qualcosa sotto (una barra in più nel confronto), la pagina si
  // allunga, compare la barra di scorrimento e tutto il contenuto centrato
  // si sposta di qualche pixel. Un `ResizeObserver` sulla radice del
  // documento, che si restringe di quanto è larga la barra, e sul campo lo
  // vede, mentre a un evento di scroll o resize non corrisponde.
  useEffect(() => {
    if (!isOpen) return
    const observer = new ResizeObserver(() => place())
    observer.observe(document.documentElement)
    if (inputRef.current) observer.observe(inputRef.current)
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }
    const onReflow = (event?: Event) => {
      // Lo scroll dentro la lista stessa non sposta l'ancora
      if (event && listRef.current?.contains(event.target as Node)) return
      place()
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [isOpen, place])

  const toggle = (row: Row) => {
    onChange(row.next)
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
          setActiveIndex((i) => Math.min(rows.length - 1, i + 1))
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (isOpen) setActiveIndex((i) => Math.max(0, i - 1))
        break
      case 'Enter':
        if (isOpen && activeIndex >= 0 && rows[activeIndex]) {
          e.preventDefault()
          toggle(rows[activeIndex])
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
    <div ref={rootRef} className={`relative ${className}`}>
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

        {isOpen &&
          createPortal(
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-multiselectable="true"
              style={{
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                minWidth: pos?.minWidth ?? 0,
                visibility: pos ? 'visible' : 'hidden',
              }}
              /* Larga almeno quanto il campo e, dove serve, quanto il nome più
               lungo: si sta scegliendo fra persone che si somigliano, e i
               puntini arriverebbero proprio sul pezzo che le distingue. Il
               tetto sta sopra la misura del campo, altrimenti sarebbe lui a
               decidere e i nomi tornerebbero a tagliarsi. */
              className="fixed z-[1000] max-h-60 w-max max-w-[min(34rem,calc(100vw-1rem))] animate-menu-in overflow-y-auto rounded-xl border border-white/6 bg-gray-900/95 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.06)] backdrop-blur-2xl"
            >
              {rows.length === 0 ? (
                <li className="px-3 py-2 text-[0.85rem] italic text-slate-500">Nessun risultato</li>
              ) : (
                rows.map((row, i) => (
                  <li
                    key={row.key}
                    id={`${listboxId}-${i}`}
                    role="option"
                    aria-selected={row.isSelected}
                    onPointerMove={() => setActiveIndex(i)}
                    onClick={() => toggle(row)}
                    /* La riga che spunta tutti porta un filetto sotto: è un
                       comando sull'elenco, non una voce dell'elenco, e senza
                       niente in mezzo si leggeva come la prima persona. */
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[0.85rem] transition ${
                      i === activeIndex ? 'bg-white/8 text-slate-100' : 'text-slate-300'
                    } ${row.isSelected ? 'bg-violet-600/15 font-medium text-slate-100' : ''} ${
                      row.key === SELECT_ALL_KEY
                        ? 'mb-1.5 rounded-b-none border-b border-white/6 pb-2.5'
                        : ''
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                        row.isSelected
                          ? 'border-violet-500 bg-violet-600 text-white'
                          : 'border-white/20 bg-white/4'
                      }`}
                    >
                      {row.isSelected && <CheckIcon size={11} />}
                    </span>
                    <span className="min-w-0 flex-1 break-words">{row.label}</span>
                    {row.sub && (
                      <span className="shrink-0 text-xs font-normal text-slate-500">{row.sub}</span>
                    )}
                  </li>
                ))
              )}
            </ul>,
            document.body,
          )}
      </div>
      {/* Niente targhette con i nomi scelti: chi si sta guardando lo dicono
          già le barre qui sotto, e una fila di chip sopra di loro ripeteva
          gli stessi nomi due volte a un centimetro di distanza. Sopra il
          campo, a destra, stanno quante sono, perché a lista chiusa
          nient'altro lo direbbe, e il comando per azzerarle tutte, che è
          l'unica cosa che dall'elenco non si può fare in un gesto solo.

          Sopra e fuori dal flusso: accanto restringevano il campo, sotto
          la lista aperta li copriva, e in flusso sopra spingevano giù il
          campo alla prima spunta. Ancorati al bordo alto con lo stesso
          margine di ogni campo fra etichetta e casella (`fieldCls`), stanno sulla riga
          dell'etichetta, che sta a sinistra, dall'altra parte. */}
      {values.length > 0 && (
        <p className="absolute bottom-full right-0 mb-1.5 flex items-center gap-1.5 text-xs">
          <span className="tabular-nums text-violet-300">
            {values.length} {values.length === 1 ? 'scelta' : 'scelte'}
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <button
            type="button"
            onClick={() => onChange([])}
            className="cursor-pointer border-none bg-transparent p-0 font-medium text-slate-400 transition hover:text-slate-200"
          >
            Azzera
          </button>
        </p>
      )}
    </div>
  )
}
