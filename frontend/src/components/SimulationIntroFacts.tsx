import type { Simulation } from '../services/simulations'
import StatTile from './StatTile'
import { formatClock, isTimed, kindLabel, QUESTION_SECONDS } from './simulationFormat'

/* I tre numeri del test, in cima alle regole: quante domande sono, come si
 * risponde, quanto tempo c'è.
 *
 * Sono le stesse cose che le regole dicono sotto per esteso, ed è voluto:
 * chi apre la pagina per la seconda volta le regole le ha già lette e vuole
 * sapere se ha mezz'ora davanti, e cercarlo dentro un paragrafo vorrebbe dire
 * rileggerlo tutto. Qui sono tre riquadri che si guardano, sotto sono le
 * frasi che spiegano cosa comportano.
 *
 * Il riquadro del tempo cambia etichetta e non solo valore: su un test senza
 * cronometro "Tempo per domanda: nessuno" farebbe cercare un limite che non
 * c'è. */
export default function SimulationIntroFacts({ simulation }: { simulation: Simulation }) {
  const timed = isTimed(simulation.kind)
  return (
    <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <StatTile label="Domande">{simulation.question_count}</StatTile>
      <StatTile label="Tipo">{kindLabel(simulation.kind)}</StatTile>
      <StatTile label={timed ? 'Tempo per domanda' : 'Tempo'}>
        {timed ? (
          <span className="tabular-nums">{formatClock(QUESTION_SECONDS * 1000)}</span>
        ) : (
          'Senza limite'
        )}
      </StatTile>
    </div>
  )
}
