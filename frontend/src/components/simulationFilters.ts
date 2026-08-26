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

import type { AdminSimulation, Simulation, SimulationStatus } from '../services/simulations'
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

/* ── La gestione, che è l'altra metà ──────────────────────────────────
 *
 * Chi prepara i test guarda le stesse righe da un'altra parte, e la domanda
 * che si fa aprendo la pagina non è quali abbia già svolto ma **quali siano
 * ancora da finire**: una simulazione vive in bozza finché il serbatoio non è
 * pieno e riletto, e le bozze sono quelle su cui si torna. Sta qui accanto
 * all'altro filtro perché sono due modi di restringere lo stesso elenco, e
 * separarli vorrebbe dire due file che parlano di simulazioni filtrate. */

/** Quali simulazioni guardare nella gestione: le bozze, le pubblicate, tutte. */
export type SimulationStatusFilter = SimulationStatus | 'all'

/* "Tutte" resta in fondo come negli altri filtri dell'app: è il punto di
 * partenza, non una terza scelta. Prima le bozze, che sono il lavoro
 * rimasto indietro. */
export const STATUS_FILTERS: { value: SimulationStatusFilter; label: string }[] = [
  { value: 'draft', label: 'Bozze' },
  { value: 'published', label: 'Pubblicate' },
  { value: 'all', label: 'Tutte' },
]

/**
 * Le simulazioni che restano dopo lo stato e la ricerca.
 *
 * La ricerca guarda anche il tipo e l'origine, che nella tabella si leggono
 * come targhette: cercare "aperta" trova i test in cui si scrive, cercare
 * "manuale" quelli scritti da una persona. L'organizzazione entra solo dove
 * si vede, cioè per chi ne amministra più di una: per un organization admin
 * sarebbe la propria su ogni riga, e cercarla restituirebbe tutto.
 */
export function filterAdminSimulations(
  simulations: AdminSimulation[],
  status: SimulationStatusFilter,
  search: string,
  showOrganization: boolean,
): AdminSimulation[] {
  return simulations.filter((simulation) => {
    if (status !== 'all' && simulation.status !== status) return false
    return matchesSearch(
      search,
      simulation.title,
      showOrganization ? simulation.organization_name : '',
      simulation.document_name,
      kindLabel(simulation.kind),
      sourceLabel(simulation.source),
    )
  })
}
