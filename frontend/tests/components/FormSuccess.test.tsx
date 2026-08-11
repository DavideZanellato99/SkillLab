import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import FormSuccess from '../../src/components/FormSuccess'

describe('FormSuccess', () => {
  /* `role="status"` e non un semplice riquadro verde: la conferma di un
   * salvataggio va annunciata anche a chi non la vede comparire. */
  it('annuncia la conferma', () => {
    render(<FormSuccess message="Profilo aggiornato." />)

    expect(screen.getByRole('status')).toHaveTextContent('Profilo aggiornato.')
  })

  it('cambia misura fra la modale e la cima di una schermata', () => {
    const { container: dentroModale } = render(<FormSuccess message="Fatto." />)
    const { container: inCimaPagina } = render(<FormSuccess message="Fatto." variant="page" />)

    expect(dentroModale.firstElementChild?.className).not.toBe(
      inCimaPagina.firstElementChild?.className,
    )
  })
})
