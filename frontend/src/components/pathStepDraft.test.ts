import { describe, expect, it } from 'vitest'

import type { PathStep } from '../services/training'
import { toLocalInputValue } from './instant'
import {
  draftFromStep,
  draftTarget,
  emptyDraft,
  isDraftComplete,
  toStepInput,
} from './pathStepDraft'

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
      kind: 'simulation',
      avatarId: null,
      simulationId: 'x1',
      targetScore: 6,
      dueAt: toLocalInputValue('2026-03-04T15:30:00'),
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
      kind: 'simulation' as const,
      avatarId: 'a1',
      simulationId: 'x1',
      targetScore: 8,
      dueAt: null,
    }

    expect(toStepInput(indeciso)).toEqual({
      avatar_id: null,
      simulation_id: 'x1',
      target_score: 8,
      due_at: null,
    })
    expect(toStepInput({ ...indeciso, kind: 'avatar' })).toEqual({
      avatar_id: 'a1',
      simulation_id: null,
      target_score: 8,
      due_at: null,
    })
  })
})
