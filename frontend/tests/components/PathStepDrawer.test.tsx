import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { StepProgress } from '../../src/services/training'
import PathStepDrawer from '../../src/components/PathStepDrawer'

/* Il riquadro si posa sopra la mappa, quindi la cosa da tenere ferma è che si
 * riesca sempre a togliere: un pannello che copre il sentiero e non si chiude
 * è un pezzo di percorso perso. */

const step: StepProgress = {
  id: 's1',
  position: 2,
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
  status: 'active',
  unlocked_at: '2026-01-02T09:00:00',
  attempts: 0,
  best_score: null,
  best_criteria_scores: {},
  achieved_at: null,
}

const renderDrawer = (onClose = vi.fn()) => ({
  onClose,
  ...render(
    <MemoryRouter>
      <PathStepDrawer step={step} total={5} onClose={onClose} />
    </MemoryRouter>,
  ),
})

describe('PathStepDrawer', () => {
  it('mostra la tappa scelta', () => {
    renderDrawer()

    expect(screen.getByText('Mario Rossi')).toBeInTheDocument()
    expect(screen.getByText('Tappa 2 di 5')).toBeInTheDocument()
  })

  it('si chiude dal bottone', async () => {
    const { onClose } = renderDrawer()

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi la Tappa' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('si chiude con Esc', async () => {
    const { onClose } = renderDrawer()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  /* Il velo esiste solo dove il riquadro sale dal basso e copre la mappa
     intera: lì toccare fuori è il gesto con cui si torna al sentiero. */
  it('si chiude toccando fuori', async () => {
    const { onClose, container } = renderDrawer()

    await userEvent.click(container.querySelector('[aria-hidden="true"]') as Element)

    expect(onClose).toHaveBeenCalled()
  })

  /* Su schermo stretto il riquadro copre tutto quello che non è lui: chi
     naviga da tastiera resterebbe dietro al velo, sul nodo appena premuto. */
  it('prende il fuoco appena si apre', () => {
    renderDrawer()

    expect(screen.getByLabelText('Dettaglio della Tappa')).toHaveFocus()
  })

  /* Chiuso il riquadro si torna sulla tappa da cui lo si era aperto: senza,
     il fuoco finisce sul body e il Tab successivo ricomincia dalla cima. */
  it('restituisce il fuoco al nodo da cui è stato aperto', () => {
    const nodo = document.createElement('button')
    document.body.append(nodo)
    nodo.focus()

    const { unmount } = render(
      <MemoryRouter>
        <PathStepDrawer step={step} total={5} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    unmount()

    expect(nodo).toHaveFocus()
    nodo.remove()
  })
})
