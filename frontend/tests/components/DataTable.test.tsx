import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fragment } from 'react'
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
/* Le righe di una tabella sono alte tutte uguali, e quanto lo decide la
 * tabella con una misura nominata per il contenuto: la riga con meno dentro
 * resta alta come le altre. Intestazione e fascia in fondo non c'entrano, e
 * nemmeno il pannello che si apre sotto una riga. */
describe('altezza delle righe', () => {
  it('scrive la misura sulla tabella e la applica alle righe del corpo', () => {
    const { container } = renderTable()

    const table = container.querySelector('table')!
    expect(table.style.getPropertyValue('--row-h')).toBe('80px')
    expect(table.className).toContain('[&_tbody>tr:not([data-detail])]:h-(--row-h)')
  })

  /* L'altezza regge se il testo va a capo una volta sola: la cella mette il
   * limite alle due righe quando dentro c'è testo e basta, e quando c'è una
   * composizione tiene comunque il contenuto entro l'altezza della riga. */
  it('lascia andare a capo il testo una volta sola', () => {
    const { container } = renderTable()

    const td = screen.getByText('Anna Rossi').closest('td')!
    expect(td.className).toContain('break-words')
    expect(td.className).not.toContain('whitespace-nowrap')
    expect(screen.getByText('Anna Rossi').className).toContain('line-clamp-2')
    expect(container.querySelector('tbody td')!.className).toContain('overflow-hidden')
  })

  it('tiene una composizione entro l altezza della riga', () => {
    render(
      <DataTable
        columns={COLUMNS}
        items={RIGHE.slice(0, 1)}
        renderRow={(p) => (
          <Tr key={p.id}>
            <Td colSpan={3}>
              <div className="flex">
                <span>{p.nome}</span>
              </div>
            </Td>
          </Tr>
        )}
      />,
    )

    const composizione = screen.getByText('Anna Rossi').parentElement!
    expect(composizione.className).not.toContain('line-clamp-2')
    expect(composizione.parentElement!.className).toContain(
      'max-h-[calc(var(--row-h)_-_2rem_-_2px)]',
    )
  })

  it('lascia fuori la riga di dettaglio, che è alta quanto contiene', () => {
    const { container } = render(
      <DataTable
        columns={COLUMNS}
        items={RIGHE.slice(0, 1)}
        renderRow={(p) => (
          <Fragment key={p.id}>
            <Tr>
              <Td>{p.nome}</Td>
              <Td>{p.eta ?? '—'}</Td>
              <Td compact>Elimina</Td>
            </Tr>
            <Tr detail>
              <Td colSpan={3} align="left">
                dettaglio
              </Td>
            </Tr>
          </Fragment>
        )}
      />,
    )

    const righe = container.querySelectorAll('tbody tr')
    expect(righe[0]).not.toHaveAttribute('data-detail')
    expect(righe[1]).toHaveAttribute('data-detail')
    // Un pannello non si evidenzia al passaggio come una riga dell'elenco
    expect(righe[1].className).not.toContain('hover:')
  })
})

/* Il tooltip con il testo intero lo porta la cella: al passaggio del mouse
 * guarda cosa dentro di sé è stato tagliato e lo mostra, e su una cella che
 * si legge tutta non compare niente. jsdom non impagina, quindi il taglio si
 * simula scrivendo le misure sull'elemento. */
describe('tooltip sul testo tagliato', () => {
  const clip = (el: Element, clipped = true) => {
    Object.defineProperty(el, 'clientWidth', { value: 100, configurable: true })
    Object.defineProperty(el, 'scrollWidth', { value: clipped ? 300 : 100, configurable: true })
  }

  it('mostra per intero il testo che la cella ha tagliato', async () => {
    const user = userEvent.setup()
    renderTable()
    const td = screen.getByText('Anna Rossi').closest('td')!
    clip(td)

    await user.hover(td)

    expect(screen.getByRole('tooltip')).toHaveTextContent('Anna Rossi')
  })

  it('non compare su una cella che si legge tutta', async () => {
    const user = userEvent.setup()
    renderTable()
    const td = screen.getByText('Anna Rossi').closest('td')!
    clip(td, false)

    await user.hover(td)

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

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

  /* L'ordine di arrivo è una risposta anche lui: è quello in cui l'elenco è
   * stato messo in fila da chi lo ha prodotto, e senza il terzo clic lo si
   * recupererebbe solo ricaricando la pagina. Le righe arrivano qui in un
   * ordine che non è né quello crescente né quello decrescente, altrimenti
   * il ritorno non si distinguerebbe da un verso. */
  it('toglie l ordinamento al terzo clic e torna all ordine di arrivo', async () => {
    const arrivo = [RIGHE[1], RIGHE[2], RIGHE[0]]
    const { container } = renderTable({ items: arrivo })
    expect(nomiInTabella(container)).toEqual(['Bruno Bianchi', 'Carla Verdi', 'Anna Rossi'])

    await userEvent.click(screen.getByRole('button', { name: /Utente/ }))
    expect(nomiInTabella(container)).toEqual(['Anna Rossi', 'Bruno Bianchi', 'Carla Verdi'])

    await userEvent.click(screen.getByRole('button', { name: /Utente/ }))
    expect(nomiInTabella(container)).toEqual(['Carla Verdi', 'Bruno Bianchi', 'Anna Rossi'])

    await userEvent.click(screen.getByRole('button', { name: /Utente/ }))
    expect(nomiInTabella(container)).toEqual(['Bruno Bianchi', 'Carla Verdi', 'Anna Rossi'])
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('aria-sort', 'none')
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
    onSortChange: (s: SortState | null) => void = () => {},
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
    const scelte: (SortState | null)[] = []
    const { container } = renderControllata(
      { key: 'utente', direction: 'desc' },
      (s: SortState | null) => {
        scelte.push(s)
      },
    )

    // Ricevute in quest'ordine, e in quest'ordine restano
    expect(nomiInTabella(container)).toEqual(['Anna Rossi', 'Bruno Bianchi', 'Carla Verdi'])
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('aria-sort', 'descending')

    /* Terzo stato del giro: la colonna era già decrescente, quindi il clic
       toglie l'ordinamento e chi ha i dati torna al suo default. */
    await userEvent.click(screen.getByRole('button', { name: /Utente/ }))
    expect(scelte).toEqual([null])
    expect(nomiInTabella(container)).toEqual(['Anna Rossi', 'Bruno Bianchi', 'Carla Verdi'])
  })

  it('riparte dal verso crescente su una colonna non ordinata', async () => {
    const scelte: (SortState | null)[] = []
    renderControllata(null, (s: SortState | null) => {
      scelte.push(s)
    })

    await userEvent.click(screen.getByRole('button', { name: /Utente/ }))
    expect(scelte).toEqual([{ key: 'utente', direction: 'asc' }])
  })

  /* Qui `sortValue` non c'entra: senza le righe che il server non ha ancora
   * mandato, il valore su cui ordinare non si può leggere. È `sortable` a
   * dire quali colonne il server sa ordinare. */
  it('non rende ordinabile una colonna senza sortable', () => {
    renderControllata(null)

    expect(screen.queryByRole('button', { name: /Età/ })).not.toBeInTheDocument()
  })
})
