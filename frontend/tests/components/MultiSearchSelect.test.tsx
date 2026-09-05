import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

/* La scelta di più voci da un elenco lungo: quello che il componente decide
 * da sé, cioè come si aggiunge, come si toglie, e cosa resta aperto mentre si
 * compone una scelta fatta di più pezzi. */

import MultiSearchSelect from '../../src/components/MultiSearchSelect'

const PERSONE = [
  { value: 'u-1', label: 'Anna Ferrari', sub: 'anna@test.it' },
  { value: 'u-2', label: 'Marco Bianchi', sub: 'marco@test.it' },
  { value: 'u-3', label: 'Sara Greco', sub: 'sara@test.it' },
]

function renderSelect(values: string[] = [], onChange = vi.fn()) {
  render(
    <MultiSearchSelect
      id="prova"
      values={values}
      onChange={onChange}
      options={PERSONE}
      placeholder="Cerca..."
    />,
  )
  return onChange
}

describe('scegliere', () => {
  it('aggiunge una voce alle altre invece di sostituirle', async () => {
    const onChange = renderSelect(['u-1'])

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: /Marco Bianchi/ }))

    expect(onChange).toHaveBeenCalledWith(['u-1', 'u-2'])
  })

  /* Chi compone un confronto ne sceglie tre o quattro di fila: richiudere
   * dopo ognuna vorrebbe dire riaprire e riscrivere ogni volta. */
  it('lascia la lista aperta dopo una scelta', async () => {
    renderSelect()

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: /Anna Ferrari/ }))

    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('cerca per nome e per email', async () => {
    renderSelect()

    await userEvent.type(screen.getByRole('combobox'), 'marco@')

    expect(screen.getByRole('option', { name: /Marco Bianchi/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Anna Ferrari/ })).not.toBeInTheDocument()
  })

  /* Le voci già scelte restano in elenco e si riconoscono: sono anche
   * l'unico modo di toglierne una, ora che le targhette non ci sono più. */
  it('marca le voci già scelte e le toglie se ricliccate', async () => {
    const onChange = renderSelect(['u-1'])

    await userEvent.click(screen.getByRole('combobox'))
    const scelta = screen.getByRole('option', { name: /Anna Ferrari/ })
    expect(scelta).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(scelta)

    expect(onChange).toHaveBeenCalledWith([])
  })
})

describe('disfare una scelta', () => {
  it('azzera tutte le scelte', async () => {
    const onChange = renderSelect(['u-1', 'u-2'])

    await userEvent.click(screen.getByRole('button', { name: 'Azzera' }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  /* Il backspace a campo vuoto toglie l'ultima: senza le targhette è il
   * gesto più corto per disfare l'ultima scelta. */
  it('toglie l’ultima scelta col backspace a campo vuoto', async () => {
    const onChange = renderSelect(['u-1', 'u-2'])

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{Backspace}')

    expect(onChange).toHaveBeenCalledWith(['u-1'])
  })

  it('col campo scritto il backspace cancella il testo e non la scelta', async () => {
    const onChange = renderSelect(['u-1'])

    await userEvent.type(screen.getByRole('combobox'), 'ann{Backspace}')

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('quello che il campo non mostra', () => {
  /* Niente targhette con i nomi scelti: chi si sta guardando lo dicono le
   * barre del grafico, e ripeterne i nomi un centimetro più sopra sarebbe
   * la stessa cosa scritta due volte. */
  it('non scrive il nome di chi è stato scelto', () => {
    renderSelect(['u-1'])

    expect(screen.queryByText('Anna Ferrari')).not.toBeInTheDocument()
  })

  it('e senza scelte non c’è nemmeno l’azzeramento', () => {
    renderSelect()

    expect(screen.queryByRole('button', { name: 'Azzera' })).not.toBeInTheDocument()
  })
})

describe('da tastiera', () => {
  it('scorre con le frecce e sceglie con Invio', async () => {
    const onChange = renderSelect()

    const campo = screen.getByRole('combobox')
    campo.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith(['u-2'])
  })

  it('chiude la lista con Escape', async () => {
    renderSelect()

    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
