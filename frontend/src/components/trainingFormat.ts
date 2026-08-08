/* Come si scrivono le cose di un percorso, in un posto solo.
 *
 * Una tappa punta a un avatar oppure a una simulazione, e le due schermate
 * che la mostrano (la gestione e la home di chi si allena) devono chiamarla
 * allo stesso modo e portare allo stesso posto. Con due copie, la prima
 * volta che una tappa cambia forma una delle due resta indietro in
 * silenzio. */

import type { PathStep, StepProgress } from '../services/training'

/** Il nome del bersaglio di una tappa: l'avatar o il titolo del test. */
export function stepTarget(step: PathStep): string {
  return step.avatar_name ?? step.simulation_title ?? ''
}

/** Dove porta una tappa: la chat con l'avatar o la pagina del test. */
export function stepLink(step: PathStep): string {
  return step.kind === 'avatar'
    ? `/app/chat/${step.avatar_id}`
    : `/app/simulatore/${step.simulation_id}`
}

/** Cosa chiede la tappa, per chi la legge senza conoscere il percorso. */
export function stepKindLabel(step: PathStep): string {
  return step.kind === 'avatar' ? 'Conversazione' : 'Test tecnico'
}

export function formatScore(score: number): string {
  return score.toLocaleString('it-IT', { maximumFractionDigits: 1 })
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Data breve, per le righe strette dove l'anno si capisce dal contesto. */
export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

/**
 * Quanto manca a superare una tappa, da 0 a 1.
 *
 * Una tappa bloccata sta a zero e non al punteggio di prove che non
 * contano: quelle sono state fatte prima del suo turno, e mostrarle come
 * avanzamento direbbe che il percorso è più avanti di dove è.
 */
export function stepProgress(step: StepProgress): number {
  if (step.status === 'locked') return 0
  return Math.max(0, Math.min(1, (step.best_score ?? 0) / step.target_score))
}
