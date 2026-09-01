import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useMyAssignments = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useTraining', () => ({ useMyAssignments }))

import type { PathAssignment, StepProgress } from '../../src/services/training'
import MyPathsRoute from '../../src/components/MyPathsRoute'

const step = (
  over: Partial<StepProgress> & Pick<StepProgress, 'id' | 'position'>,
): StepProgress => ({
  kind: 'avatar',
  target_score: 7,
  criteria_targets: [],
  due_at: null,
  avatar_id: `a${over.position}`,
  avatar_name: `Avatar ${over.position}`,
  avatar_category: 'Clienti',
  avatar_category_color: 'violet',
  simulation_id: null,
  simulation_title: null,
  simulation_kind: null,
  status: 'locked',
  unlocked_at: null,
  attempts: 0,
  best_score: null,
  best_criteria_scores: {},
  achieved_at: null,
  ...over,
})

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
  created_at: '2026-03-01T10:00:00Z',
  assigned_by_name: 'Marco Bianchi',
  status: 'active',
  steps: [
    step({ id: 's-1', position: 1, status: 'completed', unlocked_at: '2026-03-01T10:00:00Z' }),
    step({ id: 's-2', position: 2, status: 'active', unlocked_at: '2026-03-02T10:00:00Z' }),
  ],
  completed_steps: 1,
  current_position: 2,
  ...over,
})

/** La mappa del singolo percorso, ridotta al suo indirizzo: quello che
 *  interessa qui è se ci si arriva, e su quale percorso. */
function Mappa() {
  return <p>Mappa di {useParams().assignmentId}</p>
}

function renderRoute(stato: Record<string, unknown>) {
  useMyAssignments.mockReturnValue({ isPending: false, error: null, ...stato })
  render(
    <MemoryRouter initialEntries={['/app/percorsi']}>
      <Routes>
        <Route path="/app/percorsi" element={<MyPathsRoute />} />
        <Route path="/app/percorsi/:assignmentId" element={<Mappa />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useMyAssignments.mockReset()
})

describe('MyPathsRoute', () => {
  /* Un elenco di una riga sola non è una scelta: chi ha un percorso solo
   * apre questa sezione per andare sulla sua mappa. */
  it('con un percorso solo porta dritto alla sua mappa', () => {
    renderRoute({ data: [percorso()] })

    expect(screen.getByText('Mappa di as-1')).toBeInTheDocument()
  })

  it('da due in su lascia scegliere', () => {
    renderRoute({ data: [percorso(), percorso({ id: 'as-2', path_title: 'Reclami' })] })

    const percorsi = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(percorsi).toEqual(['Onboarding', 'Reclami'])
    expect(screen.queryByText(/^Mappa di/)).not.toBeInTheDocument()
  })

  it('senza percorsi resta sulla pagina che lo dice', () => {
    renderRoute({ data: [] })

    expect(screen.getByText('Nessun percorso assegnato')).toBeInTheDocument()
  })

  /* Finché la richiesta è in volo non si salta niente: la lista vuota di
   * quel momento non dice ancora quanti percorsi ci sono. */
  it('mentre carica non salta da nessuna parte', () => {
    renderRoute({ isPending: true })

    expect(screen.getByText('Caricamento percorsi...')).toBeInTheDocument()
  })
})
