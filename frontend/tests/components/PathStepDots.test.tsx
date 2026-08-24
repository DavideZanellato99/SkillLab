import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { StepProgress } from '../../src/services/training'
import PathStepDots from '../../src/components/PathStepDots'

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

const percorso = [
  step({ id: '1', position: 1, status: 'completed' }),
  step({ id: '2', position: 2, status: 'active' }),
  step({ id: '3', position: 3 }),
]

describe('PathStepDots', () => {
  /* I trattini esistono perché un percorso ridotto a titolo e percentuale
   * non si distingue da un altro: quanti sono e in che ordine è l'unica cosa
   * che resta quando non c'è spazio per il sentiero. */
  it("mostra un trattino per tappa, nell'ordine del percorso", () => {
    render(<PathStepDots steps={percorso} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('distingue le tappe fatte da quella in corso e da quelle chiuse', () => {
    const { container } = render(<PathStepDots steps={percorso} />)

    const trattini = [...container.querySelectorAll('li span')].map((s) => s.className)
    expect(new Set(trattini).size).toBe(3)
  })

  /* Il nome della tappa non sta a schermo: senza il tooltip i trattini
   * direbbero a che punto si è ma non di cosa. */
  it('tiene il nome della tappa nel tooltip', async () => {
    const { container } = render(<PathStepDots steps={percorso} />)

    await userEvent.hover(container.querySelectorAll('li span')[1])

    expect(screen.getByRole('tooltip')).toHaveTextContent('Tappa 2 · Avatar 2')
  })

  it('nomina anche le tappe fatte di un test tecnico', async () => {
    const { container } = render(
      <PathStepDots
        steps={[
          step({
            id: '1',
            position: 1,
            kind: 'simulation',
            avatar_id: null,
            avatar_name: null,
            simulation_id: 's-1',
            simulation_title: 'Normativa antiriciclaggio',
          }),
        ]}
      />,
    )

    await userEvent.hover(container.querySelector('li span')!)

    expect(screen.getByRole('tooltip')).toHaveTextContent('Tappa 1 · Normativa antiriciclaggio')
  })

  it('non disegna niente per un percorso senza tappe', () => {
    render(<PathStepDots steps={[]} />)

    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})
