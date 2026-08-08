import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { StepProgress } from '../services/training'
import PathStepsTrail from './PathStepsTrail'

/* La fila di tappe è il posto in cui la regola dello sblocco si vede: quello
 * che questi test tengono fermo è che una tappa chiusa non offra una strada
 * per cominciarla, perché è l'unico modo in cui il disegno può contraddire
 * il server. */

const step = (
  over: Partial<StepProgress> & Pick<StepProgress, 'id' | 'position'>,
): StepProgress => ({
  kind: 'avatar',
  target_score: 7,
  due_days: null,
  avatar_id: `a${over.position}`,
  avatar_name: `Avatar ${over.position}`,
  avatar_category: 'Clienti',
  avatar_category_color: 'violet',
  simulation_id: null,
  simulation_title: null,
  simulation_kind: null,
  status: 'locked',
  unlocked_at: null,
  due_at: null,
  attempts: 0,
  best_score: null,
  achieved_at: null,
  ...over,
})

const trail = [
  step({ id: '1', position: 1, status: 'completed', best_score: 8, achieved_at: '2026-01-02' }),
  step({ id: '2', position: 2, status: 'active', unlocked_at: '2026-01-02' }),
  step({ id: '3', position: 3 }),
]

const renderTrail = (interactive: boolean) =>
  render(
    <MemoryRouter>
      <PathStepsTrail steps={trail} interactive={interactive} />
    </MemoryRouter>,
  )

describe('PathStepsTrail', () => {
  it('mostra ogni tappa con il proprio stato', () => {
    renderTrail(false)

    expect(screen.getByText('Avatar 1')).toBeInTheDocument()
    expect(screen.getByText('Completato')).toBeInTheDocument()
    expect(screen.getByText('In corso')).toBeInTheDocument()
    expect(screen.getByText('Bloccata')).toBeInTheDocument()
  })

  it('porta alla prova solo dalle tappe già aperte', () => {
    renderTrail(true)

    const links = screen.getAllByRole('link')
    // La bloccata non è fra questi: si apre superando quella prima di lei
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/app/chat/a1', '/app/chat/a2'])
  })

  it('non apre niente per chi le sta solo guardando', () => {
    renderTrail(false)

    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
