import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { StepProgress } from '../../src/services/training'
import PathTrailMap from '../../src/components/PathTrailMap'
import { trailNodes } from '../../src/components/pathMapLayout'

/* La mappa non porta da nessuna parte da sola: sceglie una tappa, e a
 * portarci dentro è il pannello. Quello che i test tengono fermo è che ogni
 * tappa sia raggiungibile, anche quella bloccata e anche quella lontana,
 * perché guardare avanti è metà del motivo per cui il percorso è una fila. */

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

const renderMap = (onSelect: (id: string) => void = () => {}, completedSteps = 1) =>
  render(
    <PathTrailMap
      steps={trail}
      completedSteps={completedSteps}
      selectedId="2"
      onSelect={onSelect}
    />,
  )

const nodes = () => screen.getAllByRole('button', { name: /^Tappa/ })

describe('PathTrailMap', () => {
  it('mette sul sentiero tutte le tappe, bloccate comprese', () => {
    renderMap()

    expect(nodes()).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Tappa 3, Avatar 3, Bloccata' })).toBeInTheDocument()
  })

  it('sceglie la tappa su cui si è cliccato', async () => {
    const onSelect = vi.fn()
    renderMap(onSelect)

    await userEvent.click(nodes()[2])

    expect(onSelect).toHaveBeenCalledWith('3')
  })

  it('rimpicciolita accorcia il sentiero senza perdere tappe', async () => {
    renderMap()
    const mappa = screen.getByRole('region', { name: 'Mappa del Percorso' })
    const alto = mappa.style.height
    const rimpicciolisci = screen.getByRole('button', { name: 'Rimpicciolisci la Mappa' })

    await userEvent.click(rimpicciolisci)

    expect(parseFloat(mappa.style.height)).toBeLessThan(parseFloat(alto))
    expect(nodes()).toHaveLength(3)

    // Sotto una certa misura i nomi non ci stanno più, e restano nel tooltip
    await userEvent.click(rimpicciolisci)

    expect(nodes()).toHaveLength(3)
    expect(screen.queryByText('Avatar 3')).not.toBeInTheDocument()
  })

  /* Il sentiero acceso è la cosa che la mappa dice senza scrivere niente, e
     l'unica che può mentire: era già successo che il fondo risultasse acceso
     a percorso appena cominciato, perché il taglio era una lunghezza misurata
     lungo la curva e non un'altezza (vedi litUntil). */
  it('lascia il sentiero spento finché non si supera una tappa', () => {
    const { container } = renderMap(() => {}, 0)

    expect(container.querySelectorAll('path[clip-path]')).toHaveLength(0)
  })

  it('accende il tratto fino alla tappa che si è appena sbloccata', () => {
    const { container } = renderMap(() => {}, 1)

    expect(container.querySelectorAll('path[clip-path]')).toHaveLength(1)
    // La maschera si ferma all'altezza della seconda tappa, non oltre
    expect(container.querySelector('clipPath rect')?.getAttribute('height')).toBe(
      String(trailNodes(trail.length)[1].y),
    )
  })

  it('non offre nessun link: dentro una tappa ci si entra dal pannello', () => {
    renderMap()

    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
