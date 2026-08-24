import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { StepProgress } from '../../src/services/training'
import PathStepsTrail from '../../src/components/PathStepsTrail'

/* Questa fila è la vista di chi amministra: quello che i test tengono fermo è
 * che dica a che punto è ogni tappa, e che non offra nessuna strada per
 * cominciarne una, perché la chat e il test sono di chi il percorso lo sta
 * facendo (lui li apre dalla mappa, vedi PathStepPanel). */

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

const trail = [
  step({ id: '1', position: 1, status: 'completed', best_score: 8, achieved_at: '2026-01-02' }),
  step({ id: '2', position: 2, status: 'active', unlocked_at: '2026-01-02' }),
  step({ id: '3', position: 3 }),
]

/* Una tappa chiusa che la sua data ha già superato: lo stato dice il
 * ritardo, lo sblocco vuoto dice che non si è ancora aperta. */
const lockedAndLate = step({
  id: '4',
  position: 4,
  status: 'overdue',
  due_at: '2020-01-01T12:00:00',
})

describe('PathStepsTrail', () => {
  it('mostra ogni tappa con il proprio stato', () => {
    render(<PathStepsTrail steps={trail} />)

    expect(screen.getByText('Avatar 1')).toBeInTheDocument()
    expect(screen.getByText('Completato')).toBeInTheDocument()
    expect(screen.getByText('In Corso')).toBeInTheDocument()
    expect(screen.getByText('Bloccata')).toBeInTheDocument()
  })

  it('non apre niente per chi le sta solo guardando', () => {
    render(<PathStepsTrail steps={trail} />)

    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('dice il ritardo di una tappa che non si è ancora aperta', () => {
    render(<PathStepsTrail steps={[lockedAndLate]} />)

    expect(screen.getByText('Scaduto')).toBeInTheDocument()
    expect(screen.getByText(/entro il/)).toBeInTheDocument()
  })
})
