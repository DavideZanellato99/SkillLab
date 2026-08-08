import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { AssignableContent } from '../services/training'
import PathStepEditor from './PathStepEditor'
import type { PathStepDraft } from './pathStepDraft'
import { emptyDraft } from './pathStepDraft'

/* Il selettore del tipo è il punto in cui la tappa decide che prova
 * chiedere, e per un po' non ha funzionato: premere "Test tecnico" azzerava
 * il bersaglio e il tipo, dedotto dagli id, tornava subito indietro. Questo
 * test lo tiene premuto. */

const content: AssignableContent = {
  avatars: [{ id: 'a1', name: 'Mario Rossi', category: 'Clienti', category_color: 'violet' }],
  simulations: [{ id: 'x1', title: 'Procedure di cassa', kind: 'multiple' }],
}

/* Il componente è controllato: senza qualcuno che gli ritorni indietro quello
 * che ha cambiato, nessun clic potrebbe mai vedersi. */
function Harness({ initial = emptyDraft() }: { initial?: PathStepDraft }) {
  const [step, setStep] = useState(initial)
  return (
    <PathStepEditor
      step={step}
      index={0}
      total={2}
      content={content}
      onChange={setStep}
      onMove={() => {}}
      onRemove={() => {}}
    />
  )
}

const kindButton = (name: 'Conversazione' | 'Test tecnico') => screen.getByRole('button', { name })

describe('PathStepEditor', () => {
  it('parte dalla conversazione e cerca fra gli avatar', () => {
    render(<Harness />)

    expect(kindButton('Conversazione')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByPlaceholderText('Cerca un avatar...')).toBeInTheDocument()
  })

  it('passa al test tecnico e ci resta', async () => {
    render(<Harness />)

    await userEvent.click(kindButton('Test tecnico'))

    expect(kindButton('Test tecnico')).toHaveAttribute('aria-pressed', 'true')
    expect(kindButton('Conversazione')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByPlaceholderText('Cerca un test...')).toBeInTheDocument()
  })

  it('cerca fra i test una volta cambiato tipo', async () => {
    render(<Harness />)

    await userEvent.click(kindButton('Test tecnico'))
    await userEvent.click(screen.getByPlaceholderText('Cerca un test...'))

    expect(screen.getByRole('option', { name: /Procedure di cassa/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Mario Rossi/ })).not.toBeInTheDocument()
  })

  it('non perde l’avatar già scelto se si torna indietro', async () => {
    render(<Harness initial={{ ...emptyDraft(), avatarId: 'a1' }} />)

    await userEvent.click(kindButton('Test tecnico'))
    await userEvent.click(kindButton('Conversazione'))

    // La chip del selettore riporta la scelta di prima
    expect(screen.getByText('Mario Rossi')).toBeInTheDocument()
  })
})
