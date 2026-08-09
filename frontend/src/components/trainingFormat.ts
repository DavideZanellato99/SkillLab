/* Come si scrivono le cose di un percorso, in un posto solo.
 *
 * Una tappa punta a un avatar oppure a una simulazione, e le due schermate
 * che la mostrano (la gestione e la home di chi si allena) devono chiamarla
 * allo stesso modo e portare allo stesso posto. Con due copie, la prima
 * volta che una tappa cambia forma una delle due resta indietro in
 * silenzio. */

import type { AssignmentStatus, PathAssignment, PathStep, StepProgress } from '../services/training'
import { parseInstant } from './instant'

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
  return parseInstant(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Data breve, per le righe strette dove l'anno si capisce dal contesto. */
export function formatShortDate(dateStr: string): string {
  return parseInstant(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

/**
 * Data e ora, per una scadenza.
 *
 * L'ora fa parte del termine: una tappa da chiudere entro le 18 di venerdì
 * scritta come "venerdì" e basta manderebbe chi la legge a provarci la sera,
 * quando è già tardi.
 */
export function formatDeadline(dateStr: string): string {
  return parseInstant(dateStr).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** La stessa scadenza dove lo spazio è poco: giorno, mese e ora. */
export function formatShortDeadline(dateStr: string): string {
  return parseInstant(dateStr).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * La firma di un percorso: da chi arriva e da quando.
 *
 * Le due cose stanno insieme perché rispondono alla stessa domanda, «da dove
 * viene questo percorso che mi trovo davanti»: il nome dice a chi chiedere, la
 * data dice da quando le tappe corrono. Senza più il nome, perché quell'account
 * è stato cancellato, resta la sola data invece di sparire tutto: il percorso è
 * comunque arrivato in un giorno preciso.
 */
export function assignedByLabel(assignment: PathAssignment): string {
  const when = formatDate(assignment.created_at)
  return assignment.assigned_by_name
    ? `Assegnato da ${assignment.assigned_by_name} il ${when}`
    : `Assegnato il ${when}`
}

/**
 * Se la tappa non si è ancora aperta.
 *
 * Lo dice lo sblocco e non lo stato: una tappa chiusa la cui data è già
 * passata risponde "overdue", che è vero e va detto, ma resta una tappa che
 * il percorso non lascia ancora cominciare (vedi `AssignmentStatus`).
 */
export function isStepLocked(step: StepProgress): boolean {
  return step.unlocked_at === null
}

/**
 * Quanto manca a superare una tappa, da 0 a 1.
 *
 * Una tappa bloccata sta a zero e non al punteggio di prove che non
 * contano: quelle sono state fatte prima del suo turno, e mostrarle come
 * avanzamento direbbe che il percorso è più avanti di dove è.
 */
export function stepProgress(step: StepProgress): number {
  if (isStepLocked(step)) return 0
  return Math.max(0, Math.min(1, (step.best_score ?? 0) / step.target_score))
}

/** Un percorso è aperto finché ha una tappa da fare, scaduta o no. */
export function isOpenStatus(status: AssignmentStatus): boolean {
  return status === 'active' || status === 'overdue'
}

/**
 * La tappa in cui ci si trova adesso.
 *
 * È quella aperta, e a percorso chiuso l'ultima: è lì che si è arrivati, e
 * una schermata che deve indicarne una non può non indicarne nessuna.
 */
export function currentStepOf(steps: StepProgress[]): StepProgress | undefined {
  return steps.find((step) => isOpenStatus(step.status)) ?? steps[steps.length - 1]
}

/** La stessa domanda partendo dal percorso, che è come la fanno le schermate. */
export function currentStep(assignment: PathAssignment): StepProgress | undefined {
  return currentStepOf(assignment.steps)
}

/**
 * I percorsi con quelli ancora da chiudere in cima.
 *
 * Chi apre la propria pagina cerca cosa deve fare, non cosa ha già fatto; i
 * completati restano, perché sono la strada percorsa, ma dopo.
 */
export function openFirst(assignments: PathAssignment[]): PathAssignment[] {
  return [...assignments].sort(
    (a, b) => Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status)),
  )
}
