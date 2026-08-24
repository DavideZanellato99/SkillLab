import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { StepProgress } from '../../src/services/training'
import PathStepPanel from '../../src/components/PathStepPanel'

/* Sulla mappa il pannello è l'unico punto da cui una tappa si comincia: è
 * qui, e non più sulla fila di righe, che il disegno può contraddire il
 * server offrendo una strada dentro una tappa ancora chiusa. */

const step = (over: Partial<StepProgress>): StepProgress => ({
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
  ...over,
})

const renderPanel = (over: Partial<StepProgress>) =>
  render(
    <MemoryRouter>
      <PathStepPanel step={step(over)} total={5} />
    </MemoryRouter>,
  )

describe('PathStepPanel', () => {
  it('porta alla conversazione di una tappa aperta', () => {
    renderPanel({})

    expect(screen.getByText('Mario Rossi')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/chat/a1')
  })

  it('porta al test se la tappa è una simulazione', () => {
    renderPanel({
      kind: 'simulation',
      avatar_id: null,
      avatar_name: null,
      avatar_category: null,
      simulation_id: 'sim1',
      simulation_title: 'Procedure di cassa',
    })

    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/simulatore/sim1')
  })

  it('di una tappa bloccata dice come si apre, senza aprirla', () => {
    renderPanel({ status: 'locked', unlocked_at: null })

    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText(/Si apre quando superi la tappa 1/)).toBeInTheDocument()
  })

  it('non apre una tappa chiusa nemmeno quando la sua data è passata', () => {
    /* Scaduta e aperta sono due cose diverse: la data corre sul calendario,
     * la fila si apre una tappa per volta, e a decidere se si può cominciare
     * è la seconda. */
    renderPanel({ status: 'overdue', unlocked_at: null, due_at: '2020-01-01T12:00:00' })

    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText(/Si apre quando superi la tappa 1/)).toBeInTheDocument()
  })

  it('scrive la tappa a cui appartiene', () => {
    renderPanel({})

    expect(screen.getByText('Tappa 2 di 5')).toBeInTheDocument()
  })
  /* Una tappa può chiedere anche dei minimi sui singoli criteri, e allora il
   * solo voto complessivo non basta a spiegare cosa sta succedendo: senza
   * questa riga, un 8,5 su un obiettivo di 7 accanto a una tappa ancora
   * aperta non si capirebbe. */
  it('dice quali criteri servono e a che punto sono', () => {
    renderPanel({
      best_score: 8.5,
      criteria_targets: [
        { key: 'empatia', label: "Empatia e gestione dello stato d'animo del cliente", target: 8 },
      ],
      best_criteria_scores: { empatia: 5 },
    })

    // Il nome per esteso, lo stesso che si legge nel referto: un criterio
    // abbreviato lo riconosce solo chi ha già imparato l'elenco.
    expect(
      screen.getByText("Empatia e gestione dello stato d'animo del cliente"),
    ).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('/8')).toBeInTheDocument()
  })

  it('su una tappa chiusa non mostra voti sui criteri', () => {
    /* Le prove fatte prima del suo turno non contano: un numero lì direbbe
     * che il conto è già cominciato. */
    renderPanel({
      status: 'locked',
      unlocked_at: null,
      criteria_targets: [
        { key: 'empatia', label: "Empatia e gestione dello stato d'animo del cliente", target: 8 },
      ],
      best_criteria_scores: { empatia: 9 },
    })

    expect(
      screen.getByText("Empatia e gestione dello stato d'animo del cliente"),
    ).toBeInTheDocument()
    expect(screen.queryByText('9')).not.toBeInTheDocument()
  })

  it('non scrive niente di criteri su una tappa che non ne chiede', () => {
    renderPanel({})

    expect(screen.queryByText(/nella stessa conversazione/)).not.toBeInTheDocument()
  })
})
