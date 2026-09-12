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

const baseProps = {
  question,
  number: 1,
  total: 4,
  isLast: false,
  onChange: () => {},
  onNext: () => {},
}

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

  it('la sequenza vale come risposta solo quando è completa', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onNext = vi.fn()
    render(<SimulationOrderingStep {...baseProps} onChange={onChange} onNext={onNext} />)

    await colloca(user, 'Alfa', 1)
    await colloca(user, 'Beta', 2)
    /* Con un passo ancora da collocare la domanda è saltata, perché il server
       rifiuta una sequenza più corta della chiave. La sequenza com'è esce
       lo stesso, ed è quella che chi torna su questa domanda ritroverà. */
    expect(screen.getByRole('button', { name: 'Salta la Domanda' })).toBeInTheDocument()
    expect(onChange).toHaveBeenLastCalledWith(null, ['Alfa', 'Beta', null])

    await colloca(user, 'Gamma', 3)
    expect(onChange).toHaveBeenLastCalledWith(['Alfa', 'Beta', 'Gamma'], ['Alfa', 'Beta', 'Gamma'])
    // Andare avanti non porta la risposta con sé: è già uscita a ogni mossa
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  /* Chi torna su una domanda la ritrova com'era, anche a metà: il
     componente riparte dalla sequenza che gli si passa, non da zero. */
  it('riparte dalla sequenza lasciata, anche incompleta', () => {
    render(<SimulationOrderingStep {...baseProps} initial={['Alfa', null, 'Gamma']} />)

    expect(collocato(1, 'Alfa')).toBeInTheDocument()
    expect(posizioneVuota(2)).toBeInTheDocument()
    expect(collocato(3, 'Gamma')).toBeInTheDocument()
    expect(daCollocare('Beta')).toBeInTheDocument()
    expect(screen.getByText('2 di 3 collocati')).toBeInTheDocument()
  })

  /* "Indietro" c'è solo se c'è dove tornare: sulla prima domanda il
     chiamante non passa il comando, e il pulsante non compare. */
  it("mostra Indietro solo quando c'è una domanda prima", async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    const { rerender } = render(<SimulationOrderingStep {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Indietro' })).not.toBeInTheDocument()

    rerender(<SimulationOrderingStep {...baseProps} number={2} onBack={onBack} />)
    await user.click(screen.getByRole('button', { name: 'Indietro' }))
    expect(onBack).toHaveBeenCalledOnce()
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

  /* Il box che segue il puntatore resta afferrato dove lo si è preso. Era
     centrato sul puntatore, e un box largo quanto la pagina preso vicino al
     bordo sinistro finiva per metà fuori dallo schermo. */
  it('il fantasma tiene il punto afferrato sotto il puntatore', () => {
    render(<SimulationOrderingStep {...baseProps} />)

    const box = daCollocare('Beta')
    // jsdom non misura niente: il box sta a 100,50 ed è largo 600
    box.getBoundingClientRect = () => ({ left: 100, top: 50, width: 600, height: 40 }) as DOMRect

    // Afferrato a 20 pixel dal bordo sinistro e a 10 da quello in alto
    fireEvent.pointerDown(box, { button: 0, clientX: 120, clientY: 60 })
    fireEvent.pointerMove(window, { clientX: 320, clientY: 260 })

    const ghost = document.body.querySelector<HTMLElement>('.fixed.z-50')
    expect(ghost).not.toBeNull()
    expect(ghost?.style.left).toBe('300px')
    expect(ghost?.style.top).toBe('250px')
    expect(ghost?.style.width).toBe('600px')

    fireEvent.pointerUp(window, { clientX: 320, clientY: 260 })
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
