import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import CheckboxField from '../../src/components/CheckboxField'

/* La casella si coglie premendo su tutta la riga, spiegazione compresa, e
 * riporta il valore nuovo e non un evento da rileggere. */

describe('CheckboxField', () => {
  it('si spunta premendo sulla spiegazione, non solo sul quadratino', async () => {
    const onChange = vi.fn()
    render(
      <CheckboxField
        id="c"
        label="Registra"
        description="Cosa comporta"
        checked={false}
        onChange={onChange}
      />,
    )

    await userEvent.click(screen.getByText('Cosa comporta'))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('riporta il valore nuovo anche togliendo la spunta', async () => {
    const onChange = vi.fn()
    render(<CheckboxField id="c" label="Registra" checked onChange={onChange} />)

    await userEvent.click(screen.getByLabelText('Registra'))

    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('spenta non cambia niente', async () => {
    const onChange = vi.fn()
    render(<CheckboxField id="c" label="Registra" checked={false} onChange={onChange} disabled />)

    await userEvent.click(screen.getByLabelText('Registra'))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Registra')).toBeDisabled()
  })
})
