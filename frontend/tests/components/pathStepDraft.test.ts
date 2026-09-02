import { describe, expect, it } from 'vitest'

import type { PathStep } from '../../src/services/training'
import { toLocalInputValue } from '../../src/components/instant'
import {
  draftFromProposal,
  draftFromStep,
  draftProblem,
  draftTarget,
  emptyDraft,
  isDraftComplete,
  toStepInput,
  withCriterionTarget,
} from '../../src/components/pathStepDraft'

/* Il tipo di una tappa in composizione non si deduce dagli id, e questi test
 * lo tengono fermo: dedurlo faceva tornare "test tecnico" a "conversazione"
 * nell'istante in cui lo si sceglieva, perché in quel momento nessun test è
 * ancora stato scelto e tutti e due i campi sono vuoti.
 *
 * L'altro passaggio che qui si fissa è la scadenza, che cambia forma due
 * volte: in UTC sul server, nell'ora di chi la scrive dentro il campo. */

const simulationStep: PathStep = {
  id: 's1',
  position: 1,
  kind: 'simulation',
  target_score: 6,
  criteria_targets: [],
  due_at: '2026-03-04T15:30:00',
  avatar_id: null,
  avatar_name: null,
  avatar_category: null,
  avatar_category_color: 'violet',
  simulation_id: 'x1',
  simulation_title: 'Procedure di cassa',
  simulation_kind: 'multiple',
}

describe('la bozza di una tappa', () => {
  it('tiene il tipo scelto anche senza un bersaglio', () => {
    const draft = { ...emptyDraft(), kind: 'simulation' as const }

    expect(draft.kind).toBe('simulation')
    expect(draftTarget(draft)).toBeNull()
    expect(isDraftComplete(draft)).toBe(false)
  })

  it('legge il bersaglio del tipo attivo, non dell’altro', () => {
    const draft = { ...emptyDraft(), avatarId: 'a1' }

    expect(draftTarget(draft)).toBe('a1')
    expect(draftTarget({ ...draft, kind: 'simulation' })).toBeNull()
  })

  it('riapre una tappa esistente com’era', () => {
    expect(draftFromStep(simulationStep)).toEqual({
      // L'identità della bozza vive quanto la scheda aperta e non esce di lì:
      // qui basta che ci sia, quale sia non lo decide nessuno
      id: expect.any(String),
      kind: 'simulation',
      avatarId: null,
      criteriaTargets: {},
      criteriaOpen: false,
      simulationId: 'x1',
      targetScore: 6,
      dueAt: toLocalInputValue('2026-03-04T15:30:00'),
      // Le motivazioni erano della proposta: un percorso salvato non ne ha
      reason: null,
    })
  })

  /* Due tappe non sono mai la stessa tappa, nemmeno quando sono uguali in
   * tutto: è l'identità che permette a React di riconoscerle quando si
   * spostano, e senza, spostare una riga lasciava quello che c'era dentro
   * addosso alla tappa sbagliata. */
  it('dà a ogni bozza un’identità sua', () => {
    expect(emptyDraft().id).not.toBe(emptyDraft().id)
  })

  /* La motivazione viaggia con la tappa proposta, perché è sotto quella riga
   * che si legge mentre si decide se tenerla, e non si salva: `toStepInput`
   * non la manda al server, che di quel campo non sa niente. */
  it('porta la motivazione dentro la tappa proposta, e non la salva', () => {
    const draft = draftFromProposal({
      avatar_id: 'a1',
      simulation_id: null,
      target_score: 6,
      reason: 'Si comincia da un caso semplice.',
    })

    expect(draft.reason).toBe('Si comincia da un caso semplice.')
    expect(draft.dueAt).toBeNull()
    expect(toStepInput(draft)).toEqual({
      avatar_id: 'a1',
      simulation_id: null,
      target_score: 6,
      criteria_targets: {},
      due_at: null,
    })
  })

  it('riporta la scadenza in UTC quando la manda al server', () => {
    /* Il campo parla nell'ora di chi compone il percorso e non scrive il
     * fuso: senza il passaggio, le 15:30 di Roma diventerebbero le 15:30 in
     * colonna, cioè un'ora e mezza in più di quelle date davvero. */
    const draft = { ...emptyDraft(), avatarId: 'a1', dueAt: '2026-03-04T15:30' }

    const sent = toStepInput(draft).due_at as string
    expect(sent.endsWith('Z')).toBe(true)
    // E riletto torna al minuto che era stato scritto, non a un altro
    expect(toLocalInputValue(sent)).toBe('2026-03-04T15:30')
  })

  it('manda al server il solo bersaglio del tipo attivo', () => {
    /* Chi ha provato "conversazione", poi è passato a "test tecnico", si
     * porta dietro l'avatar scelto prima: al salvataggio non deve partire,
     * o il server rifiuterebbe una tappa con due bersagli. */
    const indeciso = {
      id: 'bozza-1',
      kind: 'simulation' as const,
      avatarId: 'a1',
      simulationId: 'x1',
      targetScore: 8,
      criteriaTargets: {},
      criteriaOpen: false,
      dueAt: null,
      reason: null,
    }

    expect(toStepInput(indeciso)).toEqual({
      avatar_id: null,
      simulation_id: 'x1',
      target_score: 8,
      criteria_targets: {},
      due_at: null,
    })
    expect(toStepInput({ ...indeciso, kind: 'avatar' })).toEqual({
      avatar_id: 'a1',
      simulation_id: null,
      target_score: 8,
      criteria_targets: {},
      due_at: null,
    })
  })
  /* Le soglie sui criteri: un criterio senza numero non è una soglia a zero,
   * è un criterio che non pone nessuna condizione. Le due cose non si possono
   * confondere, perché una soglia a zero la raggiunge chiunque. */
  it('toglie la chiave di un criterio quando il campo si svuota', () => {
    const conSoglia = withCriterionTarget(emptyDraft(), 'empatia', 8)
    expect(conSoglia.criteriaTargets).toEqual({ empatia: 8 })

    const senza = withCriterionTarget(conSoglia, 'empatia', null)
    expect(senza.criteriaTargets).toEqual({})
  })

  it('riapre una tappa con le sue soglie, ma col pannello chiuso', () => {
    const step: PathStep = {
      ...simulationStep,
      kind: 'avatar',
      simulation_id: null,
      simulation_title: null,
      simulation_kind: null,
      avatar_id: 'a1',
      avatar_name: 'Mario Rossi',
      criteria_targets: [{ key: 'empatia', label: 'Empatia', target: 8 }],
    }

    const draft = draftFromStep(step)

    expect(draft.criteriaTargets).toEqual({ empatia: 8 })
    // Il pannello si apre col bottone, anche su una tappa che le soglie ce le
    // ha già: chi torna su un percorso lo fa quasi sempre per altro, e quante
    // soglie ci sono lo dice il bottone senza aprirlo.
    expect(draft.criteriaOpen).toBe(false)
  })

  it('non manda al server le soglie di una tappa diventata un test', () => {
    /* Come per il bersaglio: chi ha scritto le soglie e poi è passato a "test
     * tecnico" se le tiene nel form, ma un test non si valuta per criteri e
     * il server rifiuterebbe la tappa. */
    const draft = {
      ...emptyDraft(),
      kind: 'simulation' as const,
      simulationId: 'x1',
      criteriaTargets: { empatia: 8 },
    }

    expect(toStepInput(draft).criteria_targets).toEqual({})
    expect(toStepInput({ ...draft, kind: 'avatar', avatarId: 'a1' }).criteria_targets).toEqual({
      empatia: 8,
    })
  })
})

/* Perché una tappa non si può ancora salvare, detto con parole invece che con
 * un bottone spento: le tappe di un percorso sono più d'una, e «una tappa non
 * è a posto» costringe a riaprirle tutte per scoprire quale. */
describe('cosa manca a una tappa', () => {
  it('chiede il bersaglio del tipo che si sta componendo', () => {
    expect(draftProblem(emptyDraft())).toBe('scegli l’avatar con cui si parla')
    expect(draftProblem({ ...emptyDraft(), kind: 'simulation' })).toBe('scegli il test da svolgere')
  })

  it('chiede l’obiettivo quando il campo è stato svuotato', () => {
    const draft = { ...emptyDraft(), avatarId: 'a1', targetScore: null }

    expect(draftProblem(draft)).toBe('scrivi l’obiettivo, un voto fra 1 e 10')
    expect(isDraftComplete(draft)).toBe(false)
  })

  /* La stessa scala del referto e la stessa che il server pretende: dirla qui
   * la fa leggere mentre si scrive, invece che dentro un rifiuto. */
  it('tiene l’obiettivo dentro la scala dei voti', () => {
    const draft = { ...emptyDraft(), avatarId: 'a1' }

    expect(draftProblem({ ...draft, targetScore: 0 })).toBe('l’obiettivo sta fra 1 e 10')
    expect(draftProblem({ ...draft, targetScore: 11 })).toBe('l’obiettivo sta fra 1 e 10')
  })

  it('non trova niente da dire su una tappa finita', () => {
    const draft = { ...emptyDraft(), avatarId: 'a1' }

    expect(draftProblem(draft)).toBeNull()
    expect(isDraftComplete(draft)).toBe(true)
  })
})
