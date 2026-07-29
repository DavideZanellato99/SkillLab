type PasswordToggleProps = {
  visible: boolean
  onToggle: () => void
  disabled?: boolean
  /** id del campo password controllato, per l'accessibilità */
  controls?: string
}

/** Bottone occhio che mostra/nasconde il testo di un campo password. */
export default function PasswordToggle({
  visible,
  onToggle,
  disabled,
  controls,
}: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={visible ? 'Nascondi password' : 'Mostra password'}
      aria-pressed={visible}
      aria-controls={controls}
      title={visible ? 'Nascondi password' : 'Mostra password'}
      className="shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1 text-slate-500 transition-colors hover:text-slate-300 focus-visible:text-violet-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {visible ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )
}
