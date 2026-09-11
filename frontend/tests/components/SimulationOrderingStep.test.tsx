import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SimulationOrderingStep from '../../src/components/SimulationOrderingStep'
import type { SimulationQuestion } from '../../src/services/simulations'

/* Il passo di ordinamento, provato su quello che fa da solo: come i box
 * arrivano nelle posizioni e cosa consegna.
 *
 * I due gesti sono uno solo per il componente, il trascinamento e il tocco
 * secco finiscono nella stessa funzione, quindi le regole del rilascio si
 * provano toccando, che è quello che jsdom sa riprodurre. Il trascinamento ha
 * il suo test, che serve a provare il tratto che il tocco non attraversa:
 * dalla zona sotto il puntatore al rilascio. */

const question: SimulationQuestion = {
  id: 'q1',
  position: 1,
  text: 'Rimetti in ordine la procedura',
  options: [],
  // Mescolati, come arrivano dal server: la sequenza giusta è Alfa, Beta, Gamma
  steps: ['Gamma', 'Alfa', 'Beta'],
  left: [],
  right: [],
}

const baseProps = { question, number: 1, total: 4, isLast: false, onAnswer: () => {} }

const daCollocare = (step: string) =>
  screen.getByRole('button', { name: `Passo da collocare: ${step}` })
const posizioneVuota = (n: number) => screen.getByRole('button', { name: `Posizione ${n}, vuota` })
const collocato = (n: number, step: string) =>
  screen.getByRole('button', { name: `Posizione ${n}: ${step}` })

/** Sceglie un passo e lo manda in una posizione, con due tocchi. */
async function colloca(user: ReturnType<typeof userEvent.setup>, step: string, n: number) {
  await user.click(daCollocare(step))
  await user.click(posizioneVuota(n))
}

describe('SimulationOrderingStep', () => {
  beforeEach(() => {
    /* jsdom non ha un rendering e quindi non sa dire cosa c'è sotto un punto:
       i test che trascinano dicono loro quale zona il puntatore sta
       sorvolando. */
    document.elementFromPoint = vi.fn(() => null)
  })

  it('conta i passi ancora da collocare', async () => {
    const user = userEvent.setup()
    render(<SimulationOrderingStep {...baseProps} />)

    expect(screen.getByText('0 di 3 collocati')).toBeInTheDocument()
    await colloca(user, 'Alfa', 1)
    expect(screen.getByText('1 di 3 collocati')).toBeInTheDocument()
    // Il passo collocato lascia la zona di sopra
    expect(screen.queryByRole('button', { name: 'Passo da collocare: Alfa' })).toBeNull()
    expect(collocato(1, 'Alfa')).toBeInTheDocument()
  })

  it('consegna la sequenza solo quando è completa', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    render(<SimulationOrderingStep {...baseProps} onAnswer={onAnswer} />)

    await colloca(user, 'Alfa', 1)
    await colloca(user, 'Beta', 2)
    /* Con un passo ancora da collocare la domanda è saltata, perché il server
       rifiuta una sequenza più corta della chiave. */
    expect(screen.getByRole('button', { name: 'Salta la Domanda' })).toBeInTheDocument()

    await colloca(user, 'Gamma', 3)
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    expect(onAnswer).toHaveBeenCalledWith(['Alfa', 'Beta', 'Gamma'])
  })

  it('una posizione occupata scambia invece di respingere', async () => {
    const user = userEvent.setup()
    render(<SimulationOrderingStep {...baseProps} />)

    await colloca(user, 'Alfa', 1)
    await colloca(user, 'Beta', 2)

    // Alfa va sulla seconda: Beta prende il posto che Alfa lascia libero
    await user.click(collocato(1, 'Alfa'))
    await user.click(collocato(2, 'Beta'))
    expect(collocato(1, 'Beta')).toBeInTheDocument()
    expect(collocato(2, 'Alfa')).toBeInTheDocument()
  })

  it('un passo scelto e toccato di nuovo torna fra quelli da collocare', async () => {
    const user = userEvent.setup()
    render(<SimulationOrderingStep {...baseProps} />)

    await colloca(user, 'Alfa', 1)
    await user.click(collocato(1, 'Alfa'))
    await user.click(collocato(1, 'Alfa'))

    expect(daCollocare('Alfa')).toBeInTheDocument()
    expect(screen.getByText('0 di 3 collocati')).toBeInTheDocument()
  })

  it('trascinare un passo su una posizione ce lo colloca', () => {
    render(<SimulationOrderingStep {...baseProps} />)

    const box = daCollocare('Beta')
    const slot = posizioneVuota(2)
    document.elementFromPoint = vi.fn(() => slot)

    fireEvent.pointerDown(box, { button: 0, clientX: 10, clientY: 10 })
    // Oltre la soglia, altrimenti resterebbe un click
    fireEvent.pointerMove(window, { clientX: 120, clientY: 220 })
    fireEvent.pointerUp(window, { clientX: 120, clientY: 220 })

    expect(collocato(2, 'Beta')).toBeInTheDocument()
  })

  it('un trascinamento lasciato fuori da ogni posizione non sposta niente', () => {
    render(<SimulationOrderingStep {...baseProps} />)

    const box = daCollocare('Beta')
    fireEvent.pointerDown(box, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 400, clientY: 900 })
    fireEvent.pointerUp(window, { clientX: 400, clientY: 900 })

    expect(daCollocare('Beta')).toBeInTheDocument()
    expect(screen.getByText('0 di 3 collocati')).toBeInTheDocument()
  })
})
