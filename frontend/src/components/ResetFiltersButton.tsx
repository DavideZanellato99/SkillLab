/* Il pulsante che riporta un elenco filtrato al suo stato intero.
 *
 * Era la stessa riga di classi in fondo a due barre di filtri, la gestione
 * utenti e il registro attività, e nelle due copie era già diventata una
 * regola diversa: una azzerava anche la casella di ricerca, l'altra la
 * lasciava scritta, quindi si premeva "Azzera Filtri" e l'elenco restava
 * filtrato. Qui è un pulsante solo, e la regola sta in chi lo mostra.
 *
 * Compare solo quando c'è qualcosa da azzerare: la condizione resta a chi lo
 * usa, perché cosa conti come filtro attivo lo sa solo la sua pagina. */

interface ResetFiltersButtonProps {
  onClick: () => void
  /** Come si chiama quello che si azzera, dove non sono filtri. */
  children?: string
}

export default function ResetFiltersButton({
  onClick,
  children = 'Azzera Filtri',
}: ResetFiltersButtonProps) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
