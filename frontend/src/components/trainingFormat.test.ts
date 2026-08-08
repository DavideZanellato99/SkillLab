import { describe, expect, it } from 'vitest'

import type { PathStep, StepProgress } from '../services/training'
import { stepKindLabel, stepLink, stepProgress, stepTarget } from './trainingFormat'

/* Le due forme di tappa si leggono e si aprono in modo diverso, e sono le
 * uniche due strade che questo file conosce: qui si fissa che una tappa non
 * finisca mai a chiamarsi con il campo dell'altra o a portare nel posto
 * sbagliato. */

const avatarStep: PathStep = {
  id: 's1',
  position: 1,
  kind: 'avatar',
  target_score: 7,
  due_days: null,
  avatar_id: 'a1',
  avatar_name: 'Mario Rossi',
  avatar_category: 'Clienti',
  avatar_category_color: 'violet',
  simulation_id: null,
  simulation_title: null,
  simulation_kind: null,
}

const simulationStep: PathStep = {
  ...avatarStep,
  id: 's2',
  position: 2,
  kind: 'simulation',
  avatar_id: null,
  avatar_name: null,
  avatar_category: null,
  simulation_id: 'x1',
  simulation_title: 'Procedure di cassa',
  simulation_kind: 'multiple',
}

const progressOf = (step: PathStep, extra: Partial<StepProgress>): StepProgress => ({
  ...step,
  status: 'active',
  unlocked_at: '2026-01-01T00:00:00',
  due_at: null,
  attempts: 0,
  best_score: null,
  achieved_at: null,
  ...extra,
})

describe('come si legge una tappa', () => {
  it('prende il nome dal bersaglio che ha', () => {
    expect(stepTarget(avatarStep)).toBe('Mario Rossi')
    expect(stepTarget(simulationStep)).toBe('Procedure di cassa')
  })

  it('porta alla chat o al test a seconda della forma', () => {
    expect(stepLink(avatarStep)).toBe('/app/chat/a1')
    expect(stepLink(simulationStep)).toBe('/app/simulatore/x1')
  })

  it('dice che prova chiede', () => {
    expect(stepKindLabel(avatarStep)).toBe('Conversazione')
    expect(stepKindLabel(simulationStep)).toBe('Test tecnico')
  })
})

describe('quanto manca a superare una tappa', () => {
  it('è la frazione fra il voto migliore e l’obiettivo', () => {
    expect(stepProgress(progressOf(avatarStep, { best_score: 3.5 }))).toBe(0.5)
  })

  it('si ferma a uno anche quando il voto supera l’obiettivo', () => {
    expect(stepProgress(progressOf(avatarStep, { best_score: 9 }))).toBe(1)
  })

  it('è zero senza tentativi', () => {
    expect(stepProgress(progressOf(avatarStep, {}))).toBe(0)
  })

  it('è zero su una tappa bloccata, qualunque cosa sia stata fatta prima', () => {
    /* Quelle prove sono arrivate prima del suo turno: mostrarle come
     * avanzamento direbbe che il percorso è più avanti di dove è. */
    const locked = progressOf(avatarStep, {
      status: 'locked',
      unlocked_at: null,
      best_score: 9,
    })

    expect(stepProgress(locked)).toBe(0)
  })
})
