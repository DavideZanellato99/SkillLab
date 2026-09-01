import { Navigate } from 'react-router'
import { useMyAssignments } from '../hooks/useTraining'
import MyPathsPage from './MyPathsPage'

/* La porta della sezione percorsi: l'elenco dei propri, oppure il percorso
 * stesso quando è uno solo.
 *
 * Un elenco di una riga non è una scelta, è un passaggio in più fra la voce
 * in barra e l'unica cosa che ci sta dietro: chi ha un percorso solo apre
 * questa sezione per andare sulla sua mappa, e la scheda intermedia diceva
 * soltanto il titolo che la mappa ripete in testa.
 *
 * Il salto sostituisce il passo nella cronologia invece di aggiungerlo,
 * altrimenti "indietro" dalla mappa tornerebbe qui e da qui ripartirebbe
 * subito in avanti, lasciando il tasto indietro senza effetto.
 *
 * Da due in su l'elenco resta quello che è, cioè la scelta fra i propri
 * percorsi; e finché la richiesta è in volo non si salta niente, perché la
 * lista vuota di quel momento non dice ancora quanti percorsi ci sono.
 *
 * La decisione sta qui e non dentro l'elenco perché sono due mestieri: uno
 * disegna i percorsi che ci sono, l'altra dice dove porta la voce in barra. */
export default function MyPathsRoute() {
  const { data: assignments = [] } = useMyAssignments()
  const solo = assignments.length === 1 ? assignments[0] : null

  if (solo) return <Navigate to={`/app/percorsi/${solo.id}`} replace />
  return <MyPathsPage />
}
