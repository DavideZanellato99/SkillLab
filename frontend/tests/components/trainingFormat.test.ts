import { describe, expect, it } from 'vitest'

import type { PathAssignment, PathStep, StepProgress } from '../../src/services/training'
import {
  criteriaMet,
  deadlineNote,
  isStepDone,
  isStepLocked,
  resumableStep,
  stepById,
  splitByOpen,
  stepInProgressFor,
  stepKindLabel,
  stepLink,
  stepProgress,
  stepTarget,
} from '../../src/components/trainingFormat'

/* Le due forme di tappa si leggono e si aprono in modo diverso, e sono le
 * uniche due strade che questo file conosce: qui si fissa che una tappa non
 * finisca mai a chiamarsi con il campo dell'altra o a portare nel posto
 * sbagliato. */

const avatarStep: PathStep = {
  id: 's1',
  position: 1,
  kind: 'avatar',
  target_score: 7,
  criteria_targets: [],
  due_at: null,
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
  attempts: 0,
  best_score: null,
  best_criteria_scores: {},
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
    expect(stepKindLabel(simulationStep)).toBe('Test Tecnico')
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
      best_criteria_scores: {},
    })

    expect(stepProgress(locked)).toBe(0)
  })

  it('resta zero su una tappa chiusa che la sua data ha superato', () => {
    /* Lì lo stato dice "scaduta", quindi a sapere che la tappa non si è
     * ancora aperta resta solo lo sblocco. */
    const lockedAndLate = progressOf(avatarStep, {
      status: 'overdue',
      unlocked_at: null,
      due_at: '2020-01-01T12:00:00',
      best_score: 9,
      best_criteria_scores: {},
    })

    expect(isStepLocked(lockedAndLate)).toBe(true)
    expect(stepProgress(lockedAndLate)).toBe(0)
  })
})

/* Le due metà dell'elenco, la tappa da cui si riprende e la stessa tappa
 * ritrovata da dentro la prova: sono i tre conti su cui l'elenco, la mappa e
 * la striscia della chat dicono tutti la stessa cosa. */

const percorso = (over: Partial<PathAssignment> = {}): PathAssignment => ({
  id: 'as-1',
  path_id: 'p-1',
  path_title: 'Onboarding',
  path_description: null,
  user_id: 'u-1',
  user_name: 'Anna Rossi',
  user_email: 'anna@test.it',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  created_at: '2026-03-01T10:00:00',
  assigned_by_name: 'Marco Bianchi',
  status: 'active',
  steps: [
    progressOf(avatarStep, { status: 'completed', achieved_at: '2026-03-02T10:00:00' }),
    progressOf(simulationStep, { status: 'active' }),
  ],
  completed_steps: 1,
  current_position: 2,
  ...over,
})

describe('le due metà dei propri percorsi', () => {
  it('tiene da una parte quelli da chiudere e dall’altra i chiusi', () => {
    const aperto = percorso({ id: 'a', status: 'overdue' })
    const chiuso = percorso({ id: 'b', status: 'completed_late' })

    const { open, done } = splitByOpen([chiuso, aperto])

    expect(open.map((p) => p.id)).toEqual(['a'])
    expect(done.map((p) => p.id)).toEqual(['b'])
  })

  it('conserva l’ordine in cui i percorsi arrivano', () => {
    const primo = percorso({ id: 'a' })
    const secondo = percorso({ id: 'b' })

    expect(splitByOpen([primo, secondo]).open.map((p) => p.id)).toEqual(['a', 'b'])
  })
})

describe('la tappa da cui si riprende', () => {
  it('è quella di adesso su un percorso aperto', () => {
    expect(resumableStep(percorso())?.position).toBe(2)
  })

  /* A percorso finito la tappa "di adesso" è l'ultima, cioè una prova già
   * superata: invitare a rifarla sarebbe mandare indietro. */
  it('non esiste su un percorso chiuso', () => {
    const chiuso = percorso({
      status: 'completed',
      completed_steps: 2,
      current_position: null,
      steps: [
        progressOf(avatarStep, { status: 'completed' }),
        progressOf(simulationStep, { status: 'completed' }),
      ],
    })

    expect(resumableStep(chiuso)).toBeUndefined()
  })

  /* Una tappa scaduta e ancora chiusa non è cominciabile, malgrado lo stato
   * del percorso dica che c'è del lavoro da fare. */
  it('non esiste finché la tappa non si è sbloccata', () => {
    const bloccato = percorso({
      status: 'overdue',
      completed_steps: 0,
      steps: [progressOf(avatarStep, { status: 'overdue', unlocked_at: null })],
    })

    expect(resumableStep(bloccato)).toBeUndefined()
  })
})

describe('la tappa che si sta percorrendo su una prova', () => {
  it('riconosce l’avatar della tappa di adesso', () => {
    const conAvatar = percorso({
      steps: [progressOf(avatarStep, { status: 'active' })],
      completed_steps: 0,
      current_position: 1,
    })

    const found = stepInProgressFor([conAvatar], 'avatar', 'a1')

    expect(found?.assignment.id).toBe('as-1')
    expect(found?.step.avatar_id).toBe('a1')
  })

  it('riconosce il test della tappa di adesso', () => {
    expect(stepInProgressFor([percorso()], 'simulation', 'x1')?.step.simulation_id).toBe('x1')
  })

  /* Le prove delle tappe che verranno non contano ancora: annunciarle come
   * obiettivo prometterebbe un avanzamento che non arriva. */
  it('ignora le tappe che non sono ancora il proprio turno', () => {
    const dopo = percorso({
      completed_steps: 0,
      current_position: 1,
      steps: [
        progressOf(avatarStep, { status: 'active' }),
        progressOf(simulationStep, { status: 'locked', unlocked_at: null }),
      ],
    })

    expect(stepInProgressFor([dopo], 'simulation', 'x1')).toBeNull()
  })

  it('non confonde un avatar con un test che porta lo stesso id', () => {
    expect(stepInProgressFor([percorso()], 'avatar', 'x1')).toBeNull()
  })

  it('senza bersaglio a schermo non cerca niente', () => {
    expect(stepInProgressFor([percorso()], 'simulation', undefined)).toBeNull()
  })
})

describe('la scadenza di una tappa come si legge di sfuggita', () => {
  /* I momenti si costruiscono in ora locale e viaggiano in UTC, come quelli
     veri: scritti a mano in UTC, l'ora attesa sarebbe quella giusta solo sul
     fuso di chi ha scritto il test. */
  const locale = (giorno: number, ora: number, minuti = 0) =>
    new Date(2026, 2, giorno, ora, minuti).toISOString()
  const adesso = new Date(2026, 2, 10, 9, 0)
  const conScadenza = (due: string | null) => ({ ...avatarStep, due_at: due })

  it('non dice niente su una tappa che non scade', () => {
    expect(deadlineNote(conScadenza(null), adesso)).toBeNull()
  })

  it('dice che il termine è passato, con il giorno', () => {
    const nota = deadlineNote(conScadenza(locale(8, 18)), adesso)

    expect(nota).toEqual({ text: 'Scaduta il 08 mar, 18:00', tone: 'overdue' })
  })

  /* Oggi e domani portano l'ora, perché è quella che decide se si fa adesso
   * o stasera. */
  it('porta l’ora quando il termine è oggi', () => {
    const nota = deadlineNote(conScadenza(locale(10, 18)), adesso)

    expect(nota).toEqual({ text: 'Scade oggi alle 18:00', tone: 'soon' })
  })

  it('porta l’ora anche per domani', () => {
    const nota = deadlineNote(conScadenza(locale(11, 18)), adesso)

    expect(nota).toEqual({ text: 'Scade domani alle 18:00', tone: 'soon' })
  })

  /* Dentro la finestra in cui il server manda già l'avviso si dice quanto
   * manca, non la data: è la conclusione che serve. */
  it('conta i giorni dentro la finestra dell’avviso', () => {
    const nota = deadlineNote(conScadenza(locale(13, 8)), adesso)

    expect(nota).toEqual({ text: 'Scade fra 3 giorni', tone: 'soon' })
  })

  /* Più in là la data basta, e resta del colore del resto della riga: accesa
   * come le altre, il colore diventerebbe decorazione. */
  it('scrive il giorno quando il termine è lontano', () => {
    const nota = deadlineNote(conScadenza(new Date(2026, 3, 2, 8).toISOString()), adesso)

    expect(nota).toEqual({ text: 'Scade il 02 apr 2026', tone: 'plain' })
  })
})

describe('la tappa ritrovata dopo che è stata superata', () => {
  it('si ritrova per id, con il percorso a cui appartiene', () => {
    const found = stepById([percorso()], 's2')

    expect(found?.assignment.id).toBe('as-1')
    expect(found?.step.id).toBe('s2')
  })

  it('non trova una tappa che non c’è', () => {
    expect(stepById([percorso()], 's-999')).toBeNull()
  })

  it('riconosce le due forme di tappa chiusa', () => {
    expect(isStepDone(progressOf(avatarStep, { status: 'completed' }))).toBe(true)
    expect(isStepDone(progressOf(avatarStep, { status: 'completed_late' }))).toBe(true)
    expect(isStepDone(progressOf(avatarStep, { status: 'overdue' }))).toBe(false)
  })
})

describe('le soglie sui criteri raggiunte', () => {
  const conCriteri = (best: Record<string, number>, extra: Partial<StepProgress> = {}) =>
    progressOf(avatarStep, {
      criteria_targets: [
        { key: 'empatia', label: 'Empatia', target: 7 },
        { key: 'chiarezza', label: 'Chiarezza', target: 8 },
      ],
      best_criteria_scores: best,
      ...extra,
    })

  it('conta quelle arrivate alla soglia, pari incluso', () => {
    expect(criteriaMet(conCriteri({ empatia: 7, chiarezza: 6 }))).toBe(1)
    expect(criteriaMet(conCriteri({ empatia: 8, chiarezza: 9 }))).toBe(2)
  })

  it('conta zero su un criterio su cui non c’è ancora nessun voto', () => {
    expect(criteriaMet(conCriteri({}))).toBe(0)
  })

  /* Come per l'avanzamento: quei voti vengono da prove fatte prima del turno
     della tappa, e non contano per lei. */
  it('è zero su una tappa bloccata', () => {
    const bloccata = conCriteri(
      { empatia: 9, chiarezza: 9 },
      {
        status: 'locked',
        unlocked_at: null,
      },
    )

    expect(criteriaMet(bloccata)).toBe(0)
  })
})
