/* La casella con cui si cerca dentro un elenco: lente, testo e la crocetta
 * che lo svuota.
 *
 * Nasce dentro DataTable e si è spostata qui quando è servita anche fuori da
 * una tabella: la colonna delle conversazioni nella chat, il pannello che le
 * apre tutte, l'elenco di chi assegnare a un percorso. Due caselle di ricerca
 * scritte due volte sarebbero due caselle che prima o poi non si somigliano
 * più. Stessa ragione per cui i selettori a pulsanti vivono in FilterTabs. */

import { CloseIcon } from './icons'

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Cerca...',
  className = '',
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Quando la casella non ha un'etichetta accanto che la spieghi. */
  ariaLabel?: string
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/50 px-4 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)] ${className}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-slate-500"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full border-none bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Cancella Ricerca"
          className="shrink-0 cursor-pointer rounded-lg border-none bg-transparent p-1 text-slate-500 transition hover:text-slate-100"
        >
          <CloseIcon size={12} />
        </button>
      )}
    </div>
  )
}
