import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import SimulationMatchingStep from '../../src/components/SimulationMatchingStep'
import type { SimulationQuestion } from '../../src/services/simulations'

/* Il passo di abbinamento, provato su quello che fa da solo: cosa mostra
 * mentre si risponde.
 *
 * Le coppie che consegna le prova già il runner, che guarda il corpo della
 * POST. Qui c'è l'altra metà, quella che il runner non vede: un abbinato vale
 * per una voce sola, sceglierlo due volte resta possibile, e senza aiuti chi
 * risponde dovrebbe tenere a mente cosa ha già usato. */

const question: SimulationQuestion = {
  id: 'q1',
  position: 1,
  text: 'Abbina ogni operazione al suo canale',
  options: [],
  steps: [],
  left: ['Bonifico', 'Carta', 'Prelievo'],
  right: ['Sportello', 'App', 'Cassa'],
}

const baseProps = { question, number: 1, total: 4, isLast: false, onAnswer: () => {} }

/** Sceglie un abbinato per una voce, aprendo la sua tendina. */
async function abbina(user: ReturnType<typeof userEvent.setup>, left: string, right: string) {
  await user.click(screen.getByRole('combobox', { name: `Abbinamento per ${left}` }))
  await user.click(screen.getByRole('option', { name: new RegExp(`^${right}`) }))
}

describe('SimulationMatchingStep', () => {
  it('conta le voci ancora da abbinare', async () => {
    const user = userEvent.setup()
    render(<SimulationMatchingStep {...baseProps} />)

    expect(screen.getByText('0 di 3 abbinate')).toBeInTheDocument()
    await abbina(user, 'Bonifico', 'Sportello')
    expect(screen.getByText('1 di 3 abbinate')).toBeInTheDocument()
  })

  it('nella tendina segnala gli abbinati già impegnati e su quale voce', async () => {
    const user = userEvent.setup()
    render(<SimulationMatchingStep {...baseProps} />)

    await abbina(user, 'Bonifico', 'Sportello')
    await user.click(screen.getByRole('combobox', { name: 'Abbinamento per Carta' }))

    expect(screen.getByRole('option', { name: 'Sportello già su Bonifico' })).toBeInTheDocument()
    /* Restano scegliibili: chi si accorge tardi di aver sbagliato la prima
       voce deve poter riprendere la scelta giusta da qui. */
    expect(screen.getByRole('option', { name: 'App' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cassa' })).toBeInTheDocument()
  })

  it('la tendina di una voce non segnala la scelta di quella voce', async () => {
    const user = userEvent.setup()
    render(<SimulationMatchingStep {...baseProps} />)

    await abbina(user, 'Bonifico', 'Sportello')
    await user.click(screen.getByRole('combobox', { name: 'Abbinamento per Bonifico' }))

    expect(screen.getByRole('option', { name: 'Sportello' })).toBeInTheDocument()
  })

  it("l'abbinato ripetuto nomina le voci che se lo contendono e le accende", async () => {
    const user = userEvent.setup()
    render(<SimulationMatchingStep {...baseProps} />)

    await abbina(user, 'Bonifico', 'Sportello')
    expect(screen.queryByText(/ogni voce ha un solo abbinamento corretto/)).not.toBeInTheDocument()

    await abbina(user, 'Carta', 'Sportello')
    expect(
      screen.getByText(
        'Sportello è su Bonifico e Carta: ogni voce ha un solo abbinamento corretto',
      ),
    ).toBeInTheDocument()

    /* Con sei righe l'avviso dice quale abbinato, le voci accese dicono dove
       guardare. Quella rimasta fuori dal conflitto resta come le altre. */
    expect(screen.getByText('Bonifico').className).toMatch(/amber/)
    expect(screen.getByText('Carta').className).toMatch(/amber/)
    expect(screen.getByText('Prelievo').className).not.toMatch(/amber/)
  })

  it('consegna le coppie formate e lascia fuori le voci scoperte', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    render(<SimulationMatchingStep {...baseProps} onAnswer={onAnswer} />)

    await abbina(user, 'Bonifico', 'Sportello')
    await abbina(user, 'Prelievo', 'Cassa')
    await user.click(screen.getByRole('button', { name: 'Avanti' }))

    expect(onAnswer).toHaveBeenCalledWith([
      { left: 'Bonifico', right: 'Sportello' },
      { left: 'Prelievo', right: 'Cassa' },
    ])
  })
})
