import { useState, useEffect, useRef, useId } from 'react';

/* Dropdown custom riutilizzabile, in linea con lo stile del sito: pulsante
 * con lo stile degli input e tendina scura stilizzata (come il menu utente
 * della navbar). Pattern ARIA "select-only combobox": la label resta
 * esterna, associata tramite l'id del pulsante. */

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  /** Testo mostrato sul pulsante quando nulla è selezionato (non è un'opzione della lista) */
  placeholder?: string;
  /** Classi extra sul wrapper (es. larghezza) */
  className?: string;
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
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listboxId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

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

  const open = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  };

  const pick = (opt: SelectOption) => {
    onChange(opt.value);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen) open();
        else if (activeIndex >= 0) pick(options[activeIndex]);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) open();
        else setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) open();
        else setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        if (isOpen) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (isOpen) {
          e.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
        }
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

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
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-60 animate-menu-in overflow-y-auto rounded-xl border border-white/6 bg-gray-900/95 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.06)] backdrop-blur-2xl"
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
