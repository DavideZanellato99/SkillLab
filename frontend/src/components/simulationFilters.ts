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

import type {
  AdminSimulation,
  Simulation,
  SimulationKind,
  SimulationSource,
  SimulationStatus,
} from '../services/simulations'
import { kindLabel, sourceLabel } from './simulationFormat'
import { matchesSearch } from './tableSearch'

/** Quali test guardare: tutti, o quelli di un tipo solo. */
export type SimulationFilter = SimulationKind | 'all'

/** Il valore della pastiglia "Tutti": il gruppo di scelta parla per stringhe,
 *  il catalogo intero è l'assenza di un tipo. */
export const ALL_KINDS = 'all'

/* L'ordine in cui i tipi si presentano, che è quello con cui sono arrivati e
 * con cui li racconta la documentazione: prima i due che c'erano, poi i due
 * che verificano quello che una crocetta non raggiunge. Un ordine dato dal
 * caso, come sarebbe quello del catalogo, sposterebbe le pastiglie sotto le
 * dita da un'organizzazione all'altra. */
const KIND_ORDER: SimulationKind[] = ['multiple', 'open', 'ordering', 'matching']

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
    if (filter !== ALL_KINDS && simulation.kind !== filter) return false
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

/**
 * Le pastiglie sopra la griglia: "Tutti" e i tipi di test che il catalogo
 * contiene davvero, ognuno con quanti ne contiene.
 *
 * Si restringe per tipo e non per «già svolto o no» perché sono due domande
 * di peso diverso: rispondere a dieci domande a crocette e scriverne dieci
 * sono due impegni che non si scambiano, e chi apre la pagina sta decidendo
 * quanto tempo ha adesso. Che un test sia già stato svolto lo dice la sua
 * tessera, riga per riga, insieme a com'era andata.
 *
 * I tipi assenti non compaiono: una pastiglia con lo zero accanto è un
 * bottone che porta a una griglia vuota, e in un catalogo di soli test a
 * crocette sarebbero tre. Il conto è del catalogo intero e non di quello che
 * la ricerca ha lasciato a schermo, come il numero accanto a ogni categoria
 * nella galleria degli avatar.
 */
export function kindFilterOptions(
  simulations: Simulation[],
): { value: SimulationFilter; label: string; count: number }[] {
  const counts = new Map<SimulationKind, number>()
  for (const simulation of simulations) {
    counts.set(simulation.kind, (counts.get(simulation.kind) ?? 0) + 1)
  }
  return [
    { value: ALL_KINDS, label: 'Tutti', count: simulations.length },
    ...KIND_ORDER.filter((kind) => counts.has(kind)).map((kind) => ({
      value: kind,
      label: kindLabel(kind),
      count: counts.get(kind) ?? 0,
    })),
  ]
}

/* ── La gestione, che è l'altra metà ──────────────────────────────────
 *
 * Chi prepara i test guarda le stesse righe da un'altra parte, e le domande
 * che si fa aprendo la pagina sono tre: **quali siano ancora da finire**, che
 * una simulazione vive in bozza finché il serbatoio non è pieno e riletto,
 * **come ci si risponde**, che scrivere dieci domande a crocette e dieci da
 * correggere a mano sono due lavori diversi, e **chi le ha scritte**, perché
 * le domande di un modello sono quelle da rileggere. Stanno qui accanto
 * all'altro filtro perché sono modi di restringere lo stesso elenco, e
 * separarli vorrebbe dire due file che parlano di simulazioni filtrate. */

/** Quali simulazioni guardare nella gestione: le bozze, le pubblicate, tutte. */
export type SimulationStatusFilter = SimulationStatus | 'all'

/** Da dove vengono le domande: dal modello, da una persona, o non importa. */
export type SimulationSourceFilter = SimulationSource | 'all'

/** Le tre tendine sopra la tabella, in un valore solo: la pagina ne cambia
 *  una per volta e le passa insieme, come la barra della gestione utenti. */
export interface AdminSimulationFilters {
  status: SimulationStatusFilter
  kind: SimulationFilter
  source: SimulationSourceFilter
}

/** L'elenco intero, che è da dove si parte e dove riporta «Azzera Filtri». */
export const NO_ADMIN_FILTERS: AdminSimulationFilters = {
  status: 'all',
  kind: ALL_KINDS,
  source: 'all',
}

/* In una tendina la voce che non restringe niente sta in cima e non in fondo,
 * come "Tutti gli stati" nella gestione utenti: è il valore di partenza, che
 * si legge sul pulsante finché nessuno sceglie, non una terza opzione da
 * cercare in fondo alla lista. */
export const ADMIN_STATUS_OPTIONS: { value: SimulationStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tutti gli stati' },
  { value: 'draft', label: 'Bozze' },
  { value: 'published', label: 'Pubblicate' },
]

/* I quattro tipi ci sono sempre, anche dove il catalogo non li ha ancora:
 * qui non c'è il numero accanto alla voce che c'è sulle pastiglie del
 * catalogo, quindi una tendina che cambia lunghezza da un'organizzazione
 * all'altra direbbe solo che le voci si spostano sotto il cursore. */
export const ADMIN_KIND_OPTIONS: { value: SimulationFilter; label: string }[] = [
  { value: ALL_KINDS, label: 'Tutti i tipi' },
  ...KIND_ORDER.map((kind) => ({ value: kind, label: kindLabel(kind) })),
]

/* L'origine con le stesse due parole del tooltip della targhetta, che sulla
 * riga è solo un'icona: chi ha visto la scintilla e ci ha letto sopra "IA"
 * ritrova quella parola qui. Prima il modello, che è il caso da rileggere:
 * le domande scritte da una persona sono già passate da chi le ha scritte. */
export const ADMIN_SOURCE_OPTIONS: { value: SimulationSourceFilter; label: string }[] = [
  { value: 'all', label: 'Tutte le origini' },
  { value: 'ai', label: sourceLabel('ai') },
  { value: 'manual', label: sourceLabel('manual') },
]

/**
 * Le simulazioni che restano dopo i filtri e la ricerca.
 *
 * La ricerca guarda anche il tipo e l'origine, che nella tabella si leggono
 * come targhette: cercare "aperta" trova i test in cui si scrive, cercare
 * "manuale" quelli scritti da una persona. L'organizzazione entra solo dove
 * si vede, cioè per chi ne amministra più di una: per un organization admin
 * sarebbe la propria su ogni riga, e cercarla restituirebbe tutto.
 */
export function filterAdminSimulations(
  simulations: AdminSimulation[],
  filters: AdminSimulationFilters,
  search: string,
  showOrganization: boolean,
): AdminSimulation[] {
  return simulations.filter((simulation) => {
    if (filters.status !== 'all' && simulation.status !== filters.status) return false
    if (filters.kind !== ALL_KINDS && simulation.kind !== filters.kind) return false
    if (filters.source !== 'all' && simulation.source !== filters.source) return false
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
