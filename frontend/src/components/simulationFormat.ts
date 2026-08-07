/* Come si scrivono e si colorano i numeri del simulatore tecnico.
 *
 * In un file a parte perché le stesse tre funzioni servono all'elenco, allo
 * svolgimento, all'esito e alla pagina di gestione, e un voto che è verde in
 * una schermata e giallo in quella accanto è un voto che non si legge. */

import type { SimulationKind, SimulationSource, SimulationStatus } from '../services/simulations'

/* La scala del punteggio a tempo, gemella di `backend/simulation_scoring.py`.
 *
 * È scritta due volte, e la copia che conta è quella del server: i punti di
 * un tentativo li assegna lui e tornano indietro con l'esito. Questa serve a
 * dire quanto vale la risposta *mentre* il tempo scorre, che è l'unico
 * momento in cui il server non ha ancora niente da dire. Cambiando la scala
 * là va cambiata anche qui, o il numero che si legge durante la domanda non
 * sarà quello che arriva nel riepilogo. */
export const QUESTION_SECONDS = 30
const SCORE_STEPS = 10
export const STEP_SECONDS = QUESTION_SECONDS / SCORE_STEPS
const STEP_POINTS = 1 / SCORE_STEPS

/** Quanto vale ora una risposta corretta, dopo `elapsedMs` dalla domanda. */
export function pointsAfter(elapsedMs: number): number {
  const seconds = Math.min(Math.max(elapsedMs, 0), QUESTION_SECONDS * 1000) / 1000
  const step = Math.max(Math.ceil(seconds / STEP_SECONDS), 1)
  return Number((1 - (step - 1) * STEP_POINTS).toFixed(1))
}

/** Il tempo di una risposta come si legge nell'esito: "in 8s". */
export function formatElapsed(ms: number): string {
  return `${Math.round(ms / 100) / 10}s`.replace('.', ',')
}

/** La lettera con cui un'alternativa si presenta nel test: A, B, C, D. */
export function optionLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

/** Il voto in decimi come si scrive in italiano: 7,5 e non 7.5. */
export function formatScore(score: number): string {
  return score.toLocaleString('it-IT', { maximumFractionDigits: 1 })
}

/* Le tre soglie sono quelle della scuola, ed è voluto: sotto il sei non si
 * passa, dall'otto in su si è preparati, in mezzo si è passati e basta. */
export function scoreBadgeTone(score: number): string {
  if (score >= 8) return 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
  if (score >= 6) return 'border border-amber-500/25 bg-amber-500/10 text-amber-400'
  return 'border border-red-500/25 bg-red-500/10 text-red-300'
}

/* Lo stato compare nella tabella di gestione, nella scheda di dettaglio e in
 * cima al pannello di revisione: sono tre posti che parlano della stessa cosa,
 * quindi la parola e il colore stanno qui e non in ciascuno di loro. */
export function statusLabel(status: SimulationStatus): string {
  return status === 'published' ? 'Pubblicata' : 'Bozza'
}

export function statusBadgeTone(status: SimulationStatus): string {
  return status === 'published'
    ? 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
    : 'border border-amber-500/25 bg-amber-500/10 text-amber-400'
}

/* Come si chiama un tipo di test dove lo si legge: dentro
 * `SimulationKindBadge`, nell'elenco di chi lo deve svolgere, e nelle
 * ricerche delle tabelle, che si fanno sulla stessa parola che il badge
 * mostra. La parola sta qui e non in ognuno di quei posti, come lo stato.
 *
 * Il colore invece non sta qui: appartiene al badge, che è l'unico modo in
 * cui il tipo si disegna. */
const KIND_LABELS: Record<SimulationKind, string> = {
  multiple: 'Scelta multipla',
  open: 'Risposta aperta',
  ordering: 'Ordinamento',
  matching: 'Abbinamento',
}

export function kindLabel(kind: SimulationKind): string {
  return KIND_LABELS[kind] ?? KIND_LABELS.multiple
}

/* Come si risponde, in una riga, dove la parola sola non basta: le regole
 * prima di cominciare e la scheda del test nell'elenco. "Ordinamento" dice
 * come si chiama il tipo, non cosa si dovrà fare. */
const KIND_HINTS: Record<SimulationKind, string> = {
  multiple: 'Una risposta fra le alternative, con il tempo che scorre',
  open: 'Una risposta scritta di qualche riga, senza limiti di tempo',
  ordering: "I passi di una procedura da rimettere nell'ordine giusto",
  matching: 'Due colonne da accoppiare, una voce alla volta',
}

export function kindHint(kind: SimulationKind): string {
  return KIND_HINTS[kind] ?? KIND_HINTS.multiple
}

/* Se le domande di questo tipo hanno il cronometro, il gemello di
 * `TechnicalSimulation.is_timed`. Solo la scelta multipla: trenta secondi
 * bastano a scegliere una lettera, non a disporre sei passi, e i punti degli
 * altri tipi si guadagnano a pezzi invece di scendere col tempo. */
export function isTimed(kind: SimulationKind): boolean {
  return kind === 'multiple'
}

/* Se una domanda di questo tipo può essere giusta a metà. Dove è vero,
 * accanto ai punti si scrive quanti elementi erano al posto giusto: "0,7"
 * da solo non dice cosa sia andato storto, "4 su 6" sì. */
export function hasPartialScore(kind: SimulationKind): boolean {
  return kind === 'ordering' || kind === 'matching'
}

/* Chi ha scritto le domande, in una parola.
 *
 * A differenza di `kindLabel` questa parola non si legge sullo schermo: la
 * targhetta dell'origine è solo un'icona con il tooltip. Serve alle ricerche
 * delle tabelle, dove cercare "manuale" deve trovare i test scritti a mano,
 * e a chi legge con uno screen reader, che l'icona non gliela racconta
 * nessuno.
 *
 * "IA" e non "AI": è la sigla italiana, e tutto il resto dell'interfaccia è
 * in italiano. */
export function sourceLabel(source: SimulationSource): string {
  return source === 'manual' ? 'Manuale' : 'IA'
}

/** Un tipo di test, o tutti insieme. */
export type KindFilter = SimulationKind | 'all'

/* Come si sceglie il tipo di test da guardare, il gemello di `MODE_FILTERS`
 * in ConversationModeBadge: le stesse parole del badge, offerte una seconda
 * volta per filtrare invece che per leggere. Lo usano la dashboard, il
 * confronto e lo storico di una persona nel report attività.
 *
 * Ogni tipo ha la sua voce e non ce n'è una che ne raccoglie più d'uno: i
 * quattro si correggono con quattro scale diverse, quindi tenerne due
 * insieme in un filtro vorrebbe dire mettere sulla stessa media un voto
 * preso a crocette in trenta secondi e uno preso disponendo sei passi senza
 * fretta. "Tutti" resta in fondo perché è il punto di partenza, non una
 * quinta scelta.
 *
 * L'ordine è quello in cui i tipi sono nati, che è anche quello dal più
 * usato al meno: chi cerca un filtro trova per primo quello che gli serve
 * quasi sempre. */
export const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'multiple', label: kindLabel('multiple') },
  { value: 'open', label: kindLabel('open') },
  { value: 'ordering', label: kindLabel('ordering') },
  { value: 'matching', label: kindLabel('matching') },
  { value: 'all', label: 'Tutti' },
]

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
