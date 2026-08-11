import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import KebabMenu, { type KebabMenuItem } from '../../src/components/KebabMenu'

/* Il menu dei tre puntini delle tabelle. Quello che deve reggere è il giro
 * con la tastiera: le voci spente si saltano invece di fermare la fila, e
 * chiudendo con Esc il fuoco torna sul pulsante, o si finirebbe in cima alla
 * pagina dopo ogni menu aperto. */

function voci(over: Partial<KebabMenuItem>[] = []): KebabMenuItem[] {
  // L'icona non entra in gioco qui: quello che si prova è il giro da tastiera.
  const base: KebabMenuItem[] = [
    { key: 'sospendi', label: 'Sospendi account', icon: null, onSelect: vi.fn() },
    { key: 'disabilita', label: 'Disabilita account', icon: null, onSelect: vi.fn() },
    { key: 'rinvia', label: 'Rinvia credenziali', icon: null, onSelect: vi.fn() },
  ]
  return base.map((v, i) => ({ ...v, ...over[i] }))
}

function renderMenu(items = voci()) {
  render(<KebabMenu label="Altre azioni per anna@test.it" items={items} />)
  return items
}

const puntini = () => screen.getByRole('button', { name: 'Altre azioni per anna@test.it' })

describe('apertura', () => {
  it('resta chiuso finché non lo si apre', () => {
    renderMenu()

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(puntini()).toHaveAttribute('aria-expanded', 'false')
  })

  it('mostra le voci quando si apre', async () => {
    renderMenu()

    await userEvent.click(puntini())

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(puntini()).toHaveAttribute('aria-expanded', 'true')
  })

  it('sceglie una voce e si richiude', async () => {
    const items = renderMenu()

    await userEvent.click(puntini())
    await userEvent.click(screen.getByRole('menuitem', { name: /Rinvia credenziali/ }))

    expect(items[2].onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('si chiude cliccando fuori', async () => {
    renderMenu()

    await userEvent.click(puntini())
    await userEvent.click(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  /* Un menu senza voci non si apre: la tendina vuota sarebbe un vicolo
   * cieco, e il pulsante spento lo dice prima del clic. */
  it("non si apre quando non c'è niente da scegliere", async () => {
    render(<KebabMenu label="Altre azioni" items={[]} />)

    expect(screen.getByRole('button', { name: 'Altre azioni' })).toBeDisabled()
  })
})

describe('voci spente', () => {
  it('dicono perché non si possono usare', async () => {
    renderMenu(
      voci([{ disabled: true, disabledReason: 'Non puoi sospendere il tuo stesso account' }]),
    )

    await userEvent.click(puntini())

    const voce = screen.getByRole('menuitem', { name: /Sospendi account/ })
    expect(voce).toBeDisabled()
    expect(voce).toHaveTextContent('Non puoi sospendere il tuo stesso account')
  })

  it('non fanno niente se cliccate', async () => {
    const items = renderMenu(voci([{ disabled: true }]))

    await userEvent.click(puntini())
    await userEvent.click(screen.getByRole('menuitem', { name: /Sospendi account/ }))

    expect(items[0].onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})

describe('tastiera', () => {
  it('si apre con la freccia in giù e sceglie con Invio', async () => {
    const items = renderMenu()

    puntini().focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await userEvent.keyboard('{Enter}')
    expect(items[0].onSelect).toHaveBeenCalledOnce()
  })

  it('scorre le voci con le frecce', async () => {
    const items = renderMenu()

    puntini().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(items[1].onSelect).toHaveBeenCalledOnce()
  })

  /* Le voci spente si saltano: fermarsi su una lascerebbe la fila bloccata
   * a metà, con Invio che non fa niente e nessun modo di capire perché. */
  it('salta le voci spente', async () => {
    const items = renderMenu(voci([{}, { disabled: true }]))

    puntini().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(items[1].onSelect).not.toHaveBeenCalled()
    expect(items[2].onSelect).toHaveBeenCalledOnce()
  })

  /* La fila si avvolge: dall'ultima voce si torna alla prima invece di
   * fermarsi contro il fondo. */
  it('dalla fine torna in cima', async () => {
    const items = renderMenu()

    puntini().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}')

    expect(items[2].onSelect).toHaveBeenCalledOnce()
  })

  /* Apre già sulla prima voce utilizzabile: se la prima è spenta,
   * l'evidenziazione parte da quella dopo. */
  it('apre sulla prima voce utilizzabile', async () => {
    const items = renderMenu(voci([{ disabled: true }]))

    puntini().focus()
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(items[0].onSelect).not.toHaveBeenCalled()
    expect(items[1].onSelect).toHaveBeenCalledOnce()
  })

  /* Chiudendo con Esc il fuoco torna sul pulsante: senza, si ripartirebbe
   * da capo alla pagina dopo ogni menu aperto per sbaglio. */
  it('con Esc si chiude e riporta il fuoco sui puntini', async () => {
    renderMenu()

    puntini().focus()
    await userEvent.keyboard('{ArrowDown}{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(puntini()).toHaveFocus()
  })

  it('con Tab si chiude e lascia andare avanti', async () => {
    renderMenu()

    puntini().focus()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.tab()

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  /* Lo scroll sposta l'ancora ma non la tendina, che è a posizione fissa:
   * si chiude invece di restare appesa dove il pulsante non è più. */
  it('si chiude quando la pagina scorre', async () => {
    renderMenu()

    await userEvent.click(puntini())
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(puntini()).toHaveAttribute('aria-expanded', 'false')
  })
})
