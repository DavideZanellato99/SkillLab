import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import NumberInput from '../../src/components/NumberInput'

/* Le frecce disegnate da noi devono muovere il numero come muovevano quelle
 * del browser: mezzo punto alla volta, dentro i limiti del campo, e senza mai
 * confondere il campo vuoto con lo zero. */

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <NumberInput
      aria-label="Obiettivo"
      min={1}
      max={10}
      step={0.5}
      value={value}
      onValueChange={setValue}
    />
  )
}

const field = () => screen.getByLabelText('Obiettivo')
const arrows = () => screen.getAllByRole('button', { hidden: true })

describe('NumberInput', () => {
  it('sale e scende di un passo alla volta', async () => {
    render(<Harness initial="8" />)
    const [up, down] = arrows()

    await userEvent.click(up)
    expect(field()).toHaveValue(8.5)

    await userEvent.click(down)
    await userEvent.click(down)
    expect(field()).toHaveValue(7.5)
  })

  it('non esce dai limiti del campo', async () => {
    render(<Harness initial="10" />)
    const [up] = arrows()

    await userEvent.click(up)
    expect(field()).toHaveValue(10)
  })

  it('da campo vuoto parte dal minimo', async () => {
    render(<Harness />)
    const [up] = arrows()

    await userEvent.click(up)
    expect(field()).toHaveValue(1)
  })

  it('consegna la stringa vuota quando il campo viene svuotato', async () => {
    // Vuoto e zero sono due cose diverse per chi ci sta sopra: vedi le soglie
    // sui criteri, dove il campo vuoto vuol dire "nessuna condizione".
    render(<Harness initial="8" />)
    await userEvent.clear(field())
    expect(field()).toHaveValue(null)
  })

  it('non porta le frecce nel giro del tab', async () => {
    // Il numero si muove già con le frecce della tastiera: due fermate in più
    // su ogni campo sarebbero solo strada in più.
    render(<Harness initial="8" />)
    for (const arrow of arrows()) {
      expect(arrow).toHaveAttribute('tabindex', '-1')
    }
  })

  it('spegne le frecce insieme al campo', () => {
    render(<NumberInput aria-label="Obiettivo" value="8" onValueChange={() => {}} disabled />)
    expect(field()).toBeDisabled()
    for (const arrow of arrows()) {
      expect(arrow).toBeDisabled()
    }
  })
})
