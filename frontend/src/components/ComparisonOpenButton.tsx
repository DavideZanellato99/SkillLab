/* Il comando con cui, dalle card in fondo al confronto, si va a leggere una
 * delle due prove per intero.
 *
 * Uguale nelle due metà perché è lo stesso gesto in due posti: una
 * conversazione si riapre per rileggerne la trascrizione, un test per
 * rivederne le domande, e in entrambi i casi si finisce nella schermata che
 * quella prova la sa già mostrare.
 *
 * Un comando esplicito e non la card intera cliccabile: dentro le card ci
 * sono la sintesi e le parole del docente, cioè testo che si legge e si
 * seleziona, e un blocco di testo che è anche un bottone si apre per sbaglio.
 *
 * L'etichetta per intero sta nell'aria-label e non nel testo visibile: sullo
 * schermo le due card dicono già di quale prova si tratta, mentre due comandi
 * che si chiamano entrambi "Apri il tentativo" sono indistinguibili per chi
 * ascolta la pagina. */
export default function ComparisonOpenButton({
  label,
  ariaLabel,
  onClick,
}: {
  /** Cosa si va a leggere: "Apri la trascrizione", "Apri il tentativo". */
  label: string
  /** Lo stesso comando con dentro la prova a cui appartiene. */
  ariaLabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/6 bg-white/4 px-3 py-1.5 text-[0.75rem] font-medium text-slate-300 transition hover:border-white/12 hover:bg-white/8 hover:text-slate-100"
    >
      {label}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  )
}
