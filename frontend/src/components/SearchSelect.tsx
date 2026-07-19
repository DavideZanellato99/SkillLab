import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { matchesSearch } from './tableSearch';

/* Selezione tramite ricerca, per elenchi lunghi (es. filtro utente della
 * dashboard): campo di testo con suggerimenti filtrati mentre si digita;
 * la voce scelta diventa una chip con la ✕ per tornare a "nessun filtro"
 * (valore vuoto). Pattern ARIA "editable combobox" con listbox a comparsa,
 * stile in linea con Select. */

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Riga secondaria nei suggerimenti, inclusa nel match (es. email) */
  sub?: string;
}

interface SearchSelectProps {
  id?: string;
  /** Valore selezionato; stringa vuota = nessuna selezione */
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  /** Testo muto mostrato accanto al campo quando non c'è selezione */
  emptyHint?: string;
  /** Classi extra sul wrapper (es. larghezza) */
  className?: string;
}

export default function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  emptyHint,
  className = '',
}: SearchSelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value);
  const visible = useMemo(
    () => options.filter((o) => matchesSearch(query, o.label, o.sub)),
    [options, query],
  );

  // Chiudi al click fuori dal componente
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  // Tieni visibile l'opzione attiva mentre si naviga con la tastiera
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex]);

  const pick = (opt: SearchSelectOption) => {
    onChange(opt.value);
    setQuery('');
    setIsOpen(false);
  };

  const clear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setActiveIndex(0);
        } else {
          setActiveIndex((i) => Math.min(visible.length - 1, i + 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Enter':
        if (isOpen && activeIndex >= 0 && visible[activeIndex]) {
          e.preventDefault();
          pick(visible[activeIndex]);
        }
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
        }
        break;
      case 'Backspace':
        // Campo vuoto: cancella la selezione corrente (come le chip dei tag input)
        if (query === '' && value !== '') clear();
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

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
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(0);
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
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-60 animate-menu-in overflow-y-auto rounded-xl border border-white/6 bg-gray-900/95 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.06)] backdrop-blur-2xl"
          >
            {visible.length === 0 ? (
              <li className="px-3 py-2 text-[0.85rem] italic text-slate-500">Nessun risultato</li>
            ) : (
              visible.map((opt, i) => {
                const isSelected = opt.value === value;
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
                    <span className="truncate">{opt.label}</span>
                    {opt.sub && (
                      <span className="truncate text-xs font-normal text-slate-500">{opt.sub}</span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {selected ? (
        <span className="flex max-w-[240px] shrink-0 items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 py-1 pl-3 pr-1.5 text-xs font-medium text-violet-300">
          <span className="truncate">{selected.label}</span>
          <button
            type="button"
            onClick={clear}
            aria-label={`Rimuovi filtro: ${selected.label}`}
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
      ) : (
        emptyHint && <span className="shrink-0 text-xs text-slate-500">{emptyHint}</span>
      )}
    </div>
  );
}
