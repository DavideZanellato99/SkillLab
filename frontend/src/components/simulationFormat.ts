/* Come si scrivono e si colorano i numeri del simulatore tecnico.
 *
 * In un file a parte perché le stesse tre funzioni servono all'elenco, allo
 * svolgimento, all'esito e alla pagina di gestione, e un voto che è verde in
 * una schermata e giallo in quella accanto è un voto che non si legge. */

import type { SimulationStatus } from '../services/simulations'

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

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
