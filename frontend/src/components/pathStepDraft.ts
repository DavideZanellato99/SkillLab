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

import type {
  CriteriaTargets,
  PathDraftStep,
  PathStep,
  PathStepInput,
  StepKind,
} from '../services/training'
import { fromLocalInputValue, toLocalInputValue } from './instant'

export interface PathStepDraft {
  /* L'identità della bozza mentre si compone, e nient'altro: non è l'id
   * della tappa salvata e non arriva mai al server.
   *
   * Serve a React come chiave dell'elenco. Con la posizione al suo posto,
   * spostare una tappa in su spostava la riga ma non quello che c'era dentro:
   * il pannello dei criteri aperto e il numero a metà scrittura restavano
   * alla posizione di prima, cioè addosso alla tappa sbagliata. */
  id: string
  kind: StepKind
  /** Il bersaglio scelto dentro il tipo, ancora vuoto appena lo si cambia. */
  avatarId: string | null
  simulationId: string | null
  /* L'obiettivo della tappa, o null mentre il campo è vuoto.
   *
   * Vuoto è uno stato che si attraversa: per riscrivere il numero lo si
   * cancella, e in quel momento la tappa non ha un obiettivo. Scritto come
   * zero sarebbe un obiettivo che il server rifiuta (la scala parte da 1) e,
   * peggio, il form crederebbe la tappa a posto e lascerebbe premere: quello
   * che tornava indietro era il rifiuto di Pydantic, che non è una frase da
   * leggere. Null lo dice invece a chi sta ancora scrivendo (vedi
   * `draftProblem`). */
  targetScore: number | null
  /* Le soglie sui singoli criteri, `{chiave: voto}`.
   *
   * Ci stanno solo i criteri su cui la tappa pone una condizione: togliere
   * il numero da un criterio ne toglie la chiave, invece di lasciarla con
   * un valore che vorrebbe dire "nessuna soglia". Un vuoto scritto come
   * zero sarebbe una soglia raggiunta da chiunque, e la differenza fra le
   * due cose la si scopre solo quando qualcuno percorre la tappa.
   *
   * Restano nella bozza anche mentre il tipo è "test tecnico", come ci
   * resta l'avatar scelto: al salvataggio parte solo quello che il tipo
   * attivo prevede, e chi torna indietro ritrova quello che aveva scritto. */
  criteriaTargets: CriteriaTargets
  /* Se il pannello dei criteri è aperto. Non si salva: è come si sta
   * guardando la tappa, non cosa la tappa chiede.
   *
   * Sta nel dato per la stessa ragione per cui ci sta il tipo: le tappe si
   * riordinano, e uno stato del componente legato alla posizione resterebbe
   * dov'è mentre i valori si spostano, lasciando aperto il pannello della
   * tappa sbagliata. Nasce aperto su una tappa che le soglie ce le ha già,
   * cioè quando si riapre in modifica un percorso che le porta. */
  criteriaOpen: boolean
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

/* L'identità di una bozza, che non deve essere niente più che diversa dalle
 * altre: vive quanto la scheda aperta e non esce da qui. */
const draftId = () => crypto.randomUUID()

/* La scala dei voti, la stessa del referto e la stessa che il server pretende
 * su ogni tappa (`TrainingPathStepInput`). Sta qui perché il form la deve dire
 * prima, mentre si scrive, invece di farla scoprire da una richiesta rifiutata. */
export const MIN_TARGET = 1
export const MAX_TARGET = 10

export function emptyDraft(): PathStepDraft {
  return {
    id: draftId(),
    kind: 'avatar',
    avatarId: null,
    simulationId: null,
    targetScore: DEFAULT_TARGET,
    criteriaTargets: {},
    criteriaOpen: false,
    dueAt: null,
    reason: null,
  }
}

/** La bozza di una tappa che esiste già, per riaprirla in modifica. */
export function draftFromStep(step: PathStep): PathStepDraft {
  return {
    id: draftId(),
    kind: step.kind,
    avatarId: step.avatar_id,
    simulationId: step.simulation_id,
    targetScore: step.target_score,
    // Dalla forma in cui si leggono, che porta anche l'etichetta, a quella
    // in cui si scrivono: qui l'etichetta non serve, il pannello la prende
    // dal catalogo dei criteri insieme al peso.
    criteriaTargets: Object.fromEntries(step.criteria_targets.map((c) => [c.key, c.target])),
    criteriaOpen: step.criteria_targets.length > 0,
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
    id: draftId(),
    kind: step.avatar_id ? 'avatar' : 'simulation',
    avatarId: step.avatar_id,
    simulationId: step.simulation_id,
    targetScore: step.target_score,
    // Una proposta non pone soglie sui criteri: sceglie le prove e il loro
    // ordine, e su quali criteri insistere lo decide chi conosce la classe.
    criteriaTargets: {},
    criteriaOpen: false,
    dueAt: null,
    reason: step.reason || null,
  }
}

/** Il bersaglio scelto, quello del tipo corrente e non dell'altro. */
export function draftTarget(draft: PathStepDraft): string | null {
  return draft.kind === 'avatar' ? draft.avatarId : draft.simulationId
}

/**
 * Cosa manca a una tappa perché si possa salvare, o null se non manca niente.
 *
 * Il motivo e non il solo sì o no: le tappe di un percorso sono più d'una, e
 * «una tappa non è a posto» costringe a riaprirle tutte per capire quale.
 * Chi lo mostra ci mette davanti il numero della tappa (vedi
 * `TrainingPathEditorModal`).
 *
 * L'ordine dei controlli è quello in cui si compone: prima si sceglie la
 * prova, poi si scrive l'obiettivo.
 */
export function draftProblem(draft: PathStepDraft): string | null {
  if (draftTarget(draft) === null) {
    return draft.kind === 'avatar'
      ? 'scegli l’avatar con cui si parla'
      : 'scegli il test da svolgere'
  }
  if (draft.targetScore === null)
    return `scrivi l’obiettivo, un voto fra ${MIN_TARGET} e ${MAX_TARGET}`
  if (draft.targetScore < MIN_TARGET || draft.targetScore > MAX_TARGET) {
    return `l’obiettivo sta fra ${MIN_TARGET} e ${MAX_TARGET}`
  }
  return null
}

/** Se la tappa è finita, cioè se non le manca più niente. */
export function isDraftComplete(draft: PathStepDraft): boolean {
  return draftProblem(draft) === null
}

/** La soglia di un criterio, scritta o cancellata: senza valore, la chiave se ne va. */
export function withCriterionTarget(
  draft: PathStepDraft,
  key: string,
  value: number | null,
): PathStepDraft {
  const next = { ...draft.criteriaTargets }
  if (value === null) delete next[key]
  else next[key] = value
  return { ...draft, criteriaTargets: next }
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
    // Si arriva qui solo da una tappa completa, che un obiettivo ce l'ha
    // (vedi `draftProblem`): il ripiego è per il compilatore, non un valore
    // che qualcuno possa vedere partire.
    target_score: draft.targetScore ?? DEFAULT_TARGET,
    // Come per il bersaglio: parte solo quello che il tipo attivo prevede.
    // Un test tecnico non si valuta per criteri, e mandarne al server una
    // tappa che ne porta è una tappa che il server rifiuta.
    criteria_targets: draft.kind === 'avatar' ? draft.criteriaTargets : {},
    due_at: draft.dueAt ? fromLocalInputValue(draft.dueAt) : null,
  }
}
