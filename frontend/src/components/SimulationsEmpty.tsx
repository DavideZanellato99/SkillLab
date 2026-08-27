/* Quello che si vede al posto della griglia quando non resta nessun test.
 *
 * Le ragioni sono tre e vanno dette come tre, come nella galleria degli
 * avatar: la ricerca non ha trovato niente, il tipo scelto è rimasto senza
 * test, oppure non è stato pubblicato ancora nessun test. Le prime due chi
 * guarda le risolve sul momento, e il riquadro gli porge il gesto che le
 * annulla; la terza no, e allora l'unica cosa utile è dire di chi è il lavoro
 * che manca: i test li prepara chi amministra, ed è l'unico a cui serve il
 * collegamento alla pagina dove si scrivono.
 *
 * La seconda è rara e non è morta: le pastiglie portano solo i tipi che il
 * catalogo contiene, quindi sceglierne uno non lascia mai la griglia vuota,
 * ma un rinfresco che porta via l'ultimo test di quel tipo sì, e senza questa
 * frase resterebbe uno spazio bianco senza spiegazione. */

import GalleryEmpty from './GalleryEmpty'
import { ChecklistIcon, SearchIcon } from './icons'

export type SimulationsEmptyReason = 'search' | 'filter' | 'catalog'

export default function SimulationsEmpty({
  reason,
  canManageSimulations,
  onClearSearch,
  onShowAll,
}: {
  reason: SimulationsEmptyReason
  /** Chi amministra è l'unico che i test li può pubblicare. */
  canManageSimulations: boolean
  onClearSearch: () => void
  onShowAll: () => void
}) {
  if (reason === 'search') {
    return (
      <GalleryEmpty
        icon={<SearchIcon size={40} />}
        message="Nessun test corrisponde a questa ricerca"
        action={{ label: 'Azzera la ricerca', onClick: onClearSearch }}
      />
    )
  }
  if (reason === 'filter') {
    return (
      <GalleryEmpty
        icon={<ChecklistIcon size={40} />}
        message="Nessun test di questo tipo"
        action={{ label: 'Mostra tutti i test', onClick: onShowAll }}
      />
    )
  }
  return (
    <GalleryEmpty
      icon={<ChecklistIcon size={40} />}
      message="Nessun test tecnico è ancora stato pubblicato"
      action={
        canManageSimulations
          ? { label: 'Vai alla gestione test', to: '/app/admin/simulations' }
          : undefined
      }
    />
  )
}
