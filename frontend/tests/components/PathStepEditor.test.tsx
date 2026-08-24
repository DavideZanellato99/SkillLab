import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { AssignableContent } from '../../src/services/training'
import PathStepEditor from '../../src/components/PathStepEditor'
import type { PathStepDraft } from '../../src/components/pathStepDraft'
import { emptyDraft } from '../../src/components/pathStepDraft'

/* Il selettore del tipo è il punto in cui la tappa decide che prova
 * chiedere, e per un po' non ha funzionato: premere "Test Tecnico" azzerava
 * il bersaglio e il tipo, dedotto dagli id, tornava subito indietro. Questo
 * test lo tiene premuto. */

const content: AssignableContent = {
  avatars: [{ id: 'a1', name: 'Mario Rossi', category: 'Clienti', category_color: 'violet' }],
  simulations: [{ id: 'x1', title: 'Procedure di cassa', kind: 'multiple' }],
  criteria: [
    { key: 'empatia', label: "Empatia e gestione dello stato d'animo del cliente", weight: 15 },
    { key: 'sicurezza_competenza', label: 'Sicurezza, competenza e autorevolezza', weight: 13 },
  ],
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

const kindButton = (name: 'Conversazione' | 'Test Tecnico') => screen.getByRole('button', { name })

describe('PathStepEditor', () => {
  it('parte dalla conversazione e cerca fra gli avatar', () => {
    render(<Harness />)

    expect(kindButton('Conversazione')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByPlaceholderText('Cerca un avatar...')).toBeInTheDocument()
  })

  it('passa al test tecnico e ci resta', async () => {
    render(<Harness />)

    await userEvent.click(kindButton('Test Tecnico'))

    expect(kindButton('Test Tecnico')).toHaveAttribute('aria-pressed', 'true')
    expect(kindButton('Conversazione')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByPlaceholderText('Cerca un test...')).toBeInTheDocument()
  })

  it('cerca fra i test una volta cambiato tipo', async () => {
    render(<Harness />)

    await userEvent.click(kindButton('Test Tecnico'))
    await userEvent.click(screen.getByPlaceholderText('Cerca un test...'))

    expect(screen.getByRole('option', { name: /Procedure di cassa/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Mario Rossi/ })).not.toBeInTheDocument()
  })

  it('nasce senza scadenza e tiene quella che le si scrive', () => {
    /* Senza data la tappa non scade, ed è la partenza giusta: una data
     * messa d'ufficio sarebbe un termine che nessuno ha deciso. */
    render(<Harness />)
    const field = screen.getByLabelText('Da completare entro')
    expect(field).toHaveValue('')

    fireEvent.change(field, { target: { value: '2026-03-04T15:30' } })

    expect(screen.getByLabelText('Da completare entro')).toHaveValue('2026-03-04T15:30')
  })

  it('la scelta prende il posto del campo di ricerca, e toglierla lo riporta', async () => {
    /* In una colonna di tabella il campo e la chip non ci stanno insieme:
     * finché il bersaglio è scelto è la chip a occupare la cella. */
    render(<Harness />)

    await userEvent.click(screen.getByPlaceholderText('Cerca un avatar...'))
    await userEvent.click(screen.getByRole('option', { name: /Mario Rossi/ }))

    expect(screen.queryByPlaceholderText('Cerca un avatar...')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cambia la scelta: Mario Rossi' }))

    expect(screen.getByPlaceholderText('Cerca un avatar...')).toBeInTheDocument()
  })

  it('non perde l’avatar già scelto se si torna indietro', async () => {
    render(<Harness initial={{ ...emptyDraft(), avatarId: 'a1' }} />)

    await userEvent.click(kindButton('Test Tecnico'))
    await userEvent.click(kindButton('Conversazione'))

    // La chip del selettore riporta la scelta di prima
    expect(screen.getByText('Mario Rossi')).toBeInTheDocument()
  })

  /* Una tappa arrivata da una proposta porta il perché sta lì, sotto la riga
   * che spiega. Cambiare la prova lo fa sparire: da quel momento sarebbe la
   * didascalia di una tappa che nessuno ha proposto. */
  it('mostra la motivazione della proposta e la perde quando la tappa cambia', async () => {
    const proposta = {
      ...emptyDraft(),
      avatarId: 'a1',
      reason: 'Si comincia da un caso semplice.',
    }
    render(<Harness initial={proposta} />)

    expect(screen.getByText('Si comincia da un caso semplice.')).toBeInTheDocument()

    await userEvent.click(kindButton('Test Tecnico'))

    expect(screen.queryByText('Si comincia da un caso semplice.')).not.toBeInTheDocument()
  })
  /* Le soglie sui singoli criteri stanno dietro un bottone: quasi nessuna
   * tappa ne pone, e sei campi aperti su ogni riga direbbero che vanno
   * riempiti. Su un test tecnico il bottone non c'è affatto, perché un test
   * si consegna, non si valuta per criteri. */
  it('apre le soglie sui criteri e tiene quella che le si scrive', async () => {
    render(<Harness initial={{ ...emptyDraft(), avatarId: 'a1' }} />)
    const empatia = "Obiettivo di Empatia e gestione dello stato d'animo del cliente (1-10)"
    expect(screen.queryByLabelText(empatia)).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Obiettivi per criterio della tappa 1' }),
    )
    fireEvent.change(screen.getByLabelText(empatia), { target: { value: '8' } })

    expect(screen.getByLabelText(empatia)).toHaveValue(8)
  })

  it('non offre le soglie sui criteri a una tappa su un test', async () => {
    render(<Harness />)

    await userEvent.click(kindButton('Test Tecnico'))

    expect(
      screen.queryByRole('button', { name: 'Obiettivi per criterio della tappa 1' }),
    ).not.toBeInTheDocument()
  })

  it('svuotare il campo di un criterio ne toglie la soglia', async () => {
    /* Un campo vuoto non è una soglia a zero: è un criterio che non pone
     * nessuna condizione, e a dirlo resta il numero sul bottone. */
    render(
      <Harness initial={{ ...emptyDraft(), avatarId: 'a1', criteriaTargets: { empatia: 8 } }} />,
    )
    const empatia = "Obiettivo di Empatia e gestione dello stato d'animo del cliente (1-10)"

    await userEvent.click(
      screen.getByRole('button', { name: 'Obiettivi per criterio della tappa 1' }),
    )
    expect(screen.getByLabelText(empatia)).toHaveValue(8)

    fireEvent.change(screen.getByLabelText(empatia), { target: { value: '' } })

    expect(screen.getByLabelText(empatia)).toHaveValue(null)
  })
})
