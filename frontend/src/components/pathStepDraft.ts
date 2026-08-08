/* Una tappa mentre la si compone, che non è ancora una tappa da mandare.
 *
 * Sul server una tappa porta un bersaglio solo, l'avatar o la simulazione, e
 * il tipo si legge da quale delle due colonne è piena. Mentre la si compone
 * quella regola non basta: appena si sceglie "test tecnico" non c'è ancora
 * nessun test scelto, quindi entrambi i campi sono vuoti e dedurre il tipo
 * dagli id lo farebbe tornare subito a "conversazione". Era il motivo per
 * cui premere "Test tecnico" sembrava non fare niente.
 *
 * Quindi la bozza tiene il tipo per conto suo, e i due id restano quello che
 * sono: la scelta fatta dentro quel tipo, che può ancora mancare. Al
 * salvataggio si torna alla forma del server, dove di campo pieno ce n'è uno.
 *
 * Il tipo vive nel dato e non in uno stato del componente perché le tappe si
 * riordinano: uno stato legato alla posizione resterebbe dov'è mentre i
 * valori si spostano, e la tappa due si ritroverebbe il tipo della tre. */

import type { PathStep, PathStepInput, StepKind } from '../services/training'

export interface PathStepDraft {
  kind: StepKind
  /** Il bersaglio scelto dentro il tipo, ancora vuoto appena lo si cambia. */
  avatarId: string | null
  simulationId: string | null
  targetScore: number
  dueDays: number | null
}

/** L'obiettivo di partenza di una tappa nuova: la sufficienza piena. */
const DEFAULT_TARGET = 7

export function emptyDraft(): PathStepDraft {
  return {
    kind: 'avatar',
    avatarId: null,
    simulationId: null,
    targetScore: DEFAULT_TARGET,
    dueDays: null,
  }
}

/** La bozza di una tappa che esiste già, per riaprirla in modifica. */
export function draftFromStep(step: PathStep): PathStepDraft {
  return {
    kind: step.kind,
    avatarId: step.avatar_id,
    simulationId: step.simulation_id,
    targetScore: step.target_score,
    dueDays: step.due_days,
  }
}

/** Il bersaglio scelto, quello del tipo corrente e non dell'altro. */
export function draftTarget(draft: PathStepDraft): string | null {
  return draft.kind === 'avatar' ? draft.avatarId : draft.simulationId
}

/** Se la tappa è finita, cioè se un bersaglio è stato scelto. */
export function isDraftComplete(draft: PathStepDraft): boolean {
  return draftTarget(draft) !== null
}

/**
 * La tappa nella forma che il server accetta: un bersaglio e uno solo.
 *
 * Il campo dell'altro tipo resta a null anche se durante la composizione era
 * stato riempito: una tappa che porta tutti e due i bersagli il server la
 * rifiuta, ed è giusto così, perché non saprebbe quale delle due prove
 * chiedere.
 */
export function toStepInput(draft: PathStepDraft): PathStepInput {
  return {
    avatar_id: draft.kind === 'avatar' ? draft.avatarId : null,
    simulation_id: draft.kind === 'simulation' ? draft.simulationId : null,
    target_score: draft.targetScore,
    due_days: draft.dueDays,
  }
}
