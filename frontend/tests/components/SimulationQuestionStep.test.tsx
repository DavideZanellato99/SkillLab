import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SimulationQuestionStep from '../../src/components/SimulationQuestionStep'
import { QUESTION_SECONDS } from '../../src/components/simulationFormat'
import type { SimulationQuestion } from '../../src/services/simulations'

/* Il passo cronometrato, provato con l'orologio in mano.
 *
 * Qui si clicca con `fireEvent` e non con `userEvent` come nel resto dei
 * test: userEvent attende fra un evento e l'altro su timer veri, e con il
 * tempo finto quelle attese non scadrebbero mai. */

const question: SimulationQuestion = {
  id: 'q1',
  position: 1,
  text: 'Entro quanto va sbloccata la carta?',
  options: ['Subito', 'Entro 24 ore', 'Entro 7 giorni', 'Mai'],
  steps: [],
  left: [],
  right: [],
}

const baseProps = {
  question,
  number: 3,
  total: 10,
  isLast: false,
  onAnswer: () => {},
}

/** Il tempo scorre a comando: senza, un test aspetterebbe trenta secondi veri. */
const passano = (seconds: number) => act(() => void vi.advanceTimersByTime(seconds * 1000))

const scegli = (option: string) => fireEvent.click(screen.getByText(option))
const premi = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))

describe('SimulationQuestionStep', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('mostra la domanda, le alternative e a che punto è il test', () => {
    render(<SimulationQuestionStep {...baseProps} />)
    expect(screen.getByText('Domanda 3 di 10')).toBeInTheDocument()
    expect(screen.getByText('Entro quanto va sbloccata la carta?')).toBeInTheDocument()
    expect(screen.getByText('Entro 24 ore')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent(`${QUESTION_SECONDS}s`)
  })

  it('il tempo che resta scende mentre si legge', () => {
    render(<SimulationQuestionStep {...baseProps} />)
    passano(12)
    expect(screen.getByRole('timer')).toHaveTextContent('18s')
  })

  it('consegna la risposta scelta quando si va avanti', () => {
    const onAnswer = vi.fn()
    render(<SimulationQuestionStep {...baseProps} onAnswer={onAnswer} />)

    scegli('Entro 24 ore')
    premi('Avanti')
    expect(onAnswer).toHaveBeenCalledWith(1, expect.any(Number))
  })

  it('non dice se la risposta era giusta o sbagliata', () => {
    render(<SimulationQuestionStep {...baseProps} />)
    scegli('Subito')
    expect(screen.queryByText(/corretta|sbagliata|esatta/i)).not.toBeInTheDocument()
  })

  it('finché non si va avanti la scelta si può cambiare', () => {
    const onAnswer = vi.fn()
    render(<SimulationQuestionStep {...baseProps} onAnswer={onAnswer} />)

    scegli('Subito')
    scegli('Mai')
    premi('Avanti')
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(3, expect.any(Number))
  })

  it('senza una scelta si salta, e la risposta consegnata è in bianco', () => {
    const onAnswer = vi.fn()
    render(<SimulationQuestionStep {...baseProps} onAnswer={onAnswer} />)

    premi('Salta la Domanda')
    expect(onAnswer).toHaveBeenCalledWith(null, expect.any(Number))
  })

  it('allo scadere del tempo consegna da solo quello che era selezionato', () => {
    const onAnswer = vi.fn()
    render(<SimulationQuestionStep {...baseProps} onAnswer={onAnswer} />)

    scegli('Entro 7 giorni')
    passano(QUESTION_SECONDS - 1)
    expect(onAnswer).not.toHaveBeenCalled()

    passano(2)
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(2, expect.any(Number))
  })

  it('allo scadere senza scelta la domanda resta in bianco', () => {
    const onAnswer = vi.fn()
    render(<SimulationQuestionStep {...baseProps} onAnswer={onAnswer} />)

    passano(QUESTION_SECONDS + 1)
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(null, expect.any(Number))
  })

  it('il tempo scaduto non consegna una seconda volta dopo il pulsante', () => {
    const onAnswer = vi.fn()
    render(<SimulationQuestionStep {...baseProps} onAnswer={onAnswer} />)

    premi('Salta la Domanda')
    passano(QUESTION_SECONDS + 5)
    expect(onAnswer).toHaveBeenCalledOnce()
  })

  it('a tempo scaduto la risposta non si cambia più', () => {
    const onAnswer = vi.fn()
    render(<SimulationQuestionStep {...baseProps} onAnswer={onAnswer} />)

    passano(QUESTION_SECONDS + 1)
    scegli('Mai')
    premi('Salta la Domanda')
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(null, expect.any(Number))
  })

  it('consegna anche quanto tempo è passato, che è quello che vale punti', () => {
    const onAnswer = vi.fn()
    render(<SimulationQuestionStep {...baseProps} onAnswer={onAnswer} />)

    passano(7)
    scegli('Subito')
    premi('Avanti')
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(0, 7_000)
  })

  it('a tempo scaduto il tempo consegnato è quello pieno', () => {
    const onAnswer = vi.fn()
    render(<SimulationQuestionStep {...baseProps} onAnswer={onAnswer} />)

    passano(QUESTION_SECONDS + 3)
    // Il cronometro consegna appena vede zero, non appena il tempo finisce:
    // quello che conta è che non sia meno del tempo pieno
    expect(onAnswer.mock.calls[0][1]).toBeGreaterThanOrEqual(QUESTION_SECONDS * 1000)
  })

  it('quanto vale la risposta scende mentre il tempo passa', () => {
    render(<SimulationQuestionStep {...baseProps} />)
    expect(screen.getByText('1')).toBeInTheDocument()

    passano(4)
    expect(screen.getByText('0,9')).toBeInTheDocument()

    passano(11)
    expect(screen.getByText('0,6')).toBeInTheDocument()
  })

  it("sull'ultima domanda il pulsante consegna il test", () => {
    render(<SimulationQuestionStep {...baseProps} isLast number={10} />)
    expect(screen.getByRole('button', { name: 'Consegna il Test' })).toBeInTheDocument()
  })
})
