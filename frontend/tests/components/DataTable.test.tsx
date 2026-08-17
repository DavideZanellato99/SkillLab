import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import DataTable, { Td, Tr } from '../../src/components/DataTable'
import type { DataTableColumn } from '../../src/components/DataTable'

/* Quello che il componente esiste per garantire, oltre alla paginazione: le
 * colonne stanno alle misure che la pagina dichiara e non a quelle del
 * contenuto. Senza, la stessa tabella cambia forma a ogni pagina sfogliata,
 * perché basta un'email lunga o un nome corto a spostare tutte le colonne. */

const COLUMNS: DataTableColumn[] = [
  { key: 'utente', label: 'Utente', width: '50%' },
  { key: 'ruolo', label: 'Ruolo', width: '30%' },
  { key: 'azioni', label: 'Azioni', width: '20%' },
]

function renderTable(props: Partial<Parameters<typeof DataTable>[0]> = {}) {
  return render(
    <DataTable columns={COLUMNS} {...props}>
      <Tr>
        <Td>Anna Rossi</Td>
        <Td>Utente</Td>
        <Td compact>Elimina</Td>
      </Tr>
    </DataTable>,
  )
}

describe('larghezza delle colonne', () => {
  it('dichiara la misura di ogni colonna nel colgroup', () => {
    const { container } = renderTable()

    const cols = container.querySelectorAll('colgroup col')
    expect([...cols].map((c) => (c as HTMLElement).style.width)).toEqual(['50%', '30%', '20%'])
  })

  /* Il colgroup da solo non basta: senza `table-fixed` il browser tratta le
   * misure come un suggerimento e allarga comunque la colonna che contiene
   * il testo più lungo. */
  it('impagina la tabella a layout fisso', () => {
    const { container } = renderTable()

    expect(container.querySelector('table')!.className).toContain('table-fixed')
  })

  /* Sotto la misura minima le percentuali sarebbero percentuali di niente:
   * da lì in giù scorre il riquadro invece di stringersi le colonne. */
  it('tiene una larghezza minima, che la pagina può alzare', () => {
    const { container, rerender } = renderTable()
    expect(container.querySelector('table')!.style.minWidth).toBe('880px')

    rerender(
      <DataTable columns={COLUMNS} minWidth="1580px">
        <Tr>
          <Td>Anna Rossi</Td>
          <Td>Utente</Td>
          <Td compact>Elimina</Td>
        </Tr>
      </DataTable>,
    )
    expect(container.querySelector('table')!.style.minWidth).toBe('1580px')
  })

  /* Le misure valgono anche quando le righe non ci sono: lo stato vuoto è una
   * cella sola su tutte le colonne, e l'intestazione sopra resta quella. */
  it('tiene le misure anche sullo stato vuoto', () => {
    const { container } = render(
      <DataTable columns={COLUMNS} isEmpty emptyMessage="Nessun utente trovato" />,
    )

    expect(screen.getByText('Nessun utente trovato')).toBeInTheDocument()
    expect(container.querySelectorAll('colgroup col')).toHaveLength(3)
  })
})

/* Il centramento è della tabella e non della pagina: una colonna non può
 * scegliere di allinearsi diversamente dalle altre, perché è la riga intera a
 * doversi leggere come una riga sola. */
describe('allineamento', () => {
  it('centra le intestazioni', () => {
    const { container } = renderTable()

    const headers = [...container.querySelectorAll('th')]
    expect(headers).toHaveLength(3)
    for (const th of headers) expect(th.className).toContain('text-center')
  })

  it('centra le celle delle righe, comprese quelle strette', () => {
    const { container } = renderTable()

    const cells = [...container.querySelectorAll('tbody td')]
    expect(cells).toHaveLength(3)
    for (const td of cells) expect(td.className).toContain('text-center')
  })

  /* Le eccezioni si dichiarano sulla cella e sono solo due: la colonna che
   * elenca persone e i pannelli che si aprono sotto una riga. La cella riceve
   * una classe di allineamento sola, mai due in conflitto. */
  it('lascia alla cella la possibilità di tornare a sinistra', () => {
    const { container } = render(
      <DataTable columns={COLUMNS}>
        <Tr>
          <Td colSpan={3} align="left">
            Richiesta
          </Td>
        </Tr>
      </DataTable>,
    )

    const cell = container.querySelector('tbody td')!
    expect(cell.className).toContain('text-left')
    expect(cell.className).not.toContain('text-center')
  })
})
