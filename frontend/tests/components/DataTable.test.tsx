import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import DataTable, { Td, Tr } from '../../src/components/DataTable'
import type { DataTableColumn, SortState } from '../../src/components/DataTable'

/* Quello che il componente esiste per garantire, oltre alla paginazione: le
 * colonne stanno alle misure che la pagina dichiara e non a quelle del
 * contenuto. Senza, la stessa tabella cambia forma a ogni pagina sfogliata,
 * perché basta un'email lunga o un nome corto a spostare tutte le colonne.
 *
 * E l'ordinamento, che ha due modi: la tabella ordina quello che ha in mano,
 * oppure lo riporta a chi i dati li legge a finestre dal server. */

interface Persona {
  id: string
  nome: string
  eta: number | null
}

const RIGHE: Persona[] = [
  { id: '1', nome: 'Anna Rossi', eta: 41 },
  { id: '2', nome: 'Bruno Bianchi', eta: 29 },
  { id: '3', nome: 'Carla Verdi', eta: null },
]

const COLUMNS: DataTableColumn<Persona>[] = [
  { key: 'utente', label: 'Utente', width: '50%', sortValue: (p) => p.nome },
  { key: 'eta', label: 'Età', width: '30%', sortValue: (p) => p.eta },
  { key: 'azioni', label: 'Azioni', width: '20%' },
]

function renderTable(props: Partial<Parameters<typeof DataTable<Persona>>[0]> = {}) {
  return render(
    <DataTable
      columns={COLUMNS}
      items={RIGHE.slice(0, 1)}
      renderRow={(p) => (
        <Tr key={p.id}>
          <Td>{p.nome}</Td>
          <Td>{p.eta ?? '—'}</Td>
          <Td compact>Elimina</Td>
        </Tr>
      )}
      {...props}
    />,
  )
}

/** I nomi nell'ordine in cui la tabella li sta mostrando. */
function nomiInTabella(container: HTMLElement): string[] {
  return [...container.querySelectorAll('tbody tr')].map(
    (tr) => tr.querySelector('td')!.textContent!,
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
    const { container } = renderTable()
    expect(container.querySelector('table')!.style.minWidth).toBe('880px')

    const { container: largo } = renderTable({ minWidth: '1580px' })
    expect(largo.querySelector('table')!.style.minWidth).toBe('1580px')
  })

  /* Le misure valgono anche quando le righe non ci sono: lo stato vuoto è una
   * cella sola su tutte le colonne, e l'intestazione sopra resta quella. */
  it('tiene le misure anche sullo stato vuoto', () => {
    const { container } = renderTable({ items: [], emptyMessage: 'Nessun utente trovato' })

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
      <DataTable
        columns={COLUMNS}
        items={RIGHE.slice(0, 1)}
        renderRow={(p) => (
          <Tr key={p.id}>
            <Td colSpan={3} align="left">
              Richiesta
            </Td>
          </Tr>
        )}
      />,
    )

    const cell = container.querySelector('tbody td')!
    expect(cell.className).toContain('text-left')
    expect(cell.className).not.toContain('text-center')
  })
})

/* La tabella riceve i dati e disegna solo la pagina che si guarda. Il motivo
 * non è di forma: finché le righe arrivavano già costruite, la pagina ne
 * costruiva una per elemento dell'elenco e la tabella ne mostrava venti. */
describe('righe da disegnare', () => {
  it('chiama renderRow solo per gli elementi della pagina mostrata', () => {
    const disegnate: string[] = []
    const tanti = Array.from({ length: 45 }, (_, i) => ({
      id: String(i),
      nome: `Persona ${i}`,
      eta: i,
    }))

    render(
      <DataTable
        columns={COLUMNS}
        items={tanti}
        renderRow={(p) => {
          disegnate.push(p.id)
          return (
            <Tr key={p.id}>
              <Td>{p.nome}</Td>
              <Td>{p.eta}</Td>
              <Td>—</Td>
            </Tr>
          )
        }}
      />,
    )

    expect(disegnate).toHaveLength(20)
  })
})

describe('ordinamento in memoria', () => {
  it('ordina sulla colonna scelta e rovescia al secondo clic', async () => {
    const { container } = renderTable({ items: RIGHE })
    expect(nomiInTabella(container)).toEqual(['Anna Rossi', 'Bruno Bianchi', 'Carla Verdi'])

    await userEvent.click(screen.getByRole('button', { name: /Utente/ }))
    expect(nomiInTabella(container)).toEqual(['Anna Rossi', 'Bruno Bianchi', 'Carla Verdi'])

    await userEvent.click(screen.getByRole('button', { name: /Utente/ }))
    expect(nomiInTabella(container)).toEqual(['Carla Verdi', 'Bruno Bianchi', 'Anna Rossi'])
  })

  /* Una cella senza valore non è né la più piccola né la più grande: è una
   * cella che a quella domanda non risponde, quindi resta in fondo in tutti e
   * due i versi invece di prendersi le prime righe a ogni inversione. */
  it('tiene le celle vuote in fondo in entrambi i versi', async () => {
    const { container } = renderTable({ items: RIGHE })

    await userEvent.click(screen.getByRole('button', { name: /Età/ }))
    expect(nomiInTabella(container).at(-1)).toBe('Carla Verdi')

    await userEvent.click(screen.getByRole('button', { name: /Età/ }))
    expect(nomiInTabella(container).at(-1)).toBe('Carla Verdi')
  })

  /* `aria-sort` sta sulla cella, che è dove lo standard lo cerca, e su tutte
   * le colonne ordinabili: "none" dice che si può ordinare e adesso non lo è,
   * ed è diverso dall'assenza dell'attributo, che dice che non si ordina. */
  it('dichiara il verso dell ordinamento sulla cella', async () => {
    renderTable({ items: RIGHE })

    const intestazioni = screen.getAllByRole('columnheader')
    expect(intestazioni[0]).toHaveAttribute('aria-sort', 'none')
    expect(intestazioni[2]).not.toHaveAttribute('aria-sort')

    await userEvent.click(within(intestazioni[0]).getByRole('button'))
    expect(intestazioni[0]).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(within(intestazioni[0]).getByRole('button'))
    expect(intestazioni[0]).toHaveAttribute('aria-sort', 'descending')
  })

  /* Le azioni non portano un dato, quindi non dichiarano `sortValue` e non
   * diventano un comando. */
  it('non rende ordinabile una colonna senza sortValue', () => {
    renderTable({ items: RIGHE })

    expect(screen.queryByRole('button', { name: /Azioni/ })).not.toBeInTheDocument()
  })

  it('riparte dalla prima pagina quando cambia l ordine', async () => {
    const tanti = Array.from({ length: 45 }, (_, i) => ({
      id: String(i),
      nome: `Persona ${String(i).padStart(2, '0')}`,
      eta: i,
    }))
    const { container } = render(
      <DataTable
        columns={COLUMNS}
        items={tanti}
        renderRow={(p) => (
          <Tr key={p.id}>
            <Td>{p.nome}</Td>
            <Td>{p.eta}</Td>
            <Td>—</Td>
          </Tr>
        )}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Pagina Successiva' }))
    expect(nomiInTabella(container)[0]).toBe('Persona 20')

    await userEvent.click(screen.getByRole('button', { name: /Utente/ }))
    expect(nomiInTabella(container)[0]).toBe('Persona 00')
  })
})

/* L'altro modo: l'elenco arriva a finestre dal server, quindi ordinarlo qui
 * vorrebbe dire ordinare le duecento righe già scaricate e chiamarle le prime
 * duecento di tutte. La tabella riporta la scelta e non tocca le righe. */
describe('ordinamento riportato a chi ha i dati', () => {
  const CONTROLLATE: DataTableColumn<Persona>[] = [
    { key: 'utente', label: 'Utente', width: '50%', sortable: true },
    { key: 'eta', label: 'Età', width: '30%' },
    { key: 'azioni', label: 'Azioni', width: '20%' },
  ]

  function renderControllata(
    sort: SortState | null,
    onSortChange: (s: SortState) => void = () => {},
  ) {
    return render(
      <DataTable
        columns={CONTROLLATE}
        items={RIGHE}
        sort={sort}
        onSortChange={onSortChange}
        renderRow={(p) => (
          <Tr key={p.id}>
            <Td>{p.nome}</Td>
            <Td>{p.eta ?? '—'}</Td>
            <Td>—</Td>
          </Tr>
        )}
      />,
    )
  }

  it('lascia le righe nell ordine ricevuto e riporta la scelta', async () => {
    const scelte: SortState[] = []
    const { container } = renderControllata(
      { key: 'utente', direction: 'desc' },
      (s: SortState) => {
        scelte.push(s)
      },
    )

    // Ricevute in quest'ordine, e in quest'ordine restano
    expect(nomiInTabella(container)).toEqual(['Anna Rossi', 'Bruno Bianchi', 'Carla Verdi'])
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('aria-sort', 'descending')

    await userEvent.click(screen.getByRole('button', { name: /Utente/ }))
    expect(scelte).toEqual([{ key: 'utente', direction: 'asc' }])
    expect(nomiInTabella(container)).toEqual(['Anna Rossi', 'Bruno Bianchi', 'Carla Verdi'])
  })

  /* Qui `sortValue` non c'entra: senza le righe che il server non ha ancora
   * mandato, il valore su cui ordinare non si può leggere. È `sortable` a
   * dire quali colonne il server sa ordinare. */
  it('non rende ordinabile una colonna senza sortable', () => {
    renderControllata(null)

    expect(screen.queryByRole('button', { name: /Età/ })).not.toBeInTheDocument()
  })
})
