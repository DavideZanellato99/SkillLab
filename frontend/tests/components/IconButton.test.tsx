import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import IconButton from '../../src/components/IconButton'

/* Le due cose che questo componente esiste per garantire: un'icona senza
 * parole ha sempre un nome accessibile, e il motivo per cui è spenta si
 * riesce a leggere.
 *
 * La seconda è la meno ovvia: un elemento `disabled` non emette eventi del
 * mouse, quindi senza l'involucro il tooltip di un bottone bloccato non
 * comparirebbe proprio a chi ne ha bisogno. */

describe('IconButton', () => {
  it("prende il nome accessibile dall'etichetta", () => {
    render(
      <IconButton label="Elimina Utente" onClick={vi.fn()}>
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Elimina Utente' })).toBeInTheDocument()
  })

  it('mostra il tooltip al passaggio del mouse', async () => {
    render(
      <IconButton label="Elimina Utente" onClick={vi.fn()}>
        <svg />
      </IconButton>,
    )
    await userEvent.hover(screen.getByRole('button', { name: 'Elimina Utente' }))
    expect(await screen.findByText('Elimina Utente')).toBeInTheDocument()
  })

  it('spiega perché è bloccato, anche se bloccato', async () => {
    render(
      <IconButton
        label="Elimina Utente"
        tooltip="Non puoi eliminare il tuo stesso account"
        disabled
        onClick={vi.fn()}
      >
        <svg />
      </IconButton>,
    )

    const button = screen.getByRole('button', { name: 'Elimina Utente' })
    expect(button).toBeDisabled()
    // Il puntatore passa sull'involucro, non sul bottone spento
    await userEvent.hover(button.parentElement!)
    expect(await screen.findByText('Non puoi eliminare il tuo stesso account')).toBeInTheDocument()
  })

  it('non fa partire niente quando è bloccato', async () => {
    const onClick = vi.fn()
    render(
      <IconButton label="Elimina Utente" disabled onClick={onClick}>
        <svg />
      </IconButton>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Elimina Utente' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('non invia il form che lo contiene', () => {
    // Sta dentro le righe di una tabella, ma anche dentro il form della
    // scheda avatar: senza type="button" il pulsante "ascolta la voce"
    // salverebbe l'avatar.
    render(
      <IconButton label="Ascolta" onClick={vi.fn()}>
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Ascolta' })).toHaveAttribute('type', 'button')
  })
})
