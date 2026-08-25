import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import ModalShell, { ModalHeader } from '../../src/components/ModalShell'
import Select from '../../src/components/Select'

/* Quello che una modale deve fare da tastiera, che con il mouse è ovvio e
 * senza mouse non esisteva: dirsi finestra, prendersi il fuoco, tenerlo, e
 * chiudersi con Esc. Il fuoco che resta sulla pagina dietro al velo è il
 * caso peggiore: si apre una conferma e il Tab successivo finisce su una
 * riga che non si vede nemmeno. */

const header = <ModalHeader icon={<svg />} iconWrapperCls="border" title="Elimina Utente" />

describe('ModalShell', () => {
  it('si dichiara finestra e prende il nome dal proprio titolo', () => {
    render(<ModalShell onClose={() => {}}>{header}</ModalShell>)

    expect(screen.getByRole('dialog', { name: 'Elimina Utente' })).toHaveAttribute(
      'aria-modal',
      'true',
    )
  })

  /* Le modali che si intestano da sé, senza ModalHeader, il nome lo passano
   * a mano: senza, la finestra si annuncerebbe senza dire quale sia. */
  it('accetta un nome scritto a mano quando il titolo non è il suo', () => {
    render(
      <ModalShell onClose={() => {}} label="Anteprima del Prompt">
        <p>contenuto</p>
      </ModalShell>,
    )

    expect(screen.getByRole('dialog', { name: 'Anteprima del Prompt' })).toBeInTheDocument()
  })

  it('chiude con Esc', async () => {
    const onClose = vi.fn()
    render(<ModalShell onClose={onClose}>{header}</ModalShell>)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  /* Un'operazione che sta scrivendo sul server non si interrompe a metà, e
   * questo vale per Esc come per la X e per lo sfondo. */
  it("non chiude con Esc mentre l'azione è in corso", async () => {
    const onClose = vi.fn()
    render(
      <ModalShell onClose={onClose} locked>
        {header}
      </ModalShell>,
    )

    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('porta il fuoco dentro e lo riporta al bottone che ha aperto', async () => {
    function Pagina() {
      const [aperta, setAperta] = useState(false)
      return (
        <>
          <button onClick={() => setAperta(true)}>Apri</button>
          {aperta && <ModalShell onClose={() => setAperta(false)}>{header}</ModalShell>}
        </>
      )
    }
    render(<Pagina />)
    const apri = screen.getByRole('button', { name: 'Apri' })

    apri.focus()
    await userEvent.click(apri)
    expect(screen.getByRole('dialog')).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(apri).toHaveFocus()
  })

  /* Il Tab gira dentro la finestra: arrivato in fondo riprende dall'inizio
   * invece di uscire sulla pagina coperta. */
  it('tiene il Tab dentro la finestra', async () => {
    render(
      <ModalShell onClose={() => {}}>
        {header}
        <button>Annulla</button>
        <button>Conferma</button>
      </ModalShell>,
    )

    const chiudi = screen.getByRole('button', { name: 'Chiudi' })
    screen.getByRole('button', { name: 'Conferma' }).focus()

    await userEvent.tab()
    expect(chiudi).toHaveFocus()

    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Conferma' })).toHaveFocus()
  })

  /* Una tendina aperta dentro una modale si chiude con Esc da sola, e la
   * modale resta dov'è: chi rinuncia a una scelta non sta chiedendo di
   * buttare via il form. */
  it('lascia che una tendina si prenda il proprio Esc', async () => {
    const onClose = vi.fn()
    render(
      <ModalShell onClose={onClose}>
        {header}
        <Select
          ariaLabel="Organizzazione"
          value=""
          onChange={() => {}}
          options={[{ value: 'org-1', label: 'Banca Esempio' }]}
        />
      </ModalShell>,
    )

    await userEvent.click(screen.getByRole('combobox', { name: 'Organizzazione' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
