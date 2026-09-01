/* Il pulsante che riporta un elenco filtrato al suo stato intero.
 *
 * Era la stessa riga di classi in fondo a due barre di filtri, la gestione
 * utenti e il registro attività, e nelle due copie era già diventata una
 * regola diversa: una azzerava anche la casella di ricerca, l'altra la
 * lasciava scritta, quindi si premeva "Azzera Filtri" e l'elenco restava
 * filtrato. Qui è un pulsante solo, e la regola sta in chi lo mostra.
 *
 * Compare solo quando c'è qualcosa da azzerare: la condizione resta a chi lo
 * usa, perché cosa conti come filtro attivo lo sa solo la sua pagina.
 *
 * L'aspetto è quello di ogni altro bottone di contorno (`SecondaryButton`):
 * qui resta soltanto cosa dice e cosa fa. */

import SecondaryButton from './SecondaryButton'

interface ResetFiltersButtonProps {
  onClick: () => void
  /** Come si chiama quello che si azzera, dove non sono filtri. */
  children?: string
}

export default function ResetFiltersButton({
  onClick,
  children = 'Azzera Filtri',
}: ResetFiltersButtonProps) {
  return <SecondaryButton onClick={onClick}>{children}</SecondaryButton>
}
