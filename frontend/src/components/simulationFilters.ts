/* Come si restringe l'elenco dei test da svolgere.
 *
 * Fuori dalla pagina per la stessa ragione per cui `avatarFilters` sta fuori
 * dalla galleria: la pagina disegna delle schede, questo decide quali, e sono
 * due cose che si leggono e si cambiano separatamente.
 *
 * I test arrivano tutti in una lettura sola, quindi cercare e scegliere sono
 * giri su una lista già in memoria: la griglia risponde nell'istante in cui
 * si preme, senza tornare sul server.
 */

import type { Simulation } from '../services/simulations'
import { kindLabel, sourceLabel } from './simulationFormat'
import { matchesSearch } from './tableSearch'

/** Quali test guardare: quelli mai svolti, quelli già svolti, o tutti. */
export type SimulationFilter = 'todo' | 'done' | 'all'

/* "Tutti" resta in fondo come nei filtri della dashboard e del confronto: è
 * il punto di partenza, non una terza scelta. Prima quello che serve a chi
 * apre la pagina per allenarsi, cioè quello che non ha ancora fatto. */
export const SIMULATION_FILTERS: { value: SimulationFilter; label: string }[] = [
  { value: 'todo', label: 'Da svolgere' },
  { value: 'done', label: 'Svolti' },
  { value: 'all', label: 'Tutti' },
]

/**
 * I test che restano dopo il filtro e la ricerca.
 *
 * La ricerca guarda anche il tipo, l'origine e l'organizzazione, che sulla
 * scheda si leggono come una targhetta o non si leggono affatto: cercare
 * "aperta" trova i test in cui si scrive, cercare "manuale" quelli scritti da
 * una persona, ed è la stessa regola delle ricerche nelle tabelle.
 */
export function filterSimulations(
  simulations: Simulation[],
  filter: SimulationFilter,
  search: string,
): Simulation[] {
  return simulations.filter((simulation) => {
    const done = simulation.attempt_count > 0
    if (filter === 'todo' && done) return false
    if (filter === 'done' && !done) return false
    return matchesSearch(
      search,
      simulation.title,
      simulation.description,
      kindLabel(simulation.kind),
      sourceLabel(simulation.source),
      simulation.organization_name,
    )
  })
}
