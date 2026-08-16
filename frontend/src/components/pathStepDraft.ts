/* Una tappa mentre la si compone, che non è ancora una tappa da mandare.
 *
 * Sul server una tappa porta un bersaglio solo, l'avatar o la simulazione, e
 * il tipo si legge da quale delle due colonne è piena. Mentre la si compone
 * quella regola non basta: appena si sceglie "test tecnico" non c'è ancora
 * nessun test scelto, quindi entrambi i campi sono vuoti e dedurre il tipo
 * dagli id lo farebbe tornare subito a "conversazione". Era il motivo per
 * cui premere "Test Tecnico" sembrava non fare niente.
 *
 * Quindi la bozza tiene il tipo per conto suo, e i due id restano quello che
 * sono: la scelta fatta dentro quel tipo, che può ancora mancare. Al
 * salvataggio si torna alla forma del server, dove di campo pieno ce n'è uno.
 *
 * Il tipo vive nel dato e non in uno stato del componente perché le tappe si
 * riordinano: uno stato legato alla posizione resterebbe dov'è mentre i
 * valori si spostano, e la tappa due si ritroverebbe il tipo della tre. */

import type { PathDraftStep, PathStep, PathStepInput, StepKind } from '../services/training'
import { fromLocalInputValue, toLocalInputValue } from './instant'

export interface PathStepDraft {
  kind: StepKind
  /** Il bersaglio scelto dentro il tipo, ancora vuoto appena lo si cambia. */
  avatarId: string | null
  simulationId: string | null
  targetScore: number
  /** La scadenza come la scrive il campo: ora locale, o vuota se non scade. */
  dueAt: string | null
  /* Perché il modello ha messo questa prova in questo punto della fila.
   *
   * Non è un campo della tappa e non si salva: vale finché la tappa è quella
   * che ha proposto lui, e appena il bersaglio cambia sparisce, perché
   * sarebbe la didascalia di qualcosa che nessuno ha più proposto. Una tappa
   * scritta a mano nasce senza. */
  reason: string | null
}

/** L'obiettivo di partenza di una tappa nuova: la sufficienza piena. */
const DEFAULT_TARGET = 7

export function emptyDraft(): PathStepDraft {
  return {
    kind: 'avatar',
    avatarId: null,
    simulationId: null,
    targetScore: DEFAULT_TARGET,
    dueAt: null,
    reason: null,
  }
}

/** La bozza di una tappa che esiste già, per riaprirla in modifica. */
export function draftFromStep(step: PathStep): PathStepDraft {
  return {
    kind: step.kind,
    avatarId: step.avatar_id,
    simulationId: step.simulation_id,
    targetScore: step.target_score,
    dueAt: step.due_at ? toLocalInputValue(step.due_at) : null,
    // Un percorso salvato non porta motivazioni: erano della proposta.
    reason: null,
  }
}

/**
 * Una tappa proposta dal modello, nella forma in cui il form la modifica.
 *
 * Il tipo si ricava da quale bersaglio è pieno, e qui si può: la proposta
 * arriva dal server, dove una tappa porta già un bersaglio solo, quindi non
 * c'è il momento intermedio in cui l'utente ha scelto il tipo e non ancora la
 * prova, che è la ragione per cui `kind` esiste nella bozza.
 *
 * La scadenza resta vuota perché il modello non la scrive: una data dipende
 * da quando il corso comincia, e la mette chi compone.
 *
 * La motivazione invece viaggia con la tappa, ed è l'unico posto in cui
 * entra: si legge sotto la riga che spiega, mentre si decide se tenerla.
 */
export function draftFromProposal(step: PathDraftStep): PathStepDraft {
  return {
    kind: step.avatar_id ? 'avatar' : 'simulation',
    avatarId: step.avatar_id,
    simulationId: step.simulation_id,
    targetScore: step.target_score,
    dueAt: null,
    reason: step.reason || null,
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
    due_at: draft.dueAt ? fromLocalInputValue(draft.dueAt) : null,
  }
}
