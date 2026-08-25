/* Come si scrivono le cose di un percorso, in un posto solo.
 *
 * Una tappa punta a un avatar oppure a una simulazione, e le due schermate
 * che la mostrano (la gestione e la home di chi si allena) devono chiamarla
 * allo stesso modo e portare allo stesso posto. Con due copie, la prima
 * volta che una tappa cambia forma una delle due resta indietro in
 * silenzio. */

import type {
  AssignmentStatus,
  PathAssignment,
  PathStep,
  StepKind,
  StepProgress,
} from '../services/training'
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
  return step.kind === 'avatar' ? 'Conversazione' : 'Test Tecnico'
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
 * I percorsi divisi in due: quelli da chiudere e quelli chiusi.
 *
 * Chi apre la propria pagina cerca cosa deve fare, non cosa ha già fatto; i
 * completati restano, perché sono la strada percorsa, ma stanno da un'altra
 * parte. Erano un solo elenco riordinato, e la differenza fra le due metà la
 * portava la sola opacità delle schede: con più di quattro o cinque percorsi
 * il confine fra il debito e l'archivio andava cercato scheda per scheda.
 * L'ordine dentro ogni metà è quello in cui arrivano, cioè i più recenti in
 * cima.
 */
export function splitByOpen(assignments: PathAssignment[]): {
  open: PathAssignment[]
  done: PathAssignment[]
} {
  return {
    open: assignments.filter((assignment) => isOpenStatus(assignment.status)),
    done: assignments.filter((assignment) => !isOpenStatus(assignment.status)),
  }
}

/**
 * La tappa da cui si riprende, se il percorso ne ha una da fare.
 *
 * È quella di adesso, ma solo quando si può davvero cominciare: a percorso
 * finito `currentStep` risponde con l'ultima, che è dove si è arrivati e non
 * dove si sta andando, e un invito a riprendere da lì porterebbe a rifare una
 * prova già superata.
 */
export function resumableStep(assignment: PathAssignment): StepProgress | undefined {
  if (!isOpenStatus(assignment.status)) return undefined
  const step = currentStep(assignment)
  return step && !isStepLocked(step) ? step : undefined
}

/**
 * La tappa che si sta percorrendo su un certo avatar o su un certo test, e il
 * percorso a cui appartiene.
 *
 * Serve alla chat e al simulatore, che di percorsi non sanno niente e ci si
 * arriva anche senza passare dalla mappa: è la domanda «quello che sto per
 * fare conta per qualcosa?». La risposta la danno i dati e non da dove si
 * arriva, quindi vale anche entrando dalla galleria, ed è la sola forma in cui
 * può essere vera.
 *
 * Guarda la sola tappa di adesso di ogni percorso aperto, e non tutte quelle
 * che puntano lì: una prova fatta prima del turno di una tappa non conta per
 * quella tappa (vedi `stepProgress`), quindi annunciarla come obiettivo
 * prometterebbe un avanzamento che non arriverà. Se due percorsi aperti
 * aspettano la stessa prova vince il primo, cioè il più recente: sono due
 * obiettivi sulla stessa conversazione, e conviene dirne uno che nessuno.
 */
export function stepInProgressFor(
  assignments: PathAssignment[],
  kind: StepKind,
  targetId: string | undefined,
): { assignment: PathAssignment; step: StepProgress } | null {
  if (!targetId) return null
  for (const assignment of assignments) {
    const step = resumableStep(assignment)
    if (!step || step.kind !== kind) continue
    const id = kind === 'avatar' ? step.avatar_id : step.simulation_id
    if (id === targetId) return { assignment, step }
  }
  return null
}

/**
 * Una tappa ritrovata per id, con il percorso a cui appartiene.
 *
 * Serve a chi ha visto una tappa e vuole sapere com'è andata a finire: la
 * striscia dentro la chat la ritrova così dopo una valutazione, quando quella
 * tappa non è più «di adesso» perché è appena stata superata. Cercarla di
 * nuovo per bersaglio non funzionerebbe, ed è il punto: la ricerca per
 * bersaglio guarda solo la tappa di adesso, che a quel momento è già la
 * successiva.
 */
export function stepById(
  assignments: PathAssignment[],
  stepId: string,
): { assignment: PathAssignment; step: StepProgress } | null {
  for (const assignment of assignments) {
    const step = assignment.steps.find((candidate) => candidate.id === stepId)
    if (step) return { assignment, step }
  }
  return null
}

/** Se una tappa è stata superata, in tempo o in ritardo. */
export function isStepDone(step: StepProgress): boolean {
  return step.status === 'completed' || step.status === 'completed_late'
}

/**
 * Quante delle soglie sui criteri di una tappa sono state raggiunte.
 *
 * Su una tappa bloccata sono zero, per la stessa ragione per cui il suo
 * avanzamento è zero: quei voti vengono da prove fatte prima del suo turno.
 * Il conto è per criterio e sul meglio fatto su ognuno, quindi tutte
 * raggiunte non vuol dire tappa superata: quella la supera una conversazione
 * che li raggiunge insieme.
 */
export function criteriaMet(step: StepProgress): number {
  if (isStepLocked(step)) return 0
  return step.criteria_targets.filter(
    (target) => (step.best_criteria_scores[target.key] ?? 0) >= target.target,
  ).length
}

/** Quanto una scadenza pesa su chi la legge: passata, vicina, o lontana. */
export type DeadlineTone = 'overdue' | 'soon' | 'plain'

/**
 * Quanti giorni prima una scadenza comincia a essere una notizia.
 *
 * È la stessa finestra con cui il server manda l'avviso (`DUE_SOON_DAYS` in
 * notifications.py): una tappa che la campanella annuncia come vicina non può
 * essere scritta come una data qualunque nella pagina che la mostra.
 */
export const DUE_SOON_DAYS = 3

/** I giorni interi di distanza fra due momenti, contati sul calendario. */
function daysApart(from: Date, to: Date): number {
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000)
}

/**
 * La scadenza di una tappa come la si legge di sfuggita, con quanto pesa.
 *
 * Una data e basta ("27 ago, 18:00") va letta e confrontata con oggi ogni
 * volta, e finché la scadenza è comparsa solo dentro il riquadro di una tappa
 * aperta apposta quel conto lo faceva chi ci era già arrivato. Nell'elenco e
 * sulla mappa serve invece la conclusione, perché è quella che decide da quale
 * percorso si comincia: vicino si dice quanto manca, lontano basta il giorno.
 *
 * L'ora resta dove cambia qualcosa, cioè quando il termine è oggi o domani: a
 * tre giorni di distanza sapere che è alle 18 non cambia cosa si fa adesso, e
 * una tappa da chiudere entro le 18 annunciata come "domani" e basta manderebbe
 * a provarci la sera.
 */
export function deadlineNote(
  step: PathStep,
  now: Date = new Date(),
): { text: string; tone: DeadlineTone } | null {
  if (!step.due_at) return null
  const due = parseInstant(step.due_at)
  if (due.getTime() <= now.getTime()) {
    return { text: `Scaduta il ${formatShortDeadline(step.due_at)}`, tone: 'overdue' }
  }
  const days = daysApart(now, due)
  const at = due.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (days === 0) return { text: `Scade oggi alle ${at}`, tone: 'soon' }
  if (days === 1) return { text: `Scade domani alle ${at}`, tone: 'soon' }
  if (days <= DUE_SOON_DAYS) return { text: `Scade fra ${days} giorni`, tone: 'soon' }
  return { text: `Scade il ${formatDate(step.due_at)}`, tone: 'plain' }
}
