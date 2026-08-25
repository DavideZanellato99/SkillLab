import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import PasswordField from '../../src/components/PasswordField'
import { LockIcon } from '../../src/components/icons'

/* Il campo password dei due moduli in cui se ne sceglie una: la modale di
 * accesso e la propria scheda. Quello che c'è da provare qui è il bottone
 * occhio, che è la sola cosa che il campo decide da sé. */

function CampoDiProva({ error }: { error?: string } = {}) {
  const [value, setValue] = useState('')
  return (
    <>
      <PasswordField
        id="prova"
        label="Password"
        value={value}
        onChange={setValue}
        Icon={LockIcon}
        error={error}
      />
      <button type="button" onClick={() => setValue('')}>
        Svuota
      </button>
    </>
  )
}

const campo = () => screen.getByLabelText('Password')

describe('PasswordField', () => {
  it('nasconde quello che si scrive finché non si chiede di vederlo', async () => {
    render(<CampoDiProva />)
    expect(campo()).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostra password' }))

    expect(campo()).toHaveAttribute('type', 'text')
  })

  /* Dopo un cambio password riuscito il modulo azzera i campi: se l'occhio
   * restasse aperto, la password successiva comparirebbe in chiaro a chi non
   * ha chiesto di vederla. */
  it("richiude l'occhio quando il campo viene svuotato da fuori", async () => {
    render(<CampoDiProva />)

    await userEvent.type(campo(), 'Password-Lunga1!')
    await userEvent.click(screen.getByRole('button', { name: 'Mostra password' }))
    expect(campo()).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Svuota' }))

    expect(campo()).toHaveAttribute('type', 'password')
  })

  /* Il motivo sta sotto il campo, dove si sta guardando, ed è legato al
   * campo perché anche chi non lo vede sappia a cosa si riferisce. */
  it("lega l'errore al campo che riguarda", () => {
    render(<CampoDiProva error="Le password non coincidono." />)

    expect(campo()).toHaveAttribute('aria-invalid', 'true')
    expect(campo()).toHaveAccessibleDescription('Le password non coincidono.')
  })
})
